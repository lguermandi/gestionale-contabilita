const axios = require('axios');
require('dotenv').config();

async function fetchRawData(anno) {
    const maxRetries = 3;
    const timeout = 10000; // 10s
    const url = `${process.env.GAS_WEBHOOK_URL}?anno=${anno}`;

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

module.exports = { fetchRawData };