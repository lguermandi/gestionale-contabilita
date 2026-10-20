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

module.exports = { generateGestioniReport };
