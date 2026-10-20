function generateTimeSeries(transactions) {
    const timeSeries = [];
    const runningBalances = {};
    const dailyAggregates = {};

    // 1. Raggruppa i movimenti per data esatta
    transactions.forEach(tx => {
        const data = tx.data;
        if (!dailyAggregates[data]) {
            dailyAggregates[data] = [];
        }
        dailyAggregates[data].push(...tx.movimenti);
    });

    // 2. Ordina le date cronologicamente (dalla più vecchia alla più recente)
    const sortedDates = Object.keys(dailyAggregates).sort();

    // 3. Scorre i giorni e aggiorna il pallottoliere
    sortedDates.forEach(date => {
        const movimentiGiorno = dailyAggregates[date];

        movimentiGiorno.forEach(mov => {
            if (!mov.conto) return;
            const conto = mov.conto;

            // Inizializza il conto a zero se è la prima volta che lo incontra
            if (!runningBalances[conto]) {
                runningBalances[conto] = 0;
            }

            // Calcola la variazione: Dare (positivo) - Avere (negativo)
            runningBalances[conto] += (mov.dare - mov.avere);
        });

        // 4. Scatta la "fotografia" dei saldi per questo specifico giorno
        const snapshot = { data: date };
        for (const [conto, saldo] of Object.entries(runningBalances)) {
            // Per comodità di analisi, filtriamo via i conti a saldo zero
            if (Math.abs(saldo) > 0.01) {
                snapshot[conto] = Number(saldo.toFixed(2));
            }
        }

        timeSeries.push(snapshot);
    });

    return timeSeries;
}

module.exports = { generateTimeSeries };
