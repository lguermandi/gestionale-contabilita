function parseTransactions(rawData) {
    const transactions = [];
    let currentEntries = [];
    let runningDare = 0;
    let runningAvere = 0;
    let transactionCounter = 1;

    function sanitizeString(s, maxLen = 200) {
        if (!s) return "";
        return String(s).trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLen);
    }

    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];

        // 1. Pulizia dei valori: trasforma "" in 0
        const dare = Number(row.dare) || 0;
        const avere = Number(row.avere) || 0;

        // Salta eventuali righe di Excel completamente vuote
        if (dare === 0 && avere === 0) continue;

        // Formatta la data (prende solo YYYY-MM-DD)
        const cleanDate = row.data ? row.data.split('T')[0] : "";

        // Aggiunge il singolo movimento al "cassetto" temporaneo
        currentEntries.push({
            conto: sanitizeString(row.conto),
            descrizione: sanitizeString(row.descrizione),
            gestione: sanitizeString(row.gestione),
            dare: Number(dare.toFixed(2)),
            avere: Number(avere.toFixed(2))
        });

        runningDare += dare;
        runningAvere += avere;

        // 2. Controllo di quadratura (differenza minore di 1 centesimo per evitare bug JS)
        const diff = Math.abs(runningDare - runningAvere);

        if (diff < 0.01 && runningDare > 0) {
            // I conti tornano a zero! Impacchettiamo la transazione
            transactions.push({
                id: `TX-${cleanDate}-${String(transactionCounter).padStart(3, '0')}`,
                data: cleanDate,
                totale: Number(runningDare.toFixed(2)),
                movimenti: currentEntries
            });

            // Svuota il cassetto e azzera i contatori per la prossima operazione
            currentEntries = [];
            runningDare = 0;
            runningAvere = 0;
            transactionCounter++;
        }
    }

    // Se alla fine del file il cassetto non è vuoto, c'è un errore nel bilancio Excel
    if (currentEntries.length > 0) {
        console.warn("ATTENZIONE: Trovate righe sbilanciate alla fine del file!");
    }

    return transactions;
}

module.exports = { parseTransactions };