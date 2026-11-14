import { describe, expect, it } from 'vitest'
import type { LedgerTransaction } from '../../domain/accounting'
import { buildDailyPositionStatistics, buildHistoricalStatistics } from './historicalStatistics'

const transactions: LedgerTransaction[] = [
  {
    id: 'income-2024',
    data: '2024-01-01',
    totale: 10000,
    movimenti: [
      { conto: 'Banca', descrizione: '', gestione: '', dare: 10000, avere: 0 },
      { conto: 'Entrate', descrizione: '', gestione: 'Personale', dare: 0, avere: 10000 },
    ],
  },
  {
    id: 'loan-2025',
    data: '2025-01-01',
    totale: 3000,
    movimenti: [
      { conto: 'Banca', descrizione: '', gestione: '', dare: 3000, avere: 0 },
      { conto: 'Debiti finanziari', descrizione: '', gestione: '', dare: 0, avere: 3000 },
    ],
  },
  {
    id: 'expense-2025',
    data: '2025-02-01',
    totale: 2000,
    movimenti: [
      { conto: 'Spese', descrizione: '', gestione: 'Personale', dare: 2000, avere: 0 },
      { conto: 'Banca', descrizione: '', gestione: '', dare: 0, avere: 2000 },
    ],
  },
]

describe('statistiche storiche', () => {
  it('calcola entrate, uscite, patrimonio netto e liquidità progressivi per anno', () => {
    expect(buildHistoricalStatistics(transactions, 2025)).toEqual([
      {
        year: 2024,
        income: 10000,
        expenses: 0,
        result: 10000,
        savingRate: 100,
        assets: 10000,
        debts: 0,
        netWorth: 10000,
        liquidity: 10000,
      },
      {
        year: 2025,
        income: 0,
        expenses: 2000,
        result: -2000,
        savingRate: null,
        assets: 11000,
        debts: 3000,
        netWorth: 8000,
        liquidity: 11000,
      },
    ])
  })

  it('limita i risultati all’anno richiesto e mostra l’esercizio vuoto selezionato', () => {
    expect(buildHistoricalStatistics(transactions, 2023)).toEqual([{
      year: 2023,
      income: 0,
      expenses: 0,
      result: 0,
      savingRate: null,
      assets: 0,
      debts: 0,
      netWorth: 0,
      liquidity: 0,
    }])
  })

  it('calcola i saldi patrimoniali e di liquidità ogni giorno riportando i saldi nei giorni senza movimenti', () => {
    const daily = buildDailyPositionStatistics(transactions, 2025)
    const byDate = new Map(daily.map((entry) => [entry.date, entry]))

    expect(byDate.get('2024-01-01')).toMatchObject({
      assets: 10000,
      debts: 0,
      netWorth: 10000,
      liquidity: 10000,
    })
    expect(byDate.get('2024-01-02')).toMatchObject({
      assets: 10000,
      debts: 0,
      netWorth: 10000,
      liquidity: 10000,
    })
    expect(byDate.get('2025-01-01')).toMatchObject({
      assets: 13000,
      debts: 3000,
      netWorth: 10000,
      liquidity: 13000,
    })
    expect(byDate.get('2025-02-01')).toMatchObject({
      assets: 11000,
      debts: 3000,
      netWorth: 8000,
      liquidity: 11000,
    })
    expect(daily.at(-1)?.date).toBe('2025-12-31')
  })
})
