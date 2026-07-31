const db = require('../db');

/**
 * Log a mutation event to the audit_logs table
 */
async function logMutation({
    userId,
    userEmail,
    userRole,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress,
    userAgent
}) {
    try {
        await db.run(
            `INSERT INTO audit_logs (
                user_id, user_email, user_role, action, entity_type, entity_id, 
                old_values, new_values, ip_address, user_agent
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                userEmail,
                userRole,
                action,
                entityType,
                String(entityId),
                oldValues ? JSON.stringify(oldValues) : null,
                newValues ? JSON.stringify(newValues) : null,
                ipAddress,
                userAgent
            ]
        );
    } catch (err) {
        console.error('[AuditLog] Failed to write audit log:', err);
    }
}

/**
 * Express middleware that adds req.logAudit helper to request context
 */
function auditMiddleware(req, res, next) {
    req.logAudit = async (action, entityType, entityId, oldValues, newValues) => {
        const user = req.user || {};
        await logMutation({
            userId: user.id || null,
            userEmail: user.email || 'system',
            userRole: user.role_id || 'system',
            action,
            entityType,
            entityId,
            oldValues,
            newValues,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });
    };
    next();
}

module.exports = {
    auditMiddleware,
    logMutation
};
