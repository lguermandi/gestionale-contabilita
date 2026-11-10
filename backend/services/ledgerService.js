const { fetchRawData, postGasAction } = require('./googleApi');
const { parseTransactions } = require('../domain/parser');

// Punto unico di accesso ai dati contabili: scarica da Google Sheets e normalizza
async function getRawData(anno) {
    return fetchRawData(anno);
}

async function getTransactions(anno, token, entity = 'private') {
    if (token) {
        return postGasAction('getTransactions', { token, anno, entity });
    }
    const rawData = await fetchRawData(anno);
    return parseTransactions(rawData);
}

async function authenticate(username, password) {
    return postGasAction('login', { username, password });
}

async function appendTransaction(token, transaction, entity = 'private') {
    return postGasAction('appendTransaction', { token, transaction, entity });
}

async function getInvoices(token, anno) {
    return postGasAction('getInvoices', { token, anno });
}

async function issueInvoice(token, invoice) {
    return postGasAction('issueInvoice', { token, invoice });
}

module.exports = { getRawData, getTransactions, authenticate, appendTransaction, getInvoices, issueInvoice };
