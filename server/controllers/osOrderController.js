const db = require('../db');
const orderService = require('../services/orderService');

/**
 * List all orders for the merchant dashboard
 */
async function listOrders(req, res) {
    try {
        const rows = await db.all(`
            SELECT o.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.deleted_at IS NULL
            ORDER BY o.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[OMS] listOrders failed:', err);
        res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
}

/**
 * Get detailed order view, including items, history timeline, and document vault records
 */
async function getOrderDetails(req, res) {
    const { id } = req.params;
    try {
        const order = await db.get(`
            SELECT o.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, w.name as warehouse_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN warehouses w ON o.warehouse_id = w.id
            WHERE o.id = ? AND o.deleted_at IS NULL
        `, [id]);

        if (!order) return res.status(404).json({ error: 'Order not found.' });

        // Fetch Order Items
        order.items = await db.all(
            `SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL`,
            [id]
        );

        // Fetch Order Timeline history
        order.timeline = await db.all(
            `SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at ASC`,
            [id]
        );

        // Fetch Document Vault records (invoices, packing slips, etc)
        order.documents = await db.all(
            `SELECT * FROM document_vault WHERE entity_type = 'order' AND entity_id = ?`,
            [id]
        );

        res.json(order);
    } catch (err) {
        console.error('[OMS] getOrderDetails failed:', err);
        res.status(500).json({ error: 'Failed to retrieve order details.' });
    }
}

/**
 * Execute order status state transition
 */
async function transitionStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body; // Target status e.g. 'APPROVED', 'PACKED', 'INVOICED'

    if (!status) return res.status(400).json({ error: 'Target status state is required.' });

    try {
        const updatedOrder = await orderService.transitionOrderStatus(
            id,
            status,
            req.user
        );

        res.json({
            message: `Order status successfully transitioned to ${status}.`,
            order: updatedOrder
        });
    } catch (err) {
        console.error('[OMS] transitionStatus failed:', err.message);
        res.status(400).json({ error: err.message });
    }
}

/**
 * Bulk transition status for multiple orders
 */
async function bulkTransition(req, res) {
    const { orderIds, status } = req.body;
    if (!orderIds || !Array.isArray(orderIds) || !status) {
        return res.status(400).json({ error: 'Array of orderIds and target status are required.' });
    }

    const results = [];
    for (const id of orderIds) {
        try {
            await orderService.transitionOrderStatus(id, status, req.user);
            results.push({ orderId: id, success: true });
        } catch (err) {
            results.push({ orderId: id, success: false, error: err.message });
        }
    }

    res.json({
        message: 'Bulk status update operation completed.',
        results
    });
}

module.exports = {
    listOrders,
    getOrderDetails,
    transitionStatus,
    bulkTransition
};
