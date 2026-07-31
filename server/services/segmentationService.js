/**
 * Segmentation Service — Automatic Customer Lifecycle Segmentation
 * 
 * Subscribes to OrderDelivered events and recalculates customer segments:
 * NEW → REPEAT → VIP → INACTIVE
 * 
 * Segment Rules:
 *   NEW:      0-1 orders, lifetime_value < ₹2,000
 *   REPEAT:   2-4 orders
 *   VIP:      5+ orders OR lifetime_value > ₹25,000
 *   INACTIVE: Last order > 180 days ago
 */
const db = require('../db');
const eventBus = require('../core/eventBus');

class SegmentationService {
    /**
     * Recalculate segment for a specific customer
     */
    async recalculateSegment(customerId) {
        try {
            const customer = await db.get(
                `SELECT id, total_orders, lifetime_value, segment FROM customers WHERE id = ?`,
                [customerId]
            );

            if (!customer) return;

            // Check last order date for inactivity
            const lastOrder = await db.get(
                `SELECT MAX(created_at) as last_order_date FROM orders WHERE customer_id = ?`,
                [customerId]
            );

            let newSegment = 'NEW';

            // Check inactivity first (180+ days since last order)
            if (lastOrder && lastOrder.last_order_date) {
                const lastDate = new Date(lastOrder.last_order_date);
                const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince > 180 && customer.total_orders > 0) {
                    newSegment = 'INACTIVE';
                }
            }

            // If not inactive, calculate based on order count and lifetime value
            if (newSegment !== 'INACTIVE') {
                const totalOrders = customer.total_orders || 0;
                const lifetimeValue = customer.lifetime_value || 0;  // In paise

                if (totalOrders >= 5 || lifetimeValue >= 2500000) {
                    // 5+ orders OR ₹25,000+ lifetime value
                    newSegment = 'VIP';
                } else if (totalOrders >= 2) {
                    newSegment = 'REPEAT';
                } else {
                    newSegment = 'NEW';
                }
            }

            // Update if changed
            if (newSegment !== customer.segment) {
                await db.run(
                    `UPDATE customers SET segment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [newSegment, customerId]
                );
                console.log(`[SegmentationService] Customer #${customerId} segment: ${customer.segment} → ${newSegment}`);
            }

            return newSegment;
        } catch (err) {
            console.error(`[SegmentationService] Failed to recalculate segment for customer #${customerId}:`, err);
        }
    }

    /**
     * Bulk recalculate all customer segments (scheduled job)
     */
    async recalculateAll() {
        try {
            const customers = await db.all(`SELECT id FROM customers`);
            let updated = 0;

            for (const customer of customers) {
                const result = await this.recalculateSegment(customer.id);
                if (result) updated++;
            }

            console.log(`[SegmentationService] Bulk recalculation complete. Processed ${customers.length} customers.`);
            return { processed: customers.length, updated };
        } catch (err) {
            console.error('[SegmentationService] Bulk recalculation failed:', err);
            throw err;
        }
    }

    /**
     * Update customer aggregate stats (total_orders, lifetime_value, favourite_sku, average_basket)
     */
    async updateCustomerAggregates(customerId) {
        try {
            const stats = await db.get(`
                SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(total_amount), 0) as lifetime_value,
                    COALESCE(AVG(total_amount), 0) as average_basket
                FROM orders 
                WHERE customer_id = ? 
                AND status NOT IN ('CANCELLED')
            `, [customerId]);

            // Find favourite SKU
            const favSku = await db.get(`
                SELECT oi.variant_sku, COUNT(*) as freq
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.customer_id = ? AND o.status NOT IN ('CANCELLED')
                GROUP BY oi.variant_sku
                ORDER BY freq DESC
                LIMIT 1
            `, [customerId]);

            await db.run(`
                UPDATE customers SET 
                    total_orders = ?,
                    lifetime_value = ?,
                    average_basket = ?,
                    favourite_sku = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                stats.total_orders,
                stats.lifetime_value,
                Math.round(stats.average_basket),
                favSku ? favSku.variant_sku : null,
                customerId
            ]);

        } catch (err) {
            console.error(`[SegmentationService] Failed to update aggregates for customer #${customerId}:`, err);
        }
    }
}

const segmentationService = new SegmentationService();

// Subscribe to order lifecycle events
eventBus.subscribe('OrderDelivered', async (event) => {
    const { customerId } = event.payload || {};
    if (customerId) {
        await segmentationService.updateCustomerAggregates(customerId);
        await segmentationService.recalculateSegment(customerId);
    }
});

eventBus.subscribe('OrderCancelled', async (event) => {
    const { customerId } = event.payload || {};
    if (customerId) {
        await segmentationService.updateCustomerAggregates(customerId);
        await segmentationService.recalculateSegment(customerId);
    }
});

module.exports = segmentationService;
