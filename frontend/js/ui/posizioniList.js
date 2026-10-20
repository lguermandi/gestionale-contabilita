import { formattaNumero } from '../core/format.js';

const LISTA_ID = 'lista-posizioni';

function creaElementoPosizione(pos) {
    const li = document.createElement('li');
    const isCredito = pos.saldo_netto > 0;
    const colore = isCredito ? '#4caf50' : '#f44336';
    const etichetta = isCredito ? 'Credito (ti devono)' : 'Debito (devi)';

    const leftSpan = document.createElement('span');
    const strongName = document.createElement('strong');
    strongName.textContent = pos.soggetto || '';
    leftSpan.appendChild(strongName);

    const small = document.createElement('small');
    small.style.color = '#888';
    small.style.fontSize = '0.85em';
    small.style.marginLeft = '5px';
    small.textContent = etichetta;
    leftSpan.appendChild(small);

    const amount = document.createElement('strong');
    amount.style.color = colore;
    amount.textContent = formattaNumero(Math.abs(pos.saldo_netto));

    li.appendChild(leftSpan);
    li.appendChild(amount);
    return li;
}

export function clearPosizioni() {
    document.getElementById(LISTA_ID).innerHTML = '';
}

export function renderPosizioni(dettaglio) {
    const lista = document.getElementById(LISTA_ID);

    if (dettaglio.length === 0) {
        lista.innerHTML = '<li style="color: #a0a0a0;">Nessuna pendenza attiva. Ottimo!</li>';
        return;
    }

    dettaglio.forEach(pos => lista.appendChild(creaElementoPosizione(pos)));
}
