/**
 * Role-Based Access Control Gate Middleware
 * @param {string} permissionId The required permission e.g. 'orders:write'
 */
function requirePermission(permissionId) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(411).json({ error: 'Authentication credentials not found.' });
        }

        // Super Admin bypasses all checks
        if (req.user.role_id === 'super_admin') {
            return next();
        }

        // Verify the permission is mapped to user role
        const hasPermission = req.user.permissions && req.user.permissions.includes(permissionId);

        if (!hasPermission) {
            console.warn(`[RBAC] Access denied for user ${req.user.email} (Role: ${req.user.role_id}). Missing permission: ${permissionId}`);
            return res.status(403).json({
                error: `Access denied. Requires permission: ${permissionId}`
            });
        }

        next();
    };
}

module.exports = requirePermission;
