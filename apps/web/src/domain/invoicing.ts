export interface InvoiceLine {
  id: string
  descrizione: string
  quantita: number
  prezzoUnitario: number
}

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
}

export interface InvoiceCustomer {
  id?: string
  ragioneSociale: string
  indirizzo: string
  partitaIva: string
  email: string
  codiceFiscale?: string
  nazione?: string
  tipologia?: string
  cap?: string
  comune?: string
  telefono?: string
}

export interface InvoicePayment {
  metodo: string
  scadenza: string
  incassata: boolean
}

export interface InvoiceStampDuty {
  addebitata: boolean
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
  cliente: InvoiceCustomer
  linee: InvoiceLine[]
  aliquotaIva: number
  aliquotaCassa: number
  aliquotaRitenuta: number
  note: string
  conti: InvoiceAccounts
  pagamento?: InvoicePayment
  marcaDaBollo?: InvoiceStampDuty
}

export interface InvoiceTotals {
  imponibile: number
  cassa: number
  baseIva: number
  iva: number
  ritenuta: number
  bollo: number
  totale: number
}

export interface IssuedInvoice extends InvoiceDraft {
  numero: string
  stato: 'emessa'
  totali: InvoiceTotals
  duplicate?: boolean
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const fromCents = (amount: number) => Number((amount / 100).toFixed(2))

export function calculateInvoiceTotals(draft: Pick<InvoiceDraft, 'linee' | 'aliquotaIva' | 'aliquotaCassa' | 'aliquotaRitenuta'> & Partial<Pick<InvoiceDraft, 'marcaDaBollo'>>): InvoiceTotals {
  const taxableCents = draft.linee.reduce(
    (total, line) => total + toCents(line.quantita * line.prezzoUnitario),
    0,
  )
  const contributionCents = Math.round(taxableCents * draft.aliquotaCassa / 100)
  const vatBaseCents = taxableCents + contributionCents
  const vatCents = Math.round(vatBaseCents * draft.aliquotaIva / 100)
  const withholdingCents = Math.round(taxableCents * draft.aliquotaRitenuta / 100)
  const stampDutyCents = draft.marcaDaBollo?.addebitata
    ? toCents(draft.marcaDaBollo.importo)
    : 0

  return {
    imponibile: fromCents(taxableCents),
    cassa: fromCents(contributionCents),
    baseIva: fromCents(vatBaseCents),
    iva: fromCents(vatCents),
    ritenuta: fromCents(withholdingCents),
    bollo: fromCents(stampDutyCents),
    totale: fromCents(taxableCents + contributionCents + vatCents - withholdingCents + stampDutyCents),
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
  if (draft.pagamento?.incassata && !draft.conti.incassi?.trim()) {
    errors.push('Configura il conto per gli incassi già ricevuti nelle Impostazioni.')
  }
  if (draft.marcaDaBollo?.addebitata) {
    if (!Number.isFinite(draft.marcaDaBollo.importo) || draft.marcaDaBollo.importo <= 0) {
      errors.push('L’importo della marca da bollo deve essere maggiore di zero.')
    }
    if (!draft.conti.bollo?.trim()) errors.push('Configura il conto per la marca da bollo nelle Impostazioni.')
  }
  if (draft.linee.length < 1 || draft.linee.length > 100) errors.push('La fattura deve contenere da 1 a 100 voci.')
  draft.linee.forEach((line, index) => {
    if (!line.descrizione.trim()) errors.push(`Inserisci la descrizione della voce ${index + 1}.`)
    if (!Number.isFinite(line.quantita) || line.quantita <= 0) errors.push(`La quantità della voce ${index + 1} deve essere maggiore di zero.`)
    if (!Number.isFinite(line.prezzoUnitario) || line.prezzoUnitario < 0) errors.push(`Il prezzo della voce ${index + 1} non è valido.`)
  })
  for (const [label, rate] of [
    ['IVA', draft.aliquotaIva],
    ['Cassa previdenziale', draft.aliquotaCassa],
    ['Ritenuta', draft.aliquotaRitenuta],
  ] as const) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push(`L’aliquota ${label} deve essere compresa tra 0 e 100.`)
  }
  Object.entries(draft.conti).forEach(([key, account]) => {
    if (!account.trim()) errors.push(`Configura il conto contabile ${key}.`)
  })
  if (calculateInvoiceTotals(draft).totale <= 0) errors.push('Il totale della fattura deve essere maggiore di zero.')
  return [...new Set(errors)]
}

export function buildInvoicePosting(invoice: IssuedInvoice) {
  const { totali, conti, numero, cliente } = invoice
  const descrizione = `Fattura ${numero} - ${cliente.ragioneSociale}`.slice(0, 200)
  const movements = [
    { conto: invoice.pagamento?.incassata ? conti.incassi || conti.clienti : conti.clienti, descrizione, gestione: '', dare: totali.totale, avere: 0 },
    ...(totali.ritenuta > 0 ? [{ conto: conti.ritenute, descrizione, gestione: '', dare: totali.ritenuta, avere: 0 }] : []),
    { conto: conti.ricavi, descrizione, gestione: conti.gestione, dare: 0, avere: totali.imponibile },
    ...(totali.cassa > 0 ? [{ conto: conti.cassa, descrizione, gestione: conti.gestione, dare: 0, avere: totali.cassa }] : []),
    ...(totali.iva > 0 ? [{ conto: conti.iva, descrizione, gestione: '', dare: 0, avere: totali.iva }] : []),
    ...(totali.bollo > 0 ? [{ conto: conti.bollo || conti.ricavi, descrizione, gestione: '', dare: 0, avere: totali.bollo }] : []),
  ]
  return movements
}