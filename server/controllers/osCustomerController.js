const db = require('../db');
const eventBus = require('../core/eventBus');

/**
 * List all customers in Shekhawati CRM database with lifetime aggregate metrics
 */
async function listCustomers(req, res) {
    try {
        const rows = await db.all(`
            SELECT c.*, 
                   COUNT(o.id) as orders_count, 
                   COALESCE(SUM(o.total_amount), 0) as lifetime_spend_paise
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id AND o.deleted_at IS NULL AND o.order_status != 'CANCELLED'
            WHERE c.deleted_at IS NULL
            GROUP BY c.id
            ORDER BY lifetime_spend_paise DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[CRM] listCustomers failed:', err);
        res.status(500).json({ error: 'Failed to retrieve customer directory.' });
    }
}

/**
 * Get customer profile details including address list, orders history, and complaints
 */
async function getCustomerDetails(req, res) {
    const { id } = req.params;
    try {
        const customer = await db.get(
            `SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL`,
            [id]
        );

        if (!customer) return res.status(404).json({ error: 'Customer not found.' });

        // Fetch Address book
        customer.addresses = await db.all(
            `SELECT * FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL`,
            [id]
        );

        // Fetch Orders history
        customer.orders = await db.all(
            `SELECT * FROM orders WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
            [id]
        );

        // Fetch Complaints
        customer.complaints = await db.all(
            `SELECT * FROM complaints WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
            [id]
        );

        res.json(customer);
    } catch (err) {
        console.error('[CRM] getCustomerDetails failed:', err);
        res.status(500).json({ error: 'Failed to retrieve customer details.' });
    }
}

/**
 * Manually override customer CRM segment tag
 */
async function overrideSegment(req, res) {
    const { id } = req.params;
    const { segment } = req.body; // 'NEW', 'REPEAT', 'VIP', 'INACTIVE'

    if (!segment) return res.status(400).json({ error: 'Segment tag is required.' });

    try {
        const oldCustomer = await db.get(`SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldCustomer) return res.status(404).json({ error: 'Customer profile not found.' });

        await db.run(
            `UPDATE customers SET segment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [segment.toUpperCase(), id]
        );

        const updatedCustomer = await db.get(`SELECT * FROM customers WHERE id = ?`, [id]);

        if (req.logAudit) {
            await req.logAudit('OVERRIDE_CUSTOMER_SEGMENT', 'customers', id, oldCustomer, updatedCustomer);
        }

        res.json({
            message: `Customer segment updated to ${segment}.`,
            customer: updatedCustomer
        });
    } catch (err) {
        console.error('[CRM] overrideSegment failed:', err);
        res.status(500).json({ error: 'Failed to update customer segment.' });
    }
}

/**
 * Automated Lifecycle CRM segmentation calculation
 */
async function autoSegmentCustomer(customerId) {
    try {
        const stats = await db.get(`
            SELECT COUNT(id) as count, SUM(total_amount) as spend 
            FROM orders 
            WHERE customer_id = ? AND deleted_at IS NULL AND order_status != 'CANCELLED'
        `, [customerId]);

        if (!stats) return;

        const count = stats.count || 0;
        const spend = stats.spend || 0;

        let segment = 'NEW';
        if (count >= 5 || spend >= 1000000) { // 5 orders or ₹10,000 spend (1000000 paise)
            segment = 'VIP';
        } else if (count >= 2) {
            segment = 'REPEAT';
        }

        await db.run(
            `UPDATE customers SET segment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [segment, customerId]
        );
        console.log(`[CRM] Auto-segmented Customer #${customerId} as "${segment}" (Orders: ${count}, Spend: ₹${(spend/100).toFixed(2)})`);
    } catch (err) {
        console.error('[CRM] autoSegmentCustomer background job failed:', err);
    }
}

// Register CRM event listeners to auto-segment customers on order actions
eventBus.subscribe('OrderPlaced', async (event) => {
    const order = event.payload;
    if (order && order.customer_id) {
        await autoSegmentCustomer(order.customer_id);
    }
});

eventBus.subscribe('OrderCompleted', async (event) => {
    const order = event.payload.order || event.payload;
    if (order && order.customer_id) {
        await autoSegmentCustomer(order.customer_id);
    }
});

module.exports = {
    listCustomers,
    getCustomerDetails,
    overrideSegment,
    autoSegmentCustomer
};
