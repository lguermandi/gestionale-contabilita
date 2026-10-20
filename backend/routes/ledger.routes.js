const express = require('express');
const ledgerService = require('../services/ledgerService');
const { calculateBalances, generateOpenPositions } = require('../domain/reports');

const router = express.Router();

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
