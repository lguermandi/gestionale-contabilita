import { formattaNumero } from '../core/format.js';

// Chart è caricato globalmente dal CDN di Chart.js in index.html
let grafico = null;

export function renderStoricoChart({ labels, datasets }) {
    if (grafico) {
        grafico.destroy();
    }

    const ctx = document.getElementById('storicoChart').getContext('2d');
    grafico = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    callbacks: {
                        label: function (context) {
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
                        callback: function (value) {
                            return formattaNumero(Math.abs(value));
                        }
                    },
                    grid: { color: '#333' }
                }
            }
        }
    });
}
