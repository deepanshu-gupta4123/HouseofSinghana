let app;
let loadError;

try {
    app = require('../server/server');
} catch (err) {
    loadError = err;
}

module.exports = (req, res) => {
    // Health check endpoint
    if (req.url === '/api/health-check' || req.url.endsWith('/health-check')) {
        return res.status(200).json({
            status: "healthy",
            message: "Vercel serverless wrapper is active",
            loadError: loadError ? { message: loadError.message, stack: loadError.stack } : null
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
