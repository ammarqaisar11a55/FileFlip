let app;
let loadError = null;

try {
    app = require('../fileflip_custom_index/server');
} catch (err) {
    loadError = err;
}

module.exports = (req, res) => {
    if (loadError) {
        return res.status(500).json({
            error: "Failed to load Express application",
            message: loadError.message,
            stack: loadError.stack
        });
    }
    try {
        return app(req, res);
    } catch (err) {
        return res.status(500).json({
            error: "Runtime error during request execution",
            message: err.message,
            stack: err.stack
        });
    }
};


