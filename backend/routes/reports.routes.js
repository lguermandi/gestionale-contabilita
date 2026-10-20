const express = require('express');
const ledgerService = require('../services/ledgerService');
const { generateMonthlyReport, generateGestioniReport, generateTimeSeries } = require('../domain/reports');

const router = express.Router();

// Consuntivo mensile (matrice P&L)
router.get('/pnl/monthly/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Generazione consuntivo mensile per l'anno ${anno}...`);

    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);
        const monthlyReport = generateMonthlyReport(cleanTransactions);

        res.json({
            totale_categorie: monthlyReport.length,
            report: monthlyReport
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante l'elaborazione del consuntivo" });
    }
});

// Marginalità per gestioni (Tipica, Finanziaria, ecc.)
router.get('/analytics/gestioni/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo marginalità gestioni per l'anno ${anno}...`);
    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);
        const gestioniReport = generateGestioniReport(cleanTransactions);

        res.json(gestioniReport);
    } catch (error) {
        console.error('Errore endpoint gestioni:', error);
        res.status(500).json({ errore: 'Errore durante il calcolo delle gestioni' });
    }
});

// Serie storica dei saldi (timeline giornaliera)
router.get('/timeseries/balances/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Generazione serie storica per l'anno ${anno}...`);

    try {
        const cleanTransactions = await ledgerService.getTransactions(anno);
        const timeSeries = generateTimeSeries(cleanTransactions);

        res.json({
            giorni_tracciati: timeSeries.length,
            timeline: timeSeries
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante la generazione della serie storica" });
    }
});

module.exports = router;
