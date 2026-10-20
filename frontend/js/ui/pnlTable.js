import { MESI } from '../core/constants.js';
import { formattaNumero } from '../core/format.js';

const CORPO_ID = 'corpo-tabella-pnl';

function creaRigheConto(righe, coloreBordo) {
    return righe.map(riga => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #333";

        const tdName = document.createElement('td');
        tdName.style.textAlign = 'left';
        tdName.style.padding = '8px';
        tdName.style.borderLeft = `3px solid ${coloreBordo}`;
        tdName.textContent = riga.conto || '';
        tr.appendChild(tdName);

        MESI.forEach(mese => {
            const td = document.createElement('td');
            td.style.padding = '8px';
            td.style.color = '#a0a0a0';
            td.style.textAlign = 'right';
            const valore = riga[mese];
            td.textContent = valore === 0 ? '-' : formattaNumero(Math.abs(valore));
            tr.appendChild(td);
        });

        const tdTot = document.createElement('td');
        tdTot.style.padding = '8px';
        tdTot.style.fontWeight = 'bold';
        tdTot.style.color = '#fff';
        tdTot.style.textAlign = 'right';
        tdTot.textContent = formattaNumero(Math.abs(riga.totale_anno));
        tr.appendChild(tdTot);

        return tr;
    });
}

function creaIntestazioneSezione(testo, sfondo, colore) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="14" style="background-color: ${sfondo}; color: ${colore}; font-weight: bold; padding: 8px; text-transform: uppercase;">${testo}</td>`;
    return tr;
}

function creaRigaUtile(utile) {
    const tr = document.createElement('tr');
    tr.style.borderTop = "2px solid #666";
    tr.style.backgroundColor = "rgba(255, 255, 255, 0.05)";

    let html = `<td style="text-align: left; padding: 12px 8px; font-weight: bold; color: #fff; text-transform: uppercase;">Utile Mensile</td>`;

    MESI.forEach(m => {
        const val = utile[m];
        const colore = val > 0 ? '#4caf50' : (val < 0 ? '#f44336' : '#a0a0a0');
        const testo = val === 0 ? "-" : formattaNumero(val);
        html += `<td style="padding: 12px 8px; font-weight: bold; color: ${colore}; text-align: right;">${testo}</td>`;
    });

    const colorTotale = utile.totale_anno > 0 ? '#4caf50' : (utile.totale_anno < 0 ? '#f44336' : '#a0a0a0');
    html += `<td style="padding: 12px 8px; font-weight: bold; color: ${colorTotale}; text-align: right; font-size: 1.1em;">${formattaNumero(utile.totale_anno)}</td>`;

    tr.innerHTML = html;
    return tr;
}

export function clearPnlTable() {
    document.getElementById(CORPO_ID).innerHTML = '';
}

export function renderPnlTable({ ricavi, costi, utile }) {
    const corpo = document.getElementById(CORPO_ID);

    corpo.appendChild(creaIntestazioneSezione('Entrate / Ricavi', 'rgba(76, 175, 80, 0.15)', '#4caf50'));
    creaRigheConto(ricavi, '#4caf50').forEach(tr => corpo.appendChild(tr));

    corpo.appendChild(creaIntestazioneSezione('Uscite / Costi', 'rgba(244, 67, 54, 0.15)', '#f44336'));
    creaRigheConto(costi, '#f44336').forEach(tr => corpo.appendChild(tr));

    corpo.appendChild(creaRigaUtile(utile));
}
