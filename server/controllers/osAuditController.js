/**
 * OS Audit Controller — Immutable audit trail viewer
 * 
 * Provides read-only access to the audit_logs table.
 * Nothing is ever deleted from the audit trail.
 */
const db = require('../db');

/**
 * List audit log entries with filters
 */
async function listAuditLogs(req, res) {
    try {
        const { entity_type, entity_id, user_id, action, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT al.*, u.email as user_email 
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (entity_type) {
            query += ` AND al.entity_type = ?`;
            params.push(entity_type);
        }
        if (entity_id) {
            query += ` AND al.entity_id = ?`;
            params.push(entity_id);
        }
        if (user_id) {
            query += ` AND al.user_id = ?`;
            params.push(user_id);
        }
        if (action) {
            query += ` AND al.action = ?`;
            params.push(action);
        }

        query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const logs = await db.all(query, params);

        // Parse JSON fields
        for (const log of logs) {
            try { log.old_value = JSON.parse(log.old_value); } catch (e) { /* keep as string */ }
            try { log.new_value = JSON.parse(log.new_value); } catch (e) { /* keep as string */ }
        }

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE 1=1`;
        const countParams = [];
        if (entity_type) { countQuery += ` AND entity_type = ?`; countParams.push(entity_type); }
        if (entity_id) { countQuery += ` AND entity_id = ?`; countParams.push(entity_id); }
        if (user_id) { countQuery += ` AND user_id = ?`; countParams.push(user_id); }
        if (action) { countQuery += ` AND action = ?`; countParams.push(action); }

        const countResult = await db.get(countQuery, countParams);

        res.json({
            data: logs,
            total: countResult.total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (err) {
        console.error('[OS:Audit] listAuditLogs failed:', err);
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
}

/**
 * Get audit trail for a specific entity
 */
async function getEntityAuditTrail(req, res) {
    try {
        const { entityType, entityId } = req.params;

        const logs = await db.all(`
            SELECT al.*, u.email as user_email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.entity_type = ? AND al.entity_id = ?
            ORDER BY al.created_at DESC
        `, [entityType, entityId]);

        for (const log of logs) {
            try { log.old_value = JSON.parse(log.old_value); } catch (e) { /* keep as string */ }
            try { log.new_value = JSON.parse(log.new_value); } catch (e) { /* keep as string */ }
        }

        res.json(logs);
    } catch (err) {
        console.error('[OS:Audit] getEntityAuditTrail failed:', err);
        res.status(500).json({ error: 'Failed to fetch entity audit trail.' });
    }
}

module.exports = {
    listAuditLogs,
    getEntityAuditTrail
};
