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

export interface DailyPositionStatistics {
  date: string
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

export function buildDailyPositionStatistics(
  transactions: LedgerTransaction[],
  throughYear: number,
): DailyPositionStatistics[] {
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const endDate = throughYear < today.getFullYear() ? `${throughYear}-12-31` : todayKey
  const transactionsByDate = new Map<string, LedgerTransaction[]>()
  const managementAccounts = new Set<string>()

  transactions.forEach((transaction) => {
    if (!isValidDateKey(transaction.data) || transaction.data > endDate) return
    const datedTransactions = transactionsByDate.get(transaction.data) ?? []
    datedTransactions.push(transaction)
    transactionsByDate.set(transaction.data, datedTransactions)

    transaction.movimenti.forEach((movement) => {
      const accountName = movement.conto.trim()
      if (accountName && movement.gestione.trim() && !isEquityAccount(accountName)) {
        managementAccounts.add(accountName)
      }
    })
  })

  const dates = [...transactionsByDate.keys()].sort()
  const firstDate = dates[0]
  if (!firstDate || firstDate.slice(0, 4) > String(throughYear)) return []

  const balances = new Map<string, number>()
  const statistics: DailyPositionStatistics[] = []
  const endTime = Date.parse(`${endDate}T00:00:00.000Z`)
  for (let time = Date.parse(`${firstDate}T00:00:00.000Z`); time <= endTime; time += 24 * 60 * 60 * 1000) {
    const date = new Date(time).toISOString().slice(0, 10)
    transactionsByDate.get(date)?.forEach((transaction) => {
      transaction.movimenti.forEach((movement) => {
        const accountName = movement.conto.trim()
        if (!accountName) return
        const debit = Math.round((movement.dare + Number.EPSILON) * 100)
        const credit = Math.round((movement.avere + Number.EPSILON) * 100)
        balances.set(accountName, (balances.get(accountName) ?? 0) + debit - credit)
      })
    })

    let assetsCents = 0
    let debtsCents = 0
    let liquidityCents = 0
    balances.forEach((balance, accountName) => {
      if (isCashAccount(accountName)) liquidityCents += balance
      if (managementAccounts.has(accountName) || isEquityAccount(accountName)) return
      if (balance > 0) assetsCents += balance
      else debtsCents -= balance
    })

    statistics.push({
      date,
      assets: assetsCents / 100,
      debts: debtsCents / 100,
      netWorth: (assetsCents - debtsCents) / 100,
      liquidity: liquidityCents / 100,
    })
  }

  return statistics
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
