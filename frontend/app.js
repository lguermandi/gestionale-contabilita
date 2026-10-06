// Nuova funzione: formatta in stile italiano (es. 1.234,50) senza simbolo dell'Euro
const formattaNumero = (numero) => {
    return new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numero);
};

let graficoStorico = null; 
let databaseSaldi = []; 

async function caricaDati(anno) {
    const statusEl = document.getElementById('status-connessione');
    const corpoTabella = document.getElementById('corpo-tabella-pnl');
    const corpoGestioni = document.getElementById('corpo-gestioni');
    const listaPosizioni = document.getElementById('lista-posizioni');

    corpoTabella.innerHTML = '';
    corpoGestioni.innerHTML = '';
    listaPosizioni.innerHTML = '';
    statusEl.innerText = "Caricamento in corso... ⏳";
    statusEl.style.color = "#ff9800";

    try {
        // --- 1. SALDI (Scaricati ma NON stampati a video) ---
        const resSaldi = await fetch(`http://localhost:3000/api/balances/${anno}`);
        const dataSaldi = await resSaldi.json();
        databaseSaldi = dataSaldi.saldi;

        // --- 2. GRAFICO STORICO ---
        const resStorico = await fetch(`http://localhost:3000/api/timeseries/balances/${anno}`);
        const dataStorico = await resStorico.json();
        const timeline = dataStorico.timeline;

        const labels = timeline.map(giorno => giorno.data);
        const nomiConti = new Set();
        timeline.forEach(giorno => {
            Object.keys(giorno).forEach(chiave => {
                if (chiave !== 'data') nomiConti.add(chiave);
            });
        });

        const datasets = Array.from(nomiConti).map((conto, index) => {
            const hue = index * 137.5; 
            const colore = `hsl(${hue % 360}, 70%, 60%)`;
            return {
                label: conto,
                data: timeline.map(giorno => giorno[conto] || 0), 
                borderColor: colore,
                backgroundColor: colore,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 10,
                tension: 0.2
            };
        });

        if (graficoStorico) {
            graficoStorico.destroy();
        }

        const ctx = document.getElementById('storicoChart').getContext('2d');
        graficoStorico = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#e0e0e0' } },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: function(context) { 
                                return context.dataset.label + ': ' + formattaNumero(Math.abs(context.parsed.y)); 
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
                    y: { 
                        ticks: { 
                            color: '#a0a0a0', 
                            callback: function(value) { 
                                return formattaNumero(Math.abs(value)); 
                            } 
                        }, 
                        grid: { color: '#333' } 
                    }
                }
            }
        });

        // --- 3. CONSUNTIVO MENSILE (SEPARATO E CON UTILE) ---
        const resPnl = await fetch(`http://localhost:3000/api/pnl/monthly/${anno}`);
        const dataPnl = await resPnl.json();
        const mesi = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

        // 3.1 Dividiamo i conti: i Costi hanno totale > 0, i Ricavi totale < 0
        const costi = dataPnl.report.filter(r => r.totale_anno > 0);
        const ricavi = dataPnl.report.filter(r => r.totale_anno < 0);

        // 3.2 Inizializziamo i contatori per calcolare l'Utile (Ricavi - Costi)
        const utileMensile = { totale_anno: 0 };
        mesi.forEach(m => utileMensile[m] = 0);

        // Funzione helper per disegnare le righe della tabella (sicura, senza innerHTML)
        const generaRighe = (array, coloreBordo) => {
            array.forEach(riga => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #333";

                const tdName = document.createElement('td');
                tdName.style.textAlign = 'left';
                tdName.style.padding = '8px';
                tdName.style.borderLeft = `3px solid ${coloreBordo}`;
                tdName.textContent = riga.conto || '';
                tr.appendChild(tdName);

                meses.forEach(mese => {
                    const td = document.createElement('td');
                    td.style.padding = '8px';
                    td.style.color = '#a0a0a0';
                    td.style.textAlign = 'right';
                    const valore = riga[mese];
                    td.textContent = valore === 0 ? '-' : formattaNumero(Math.abs(valore));
                    tr.appendChild(td);

                    // Aggiorniamo il contatore dell'Utile (Ricavi in Avere sono negativi, li invertiamo)
                    utileMensile[mese] += (-valore);
                });

                utileMensile.totale_anno += (-riga.totale_anno);

                const tdTot = document.createElement('td');
                tdTot.style.padding = '8px';
                tdTot.style.fontWeight = 'bold';
                tdTot.style.color = '#fff';
                tdTot.style.textAlign = 'right';
                tdTot.textContent = formattaNumero(Math.abs(riga.totale_anno));
                tr.appendChild(tdTot);

                corpoTabella.appendChild(tr);
            });
        };

        // 3.3 Disegniamo la sezione ENTRATE
        const trIntestazioneRicavi = document.createElement('tr');
        trIntestazioneRicavi.innerHTML = `<td colspan="14" style="background-color: rgba(76, 175, 80, 0.15); color: #4caf50; font-weight: bold; padding: 8px; text-transform: uppercase;">Entrate / Ricavi</td>`;
        corpoTabella.appendChild(trIntestazioneRicavi);
        generaRighe(ricavi, '#4caf50');

        // 3.4 Disegniamo la sezione USCITE
        const trIntestazioneCosti = document.createElement('tr');
        trIntestazioneCosti.innerHTML = `<td colspan="14" style="background-color: rgba(244, 67, 54, 0.15); color: #f44336; font-weight: bold; padding: 8px; text-transform: uppercase;">Uscite / Costi</td>`;
        corpoTabella.appendChild(trIntestazioneCosti);
        generaRighe(costi, '#f44336');

        // 3.5 Disegniamo la riga finale dell'UTILE
        const trUtile = document.createElement('tr');
        trUtile.style.borderTop = "2px solid #666";
        trUtile.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
        
        let htmlUtile = `<td style="text-align: left; padding: 12px 8px; font-weight: bold; color: #fff; text-transform: uppercase;">Utile Mensile</td>`;
        
        mesi.forEach(m => {
            const val = utileMensile[m];
            const colore = val > 0 ? '#4caf50' : (val < 0 ? '#f44336' : '#a0a0a0');
            const testo = val === 0 ? "-" : formattaNumero(val);
            htmlUtile += `<td style="padding: 12px 8px; font-weight: bold; color: ${colore}; text-align: right;">${testo}</td>`;
        });
        
        const colorTotale = utileMensile.totale_anno > 0 ? '#4caf50' : (utileMensile.totale_anno < 0 ? '#f44336' : '#a0a0a0');
        htmlUtile += `<td style="padding: 12px 8px; font-weight: bold; color: ${colorTotale}; text-align: right; font-size: 1.1em;">${formattaNumero(utileMensile.totale_anno)}</td>`;
        
        trUtile.innerHTML = htmlUtile;
        corpoTabella.appendChild(trUtile);

        // --- 4. GESTIONI ---
        const resGestioni = await fetch(`http://localhost:3000/api/analytics/gestioni/${anno}`);
        const dataGestioni = await resGestioni.json();

        dataGestioni.forEach(g => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #333";
            const colorUtile = g.utile >= 0 ? '#4caf50' : '#f44336';

            const tdGest = document.createElement('td');
            tdGest.style.padding = '8px';
            tdGest.style.textTransform = 'capitalize';
            tdGest.style.fontWeight = 'bold';
            tdGest.textContent = g.gestione || '';
            tr.appendChild(tdGest);

            const tdRic = document.createElement('td');
            tdRic.style.padding = '8px';
            tdRic.style.color = '#a0a0a0';
            tdRic.style.textAlign = 'right';
            tdRic.textContent = formattaNumero(g.totale_ricavi);
            tr.appendChild(tdRic);

            const tdCost = document.createElement('td');
            tdCost.style.padding = '8px';
            tdCost.style.color = '#a0a0a0';
            tdCost.style.textAlign = 'right';
            tdCost.textContent = formattaNumero(g.totale_costi);
            tr.appendChild(tdCost);

            const tdUtile = document.createElement('td');
            tdUtile.style.padding = '8px';
            tdUtile.style.fontWeight = 'bold';
            tdUtile.style.color = colorUtile;
            tdUtile.style.textAlign = 'right';
            tdUtile.textContent = formattaNumero(g.utile);
            tr.appendChild(tdUtile);

            const tdMarg = document.createElement('td');
            tdMarg.style.padding = '8px';
            tdMarg.style.textAlign = 'right';
            tdMarg.textContent = (g.margine || '').replace('.', ',');
            tr.appendChild(tdMarg);

            corpoGestioni.appendChild(tr);
        });

        // --- 5. POSIZIONI APERTE ---
        const resPosizioni = await fetch(`http://localhost:3000/api/ledgers/open-positions/${anno}`);
        const dataPosizioni = await resPosizioni.json();

        if (dataPosizioni.dettaglio.length === 0) {
            listaPosizioni.innerHTML = '<li style="color: #a0a0a0;">Nessuna pendenza attiva. Ottimo!</li>';
        } else {
            dataPosizioni.dettaglio.forEach(pos => {
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
                listaPosizioni.appendChild(li);
            });
        }

        statusEl.innerText = "Backend Connesso 🟢";
        statusEl.style.color = "#4caf50";

    } catch (error) {
        console.error("Errore:", error);
        statusEl.innerText = "Errore di connessione 🔴";
        statusEl.style.color = "#f44336";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const annoIniziale = document.getElementById('selettore-anno').value;
    caricaDati(annoIniziale);
});

document.getElementById('selettore-anno').addEventListener('change', (evento) => {
    const nuovoAnno = evento.target.value;
    caricaDati(nuovoAnno);
});