// Formato italiano (es. 1.234,50) senza simbolo dell'Euro
export const formattaNumero = (numero) => {
    return new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numero);
};
