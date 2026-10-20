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

module.exports = { calculateBalances };
