import { describe, expect, it } from 'vitest'
import { buildAccountingReports, buildMonthlyIncomeSeries, validateTransaction, type LedgerTransaction } from './accounting'

const transactions: LedgerTransaction[] = [
  {
    id: 'tx-1',
    data: '2026-01-01',
    totale: 100,
    movimenti: [
      { conto: 'Banca', descrizione: 'Incasso', gestione: '', dare: 100, avere: 0 },
      { conto: 'Ricavi vendite', descrizione: 'Vendita', gestione: 'Tipica', dare: 0, avere: 100 },
    ],
  },
  {
    id: 'tx-2',
    data: '2026-01-02',
    totale: 30,
    movimenti: [
      { conto: 'Costi materiali', descrizione: 'Acquisto', gestione: 'Tipica', dare: 30, avere: 0 },
      { conto: 'Banca', descrizione: 'Pagamento', gestione: '', dare: 0, avere: 30 },
    ],
  },
]

describe('motore contabile', () => {
  it('accetta una scrittura quadrata e rifiuta una scrittura sbilanciata', () => {
    expect(validateTransaction(transactions[0])).toEqual([])
    expect(validateTransaction({
      data: '2026-01-01',
      movimenti: [
        { conto: 'Cassa', descrizione: '', gestione: '', dare: 10, avere: 0 },
        { conto: 'Ricavi', descrizione: '', gestione: 'Tipica', dare: 0, avere: 9.99 },
      ],
    })).toContain('Il totale Dare deve essere uguale al totale Avere e maggiore di zero.')
  })

  it('rifiuta date impossibili', () => {
    expect(validateTransaction({
      data: '2026-02-31',
      movimenti: transactions[0].movimenti,
    })).toContain('Inserisci una data valida.')
  })

  it('calcola utile, stato patrimoniale e liquidità mantenendo il pareggio', () => {
    const reports = buildAccountingReports(transactions)

    expect(reports.contoEconomico).toMatchObject({ ricavi: 100, costi: 30, utile: 70 })
    expect(reports.statoPatrimoniale.totaleAttivita).toBe(70)
    expect(reports.statoPatrimoniale.totalePassivita).toBe(70)
    expect(reports.liquidita).toEqual([
      { data: '2026-01-01', saldo: 100, variazione: 100 },
      { data: '2026-01-02', saldo: 70, variazione: -30 },
    ])
  })

  it('raggruppa ricavi e costi per mese e ignora gli altri esercizi', () => {
    const series = buildMonthlyIncomeSeries([
      ...transactions,
      {
        id: 'tx-3',
        data: '2025-01-10',
        totale: 500,
        movimenti: [
          { conto: 'Banca', descrizione: 'Incasso', gestione: '', dare: 500, avere: 0 },
          { conto: 'Ricavi vendite', descrizione: 'Vendita', gestione: 'Tipica', dare: 0, avere: 500 },
        ],
      },
    ], 2026)

    expect(series).toHaveLength(12)
    expect(series[0]).toEqual({ mese: 1, ricavi: 100, costi: 30 })
    expect(series[1]).toEqual({ mese: 2, ricavi: 0, costi: 0 })
  })
})