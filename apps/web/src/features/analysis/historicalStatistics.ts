import { buildAccountingReportsForYear, isCashAccount, isEquityAccount, type LedgerTransaction } from '../../domain/accounting'

export interface HistoricalStatistics {
  year: number
  income: number
  expenses: number
  result: number
  savingRate: number | null
  assets: number
  debts: number
  netWorth: number
  liquidity: number
}

export function buildHistoricalStatistics(
  transactions: LedgerTransaction[],
  throughYear: number,
): HistoricalStatistics[] {
  const years = new Set<number>()
  transactions.forEach(({ data }) => {
    const transactionYear = Number(data.slice(0, 4))
    if (Number.isInteger(transactionYear) && transactionYear <= throughYear) years.add(transactionYear)
  })
  years.add(throughYear)

  return [...years].sort((left, right) => left - right).map((year) => {
    const reports = buildAccountingReportsForYear(transactions, year)
    const income = reports.contoEconomico.ricavi
    const expenses = reports.contoEconomico.costi
    const assets = reports.statoPatrimoniale.totaleAttivita
    const debts = reports.statoPatrimoniale.passivita
      .filter(({ conto }) => !isEquityAccount(conto))
      .reduce((total, account) => total + account.saldo, 0)

    return {
      year,
      income,
      expenses,
      result: reports.contoEconomico.utile,
      savingRate: income > 0 ? reports.contoEconomico.utile / income * 100 : null,
      assets,
      debts,
      netWorth: assets - debts,
      liquidity: reports.saldi
        .filter(({ conto }) => isCashAccount(conto))
        .reduce((total, account) => total + account.saldo, 0),
    }
  })
}
