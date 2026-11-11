import type { InvoiceCustomer } from './invoicing'
import type { InvoiceAccounts } from './invoicing'

export interface ExpenseAttachmentDraft {
  nome: string
  mimeType: string
  base64: string
}

export interface ExpenseDraft {
  id: string
  tipo: 'fattura' | 'ricevuta' | 'spesa personale'
  data: string
  numeroDocumento: string
  fornitore: InvoiceCustomer
  descrizione: string
  conto: string
  imponibile: number
  aliquotaIva: number
  conti: Pick<InvoiceAccounts, 'ivaCredito' | 'fornitori' | 'gestione'>
  note: string
  allegato?: ExpenseAttachmentDraft
}

export interface IssuedExpense extends ExpenseDraft {
  totale: number
  iva: number
  stato: 'da pagare'
  allegatoSalvato?: { nome: string; mimeType: string; url: string }
}

export function calculateExpenseTotals(expense: Pick<ExpenseDraft, 'imponibile' | 'aliquotaIva'>) {
  const imponibileCents = Math.round(expense.imponibile * 100)
  const ivaCents = Math.round(imponibileCents * expense.aliquotaIva / 100)
  return {
    imponibile: imponibileCents / 100,
    iva: ivaCents / 100,
    totale: (imponibileCents + ivaCents) / 100,
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
  if (!expense.conto.trim()) errors.push('Indica il conto di costo.')
  if (!expense.conti.ivaCredito?.trim() || !expense.conti.fornitori?.trim() || !expense.conti.gestione?.trim()) errors.push('Configura i conti IVA a credito, fornitori e gestione nelle Impostazioni.')
  if (!Number.isFinite(expense.imponibile) || expense.imponibile <= 0) errors.push('L’imponibile deve essere maggiore di zero.')
  if (!Number.isFinite(expense.aliquotaIva) || expense.aliquotaIva < 0 || expense.aliquotaIva > 100) errors.push('L’aliquota IVA deve essere tra 0 e 100.')
  if (expense.allegato) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(expense.allegato.mimeType)) {
      errors.push('Carica un allegato PDF, JPG o PNG.')
    }
    if (expense.allegato.base64.length > 11_200_000) errors.push('L’allegato supera il limite di 8 MB.')
  }
  return errors
}
