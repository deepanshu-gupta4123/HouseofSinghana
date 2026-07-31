const analyticsService = require('../services/analyticsService');
const healthScoreService = require('../services/healthScoreService');
const systemMonitorService = require('../services/systemMonitorService');
const closingReportService = require('../services/closingReportService');
const db = require('../db');

/**
 * Get comprehensive analytics, system health and server diagnostic aggregates
 */
async function getDashboardSummary(req, res) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Fetch today's sales metrics from OLAP table
        const salesToday = await db.get(
            `SELECT * FROM analytics_daily_metrics WHERE metric_date = ?`,
            [todayStr]
        );

        // 2. Fetch operational Health score
        const health = await healthScoreService.calculateSystemHealthScore();

        // 3. Fetch server diagnostics status
        const diagnostics = await systemMonitorService.runDiagnostics();

        res.json({
            date: todayStr,
            sales: {
                totalOrders: salesToday ? salesToday.orders_count : 0,
                grossRevenueRupees: salesToday ? (salesToday.gross_revenue / 100) : 0,
                aovRupees: salesToday ? (salesToday.aov / 100) : 0,
                newComplaints: salesToday ? salesToday.complaints_opened : 0
            },
            health,
            diagnostics
        });
    } catch (err) {
        console.error('[IntelligenceCMS] getDashboardSummary failed:', err);
        res.status(500).json({ error: 'Failed to retrieve analytics dashboard summary.' });
    }
}

/**
 * Fetch daily metrics range history (charts data)
 */
async function getDailyMetricsHistory(req, res) {
    const limit = req.query.days ? parseInt(req.query.days) : 30;
    try {
        const rows = await analyticsService.getDailyMetricsRange(limit);
        res.json(rows);
    } catch (err) {
        console.error('[IntelligenceCMS] getDailyMetricsHistory failed:', err);
        res.status(500).json({ error: 'Failed to retrieve metrics history.' });
    }
}

/**
 * Fetch top moving variant velocity metrics
 */
async function getTopSkus(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    try {
        const rows = await analyticsService.getTopSkuVelocity(limit);
        res.json(rows);
    } catch (err) {
        console.error('[IntelligenceCMS] getTopSkus failed:', err);
        res.status(500).json({ error: 'Failed to retrieve top variant velocity metrics.' });
    }
}

/**
 * Trigger daily closing report compilation manually
 */
async function triggerClosingReport(req, res) {
    const { date } = req.body;
    try {
        const result = await closingReportService.generateDailyClosingReport(date);
        res.json({
            message: 'Daily closing report successfully generated and saved to document vault.',
            ...result
        });
    } catch (err) {
        console.error('[IntelligenceCMS] triggerClosingReport failed:', err);
        res.status(500).json({ error: 'Failed to generate closing report.' });
    }
}

module.exports = {
    getDashboardSummary,
    getDailyMetricsHistory,
    getTopSkus,
    triggerClosingReport
};
