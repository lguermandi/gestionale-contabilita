import { fetchSaldi, fetchTimeseries, fetchPnlMensile, fetchGestioni, fetchPosizioniAperte } from './api/ledgerApi.js';
import { buildStoricoDatasets } from './core/storico.js';
import { dividiRicaviCosti, calcolaUtileMensile } from './core/pnl.js';
import { mostraCaricamento, mostraConnesso, mostraErrore } from './ui/status.js';
import { renderStoricoChart } from './ui/storicoChart.js';
import { clearPnlTable, renderPnlTable } from './ui/pnlTable.js';
import { clearGestioni, renderGestioni } from './ui/gestioniTable.js';
import { clearPosizioni, renderPosizioni } from './ui/posizioniList.js';

const state = {
    saldi: []
};

async function caricaDati(anno) {
    clearPnlTable();
    clearGestioni();
    clearPosizioni();
    mostraCaricamento();

    try {
        // I saldi vengono scaricati e tenuti in memoria, non mostrati a video
        const dataSaldi = await fetchSaldi(anno);
        state.saldi = dataSaldi.saldi;

        const dataStorico = await fetchTimeseries(anno);
        renderStoricoChart(buildStoricoDatasets(dataStorico.timeline));

        const dataPnl = await fetchPnlMensile(anno);
        const { ricavi, costi } = dividiRicaviCosti(dataPnl.report);
        renderPnlTable({ ricavi, costi, utile: calcolaUtileMensile(ricavi, costi) });

        const dataGestioni = await fetchGestioni(anno);
        renderGestioni(dataGestioni);

        const dataPosizioni = await fetchPosizioniAperte(anno);
        renderPosizioni(dataPosizioni.dettaglio);

        mostraConnesso();
    } catch (error) {
        console.error("Errore:", error);
        mostraErrore();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const selettoreAnno = document.getElementById('selettore-anno');
    caricaDati(selettoreAnno.value);

    selettoreAnno.addEventListener('change', (evento) => {
        caricaDati(evento.target.value);
    });
});
