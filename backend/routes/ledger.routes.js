const express = require('express');
const ledgerService = require('../services/ledgerService');
const { calculateBalances, generateOpenPositions } = require('../domain/reports');

const router = express.Router();

router.get('/ledger/transactions/:anno', async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Accedi a Google Apps Script per leggere i dati.' });
    try {
        const entity = req.query.entity === 'business' ? 'business' : 'private';
        const transactions = await ledgerService.getTransactions(req.params.anno, token, entity);
        return res.json({ totale_transazioni: transactions.length, dati: transactions });
    } catch (error) {
        console.error('Errore durante il caricamento delle registrazioni GAS:', error.message);
        const status = error.status === 401 ? 401 : error.status === 400 ? 400 : 502;
        return res.status(status).json({ error: error.message });
    }
});

router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 128 || password.length > 128) {
        return res.status(400).json({ error: 'Credenziali non valide.' });
    }
    try {
        const session = await ledgerService.authenticate(username, password);
        return res.json(session);
    } catch (error) {
        console.error('Errore durante l’autenticazione GAS:', error.message);
        return res.status(error.status === 401 ? 401 : 502).json({ error: 'Accesso non riuscito.' });
    }
});

router.post('/transactions', async (req, res) => {
    const { token, transaction, entity } = req.body || {};
    if (typeof token !== 'string' || !transaction || typeof transaction !== 'object') {
        return res.status(400).json({ error: 'Sessione o registrazione mancanti.' });
    }
    try {
        const result = await ledgerService.appendTransaction(token, transaction, entity === 'business' ? 'business' : 'private');
        return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
        console.error('Errore durante il salvataggio della registrazione:', error.message);
        return res.status(error.status === 401 ? 401 : 400).json({ error: error.message });
    }
});

router.get('/invoices/:anno', async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Accedi a Google Apps Script per leggere le fatture.' });
    try {
        const invoices = await ledgerService.getInvoices(token, req.params.anno);
        return res.json({ fatture: invoices });
    } catch (error) {
        console.error('Errore durante il caricamento delle fatture:', error.message);
        const status = error.status === 401 ? 401 : error.status === 400 ? 400 : 502;
        return res.status(status).json({ error: error.message });
    }
});

router.post('/invoices', async (req, res) => {
    const { token, invoice } = req.body || {};
    if (typeof token !== 'string' || !invoice || typeof invoice !== 'object') {
        return res.status(400).json({ error: 'Sessione o fattura mancanti.' });
    }
    try {
        const result = await ledgerService.issueInvoice(token, invoice);
        return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
        console.error('Errore durante l’emissione della fattura:', error.message);
        const status = error.status === 401 ? 401 : error.status === 400 ? 400 : 502;
        return res.status(status).json({ error: error.message });
    }
});

// Dati grezzi (per debug)
router.get('/raw-data/:anno', async (req, res) => {
    const anno = req.params.anno;
    try {
        const rawData = await ledgerService.getRawData(anno);
        res.json(rawData);
    } catch (error) {
        console.error('Errore endpoint raw-data:', error);
        res.status(500).json({ errore: 'Errore fetching raw data' });
    }
});

// Transazioni raggruppate e bilanciate in Partita Doppia
router.get('/transactions/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Elaborazione transazioni per l'anno ${anno}...`);
    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);

        res.json({
            totale_transazioni: cleanTransactions.length,
            dati: cleanTransactions
        });
    } catch (error) {
        console.error('Errore endpoint transactions:', error);
        res.status(500).json({ errore: 'Errore durante l\'elaborazione delle transazioni' });
    }
});

// Saldi dei conti calcolati
router.get('/balances/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo saldi per l'anno ${anno}...`);
    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);
        const balances = calculateBalances(cleanTransactions);

        res.json({
            totale_conti: balances.length,
            saldi: balances
        });
    } catch (error) {
        console.error('Errore endpoint balances:', error);
        res.status(500).json({ errore: 'Errore durante il calcolo dei saldi' });
    }
});

// Posizioni aperte (crediti e debiti attivi)
router.get('/ledgers/open-positions/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo posizioni aperte per l'anno ${anno}...`);

    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);
        const openPositions = generateOpenPositions(cleanTransactions);

        res.json({
            posizioni_attive: openPositions.length,
            dettaglio: openPositions
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante il calcolo delle posizioni aperte" });
    }
});

module.exports = router;
