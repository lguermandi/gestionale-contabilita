const { MESI } = require('../constants');

function generateMonthlyReport(transactions) {
    const matrix = {};

    transactions.forEach(tx => {
        if (!tx.data) return;
        const mese = tx.data.split('-')[1]; 

        tx.movimenti.forEach(mov => {
            // IL FILTRO MAGICO: Se non c'è una gestione, è un conto patrimoniale. Lo saltiamo.
            if (!mov.gestione || mov.gestione.trim() === "") return;

            const contoNome = mov.conto;

            if (!matrix[contoNome]) {
                matrix[contoNome] = { conto: contoNome, gestione: mov.gestione, totale_anno: 0 };
                MESI.forEach(m => matrix[contoNome][m] = 0);
            }

            // Costi in positivo, Ricavi in negativo
            const netto = mov.dare - mov.avere;
            matrix[contoNome][mese] += netto;
            matrix[contoNome].totale_anno += netto;
        });
    });

    return Object.values(matrix).map(riga => {
        MESI.forEach(m => riga[m] = Number(riga[m].toFixed(2)));
        riga.totale_anno = Number(riga.totale_anno.toFixed(2));
        return riga;
    }).sort((a, b) => a.conto.localeCompare(b.conto));
}

module.exports = { generateMonthlyReport };
