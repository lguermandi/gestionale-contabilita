const cors = require('cors');
const config = require('../config');

function corsMiddleware() {
    return cors({
        origin: function(origin, callback) {
            // allow non-browser tools (curl/postman) when origin is undefined
            if (!origin) return callback(null, true);

            // allow common local dev origins when in development mode
            if (config.isDev && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
                return callback(null, true);
            }

            if (config.allowedOrigins.length === 0 || config.allowedOrigins.indexOf(origin) !== -1) {
                return callback(null, true);
            }

            callback(new Error('Not allowed by CORS'));
        }
    });
}

module.exports = { corsMiddleware };
