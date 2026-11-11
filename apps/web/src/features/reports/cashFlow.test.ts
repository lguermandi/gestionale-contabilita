import { describe, expect, it } from 'vitest'
import { buildAccountingReportsForYear, type LedgerTransaction } from '../../domain/accounting'
import { buildCashFlowStatement } from './cashFlow'

const transactions: LedgerTransaction[] = [
  {
    id: 'opening',
    data: '2025-01-01',
    totale: 1000,
    movimenti: [
      { conto: 'Banca', descrizione: 'Saldo iniziale', gestione: '', dare: 1000, avere: 0 },
      { conto: 'Capitale sociale', descrizione: 'Saldo iniziale', gestione: '', dare: 0, avere: 1000 },
    ],
  },
  {
    id: 'sale-cash',
    data: '2026-01-01',
    totale: 100,
    movimenti: [
      { conto: 'Banca', descrizione: 'Incasso', gestione: '', dare: 100, avere: 0 },
      { conto: 'Ricavi vendite', descrizione: 'Vendita', gestione: 'Tipica', dare: 0, avere: 100 },
    ],
  },
  {
    id: 'operating-cost',
    data: '2026-01-02',
    totale: 30,
    movimenti: [
      { conto: 'Costi servizi', descrizione: 'Pagamento', gestione: 'Tipica', dare: 30, avere: 0 },
      { conto: 'Banca', descrizione: 'Pagamento', gestione: '', dare: 0, avere: 30 },
    ],
  },
  {
    id: 'sale-credit',
    data: '2026-01-03',
    totale: 20,
    movimenti: [
      { conto: 'Crediti v/clienti', descrizione: 'Vendita', gestione: '', dare: 20, avere: 0 },
      { conto: 'Ricavi vendite', descrizione: 'Vendita', gestione: 'Tipica', dare: 0, avere: 20 },
    ],
  },
  {
    id: 'equipment',
    data: '2026-01-04',
    totale: 50,
    movimenti: [
      { conto: 'Attrezzature', descrizione: 'Acquisto', gestione: '', dare: 50, avere: 0 },
      { conto: 'Banca', descrizione: 'Pagamento', gestione: '', dare: 0, avere: 50 },
    ],
  },
  {
    id: 'loan',
    data: '2026-01-05',
    totale: 40,
    movimenti: [
      { conto: 'Banca', descrizione: 'Erogazione', gestione: '', dare: 40, avere: 0 },
      { conto: 'Debiti verso banche', descrizione: 'Finanziamento', gestione: '', dare: 0, avere: 40 },
    ],
  },
]

describe('rendiconto finanziario', () => {
  it('calcola i flussi operativi, di investimento e finanziamento col metodo indiretto', () => {
    const previous = buildAccountingReportsForYear(transactions, 2025)
    const current = buildAccountingReportsForYear(transactions, 2026)
    const statement = buildCashFlowStatement(current, previous)

    expect(statement.openingCash).toBe(1000)
    expect(statement.operating.total).toBe(70)
    expect(statement.investing.total).toBe(-50)
    expect(statement.financing.total).toBe(40)
    expect(statement.unclassified).toBe(0)
    expect(statement.netChange).toBe(60)
    expect(statement.closingCash).toBe(1060)
  })

  it('espone il raccordo se i conti non vengono classificati nei flussi', () => {
    const opening = buildAccountingReportsForYear(transactions, 2025)
    const current = buildAccountingReportsForYear([
      ...transactions,
      {
        id: 'unclassified-cash',
        data: '2026-01-06',
        totale: 10,
        movimenti: [
          { conto: 'Banca', descrizione: 'Movimento', gestione: '', dare: 10, avere: 0 },
          { conto: 'Conto transitorio', descrizione: 'Movimento', gestione: '', dare: 0, avere: 10 },
        ],
      },
    ], 2026)
    const statement = buildCashFlowStatement(current, opening)

    expect(statement.unclassified).toBe(10)
    expect(statement.openingCash + statement.netChange).toBe(statement.closingCash)
  })
})
