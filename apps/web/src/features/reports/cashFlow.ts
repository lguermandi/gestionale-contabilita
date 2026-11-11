import type { AccountingReports } from '../../domain/accounting'

export interface CashFlowSection {
  code: string
  title: string
  rows: Array<{ label: string; amount: number }>
  total: number
}

export interface CashFlowStatement {
  openingCash: number
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  unclassified: number
  netChange: number
  closingCash: number
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const fromCents = (amount: number) => Number((amount / 100).toFixed(2))
const normalize = (value: string) => value.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const isCashAccount = (name: string) => /(cassa|banca|liquidit|conto corrente|cash)/.test(normalize(name))
const isFinancingDebt = (name: string) => /debit.*(banc|finanzi|mutu|prestiti|lungo termine|l\/t|oltre)|mutu|finanziament|prestiti|obbligazion|debiti finanziar|carta/.test(normalize(name))
const isLongTermDebt = (name: string) => /debit.*(lungo termine|l\/t|oltre)|mutu|finanziament|prestiti|obbligazion/.test(normalize(name))
const isShortTermBankDebt = (name: string) => /debit.*banc/.test(normalize(name)) && !isLongTermDebt(name)
const isOperatingAsset = (name: string) => /credit|client|rimanenz|ratei attiv|risconti attiv|depositi|anticipi|ritenute subite|iva a credito|erario a credito/.test(normalize(name))
const isOperatingLiability = (name: string) => {
  const account = normalize(name)
  return !isFinancingDebt(account)
    && /fornitor|debit|iva a debito|erario|ratei passiv|risconti passiv|fondo.*(rischi|oneri|imposte|tasse)|stipend|personal|contribut.*previdenz/.test(account)
}
const isInvestment = (name: string) => {
  const account = normalize(name)
  if (isCashAccount(account) || /fond[oi].*(rischi|oneri|imposte|tasse)/.test(account)) return false
  return /immobil|terren|fabbric|impiant|macchin|attrezz|autovett|automez|arred|brevet|marchi|software|beni ammort|titoli|etf|obbligaz|partecipaz|costruzion.*economia|fond[oi].*(invest|comun|pension)/.test(account)
}
const isEquityContribution = (name: string) => /capitale|versament.*soci|apporti.*soci|conferiment|contribut.*capitale|titolare/.test(normalize(name))
const isProfitDistribution = (name: string) => /preliev|distribuzion.*util|dividend/.test(normalize(name))

export function buildCashFlowStatement(current: AccountingReports, previous: AccountingReports): CashFlowStatement {
  const currentBalances = new Map(current.saldi.map(({ conto, saldo }) => [conto, toCents(saldo)]))
  const previousBalances = new Map(previous.saldi.map(({ conto, saldo }) => [conto, toCents(saldo)]))
  const accountNames = new Set([...currentBalances.keys(), ...previousBalances.keys()])
  const changes = [...accountNames].map((conto) => ({
    conto,
    change: (currentBalances.get(conto) ?? 0) - (previousBalances.get(conto) ?? 0),
  }))

  const openingCash = sumBalances(previous.saldi.filter(({ conto }) => isCashAccount(conto)))
  const closingCash = sumBalances(current.saldi.filter(({ conto }) => isCashAccount(conto)))
  const currentYearIncome = current.contoEconomico.righe
  const nonCashExpenses = currentYearIncome.reduce((sum, row) => (
    /ammort|svalutaz|accantonament/.test(normalize(row.conto)) ? sum + toCents(row.costi) : sum
  ), 0)
  const nonCashIncome = currentYearIncome.reduce((sum, row) => (
    /rivalutaz|plusvalenz|increment.*immobilizz/.test(normalize(row.conto)) ? sum + toCents(row.ricavi) : sum
  ), 0)
  const operatingAssetChanges = changes.reduce((sum, { conto, change }) => (
    isOperatingAsset(conto) ? sum - change : sum
  ), 0)
  const operatingLiabilityChanges = changes.reduce((sum, { conto, change }) => (
    isOperatingLiability(conto) ? sum - change : sum
  ), 0)

  const operatingRows = [
    { label: 'Risultato netto dell’esercizio', amount: toCents(current.contoEconomico.utile) },
    { label: 'Costi non monetari', amount: nonCashExpenses },
    { label: 'Ricavi non monetari', amount: -nonCashIncome },
    { label: 'Variazione di crediti, rimanenze e ratei/risconti attivi', amount: operatingAssetChanges },
    { label: 'Variazione di debiti operativi, fondi e ratei/risconti passivi', amount: operatingLiabilityChanges },
  ]
  const operating = createSection('B', 'Flusso di cassa della gestione operativa', operatingRows)

  const investing = createSection('C', 'Flusso monetario da attività di investimento', [
    {
      label: 'Variazione delle immobilizzazioni e degli investimenti',
      amount: changes.reduce((sum, { conto, change }) => sum + (isInvestment(conto) ? -change : 0), 0),
    },
  ])
  const financing = createSection('D', 'Flusso monetario da attività di finanziamento', [
    {
      label: 'Variazione dei debiti verso banche a breve termine',
      amount: changes.reduce((sum, { conto, change }) => sum + (isShortTermBankDebt(conto) ? -change : 0), 0),
    },
    {
      label: 'Variazione dei debiti finanziari a lungo termine',
      amount: changes.reduce((sum, { conto, change }) => sum + (isFinancingDebt(conto) && isLongTermDebt(conto) ? -change : 0), 0),
    },
    {
      label: 'Variazione degli altri debiti finanziari',
      amount: changes.reduce((sum, { conto, change }) => sum + (isFinancingDebt(conto) && !isShortTermBankDebt(conto) && !isLongTermDebt(conto) ? -change : 0), 0),
    },
    {
      label: 'Aumenti di capitale e apporti dei soci',
      amount: changes.reduce((sum, { conto, change }) => sum + (isEquityContribution(conto) && !isProfitDistribution(conto) ? -change : 0), 0),
    },
    {
      label: 'Distribuzioni di utili e prelievi dei soci',
      amount: changes.reduce((sum, { conto, change }) => sum + (isProfitDistribution(conto) ? -change : 0), 0),
    },
  ])

  const classifiedChange = toCents(operating.total) + toCents(investing.total) + toCents(financing.total)
  const actualChange = closingCash - openingCash
  const unclassified = actualChange - classifiedChange

  return {
    openingCash: fromCents(openingCash),
    operating,
    investing,
    financing,
    unclassified: fromCents(unclassified),
    netChange: fromCents(actualChange),
    closingCash: fromCents(closingCash),
  }
}

function createSection(code: string, title: string, rows: Array<{ label: string; amount: number }>): CashFlowSection {
  return {
    code,
    title,
    rows: rows.map(({ label, amount }) => ({ label, amount: fromCents(amount) })),
    total: fromCents(rows.reduce((sum, row) => sum + row.amount, 0)),
  }
}

function sumBalances(rows: Array<{ saldo: number }>) {
  return rows.reduce((sum, row) => sum + toCents(row.saldo), 0)
}
