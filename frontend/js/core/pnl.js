import { MESI } from './constants.js';

// Ricavi hanno totale < 0 (in Avere), costi hanno totale > 0 (in Dare)
export function dividiRicaviCosti(report) {
    return {
        ricavi: report.filter(r => r.totale_anno < 0),
        costi: report.filter(r => r.totale_anno > 0)
    };
}

// Utile = ricavi - costi, quindi i valori dei conti vanno invertiti di segno
export function calcolaUtileMensile(ricavi, costi) {
    const utile = { totale_anno: 0 };
    MESI.forEach(m => utile[m] = 0);

    [...ricavi, ...costi].forEach(riga => {
        MESI.forEach(m => {
            utile[m] += (-riga[m]);
        });
        utile.totale_anno += (-riga.totale_anno);
    });

    return utile;
}
