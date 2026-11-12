import type { MonthlyIncomeLine } from '../../domain/accounting'

export type IncomeStatementSide = 'positive' | 'negative'

export interface IncomeStatementRow {
  conto: string
  importo: number
  side: IncomeStatementSide
}

export interface IncomeStatementItem {
  code: string
  title: string
  rows: IncomeStatementRow[]
  total: number
}

export interface IncomeStatementSection {
  code: string
  title: string
  items: IncomeStatementItem[]
  total: number
}

export interface IncomeStatement {
  sections: IncomeStatementSection[]
  positiveSections: IncomeStatementSection[]
  negativeSections: IncomeStatementSection[]
  productionValue: number
  productionCosts: number
  operatingResult: number
  financialResult: number
  adjustmentsResult: number
  preTaxResult: number
  incomeTaxes: number
  netResult: number
}

const itemSchema = [
  { section: 'A', code: '1', title: 'Ricavi delle vendite e delle prestazioni' },
  { section: 'A', code: '2', title: 'Variazioni delle rimanenze di prodotti in corso, semilavorati e finiti' },
  { section: 'A', code: '3', title: 'Variazioni dei lavori in corso su ordinazione' },
  { section: 'A', code: '4', title: 'Incrementi di immobilizzazioni per lavori interni' },
  { section: 'A', code: '5', title: 'Altri ricavi e proventi' },
  { section: 'B', code: '6', title: 'Materie prime, sussidiarie, di consumo e merci' },
  { section: 'B', code: '7', title: 'Servizi' },
  { section: 'B', code: '8', title: 'Godimento di beni di terzi' },
  { section: 'B', code: '9', title: 'Personale' },
  { section: 'B', code: '10', title: 'Ammortamenti e svalutazioni' },
  { section: 'B', code: '11', title: 'Variazioni delle rimanenze' },
  { section: 'B', code: '12', title: 'Accantonamenti per rischi' },
  { section: 'B', code: '13', title: 'Altri accantonamenti' },
  { section: 'B', code: '14', title: 'Oneri diversi di gestione' },
  { section: 'C', code: '15', title: 'Proventi da partecipazioni' },
  { section: 'C', code: '16', title: 'Altri proventi finanziari' },
  { section: 'C', code: '17', title: 'Interessi e altri oneri finanziari' },
  { section: 'C', code: '17-bis', title: 'Utili e perdite su cambi' },
  { section: 'D', code: '18', title: 'Rivalutazioni di attività finanziarie' },
  { section: 'D', code: '19', title: 'Svalutazioni di attività finanziarie' },
  { section: '20', code: '', title: 'Imposte sul reddito dell’esercizio' },
] as const

const sectionSchema = [
  { code: 'A', title: 'Valore della produzione' },
  { code: 'B', title: 'Costi della produzione' },
  { code: 'C', title: 'Proventi e oneri finanziari' },
  { code: 'D', title: 'Rettifiche di valore di attività e passività finanziarie' },
  { code: '20', title: 'Imposte sul reddito dell’esercizio' },
] as const

type ItemCode = (typeof itemSchema)[number]['code'] | '20'

export function buildIncomeStatement(rows: MonthlyIncomeLine[]): IncomeStatement {
  const amounts = new Map<string, IncomeStatementRow[]>()

  rows.forEach((row) => {
    if (row.ricavi > 0) addRow(row, 'positive', row.ricavi, classifyAccount(row.conto, 'positive'), amounts)
    if (row.costi > 0) addRow(row, 'negative', row.costi, classifyAccount(row.conto, 'negative'), amounts)
  })

  const sectionData = sectionSchema.map((section) => {
    const items = itemSchema
      .filter((item) => item.section === section.code)
      .map((item) => {
        const key = `${section.code}:${item.code}`
        const itemRows = amounts.get(key) ?? []
        const total = itemRows.reduce((sum, row) => sum + (row.side === 'positive' ? row.importo : -row.importo), 0)
        return { code: item.code, title: item.title, rows: itemRows, total: roundAmount(total) }
      })
      .filter((item) => item.rows.length > 0)
    const total = roundAmount(items.reduce((sum, item) => sum + item.total, 0))
    return { code: section.code, title: section.title, items, total }
  })

  const byCode = new Map(sectionData.map((section) => [section.code, section.total]))
  const productionValue = byCode.get('A') ?? 0
  const productionCosts = Math.abs(byCode.get('B') ?? 0)
  const operatingResult = roundAmount(productionValue - productionCosts)
  const financialResult = byCode.get('C') ?? 0
  const adjustmentsResult = byCode.get('D') ?? 0
  const incomeTaxes = byCode.get('20') ?? 0
  const preTaxResult = roundAmount(operatingResult + financialResult + adjustmentsResult)

  return {
    sections: sectionData,
    positiveSections: buildSideSections(sectionData, 'positive'),
    negativeSections: buildSideSections(sectionData, 'negative'),
    productionValue,
    productionCosts,
    operatingResult,
    financialResult,
    adjustmentsResult,
    preTaxResult,
    incomeTaxes,
    netResult: roundAmount(preTaxResult + incomeTaxes),
  }
}

