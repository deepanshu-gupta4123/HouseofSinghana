let app;
let loadError;

try {
    app = require('../server/server');
} catch (err) {
    loadError = err;
}

module.exports = (req, res) => {
    const url = require('url');
    const parsedUrl = url.parse(req.url, true);

    // Reconstruct the original requested URL from the path parameter
    if (parsedUrl.query && parsedUrl.query.path) {
        const originalPath = '/api/' + parsedUrl.query.path;
        delete parsedUrl.query.path; // Strip the internal path parameter

        const search = url.format({ query: parsedUrl.query });
        req.url = originalPath + search;
    }

    // Health check endpoint
    if (req.url.startsWith('/api/health-check') || req.url.includes('/health-check')) {
        let dbError = null;
        try {
            const dbHelper = require('../server/db');
            dbError = dbHelper.dbError ? { message: dbHelper.dbError.message, stack: dbHelper.dbError.stack } : null;
        } catch (err) {
            dbError = { message: "Failed to require db.js: " + err.message, stack: err.stack };
        }

        return res.status(200).json({
            status: "healthy",
            message: "Vercel serverless wrapper is active",
            loadError: loadError ? { message: loadError.message, stack: loadError.stack } : null,
            dbError: dbError
        });
    }

    // Return the initialization error if the server failed to boot
    if (loadError) {
        return res.status(500).json({
            error: "Failed to load Express backend",
            message: loadError.message,
            stack: loadError.stack
        });
    }

    return app(req, res);
};
