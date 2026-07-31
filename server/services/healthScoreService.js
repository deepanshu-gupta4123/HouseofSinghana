const db = require('../db');

class HealthScoreService {
    /**
     * Compute system operational health score from active database queues
     */
    async calculateSystemHealthScore() {
        try {
            // 1. Check SKU health
            const totalStockCount = await db.get(`SELECT COUNT(*) as count FROM inventory_summary`);
            const lowStockCount = await db.get(`SELECT COUNT(*) as count FROM inventory_summary WHERE available_stock < reorder_level`);
            
            // 2. Check Complaint SLA breaches
            const pendingComplaints = await db.get(`SELECT COUNT(*) as count FROM complaints WHERE status != 'CLOSED'`);
            const breachedComplaints = await db.get(`
                SELECT COUNT(*) as count 
                FROM complaints 
                WHERE status != 'CLOSED' AND datetime('now') > sla_expires_at
            `);

            // 3. Check Price approvals lag
            const pendingPriceApprovals = await db.get(`
                SELECT COUNT(*) as count 
                FROM approval_requests 
                WHERE status = 'PENDING' AND request_type = 'PRICE_UPDATE'
            `);

            // Deduct from 100 base score
            let score = 100;
            
            // Deduct 5 points per low stock item (up to 25 max)
            const stockDeduction = Math.min((lowStockCount ? lowStockCount.count : 0) * 5, 25);
            score -= stockDeduction;

            // Deduct 10 points per breached SLA complaint (up to 40 max)
            const complaintDeduction = Math.min((breachedComplaints ? breachedComplaints.count : 0) * 10, 40);
            score -= complaintDeduction;

            // Deduct 5 points per pending price approval request (up to 15 max)
            const approvalDeduction = Math.min((pendingPriceApprovals ? pendingPriceApprovals.count : 0) * 5, 15);
            score -= approvalDeduction;

            score = Math.max(score, 0);

            return {
                healthScore: score,
                status: score >= 85 ? 'HEALTHY' : (score >= 60 ? 'WARNING' : 'CRITICAL'),
                metrics: {
                    totalSkus: totalStockCount ? totalStockCount.count : 0,
                    lowStockSkus: lowStockCount ? lowStockCount.count : 0,
                    pendingComplaints: pendingComplaints ? pendingComplaints.count : 0,
                    slaBreachedComplaints: breachedComplaints ? breachedComplaints.count : 0,
                    pendingPriceApprovals: pendingPriceApprovals ? pendingPriceApprovals.count : 0
                }
            };
        } catch (err) {
            console.error('[HealthScoreService] Failed to calculate score:', err);
            return {
                healthScore: 50,
                status: 'WARNING',
                error: err.message
            };
        }
    }
}

const healthScoreService = new HealthScoreService();
module.exports = healthScoreService;
