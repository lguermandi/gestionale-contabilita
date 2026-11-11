export type BalanceAccountRow = { conto: string; corrente: number; precedente: number }
export type BalanceSubsection = { code: string; title: string; rows: BalanceAccountRow[] }
export type BalanceSection = { code: string; title: string; subsections: BalanceSubsection[] }
export type BalanceSheetSections = { activity: BalanceSection[]; liability: BalanceSection[] }
export type BalanceRow = { conto: string; saldo: number }

const sectionSchema = {
  activity: [
    { code: 'A)', title: 'Immobilizzazioni', subsections: [
      { code: 'I -', title: 'Immobilizzazioni materiali' },
      { code: 'II -', title: 'Immobilizzazioni finanziarie' },
    ] },
    { code: 'B)', title: 'Attivo circolante', subsections: [
      { code: 'I -', title: 'Crediti' },
      { code: 'II -', title: 'Disponibilità liquide' },
    ] },
    { code: 'C)', title: 'Ratei e risconti attivi', subsections: [{ code: '', title: '' }] },
  ],
  liability: [
    { code: 'A)', title: 'Patrimonio netto', subsections: [
      { code: 'I -', title: 'Capitale sociale' },
      { code: 'II -', title: 'Riserva legale' },
      { code: 'III -', title: 'Riserva statutaria' },
      { code: 'IV -', title: 'Altre riserve' },
      { code: 'VIII -', title: 'Utili d’esercizio' },
    ] },
    { code: 'B)', title: 'Fondi rischi e oneri', subsections: [
      { code: 'I -', title: 'Fondi rischi e oneri' },
    ] },
    { code: 'C)', title: 'Debiti', subsections: [
      { code: 'I -', title: 'Debiti a lungo termine' },
      { code: 'II -', title: 'Debiti a breve termine' },
    ] },
    { code: 'D)', title: 'Ratei e risconti passivi', subsections: [{ code: '', title: '' }] },
  ],
} satisfies Record<'activity' | 'liability', Array<{ code: string; title: string; subsections: Array<{ code: string; title: string }> }>>

export function buildBalanceSheetSections(currentRows: BalanceRow[], previousRows: BalanceRow[]): BalanceSheetSections {
  const result: BalanceSheetSections = {
    activity: createSections('activity'),
    liability: createSections('liability'),
  }
  const currentAccounts = new Map(currentRows.map((row) => [row.conto, row.saldo]))
  const previousAccounts = new Map(previousRows.map((row) => [row.conto, row.saldo]))
  const accounts = new Set([...currentAccounts.keys(), ...previousAccounts.keys()])

  accounts.forEach((conto) => {
    const current = currentAccounts.get(conto) ?? 0
    const previous = previousAccounts.get(conto) ?? 0
    const currentTarget = current === 0 ? null : classifyAccount(conto, current)
    const previousTarget = previous === 0 ? null : classifyAccount(conto, previous)

    const destinations = new Map<string, { side: 'activity' | 'liability'; section: number; subsection: number; current: number; previous: number }>()
    if (currentTarget) {
      const key = `${currentTarget.side}:${currentTarget.section}:${currentTarget.subsection}`
      destinations.set(key, { ...currentTarget, current, previous: 0 })
    }
    if (previousTarget) {
      const key = `${previousTarget.side}:${previousTarget.section}:${previousTarget.subsection}`
      const destination = destinations.get(key)
      if (destination) destination.previous = previous
      else destinations.set(key, { ...previousTarget, current: 0, previous })
    }
    destinations.forEach((destination) => {
      result[destination.side][destination.section].subsections[destination.subsection].rows.push({
        conto,
        corrente: toDisplayAmount(destination.current, destination.side),
        precedente: toDisplayAmount(destination.previous, destination.side),
      })
    })
  })

  Object.values(result).forEach((sections) => sections.forEach((section) => {
    section.subsections.forEach((subsection) => {
      subsection.rows.sort((left, right) => left.conto.localeCompare(right.conto, 'it'))
    })
  }))
  return result
}

function createSections(side: 'activity' | 'liability'): BalanceSection[] {
  return sectionSchema[side].map((section) => ({
    ...section,
    subsections: section.subsections.map((subsection) => ({ ...subsection, rows: [] })),
  }))
}

function classifyAccount(conto: string, saldo: number): { side: 'activity' | 'liability'; section: number; subsection: number } {
  const name = normalizeAccountName(conto)
  const liability = (section: number, subsection: number) => ({ side: 'liability' as const, section, subsection })
  const activity = (section: number, subsection: number) => ({ side: 'activity' as const, section, subsection })
  const equity = /capitale|cap\.\s*sociale|patrimonio netto|riserv|utile|perdita|risultato d'esercizio|titolare/.test(name)

  if (equity) {
    if (/riserv[ae]\s+legal[ei]/.test(name)) return liability(0, 1)
    if (/riserv[ae]\s+statutari[ae]/.test(name)) return liability(0, 2)
    if (/capitale|cap\.\s*sociale/.test(name)) return liability(0, 0)
    if (/utile|perdita|risultato d'esercizio/.test(name)) return liability(0, 4)
    return liability(0, 3)
  }
  if (/fond[oi].*(rischi|oneri|imposte|tasse)|f\.?\s*do.*(rischi|oneri|imposte|tasse)|rischi|oneri|accantonament/.test(name)) return liability(1, 0)
  if (/ratei|risconti/.test(name)) {
    if (/attiv[oi]/.test(name)) return saldo > 0 ? activity(2, 0) : liability(3, 0)
    if (/passiv[oi]/.test(name)) return liability(3, 0)
    return saldo > 0 ? activity(2, 0) : liability(3, 0)
  }
  if (/carta|debit|mutu|finanziament|fornitor|iva a debito/.test(name)) {
    return liability(2, /lungo termine|mutu|finanziament/.test(name) ? 0 : 1)
  }
  if (/azion|etf|fondi|titoli|obbligaz|partecipaz|immobilizzazioni finanziarie/.test(name)) {
    return activity(0, 1)
  }
  if (/banca|banche|cassa|liquidit|conto corrente|portafoglio|denaro|chiave.*(macc|coffee)|macc.*coffee/.test(name)) {
    return activity(1, 1)
  }
  if (/immobil|terren|fabbric|impiant|macchin|attrezz|autovett|automez|arred|brevet|marchi|software|altri beni|chiave/.test(name)) {
    return saldo > 0 ? activity(0, 0) : liability(2, 1)
  }
  if (/credit|client|tribut|erario|depositi|anticipi|ritenute subite/.test(name)) {
    return saldo > 0 ? activity(1, 0) : liability(2, 1)
  }
  return saldo > 0 ? activity(1, 0) : liability(2, 1)
}

function toDisplayAmount(saldo: number, side: 'activity' | 'liability') {
  const amount = side === 'activity' ? saldo : -saldo
  return amount === 0 ? 0 : amount
}

function normalizeAccountName(name: string) {
  return name.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
