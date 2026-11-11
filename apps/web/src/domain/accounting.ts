export interface LedgerMovement {
  conto: string
  descrizione: string
  gestione: string
  dare: number
  avere: number
}

export interface LedgerTransaction {
  id: string
  data: string
  totale: number
  movimenti: LedgerMovement[]
}

export interface AccountBalance {
  conto: string
  totale_dare: number
  totale_avere: number
  saldo: number
}

export interface MonthlyIncomeLine {
  conto: string
  gestione: string
  ricavi: number
  costi: number
  saldo: number
}

export interface AccountingReports {
  saldi: AccountBalance[]
  contoEconomico: {
    righe: MonthlyIncomeLine[]
    ricavi: number
    costi: number
    utile: number
  }
  statoPatrimoniale: {
    attivita: AccountBalance[]
    passivita: Array<{ conto: string; saldo: number }>
    totaleAttivita: number
    totalePassivita: number
  }
  liquidita: Array<{ data: string; saldo: number; variazione: number }>
  conti: string[]
  gestioni: string[]
}

export interface MonthlyIncome {
  mese: number
  ricavi: number
  costi: number
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const fromCents = (amount: number) => Number((amount / 100).toFixed(2))
const CASH_ACCOUNT = /(cassa|banca|liquidit|conto corrente|cash)/i
const EQUITY_ACCOUNT = /capitale|cap\.\s*sociale|patrimonio netto|riserv|utile|perdita|risultato d['’]esercizio|titolare/i

export function buildMonthlyIncomeSeries(transactions: LedgerTransaction[], year: number): MonthlyIncome[] {
  const months = Array.from({ length: 12 }, (_, index) => ({ mese: index + 1, ricavi: 0, costi: 0 }))

  transactions.forEach((transaction) => {
    if (Number(transaction.data.slice(0, 4)) !== year) return
    const monthIndex = Number(transaction.data.slice(5, 7)) - 1
    if (monthIndex < 0 || monthIndex >= months.length) return

    transaction.movimenti.forEach((movement) => {
      if (!movement.gestione.trim() || EQUITY_ACCOUNT.test(movement.conto)) return
      const net = toCents(movement.dare) - toCents(movement.avere)
      if (net > 0) months[monthIndex].costi += net
      else months[monthIndex].ricavi -= net
    })
  })

  return months.map(({ mese, ricavi, costi }) => ({
    mese,
    ricavi: fromCents(ricavi),
    costi: fromCents(costi),
  }))
}

export function validateTransaction(transaction: Pick<LedgerTransaction, 'data' | 'movimenti'>) {
  const errors: string[] = []
  const date = new Date(`${transaction.data}T00:00:00.000Z`)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.data)
    || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== transaction.data) {
    errors.push('Inserisci una data valida.')
  }
  if (transaction.movimenti.length < 2) {
    errors.push('La registrazione deve contenere almeno due righe.')
  }

  let totalDebit = 0
  let totalCredit = 0
  transaction.movimenti.forEach((movement, index) => {
    const debit = Number(movement.dare)
    const credit = Number(movement.avere)
    if (!movement.conto.trim()) errors.push(`Indica il conto alla riga ${index + 1}.`)
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) {
      errors.push(`Gli importi alla riga ${index + 1} non sono validi.`)
      return
    }
    const debitCents = toCents(debit)
    const creditCents = toCents(credit)
    if ((debitCents > 0) === (creditCents > 0)) {
      errors.push(`Compila solo Dare oppure Avere alla riga ${index + 1}.`)
    }
    totalDebit += debitCents
    totalCredit += creditCents
  })

  if (totalDebit === 0 || totalCredit === 0 || totalDebit !== totalCredit) {
    errors.push('Il totale Dare deve essere uguale al totale Avere e maggiore di zero.')
  }
  return errors
}

export function buildAccountingReports(transactions: LedgerTransaction[]): AccountingReports {
  const accounts = new Map<string, { dare: number; avere: number }>()
  const managementByAccount = new Map<string, string>()
  const incomeByAccount = new Map<string, { gestione: string; ricavi: number; costi: number }>()
  const dailyCashChanges = new Map<string, number>()
  const managements = new Set<string>()

  transactions.forEach((transaction) => {
    transaction.movimenti.forEach((movement) => {
      const accountName = movement.conto.trim()
      if (!accountName) return

      const debit = toCents(movement.dare)
      const credit = toCents(movement.avere)
      const account = accounts.get(accountName) ?? { dare: 0, avere: 0 }
      account.dare += debit
      account.avere += credit
      accounts.set(accountName, account)

      if (movement.gestione.trim() && !EQUITY_ACCOUNT.test(accountName)) {
        const management = movement.gestione.trim()
        managementByAccount.set(accountName, management)
        managements.add(management)
        const income = incomeByAccount.get(accountName) ?? { gestione: management, ricavi: 0, costi: 0 }
        const net = debit - credit
        if (net > 0) income.costi += net
        else income.ricavi -= net
        incomeByAccount.set(accountName, income)
      }

      if (CASH_ACCOUNT.test(accountName)) {
        dailyCashChanges.set(
          transaction.data,
          (dailyCashChanges.get(transaction.data) ?? 0) + debit - credit,
        )
      }
    })
  })

  const saldi = [...accounts.entries()]
    .map(([conto, amounts]) => ({
      conto,
      totale_dare: fromCents(amounts.dare),
      totale_avere: fromCents(amounts.avere),
      saldo: fromCents(amounts.dare - amounts.avere),
    }))
    .sort((left, right) => left.conto.localeCompare(right.conto, 'it'))

  const righe = [...incomeByAccount.entries()]
    .map(([conto, income]) => ({
      conto,
      gestione: income.gestione,
      ricavi: fromCents(income.ricavi),
      costi: fromCents(income.costi),
      saldo: fromCents(income.ricavi - income.costi),
    }))
    .sort((left, right) => left.conto.localeCompare(right.conto, 'it'))
  const ricaviCents = righe.reduce((sum, line) => sum + toCents(line.ricavi), 0)
  const costiCents = righe.reduce((sum, line) => sum + toCents(line.costi), 0)
  const utileCents = ricaviCents - costiCents

  const patrimoniali = saldi.filter((account) => !managementByAccount.has(account.conto))
  const attivita = patrimoniali.filter((account) => account.saldo > 0)
  const passivita = patrimoniali
    .filter((account) => account.saldo < 0)
    .map((account) => ({ conto: account.conto, saldo: -account.saldo }))
  if (utileCents !== 0) {
    passivita.push({ conto: "Risultato d'esercizio", saldo: fromCents(utileCents) })
  }

  let runningCash = 0
  const liquidita = [...dailyCashChanges.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([data, change]) => {
      runningCash += change
      return { data, saldo: fromCents(runningCash), variazione: fromCents(change) }
    })

  return {
    saldi,
    contoEconomico: {
      righe,
      ricavi: fromCents(ricaviCents),
      costi: fromCents(costiCents),
      utile: fromCents(utileCents),
    },
    statoPatrimoniale: {
      attivita,
      passivita,
      totaleAttivita: fromCents(attivita.reduce((sum, account) => sum + toCents(account.saldo), 0)),
      totalePassivita: fromCents(passivita.reduce((sum, account) => sum + toCents(account.saldo), 0)),
    },
    liquidita,
    conti: saldi.map((account) => account.conto),
    gestioni: [...managements].sort((left, right) => left.localeCompare(right, 'it')),
  }
}