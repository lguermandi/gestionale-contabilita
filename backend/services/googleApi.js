const axios = require('axios');
const config = require('../config');

async function fetchRawData(anno) {
    const maxRetries = 3;
    const timeout = 10000; // 10s
    const url = `${config.gasWebhookUrl}?anno=${anno}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, { timeout });
            if (response.data && response.data.status === 200) {
                return response.data.data;
            } else {
                throw new Error("Errore nel formato della risposta da Google");
            }
        } catch (error) {
            console.error(`Errore di connessione a Google Sheets (attempt ${attempt}):`, error.message);
            if (attempt === maxRetries) {
                return [];
            }
            // semplice backoff
            await new Promise(r => setTimeout(r, attempt * 500));
        }
    }
}

async function postGasAction(action, payload) {
    if (!config.gasWebhookUrl) {
        throw new Error('GAS_WEBHOOK_URL non configurato');
    }

    const response = await axios.post(config.gasWebhookUrl, { action, ...payload }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.data || response.data.status !== 200) {
        const error = new Error(response.data?.error || 'Risposta non valida da Google Apps Script');
        error.status = response.data?.status || response.status;
        throw error;
    }
    return response.data.data;
}

module.exports = { fetchRawData, postGasAction };