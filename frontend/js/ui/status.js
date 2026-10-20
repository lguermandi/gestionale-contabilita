function impostaStato(testo, colore) {
    const statusEl = document.getElementById('status-connessione');
    statusEl.innerText = testo;
    statusEl.style.color = colore;
}

export const mostraCaricamento = () => impostaStato("Caricamento in corso... ⏳", "#ff9800");
export const mostraConnesso = () => impostaStato("Backend Connesso 🟢", "#4caf50");
export const mostraErrore = () => impostaStato("Errore di connessione 🔴", "#f44336");
