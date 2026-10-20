// Trasforma la timeline giornaliera (un oggetto per giorno, con una chiave per conto) in labels e dataset per Chart.js
export function buildStoricoDatasets(timeline) {
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

    return { labels, datasets };
}
