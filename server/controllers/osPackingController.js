const db = require('../db');
const orderService = require('../services/orderService');

/**
 * Get orders in packing queue (approved, waiting for packing)
 */
async function listPackingQueue(req, res) {
    try {
        const rows = await db.all(`
            SELECT o.id, o.order_number, o.created_at, o.order_notes, c.name as customer_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.order_status = 'APPROVED' AND o.deleted_at IS NULL
            ORDER BY o.created_at ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[Packing] listPackingQueue failed:', err);
        res.status(500).json({ error: 'Failed to retrieve packing queue.' });
    }
}

/**
 * Mark order as packed
 */
async function markPacked(req, res) {
    const { id } = req.params;
    try {
        const updated = await orderService.transitionOrderStatus(
            id,
            'PACKED',
            req.user
        );
        res.json({ success: true, order: updated });
    } catch (err) {
        console.error('[Packing] markPacked failed:', err.message);
        res.status(400).json({ error: err.message });
    }
}

module.exports = {
    listPackingQueue,
    markPacked
};
