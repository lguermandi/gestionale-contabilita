import { formattaNumero } from '../core/format.js';

const CORPO_ID = 'corpo-gestioni';

function creaCella(testo, stile = {}) {
    const td = document.createElement('td');
    td.style.padding = '8px';
    Object.assign(td.style, stile);
    td.textContent = testo;
    return td;
}

function creaRiga(g) {
    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid #333";
    const colorUtile = g.utile >= 0 ? '#4caf50' : '#f44336';

    tr.appendChild(creaCella(g.gestione || '', {
        textTransform: 'capitalize',
        fontWeight: 'bold'
    }));
    tr.appendChild(creaCella(formattaNumero(g.totale_ricavi), {
        color: '#a0a0a0',
        textAlign: 'right'
    }));
    tr.appendChild(creaCella(formattaNumero(g.totale_costi), {
        color: '#a0a0a0',
        textAlign: 'right'
    }));
    tr.appendChild(creaCella(formattaNumero(g.utile), {
        fontWeight: 'bold',
        color: colorUtile,
        textAlign: 'right'
    }));
    tr.appendChild(creaCella((g.margine || '').replace('.', ','), {
        textAlign: 'right'
    }));

    return tr;
}

export function clearGestioni() {
    document.getElementById(CORPO_ID).innerHTML = '';
}

export function renderGestioni(gestioni) {
    const corpo = document.getElementById(CORPO_ID);
    gestioni.forEach(g => corpo.appendChild(creaRiga(g)));
}
