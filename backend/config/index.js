require('dotenv').config();

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

module.exports = {
    port: process.env.PORT || 3000,
    isDev: process.env.NODE_ENV !== 'production',
    allowedOrigins,
    // Se vuota, la protezione con API key è disattivata
    apiKey: process.env.API_KEY || '',
    gasWebhookUrl: process.env.GAS_WEBHOOK_URL
};
