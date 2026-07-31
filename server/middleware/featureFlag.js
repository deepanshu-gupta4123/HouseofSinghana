const db = require('../db');

/**
 * Feature Flag Gate Middleware Factory
 * @param {string} flagId The ID of the feature flag to check e.g. 'module_gift_orders'
 */
function requireFeature(flagId) {
    return async (req, res, next) => {
        try {
            const flag = await db.get(
                `SELECT is_enabled FROM feature_flags WHERE id = ?`,
                [flagId]
            );

            // If the flag doesn't exist or is disabled, block request
            const isEnabled = flag ? Boolean(flag.is_enabled) : false;

            if (!isEnabled) {
                console.warn(`[FeatureFlag] Blocked access to disabled feature: ${flagId}`);
                return res.status(403).json({
                    error: `This module or feature (${flagId.replace('module_', '')}) is currently disabled by system configuration.`
                });
            }

            next();
        } catch (err) {
            console.error(`[FeatureFlag] Error checking flag ${flagId}:`, err);
            return res.status(500).json({ error: 'Internal server check failed.' });
        }
    };
}

module.exports = requireFeature;
