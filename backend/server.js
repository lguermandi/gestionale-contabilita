const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { fetchRawData } = require('./services/googleApi');
const { parseTransactions } = require('./utils/parser');
const { calculateBalances, 
        generateMonthlyReport, 
        generateGestioniReport, 
        generateTimeSeries ,
        generateOpenPositions
    } = require('./analytics/statsEngine');

const app = express();
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
    origin: function(origin, callback) {
        // allow non-browser tools (curl/postman) when origin is undefined
        if (!origin) return callback(null, true);

        // allow common local dev origins when in development mode
        if (isDev && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
            return callback(null, true);
        }

        if (allowedOrigins.length === 0 || allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json());

// Simple API key middleware: define API_KEY in .env to enable protection
const API_KEY = process.env.API_KEY || '';
app.use((req, res, next) => {
    // If no API key configured, allow all (developer convenience)
    if (!API_KEY) return next();

    // Allow local development hosts to bypass the API key even if set (useful while testing)
    if (isDev && req.headers.origin && (req.headers.origin.startsWith('http://localhost') || req.headers.origin.startsWith('http://127.0.0.1'))) {
        return next();
    }

    const key = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (key === API_KEY) return next();
    res.status(401).json({ error: 'Unauthorized' });
});

// Endpoint 1: Dati grezzi (per debug)
app.get('/api/raw-data/:anno', async (req, res) => {
    const anno = req.params.anno;
    try {
        const rawData = await fetchRawData(anno);
        res.json(rawData);
    } catch (error) {
        console.error('Errore endpoint raw-data:', error);
        res.status(500).json({ errore: 'Errore fetching raw data' });
    }
});

// Endpoint 2: Transazioni raggruppate e bilanciate in Partita Doppia (IL VERO MOTORE) <-- AGGIUNTO
app.get('/api/transactions/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Elaborazione transazioni per l'anno ${anno}...`);
    try {
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        
        res.json({
            totale_transazioni: cleanTransactions.length,
            dati: cleanTransactions
        });
    } catch (error) {
        console.error('Errore endpoint transactions:', error);
        res.status(500).json({ errore: 'Errore durante l\'elaborazione delle transazioni' });
    }
});

// Endpoint 3: Saldi dei conti calcolati <-- AGGIUNTO
app.get('/api/balances/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo saldi per l'anno ${anno}...`);
    try {
        // 1. Scarica e pulisci i dati
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        
        // 2. Passa i dati puliti al motore statistico
        const balances = calculateBalances(cleanTransactions);
        
        // 3. Invia il risultato
        res.json({
            totale_conti: balances.length,
            saldi: balances
        });
    } catch (error) {
        console.error('Errore endpoint balances:', error);
        res.status(500).json({ errore: 'Errore durante il calcolo dei saldi' });
    }
});

// Endpoint 4: Consuntivo Mensile (Matrice P&L)
app.get('/api/pnl/monthly/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Generazione consuntivo mensile per l'anno ${anno}...`);
    
    try {
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        
        const monthlyReport = generateMonthlyReport(cleanTransactions);
        
        res.json({
            totale_categorie: monthlyReport.length,
            report: monthlyReport
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante l'elaborazione del consuntivo" });
    }
});

// Endpoint 5: Marginalità per Gestioni (Tipica, Finanziaria, ecc.)
app.get('/api/analytics/gestioni/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo marginalità gestioni per l'anno ${anno}...`);
    try {
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        const gestioniReport = generateGestioniReport(cleanTransactions);
        
        res.json(gestioniReport);
    } catch (error) {
        console.error('Errore endpoint gestioni:', error);
        res.status(500).json({ errore: 'Errore durante il calcolo delle gestioni' });
    }
});

// Endpoint 6: Serie Storica dei Saldi (Timeline giornaliera)
app.get('/api/timeseries/balances/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Generazione serie storica per l'anno ${anno}...`);
    
    try {
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        const timeSeries = generateTimeSeries(cleanTransactions);
        
        res.json({
            giorni_tracciati: timeSeries.length,
            timeline: timeSeries
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante la generazione della serie storica" });
    }
});

// Endpoint 7: Posizioni Aperte (Crediti e Debiti attivi)
app.get('/api/ledgers/open-positions/:anno', async (req, res) => {
    const anno = req.params.anno;
    console.log(`Calcolo posizioni aperte per l'anno ${anno}...`);
    
    try {
        const rawData = await fetchRawData(anno);
        const cleanTransactions = parseTransactions(rawData);
        const openPositions = generateOpenPositions(cleanTransactions);
        
        res.json({
            posizioni_attive: openPositions.length,
            dettaglio: openPositions
        });
    } catch (error) {
        res.status(500).json({ errore: "Errore durante il calcolo delle posizioni aperte" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server gestionale in ascolto su http://localhost:${PORT}`);
});