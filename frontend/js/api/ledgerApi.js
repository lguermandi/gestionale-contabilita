import { API_BASE_URL } from '../config.js';

async function getJson(percorso) {
    const risposta = await fetch(`${API_BASE_URL}${percorso}`);
    return risposta.json();
}

export const fetchSaldi = (anno) => getJson(`/balances/${anno}`);
export const fetchTimeseries = (anno) => getJson(`/timeseries/balances/${anno}`);
export const fetchPnlMensile = (anno) => getJson(`/pnl/monthly/${anno}`);
export const fetchGestioni = (anno) => getJson(`/analytics/gestioni/${anno}`);
export const fetchPosizioniAperte = (anno) => getJson(`/ledgers/open-positions/${anno}`);
