function calculateBalances(transactions) {
    const balances = {};

    transactions.forEach(tx => {
        tx.movimenti.forEach(mov => {
            if (!mov.conto) return; // Salta righe senza nome conto
            
            const contoNome = mov.conto;
            
            // Inizializza il conto se non esiste ancora nell'oggetto
            if (!balances[contoNome]) {
                balances[contoNome] = {
                    conto: contoNome,
                    totale_dare: 0,
                    totale_avere: 0,
                    saldo: 0
                };
            }
            
            // Somma gli importi
            balances[contoNome].totale_dare += mov.dare;
            balances[contoNome].totale_avere += mov.avere;
        });
    });

    // Calcola il saldo finale (Dare - Avere) e arrotonda per evitare bug sui decimali
    // Infine, converte l'oggetto in un array ordinato alfabeticamente per nome conto
    return Object.values(balances).map(conto => {
        conto.totale_dare = Number(conto.totale_dare.toFixed(2));
        conto.totale_avere = Number(conto.totale_avere.toFixed(2));
        conto.saldo = Number((conto.totale_dare - conto.totale_avere).toFixed(2));
        return conto;
    }).sort((a, b) => a.conto.localeCompare(b.conto));
}


function generateMonthlyReport(transactions) {
    const matrix = {};
    const mesi = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

    transactions.forEach(tx => {
        if (!tx.data) return;
        const mese = tx.data.split('-')[1]; 

        tx.movimenti.forEach(mov => {
            // IL FILTRO MAGICO: Se non c'è una gestione, è un conto patrimoniale. Lo saltiamo.
            if (!mov.gestione || mov.gestione.trim() === "") return;

            const contoNome = mov.conto;

            if (!matrix[contoNome]) {
                matrix[contoNome] = { conto: contoNome, gestione: mov.gestione, totale_anno: 0 };
                mesi.forEach(m => matrix[contoNome][m] = 0);
            }

            // Costi in positivo, Ricavi in negativo
            const netto = mov.dare - mov.avere;
            matrix[contoNome][mese] += netto;
            matrix[contoNome].totale_anno += netto;
        });
    });

    return Object.values(matrix).map(riga => {
        mesi.forEach(m => riga[m] = Number(riga[m].toFixed(2)));
        riga.totale_anno = Number(riga.totale_anno.toFixed(2));
        return riga;
    }).sort((a, b) => a.conto.localeCompare(b.conto));
}

function generateGestioniReport(transactions) {
    const gestioni = {};

    transactions.forEach(tx => {
        tx.movimenti.forEach(mov => {
            if (!mov.gestione || mov.gestione.trim() === "") return;
            
            const nomeGestione = mov.gestione.toLowerCase();

            if (!gestioni[nomeGestione]) {
                gestioni[nomeGestione] = {
                    gestione: nomeGestione,
                    totale_costi: 0,
                    totale_ricavi: 0,
                    utile: 0
                };
            }

            gestioni[nomeGestione].totale_costi += mov.dare;
            gestioni[nomeGestione].totale_ricavi += mov.avere;
        });
    });

    return Object.values(gestioni).map(g => {
        g.totale_costi = Number(g.totale_costi.toFixed(2));
        g.totale_ricavi = Number(g.totale_ricavi.toFixed(2));
        
        // Utile = Ricavi (Avere) - Costi (Dare)
        g.utile = Number((g.totale_ricavi - g.totale_costi).toFixed(2));
        g.margine = g.totale_ricavi > 0 ? Number(((g.utile / g.totale_ricavi) * 100).toFixed(1)) + "%" : "N/A";

        return g;
    });
}


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

function generateOpenPositions(transactions) {
    const positions = {};

    // Definiamo quali conti il sistema deve monitorare come pendenze.
    // Assicurati che i nomi corrispondano esattamente a quelli che usi su Excel.
    const contiMonitorati = ["crediti v/altri", "crediti v/genitori", "debiti v/altri", "debiti diversi"];

    transactions.forEach(tx => {
        tx.movimenti.forEach(mov => {
            if (!mov.conto || !mov.descrizione) return;
            
            const conto = mov.conto.toLowerCase();
            
            // Filtriamo solo i conti monitorati e ignoriamo le righe senza nome nella descrizione
            if (contiMonitorati.includes(conto) && mov.descrizione.trim() !== "") {
                const soggetto = mov.descrizione.trim();
                
                if (!positions[soggetto]) {
                    positions[soggetto] = {
                        soggetto: soggetto,
                        conto_origine: mov.conto,
                        totale_dare: 0,
                        totale_avere: 0,
                        saldo_netto: 0
                    };
                }
                
                // Aggiorniamo i contatori
                positions[soggetto].totale_dare += mov.dare;
                positions[soggetto].totale_avere += mov.avere;
            }
        });
    });

    // Calcoliamo il saldo netto e filtriamo chi ha già saldato
    return Object.values(positions)
        .map(pos => {
            // Saldo = Dare - Avere. 
            // Risultato Positivo = Credito (ti devono soldi). Risultato Negativo = Debito (devi soldi).
            pos.saldo_netto = Number((pos.totale_dare - pos.totale_avere).toFixed(2));
            return pos;
        })
        // Filtro magico: se il saldo è tra -0.01 e +0.01 lo consideriamo chiuso e lo nascondiamo
        .filter(pos => Math.abs(pos.saldo_netto) > 0.01)
        // Ordiniamo la lista: prima chi ti deve più soldi, poi scendendo fino ai tuoi debiti maggiori
        .sort((a, b) => b.saldo_netto - a.saldo_netto);
}

// Esporta la nuova funzione insieme alle altre
module.exports = { 
    calculateBalances, 
    generateMonthlyReport, 
    generateGestioniReport, 
    generateTimeSeries, 
    generateOpenPositions
};

