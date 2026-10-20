const config = require('../config');

// Protezione opzionale: se API_KEY è definita in .env, le richieste devono inviarla
// tramite header "x-api-key" oppure "Authorization: Bearer <key>"
function apiKeyMiddleware() {
    return (req, res, next) => {
        if (!config.apiKey) return next();

        // Allow local development hosts to bypass the API key even if set (useful while testing)
        const origin = req.headers.origin;
        if (config.isDev && origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
            return next();
        }

        const key = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (key === config.apiKey) return next();
        res.status(401).json({ error: 'Unauthorized' });
    };
}

module.exports = { apiKeyMiddleware };
