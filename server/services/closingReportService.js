const db = require('../db');
const templateEngine = require('../core/templateEngine');
const fs = require('fs');
const path = require('path');

class ClosingReportService {
    /**
     * Compile transaction and operational health metrics for a date, write HTML report to vault
     */
    async generateDailyClosingReport(dateStr) {
        const date = dateStr || new Date().toISOString().split('T')[0];
        console.log(`[ClosingReportService] Generating closing report for date: ${date}`);

        try {
            // 1. Fetch sales figures
            const sales = await db.get(
                `SELECT * FROM analytics_daily_metrics WHERE date = ?`,
                [date]
            );

            // 2. Fetch inventory health indicators
            const lowStockCount = await db.get(
                `SELECT COUNT(*) as count FROM inventory_summary WHERE available_stock < reorder_level`
            );

            // 3. Fetch complaints status
            const activeComplaints = await db.get(
                `SELECT COUNT(*) as count FROM complaints WHERE status != 'CLOSED'`
            );

            // 4. Fetch price approval queue metrics
            const pendingApprovals = await db.get(
                `SELECT COUNT(*) as count FROM approval_requests WHERE status = 'PENDING'`
            );

            const context = {
                date,
                totalOrders: sales ? sales.total_orders : 0,
                grossRevenue: sales ? (sales.gross_revenue_paise / 100).toFixed(2) : '0.00',
                aov: sales ? (sales.average_order_value_paise / 100).toFixed(2) : '0.00',
                newComplaints: sales ? sales.complaints_count : 0,
                activeComplaints: activeComplaints ? activeComplaints.count : 0,
                lowStockSkus: lowStockCount ? lowStockCount.count : 0,
                pendingApprovals: pendingApprovals ? pendingApprovals.count : 0
            };

            const reportHtml = await templateEngine.render('nightly_closing_report', context);

            const reportDir = path.join(__dirname, '..', 'vault', 'reports');
            if (!fs.existsSync(reportDir)) {
                fs.mkdirSync(reportDir, { recursive: true });
            }

            const fileName = `REPORT-${date}.html`;
            const filePath = path.join(reportDir, fileName);
            fs.writeFileSync(filePath, reportHtml, 'utf8');

            const relativePath = `/vault/reports/${fileName}`;

            console.log(`[ClosingReportService] Report compiled successfully at: ${relativePath}`);
            return {
                success: true,
                filePath: relativePath,
                summary: context
            };

        } catch (err) {
            console.error('[ClosingReportService] Report compilation failed:', err);
            throw err;
        }
    }
}

const closingReportService = new ClosingReportService();
module.exports = closingReportService;
