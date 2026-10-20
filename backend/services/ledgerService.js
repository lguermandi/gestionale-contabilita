const { fetchRawData } = require('./googleApi');
const { parseTransactions } = require('../domain/parser');

// Punto unico di accesso ai dati contabili: scarica da Google Sheets e normalizza
async function getRawData(anno) {
    return fetchRawData(anno);
}

async function getTransactions(anno) {
    const rawData = await fetchRawData(anno);
    return parseTransactions(rawData);
}

module.exports = { getRawData, getTransactions };
