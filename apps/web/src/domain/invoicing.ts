import { buildInvoiceAccountingPosting } from './accounting'

export interface InvoiceLine {
  id: string
  descrizione: string
  quantita: number
  prezzoUnitario: number
  aliquotaIva?: number
  naturaIva?: string
  riferimentoAmministrazione?: string
  revenueAccount?: string
  costAccount?: string
  atecoCode?: string
}

export type InvoiceDocumentType =
  | 'TD01' | 'TD02' | 'TD03' | 'TD04' | 'TD05' | 'TD06' | 'TD07' | 'TD08' | 'TD09'
  | 'TD10' | 'TD16' | 'TD17' | 'TD18' | 'TD19' | 'TD20' | 'TD21' | 'TD22' | 'TD23'
  | 'TD24' | 'TD25' | 'TD26' | 'TD27' | 'TD28' | 'TD29'

export type InvoiceContributionType = 'gestione_separata' | 'cassa_previdenziale'

export interface InvoiceAccounts {
  clienti: string
  ricavi: string
  iva: string
  ritenute: string
  cassa: string
  gestione: string
  bollo?: string
  incassi?: string
  costi?: string
  ivaCredito?: string
  fornitori?: string
  ivaAutofatture?: string
}

export interface InvoiceCustomer {
  id?: string
  ragioneSociale: string
  indirizzo: string
  partitaIva: string
  email: string
  codiceFiscale?: string
  nazione?: string
  provincia?: string
  codiceDestinatario?: string
  pec?: string
  tipologia?: string
  cap?: string
  comune?: string
  telefono?: string
}

export interface InvoicePayment {
  data: string
  importo: number
  conto: string
  linkedTransactionId?: string
}

export interface InvoicePaymentTerms {
  metodo: string
  scadenza: string
  incassata: boolean
}

export interface InvoiceStampDuty {
  addebitata: boolean
  dovuta?: boolean
  importo: number
  identificativo: string
}

export interface CreditNoteDraft {
  id: string
  data: string
  fatturaId: string
  importo: number
  note: string
}

export interface IssuedCreditNote extends CreditNoteDraft {
  numero: string
  stato: 'emessa'
  cliente: InvoiceCustomer
  fatturaNumero: string
}

export interface InvoiceDraft {
  id: string
  data: string
  documentType: InvoiceDocumentType
  tipoDocumento?: InvoiceDocumentType
  dataRicezione?: string
  numeroDocumento?: string
  causale?: string
  revenueAccount?: string
  costAccount?: string
  atecoCode?: string
  regimeFiscale?: string
  contributionType?: InvoiceContributionType
  contributionCode?: string
  ritenutaAttiva?: boolean
  bolloRiaddebitatoAlCliente: boolean
  payments: InvoicePayment[]
  linkedIssueTransactionId?: string
  linkedInvoiceNumber?: string
  linkedInvoiceDate?: string
  divisa?: string
  cliente: InvoiceCustomer
  linee: InvoiceLine[]
  aliquotaIva: number
  aliquotaCassa: number
  aliquotaRitenuta: number
  note: string
  conti: InvoiceAccounts
  pagamento?: InvoicePaymentTerms
  marcaDaBollo?: InvoiceStampDuty
}

export interface InvoiceTotals {
  imponibile: number
  cassa: number
  baseIva: number
  iva: number
  ivaPerAliquota: { aliquota: number; baseIva: number; iva: number }[]
  ritenuta: number
  bollo: number
  bolloRiaddebitato?: boolean
  totale: number
}

export interface IssuedInvoice extends InvoiceDraft {
  numero: string
  stato: 'emessa'
  totali: InvoiceTotals
  duplicate?: boolean
  archivio?: InvoiceArchive
}

export type InvoicePaymentStatus = 'Da incassare' | 'Parziale' | 'Saldata' | 'Scaduta' | 'Autofattura' | 'Nota di credito'

export function getInvoicePaidAmount(invoice: Pick<IssuedInvoice, 'pagamento' | 'payments' | 'totali'>): number {
  if (invoice.pagamento?.incassata && !invoice.payments.length) return invoice.totali.totale
  const cents = invoice.payments.reduce((total, payment) => (
    total + Math.max(0, Math.round((Number(payment.importo) + Number.EPSILON) * 100))
  ), 0)
  return cents / 100
}

export function getInvoiceRemainingAmount(invoice: Pick<IssuedInvoice, 'pagamento' | 'payments' | 'totali'>): number {
  return Math.max(0, Math.round(invoice.totali.totale * 100) - Math.round(getInvoicePaidAmount(invoice) * 100)) / 100
}

export function getInvoicePaymentStatus(
  invoice: Pick<IssuedInvoice, 'documentType' | 'pagamento' | 'payments' | 'totali'>,
  today = new Date().toISOString().slice(0, 10),
): InvoicePaymentStatus {
  if (invoice.documentType === 'TD04') return 'Nota di credito'
  if (['TD16', 'TD17', 'TD18', 'TD19'].includes(invoice.documentType)) return 'Autofattura'
  if (getInvoiceRemainingAmount(invoice) === 0) return 'Saldata'
  if (invoice.pagamento?.scadenza && invoice.pagamento.scadenza < today) return 'Scaduta'
  return getInvoicePaidAmount(invoice) > 0 ? 'Parziale' : 'Da incassare'
}