function addRow(
  row: MonthlyIncomeLine,
  side: IncomeStatementSide,
  importo: number,
  itemCode: ItemCode,
  amounts: Map<string, IncomeStatementRow[]>,
) {
  const item = itemSchema.find((entry) => entry.code === itemCode || (itemCode === '20' && entry.section === '20'))
  if (!item) throw new Error(`Voce del conto economico non riconosciuta: ${itemCode}`)
  const key = `${item.section}:${item.code}`
  const itemRows = amounts.get(key) ?? []
  itemRows.push({ conto: row.conto, importo, side })
  amounts.set(key, itemRows)
}

function classifyAccount(conto: string, side: IncomeStatementSide): ItemCode {
  const name = normalize(conto)
  const isPositive = side === 'positive'
  if (/impost[ae].*(reddito|esercizio)|ires|irpef|irap/.test(name)) return '20'
  if (/cambio|cambi/.test(name) && /utile|perdita|onere|provento/.test(name)) return '17-bis'
  if (/partecipaz|attivit[ae] finanziari|titoli|strumenti finanziari/.test(name)) {
    if (/rivalutaz|plusval/.test(name)) return '18'
    if (/svalutaz|minusval/.test(name)) return '19'
    if (isPositive && /dividend|provent/.test(name)) return '15'
  }
  if (isPositive && /interess|provent.*finanziar|rendiment/.test(name)) return '16'
  if (!isPositive && /interess|oneri finanziar|commission.*bancar|spese bancar/.test(name)) return '17'
  if (!isPositive && /rivalutaz/.test(name)) return '19'

  if (isPositive) {
    if (/variaz.*rimanenz|rimanenz/.test(name)) return '2'
    if (/lavor[oi].*corso|commess/.test(name)) return '3'
    if (/increment.*immobilizz|capitalizz.*lavor/.test(name)) return '4'
    if (/stipend|vendit|prestaz|serviz|fattur|ricav/.test(name)) return '1'
    return '5'
  }

  if (/variaz.*rimanenz|rimanenz/.test(name)) return '11'
  if (/ammort|svalutaz/.test(name)) return '10'
  if (/accanton.*risch|rischi/.test(name)) return '12'
  if (/accanton/.test(name)) return '13'
  if (/stipend|salari|personale|contribut[io].*previdenz/.test(name)) return '9'
  if (/affitt|locazion|noleggi|leasing|godimento beni/.test(name)) return '8'
  if (/material|materie|merci|acquist[oi].*(bene|merce)|consumabili/.test(name)) return '6'
  if (/serviz|consulenz|utenze|telefon|pubblicit|assicuraz|profession/.test(name)) return '7'
  if (/rivalutaz/.test(name)) return '18'
  return '14'
}

function normalize(value: string) {
  return value.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function buildSideSections(sections: IncomeStatementSection[], side: IncomeStatementSide) {
  return sections.map((section) => {
    const items = section.items.map((item) => {
      const rows = item.rows.filter((row) => row.side === side)
      return { ...item, rows, total: roundAmount(rows.reduce((sum, row) => sum + row.importo, 0)) }
    }).filter((item) => item.rows.length > 0)
    return { ...section, items, total: roundAmount(items.reduce((sum, item) => sum + item.total, 0)) }
  }).filter((section) => section.items.length > 0)
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
