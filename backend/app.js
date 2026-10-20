const path = require('path');
const express = require('express');
const { corsMiddleware } = require('./middleware/cors');
const { apiKeyMiddleware } = require('./middleware/apiKey');
const apiRoutes = require('./routes');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

function createApp() {
    const app = express();

    app.use(corsMiddleware());
    app.use(express.json());
    app.use(apiKeyMiddleware());
    app.use('/api', apiRoutes);
    app.use(express.static(FRONTEND_DIR));

    return app;
}

module.exports = { createApp };
