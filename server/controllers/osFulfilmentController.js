const db = require('../db');
const orderService = require('../services/orderService');

/**
 * Get orders in fulfillment dispatch queue (invoiced, ready to dispatch)
 */
async function listFulfilmentQueue(req, res) {
    try {
        const rows = await db.all(`
            SELECT o.id, o.order_number, o.created_at, o.total_amount, c.name as customer_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.order_status = 'INVOICED' AND o.deleted_at IS NULL
            ORDER BY o.created_at ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[Fulfilment] listFulfilmentQueue failed:', err);
        res.status(500).json({ error: 'Failed to retrieve dispatch queue.' });
    }
}

/**
 * Assign courier tracking details and dispatch order
 */
async function dispatchOrder(req, res) {
    const { id } = req.params;
    const { courier, tracking_number } = req.body;

    if (!courier || !tracking_number) {
        return res.status(400).json({ error: 'Courier partner and tracking number are required.' });
    }

    try {
        await db.transaction(async () => {
            // Update courier tracking coordinates
            await db.run(
                `UPDATE orders 
                 SET dispatch_courier = ?, dispatch_tracking = ?, dispatch_date = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [courier, tracking_number, id]
            );

            // Execute workflow status state transition
            await orderService.transitionOrderStatus(
                id,
                'DISPATCHED',
                req.user
            );
        });

        const updated = await db.get(`SELECT * FROM orders WHERE id = ?`, [id]);
        res.json({ success: true, order: updated });
    } catch (err) {
        console.error('[Fulfilment] dispatchOrder failed:', err.message);
        res.status(400).json({ error: err.message });
    }
}

module.exports = {
    listFulfilmentQueue,
    dispatchOrder
};
