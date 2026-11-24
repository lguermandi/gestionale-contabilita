export interface ParsedFatturaPaLine {
  id: string
  descrizione: string
  imponibile: number
  aliquotaIva: number
}

export interface ParsedFatturaPa {
  data: string
  dataScadenza?: string
  documentType: string
  numeroDocumento: string
  fornitore: {
    ragioneSociale: string
    indirizzo: string
    partitaIva: string
    codiceFiscale: string
    nazione: string
    provincia: string
    cap: string
    comune: string
  }
  descrizione: string
  righe: ParsedFatturaPaLine[]
  imponibile: number
  iva: number
  totale: number
}

function elementsByLocalName(node: Document | Element, name: string): Element[] {
  return Array.from(node.getElementsByTagName('*')).filter((element) => (
    element.localName === name || element.tagName.split(':').pop() === name
  ))
}

function firstDescendant(node: Document | Element, name: string): Element | undefined {
  return elementsByLocalName(node, name)[0]
}

function directChild(node: Element | undefined, name: string): Element | undefined {
  if (!node) return undefined
  return Array.from(node.children).find((element) => (
    element.localName === name || element.tagName.split(':').pop() === name
  ))
}

function text(node: Element | undefined): string {
  return node?.textContent?.trim() || ''
}

function decimal(value: string, label: string): number {
  const parsed = Number(value.trim().replace(',', '.'))
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error(`Valore ${label} non valido nel file FatturaPA.`)
  }
  return parsed
}

function validDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} mancante o non valida nel file FatturaPA.`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} mancante o non valida nel file FatturaPA.`)
  }
  return value
}

export function parseFatturaPaXml(xml: string): ParsedFatturaPa {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Il browser non supporta la lettura locale dei file XML.')
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (elementsByLocalName(document, 'parsererror').length > 0) {
    throw new Error('Il file selezionato non contiene XML valido.')
  }
  const root = document.documentElement
  if (!root || (root.localName !== 'FatturaElettronica' && root.tagName.split(':').pop() !== 'FatturaElettronica')) {
    throw new Error('Il file selezionato non è una fattura elettronica FatturaPA.')
  }

  const header = firstDescendant(root, 'FatturaElettronicaHeader')
  const seller = firstDescendant(header || root, 'CedentePrestatore')
  const supplierDetails = firstDescendant(seller || root, 'DatiAnagrafici')
  const supplierName = firstDescendant(supplierDetails || root, 'Anagrafica')
  const vatId = firstDescendant(supplierDetails || root, 'IdFiscaleIVA')
  const address = firstDescendant(seller || root, 'Sede')
  const companyName = text(directChild(supplierName, 'Denominazione'))
  const personName = [
    text(directChild(supplierName, 'Nome')),
    text(directChild(supplierName, 'Cognome')),
  ].filter(Boolean).join(' ')
  const ragioneSociale = companyName || personName
  if (!ragioneSociale) throw new Error('Ragione sociale del fornitore mancante nel file FatturaPA.')

  const bodies = elementsByLocalName(root, 'FatturaElettronicaBody')
  const body = bodies[0]
  if (!body) throw new Error('Dati del documento mancanti nel file FatturaPA.')
  const documentData = firstDescendant(body, 'DatiGeneraliDocumento')
  const documentType = text(directChild(documentData, 'TipoDocumento'))
  const data = validDate(text(directChild(documentData, 'Data')), 'Data documento')
  const numeroDocumento = text(directChild(documentData, 'Numero'))
  if (!documentType || !numeroDocumento) {
    throw new Error('Tipo o numero documento mancante nel file FatturaPA.')
  }

  const lines = elementsByLocalName(body, 'DettaglioLinee')
    .map((line, index) => {
      const description = text(directChild(line, 'Descrizione'))
      const quantityText = text(directChild(line, 'Quantita')) || '1'
      const unitPriceText = text(directChild(line, 'PrezzoUnitario')) || '0'
      const totalText = text(directChild(line, 'PrezzoTotale'))
      const amount = Math.abs(totalText
        ? decimal(totalText, 'imponibile riga')
        : decimal(quantityText, 'quantità') * decimal(unitPriceText, 'prezzo unitario'))
      const rateText = text(directChild(line, 'AliquotaIVA'))
      if (!description || !rateText) {
        throw new Error(`Descrizione o aliquota IVA mancante alla riga ${index + 1} della FatturaPA.`)
      }
      return {
        id: `xml-${index + 1}`,
        descrizione: description,
        imponibile: amount,
        aliquotaIva: decimal(rateText, 'aliquota IVA'),
      }
    })
  if (lines.length < 1) throw new Error('Il file FatturaPA non contiene righe di dettaglio.')

  const paymentDates = elementsByLocalName(body, 'DataScadenzaPagamento')
    .map((element) => text(element))
    .filter(Boolean)
  const dataScadenza = paymentDates.length
    ? paymentDates.sort()[0]
    : undefined
  if (dataScadenza) validDate(dataScadenza, 'Data di scadenza')

  const supplierCountry = text(directChild(vatId, 'IdPaese')) || 'IT'
  const totalText = text(directChild(documentData, 'ImportoTotaleDocumento'))
  const summaries = elementsByLocalName(body, 'DatiRiepilogo')
  const declaredTaxable = summaries.reduce((sum, summary) => {
    const amount = text(directChild(summary, 'ImponibileImporto'))
    return sum + (amount ? decimal(amount, 'imponibile riepilogo') : 0)
  }, 0)
  const declaredVat = summaries.reduce((sum, summary) => {
    const amount = text(directChild(summary, 'Imposta'))
    return sum + (amount ? decimal(amount, 'IVA riepilogo') : 0)
  }, 0)
  const imponibile = summaries.length
    ? Math.abs(declaredTaxable)
    : lines.reduce((sum, line) => sum + line.imponibile, 0)
  const iva = summaries.length
    ? Math.abs(declaredVat)
    : lines.reduce((sum, line) => sum + Math.round(line.imponibile * line.aliquotaIva) / 100, 0)
  const totale = totalText
    ? Math.abs(decimal(totalText, 'totale documento'))
    : Math.round((imponibile + iva) * 100) / 100
  const addressParts = [
    text(directChild(address, 'Indirizzo')),
    text(directChild(address, 'NumeroCivico')),
  ].filter(Boolean)

  return {
    data,
    dataScadenza,
    documentType,
    numeroDocumento,
    fornitore: {
      ragioneSociale,
      indirizzo: addressParts.join(', '),
      partitaIva: text(directChild(vatId, 'IdCodice')),
      codiceFiscale: text(directChild(supplierDetails, 'CodiceFiscale')),
      nazione: supplierCountry === 'IT' ? 'Italia' : supplierCountry,
      provincia: text(directChild(address, 'Provincia')),
      cap: text(directChild(address, 'CAP')),
      comune: text(directChild(address, 'Comune')),
    },
    descrizione: lines.map((line) => line.descrizione).join('; ').slice(0, 200),
    righe: lines,
    imponibile,
    iva,
    totale,
  }
}