export type StoredIssuedInvoice = Omit<
  IssuedInvoice,
  'documentType' | 'payments' | 'bolloRiaddebitatoAlCliente'
> & Partial<Pick<IssuedInvoice, 'documentType' | 'payments' | 'bolloRiaddebitatoAlCliente'>>

export function normalizeIssuedInvoice(invoice: StoredIssuedInvoice): IssuedInvoice {
  return {
    ...invoice,
    documentType: invoice.documentType || invoice.tipoDocumento || 'TD01',
    revenueAccount: invoice.revenueAccount || invoice.conti.ricavi,
    ritenutaAttiva: invoice.ritenutaAttiva ?? invoice.aliquotaRitenuta > 0,
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    linkedIssueTransactionId: invoice.linkedIssueTransactionId || invoice.id,
    bolloRiaddebitatoAlCliente: invoice.bolloRiaddebitatoAlCliente
      || invoice.marcaDaBollo?.addebitata
      || false,
  }
}

export interface InvoiceArchive {
  folderUrl: string
  pdfUrl: string
  xmlUrl: string
  pdfId: string
  xmlId: string
  dataArchiviazione: string
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const fromCents = (amount: number) => Number((amount / 100).toFixed(2))

export function calculateInvoiceTotals(draft: Pick<InvoiceDraft, 'linee' | 'aliquotaIva' | 'aliquotaCassa' | 'aliquotaRitenuta'> & Partial<Pick<
  InvoiceDraft,
  'documentType' | 'regimeFiscale' | 'bolloRiaddebitatoAlCliente' | 'marcaDaBollo' | 'ritenutaAttiva'
>>): InvoiceTotals {
  const taxableByRate = new Map<number, number>()
  const reverseCharge = ['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType || '')
  for (const line of draft.linee) {
    const rate = draft.regimeFiscale === 'RF19' && !reverseCharge
      ? 0
      : line.aliquotaIva ?? draft.aliquotaIva
    const lineCents = toCents(line.quantita * line.prezzoUnitario)
    taxableByRate.set(rate, (taxableByRate.get(rate) || 0) + lineCents)
  }
  const taxableCents = [...taxableByRate.values()].reduce((total, cents) => total + cents, 0)
  const contributionCents = Math.round(taxableCents * draft.aliquotaCassa / 100)
  const vatBaseCents = taxableCents + contributionCents
  const rates = [...taxableByRate.entries()].sort(([left], [right]) => left - right)
  let allocatedContributionCents = 0
  const ivaPerAliquota = rates.map(([aliquota, baseCents], index) => {
    const rateContributionCents = index === rates.length - 1
      ? contributionCents - allocatedContributionCents
      : taxableCents > 0 ? Math.round(contributionCents * baseCents / taxableCents) : 0
    allocatedContributionCents += rateContributionCents
    const rateBaseCents = baseCents + rateContributionCents
    return {
      aliquota,
      baseIva: fromCents(rateBaseCents),
      iva: fromCents(Math.round(rateBaseCents * aliquota / 100)),
    }
  })
  const vatCents = ivaPerAliquota.reduce((total, item) => total + toCents(item.iva), 0)
  const withholdingCents = draft.ritenutaAttiva === false || draft.regimeFiscale === 'RF19'
    ? 0
    : Math.round(taxableCents * draft.aliquotaRitenuta / 100)
  const exemptCents = [...taxableByRate.entries()]
    .filter(([rate]) => rate === 0)
    .reduce((sum, [, amount]) => sum + amount, 0)
  const stampDutyBaseCents = reverseCharge
    ? 0
    : draft.regimeFiscale === 'RF19' ? taxableCents : exemptCents
  const stampDutyDue = draft.marcaDaBollo?.dovuta
    ?? (Boolean(draft.marcaDaBollo?.addebitata)
      || stampDutyBaseCents > 7_747)
  const stampDutyCents = stampDutyDue
    ? toCents(draft.marcaDaBollo?.importo || 2)
    : 0
  const stampDutyRecharged = Boolean(
    draft.bolloRiaddebitatoAlCliente || draft.marcaDaBollo?.addebitata,
  )

  return {
    imponibile: fromCents(taxableCents),
    cassa: fromCents(contributionCents),
    baseIva: fromCents(vatBaseCents),
    iva: fromCents(vatCents),
    ivaPerAliquota,
    ritenuta: fromCents(withholdingCents),
    bollo: fromCents(stampDutyCents),
    bolloRiaddebitato: stampDutyRecharged && stampDutyCents > 0,
    totale: fromCents(taxableCents + contributionCents + vatCents - withholdingCents
      + (stampDutyRecharged ? stampDutyCents : 0)),
  }
}

export function validateInvoice(draft: InvoiceDraft): string[] {
  const errors: string[] = []
  const invoiceDate = new Date(`${draft.data}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.data)
    || Number.isNaN(invoiceDate.getTime())
    || invoiceDate.toISOString().slice(0, 10) !== draft.data) {
    errors.push('Inserisci una data di emissione valida.')
  }
  if (!draft.cliente.ragioneSociale.trim()) errors.push('Inserisci il nome o la ragione sociale del cliente.')
  if (!draft.cliente.partitaIva.trim() && !draft.cliente.codiceFiscale?.trim()) {
    errors.push('Inserisci il codice fiscale o la partita IVA del cliente.')
  }
  if (draft.cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.cliente.email)) {
    errors.push('L’indirizzo email del cliente non è valido.')
  }
  if (draft.pagamento?.scadenza) {
    const dueDate = new Date(`${draft.pagamento.scadenza}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.pagamento.scadenza)
      || Number.isNaN(dueDate.getTime())
      || dueDate.toISOString().slice(0, 10) !== draft.pagamento.scadenza) {
      errors.push('Inserisci una data di scadenza valida.')
    }
  }
  if (draft.documentType === 'TD04') {
    if (!draft.linkedInvoiceNumber?.trim()) errors.push('Indica il numero della fattura collegata alla nota di credito.')
    if (!draft.linkedInvoiceDate?.trim()) errors.push('Indica la data della fattura collegata alla nota di credito.')
    else {
      const linkedDate = new Date(`${draft.linkedInvoiceDate}T00:00:00.000Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.linkedInvoiceDate)
        || Number.isNaN(linkedDate.getTime())
        || linkedDate.toISOString().slice(0, 10) !== draft.linkedInvoiceDate) {
        errors.push('La data della fattura collegata alla nota di credito non è valida.')
      }
    }
  }
  if (draft.pagamento?.incassata && !draft.conti.incassi?.trim()) {
    errors.push('Configura il conto per gli incassi già ricevuti nelle Impostazioni.')
  }
  const stampDuty = calculateInvoiceTotals(draft)
  if (stampDuty.bolloRiaddebitato) {
    if (!draft.conti.bollo?.trim()) errors.push('Configura il conto per la marca da bollo nelle Impostazioni.')
  }
  if (stampDuty.bollo > 0) {
    if (!Number.isFinite(draft.marcaDaBollo?.importo ?? 2) || (draft.marcaDaBollo?.importo ?? 2) <= 0) {
      errors.push('L’importo della marca da bollo deve essere maggiore di zero.')
    }
  }
  if (draft.linee.length < 1 || draft.linee.length > 100) errors.push('La fattura deve contenere da 1 a 100 voci.')
  draft.linee.forEach((line, index) => {
    if (!line.descrizione.trim()) errors.push(`Inserisci la descrizione della voce ${index + 1}.`)
    if (!Number.isFinite(line.quantita) || line.quantita <= 0) errors.push(`La quantità della voce ${index + 1} deve essere maggiore di zero.`)
    if (!Number.isFinite(line.prezzoUnitario) || line.prezzoUnitario < 0) errors.push(`Il prezzo della voce ${index + 1} non è valido.`)
    const rate = line.aliquotaIva ?? draft.aliquotaIva
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push(`L’aliquota IVA della voce ${index + 1} deve essere compresa tra 0 e 100.`)
  })
  for (const [label, rate] of [
    ['IVA', draft.aliquotaIva],
    ['Cassa previdenziale', draft.aliquotaCassa],
    ['Ritenuta', draft.aliquotaRitenuta],
  ] as const) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push(`L’aliquota ${label} deve essere compresa tra 0 e 100.`)
  }
  if (draft.regimeFiscale === 'RF19' && draft.ritenutaAttiva) {
    errors.push('La ritenuta d’acconto non è applicabile alle fatture in regime forfettario.')
  }
  Object.entries(draft.conti).forEach(([key, account]) => {
    if (!account.trim()) errors.push(`Configura il conto contabile ${key}.`)
  })
  if (!['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType) && !draft.revenueAccount?.trim()) {
    errors.push('Seleziona il conto di ricavo.')
  }
  if (!['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType) && !draft.atecoCode?.trim()) {
    errors.push('Seleziona il codice ATECO dell’attività.')
  }
  if (['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType) && !draft.costAccount?.trim()) {
    errors.push('Seleziona il conto di costo per l’autofattura.')
  }
  if (calculateInvoiceTotals(draft).totale <= 0) errors.push('Il totale della fattura deve essere maggiore di zero.')
  if (draft.aliquotaCassa > 0 && !draft.contributionType) {
    errors.push('Seleziona il tipo di rivalsa previdenziale.')
  }
  if (draft.aliquotaCassa > 0 && draft.contributionType === 'cassa_previdenziale' && !draft.contributionCode?.trim()) {
    errors.push('Seleziona il codice FatturaPA della cassa previdenziale.')
  }
  if (draft.contributionCode && !/^TC(?:0[1-9]|1\d|2[0-2])$/.test(draft.contributionCode)) {
    errors.push('Il codice della cassa previdenziale non è valido.')
  }
  return [...new Set(errors)]
}

export function buildInvoicePosting(invoice: IssuedInvoice) {
  return buildInvoiceAccountingPosting(invoice)
}