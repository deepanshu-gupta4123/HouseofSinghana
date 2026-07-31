const jwt = require('jsonwebtoken');
const db = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-singhana-key';

/**
 * JWT Authentication Middleware
 */
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(411).json({ error: 'Access token required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Fetch user from DB to verify if active and get permissions
        let user;
        if (decoded.scope === 'os') {
            user = await db.get(
                `SELECT u.*, r.name as role_name 
                 FROM users u 
                 JOIN roles r ON u.role_id = r.id 
                 WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL`,
                [decoded.id]
            );

            if (!user) {
                return res.status(403).json({ error: 'User is inactive or deleted.' });
            }

            // Fetch and map permissions
            const perms = await db.all(
                `SELECT permission_id FROM role_permissions WHERE role_id = ?`,
                [user.role_id]
            );
            user.permissions = perms.map(p => p.permission_id);
            user.scope = 'os';
        } else {
            // Customer token
            user = await db.get(
                `SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL`,
                [decoded.id]
            );

            if (!user) {
                // Backwards compatibility fallback to users table
                user = await db.get(
                    `SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`,
                    [decoded.id]
                );
            }

            if (!user) {
                return res.status(403).json({ error: 'Customer account not found.' });
            }
            user.scope = 'customer';
            user.permissions = []; // Customer role does not carry dashboard RBAC keys
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('[AuthMiddleware] JWT verify failure:', err.message);
        return res.status(403).json({ error: 'Invalid or expired access token.' });
    }
}

module.exports = authenticateToken;
