const eventBus = require('../core/eventBus');
const db = require('../db');

class AnalyticsService {
    initialize() {
        console.log('[AnalyticsService] Starting out-of-band OLAP metrics aggregator...');

        // Subscribe to OrderPlaced for sales aggregates
        eventBus.subscribe('OrderPlaced', async (event) => {
            const order = event.payload;
            if (!order) return;
            const date = new Date(order.created_at || Date.now()).toISOString().split('T')[0];

            try {
                await db.transaction(async () => {
                    // 1. Update Daily Metrics
                    let metric = await db.get(`SELECT * FROM analytics_daily_metrics WHERE metric_date = ?`, [date]);
                    if (!metric) {
                        await db.run(
                            `INSERT INTO analytics_daily_metrics (
                                metric_date, orders_count, gross_revenue, aov
                             ) VALUES (?, 0, 0, 0)`,
                            [date]
                        );
                        metric = { orders_count: 0, gross_revenue: 0 };
                    }

                    const nextOrders = metric.orders_count + 1;
                    const nextRevenue = metric.gross_revenue + order.total_amount;
                    const nextAov = Math.round(nextRevenue / nextOrders);

                    await db.run(
                        `UPDATE analytics_daily_metrics 
                         SET orders_count = ?, gross_revenue = ?, aov = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE metric_date = ?`,
                        [nextOrders, nextRevenue, nextAov, date]
                    );

                    // 2. Update SKU Velocity metrics
                    for (const item of order.items || []) {
                        // Get variant info
                        const variantInfo = await db.get(`
                            SELECT v.sku, p.name as product_name, COALESCE(s.current_stock, 0) as current_stock
                            FROM product_variants v
                            JOIN products p ON v.product_id = p.id
                            LEFT JOIN inventory_summary s ON v.id = s.variant_id
                            WHERE v.id = ?
                        `, [item.variant_id]);

                        if (!variantInfo) continue;

                        let skuMetric = await db.get(
                            `SELECT * FROM analytics_sku_velocity WHERE variant_id = ?`,
                            [item.variant_id]
                        );

                        if (!skuMetric) {
                            await db.run(
                                `INSERT INTO analytics_sku_velocity (
                                    variant_id, sku, product_name, sales_7d, sales_30d, revenue_30d, current_stock
                                 ) VALUES (?, ?, ?, 0, 0, 0, ?)`,
                                [item.variant_id, variantInfo.sku, variantInfo.product_name, variantInfo.current_stock]
                            );
                            skuMetric = { sales_7d: 0, sales_30d: 0, revenue_30d: 0 };
                        }

                        const nextSales7d = skuMetric.sales_7d + item.quantity;
                        const nextSales30d = skuMetric.sales_30d + item.quantity;
                        const nextRevenue30d = skuMetric.revenue_30d + item.total_price;
                        const dailyVelocity = parseFloat((nextSales30d / 30.0).toFixed(2));
                        
                        let daysRemaining = 999.0;
                        if (dailyVelocity > 0) {
                            daysRemaining = parseFloat((variantInfo.current_stock / dailyVelocity).toFixed(1));
                        }

                        await db.run(
                            `UPDATE analytics_sku_velocity 
                             SET sales_7d = ?, sales_30d = ?, revenue_30d = ?, daily_velocity = ?,
                                 current_stock = ?, days_of_stock_remaining = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE variant_id = ?`,
                            [nextSales7d, nextSales30d, nextRevenue30d, dailyVelocity, variantInfo.current_stock, daysRemaining, item.variant_id]
                        );
                    }
                });

                console.log(`[AnalyticsService] Daily OLAP sales metrics aggregated for date: ${date}`);
            } catch (err) {
                console.error('[AnalyticsService] Failed to aggregate sales metrics:', err);
            }
        });

        // Subscribe to ComplaintRaised for ticket tracking
        eventBus.subscribe('ComplaintRaised', async (event) => {
            const ticket = event.payload;
            if (!ticket) return;
            const date = new Date(ticket.created_at || Date.now()).toISOString().split('T')[0];

            try {
                let metric = await db.get(`SELECT * FROM analytics_daily_metrics WHERE metric_date = ?`, [date]);
                if (!metric) {
                    await db.run(
                        `INSERT INTO analytics_daily_metrics (
                            metric_date, orders_count, gross_revenue, aov, complaints_opened
                         ) VALUES (?, 0, 0, 0, 0)`,
                        [date]
                    );
                }

                await db.run(
                    `UPDATE analytics_daily_metrics SET complaints_opened = complaints_opened + 1 WHERE metric_date = ?`,
                    [date]
                );
            } catch (err) {
                console.error('[AnalyticsService] Failed to aggregate complaint metric:', err);
            }
        });
    }

    /**
     * Fetch daily metrics summary for dashboard charts
     */
    async getDailyMetricsRange(days = 30) {
        return await db.all(`
            SELECT metric_date as date, orders_count, gross_revenue, aov, complaints_opened
            FROM analytics_daily_metrics 
            ORDER BY metric_date DESC 
            LIMIT ?
        `, [days]);
    }

    /**
     * Fetch top velocity products
     */
    async getTopSkuVelocity(limit = 10) {
        return await db.all(`
            SELECT sv.variant_id, sv.sales_30d as total_units, sv.revenue_30d as total_revenue,
                   v.variant_name, sv.sku, sv.product_name
            FROM analytics_sku_velocity sv
            JOIN product_variants v ON sv.variant_id = v.id
            ORDER BY total_units DESC
            LIMIT ?
        `, [limit]);
    }
}

const analyticsService = new AnalyticsService();
module.exports = analyticsService;
