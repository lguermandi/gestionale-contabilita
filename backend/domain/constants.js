// Codici dei mesi usati come chiavi nei report mensili
const MESI = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

// Conti da monitorare come pendenze (posizioni aperte).
// Assicurati che i nomi corrispondano esattamente a quelli che usi su Excel.
const CONTI_MONITORATI = ["crediti v/altri", "crediti v/genitori", "debiti v/altri", "debiti diversi"];

module.exports = { MESI, CONTI_MONITORATI };
