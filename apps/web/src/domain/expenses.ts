import type { InvoiceCustomer } from './invoicing'
import type { InvoiceAccounts } from './invoicing'

export interface ExpenseAttachmentDraft {
  nome: string
  mimeType: string
  base64: string
}

export interface ExpenseLine {
  id: string
  conto: string
  imponibile: number
  aliquotaIva: number
}

export interface ExpenseDraft {
  id: string
  tipo: 'fattura' | 'ricevuta' | 'spesa personale'
  data: string
  numeroDocumento: string
  fornitore: InvoiceCustomer
  descrizione: string
  righe?: ExpenseLine[]
  conto?: string
  imponibile?: number
  aliquotaIva?: number
  conti: Pick<InvoiceAccounts, 'ivaCredito' | 'fornitori' | 'gestione'>
  note: string
  allegato?: ExpenseAttachmentDraft
}

export interface IssuedExpense extends ExpenseDraft {
  imponibile: number
  iva: number
  totale: number
  stato: 'da pagare'
  allegatoSalvato?: { nome: string; mimeType: string; url: string }
}

export function getExpenseLines(expense: Pick<ExpenseDraft, 'righe' | 'conto' | 'imponibile' | 'aliquotaIva'>): ExpenseLine[] {
  if (expense.righe?.length) return expense.righe
  if (expense.conto && expense.imponibile !== undefined && expense.aliquotaIva !== undefined) {
    return [{ id: 'legacy', conto: expense.conto, imponibile: expense.imponibile, aliquotaIva: expense.aliquotaIva }]
  }
  return []
}

export function calculateExpenseTotals(expense: Pick<ExpenseDraft, 'righe' | 'conto' | 'imponibile' | 'aliquotaIva'>) {
  const righe = getExpenseLines(expense)
  const imponibileCents = righe.reduce((sum, line) => sum + Math.round(line.imponibile * 100), 0)
  const groupedRates = new Map<number, { imponibile: number; iva: number }>()
  for (const line of righe) {
    const lineCents = Math.round(line.imponibile * 100)
    const group = groupedRates.get(line.aliquotaIva) || { imponibile: 0, iva: 0 }
    group.imponibile += lineCents
    group.iva += Math.round(lineCents * line.aliquotaIva / 100)
    groupedRates.set(line.aliquotaIva, group)
  }
  const ivaPerAliquota = [...groupedRates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([aliquota, amounts]) => ({
      aliquota,
      imponibile: amounts.imponibile / 100,
      iva: amounts.iva / 100,
    }))
  const ivaCents = ivaPerAliquota.reduce((sum, item) => sum + Math.round(item.iva * 100), 0)
  return {
    imponibile: imponibileCents / 100,
    iva: ivaCents / 100,
    totale: (imponibileCents + ivaCents) / 100,
    ivaPerAliquota,
  }
}

export function validateExpense(expense: ExpenseDraft) {
  const errors: string[] = []
  const date = new Date(`${expense.data}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.data)
    || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== expense.data) errors.push('Inserisci una data documento valida.')
  if (!expense.fornitore.ragioneSociale.trim()) errors.push('Seleziona o inserisci il fornitore.')
  if (!expense.fornitore.partitaIva.trim() && !expense.fornitore.codiceFiscale?.trim()) {
    errors.push('Inserisci la partita IVA o il codice fiscale del fornitore.')
  }
  if (!expense.descrizione.trim()) errors.push('Inserisci l’oggetto della spesa.')
  const righe = getExpenseLines(expense)
  if (righe.length < 1 || righe.length > 100) errors.push('La spesa deve contenere da 1 a 100 righe.')
  righe.forEach((line, index) => {
    if (!line.conto.trim()) errors.push(`Indica il conto di costo alla riga ${index + 1}.`)
    if (!Number.isFinite(line.imponibile) || line.imponibile <= 0) errors.push(`L’imponibile alla riga ${index + 1} deve essere maggiore di zero.`)
    if (!Number.isFinite(line.aliquotaIva) || line.aliquotaIva < 0 || line.aliquotaIva > 100) errors.push(`L’aliquota IVA alla riga ${index + 1} deve essere tra 0 e 100.`)
  })
  if (!expense.conti.ivaCredito?.trim() || !expense.conti.fornitori?.trim() || !expense.conti.gestione?.trim()) errors.push('Configura i conti IVA a credito, fornitori e gestione nelle Impostazioni.')
  if (expense.allegato) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(expense.allegato.mimeType)) {
      errors.push('Carica un allegato PDF, JPG o PNG.')
    }
    if (expense.allegato.base64.length > 11_200_000) errors.push('L’allegato supera il limite di 8 MB.')
  }
  return errors
}
