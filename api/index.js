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
    return app(req, res);
};


