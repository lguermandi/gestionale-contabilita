const { CONTI_MONITORATI } = require('../constants');

function generateOpenPositions(transactions) {
    const positions = {};

    transactions.forEach(tx => {
        tx.movimenti.forEach(mov => {
            if (!mov.conto || !mov.descrizione) return;
            
            const conto = mov.conto.toLowerCase();
            
            // Filtriamo solo i conti monitorati e ignoriamo le righe senza nome nella descrizione
            if (CONTI_MONITORATI.includes(conto) && mov.descrizione.trim() !== "") {
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

module.exports = { generateOpenPositions };
