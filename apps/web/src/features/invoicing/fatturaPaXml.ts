import type { IssuedInvoice } from '../../domain/invoicing'
import type { CompanyProfile } from '../../stores/profileStore'

const XML_NS = 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decimal(value: number) {
  return Number(value).toFixed(2)
}

function formatCode(value: string) {
  return [...value].filter((character) => /[A-Za-z0-9]/.test(character)).join('').toUpperCase()
}

function digits(value: string) {
  return [...value].filter((character) => /[0-9]/.test(character)).join('')
}

function alphanumeric(value: string) {
  return [...value].filter((character) => /[A-Za-z0-9]/.test(character)).join('')
}

export function validateFatturaPaXml(invoice: IssuedInvoice, company: CompanyProfile): string[] {
  const errors: string[] = []
  const vat = formatCode(company.partitaIva)
  if (!/^IT[A-Z0-9]{11,28}$/.test(vat)) {
    const digits = company.partitaIva.replace(/[^0-9]/g, '')
    if (!/^[0-9]{11}$/.test(digits)) {
      errors.push(`Partita IVA emittente non valida: sono richieste 11 cifre; valore attuale ${digits.length} cifre.`)
    }
  }
  if (!company.regimeFiscale) errors.push('Seleziona il regime fiscale dell’emittente nelle Impostazioni.')
  if (!company.indirizzo || !company.comune) errors.push('Indirizzo sede, comune e CAP dell’emittente sono obbligatori.')
  if (!company.cap) errors.push('CAP dell’emittente obbligatorio.')
  if (!invoice.cliente.ragioneSociale) errors.push('Ragione sociale o denominazione del destinatario obbligatoria.')
  if (!invoice.cliente.partitaIva && !invoice.cliente.codiceFiscale) errors.push('Partita IVA o codice fiscale del destinatario obbligatorio.')
  if (invoice.cliente.nazione === 'Italia' || !invoice.cliente.nazione) {
    if (!invoice.cliente.indirizzo || !invoice.cliente.comune || !invoice.cliente.cap) {
      errors.push('Per clienti italiani sono obbligatori indirizzo, comune e CAP.')
    }
  }
  if (!invoice.linee.length) errors.push('La fattura deve contenere almeno una voce.')
  invoice.linee.forEach((line, index) => {
    if (!line.descrizione.trim()) errors.push(`Descrizione voce ${index + 1} obbligatoria.`)
  })
  return [...new Set(errors)]
}

export function buildFatturaPaXml(invoice: IssuedInvoice, company: CompanyProfile) {
  const errors = validateFatturaPaXml(invoice, company)
  if (errors.length) throw new Error(errors.join(' '))

  const progressivo = alphanumeric(invoice.numero).slice(0, 10) || invoice.id.slice(0, 10)
  const cedenteVat = digits(company.partitaIva)
  const cedenteFiscalCode = alphanumeric(company.codiceFiscale).toUpperCase()
  const cedenteId = `<IdCodice>${esc(cedenteVat)}</IdCodice>`
  const customerForeign = (invoice.cliente.nazione || 'Italia').toLocaleLowerCase('it') !== 'italia'
  const customerVat = alphanumeric(invoice.cliente.partitaIva)
  const customerFiscalCode = alphanumeric(invoice.cliente.codiceFiscale || '').toUpperCase()
  const customerId = customerVat
    ? `<IdPaese>${esc(customerForeign ? (invoice.cliente.nazione || 'XX').slice(0, 2).toUpperCase() : 'IT')}</IdPaese><IdCodice>${esc(customerVat)}</IdCodice>`
    : ''
  const destinationCode = invoice.cliente.tipologia === 'Pubblica amministrazione'
    ? (invoice.cliente.codiceDestinatario || '0000000')
    : (invoice.cliente.codiceDestinatario || '0000000')
  const tipoDocumento = invoice.tipoDocumento || 'TD01'

  const vatGroups = new Map<number, { base: number; vat: number }>()
  for (const line of invoice.linee) {
    const rate = company.regimeFiscale === 'RF19' ? 0 : (line.aliquotaIva ?? invoice.aliquotaIva)
    const base = Math.round(line.quantita * line.prezzoUnitario * 100) / 100
    const current = vatGroups.get(rate) || { base: 0, vat: 0 }
    current.base += base
    current.vat += Math.round(base * rate) / 100
    vatGroups.set(rate, current)
  }

  const dettaglio = invoice.linee.map((line, index) => {
    const originalRate = line.aliquotaIva ?? invoice.aliquotaIva
    const rate = company.regimeFiscale === 'RF19' ? 0 : originalRate
    const natura = company.regimeFiscale === 'RF19'
      ? 'N2.2'
      : (line.naturaIva || (rate === 0 ? 'N1' : ''))
    return `      <DettaglioLinee>
        <NumeroLinea>${index + 1}</NumeroLinea>
        <Descrizione>${esc(line.descrizione)}</Descrizione>
        <Quantita>${decimal(line.quantita)}</Quantita>
        <PrezzoUnitario>${decimal(line.prezzoUnitario)}</PrezzoUnitario>
        <PrezzoTotale>${decimal(line.quantita * line.prezzoUnitario)}</PrezzoTotale>
        <AliquotaIVA>${decimal(rate)}</AliquotaIVA>
        ${natura ? `<Natura>${esc(natura)}</Natura>` : ''}
        ${line.riferimentoAmministrazione ? `<RiferimentoAmministrazione>${esc(line.riferimentoAmministrazione)}</RiferimentoAmministrazione>` : ''}
      </DettaglioLinee>`
  }).join('\n')

  const riepilogo = [...vatGroups.entries()].sort(([left], [right]) => left - right).map(([rate, values]) => {
    const natura = company.regimeFiscale === 'RF19'
      ? 'N2.2'
      : (invoice.linee.find((line) => (line.aliquotaIva ?? invoice.aliquotaIva) === rate)?.naturaIva || (rate === 0 ? 'N1' : ''))
    return `      <DatiRiepilogo>
        <AliquotaIVA>${decimal(rate)}</AliquotaIVA>
        ${natura ? `<Natura>${esc(natura)}</Natura>` : ''}
        <ImponibileImporto>${decimal(values.base)}</ImponibileImporto>
        <Imposta>${decimal(values.vat)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`
  }).join('\n')

  const paymentCode = invoice.pagamento?.metodo === 'Bonifico' ? 'MP05'
    : invoice.pagamento?.metodo === 'Contanti' ? 'MP01'
      : invoice.pagamento?.metodo === 'Carta' ? 'MP08'
        : invoice.pagamento?.metodo === 'PayPal' ? 'MP19'
          : 'MP01'

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="${XML_NS}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${esc(cedenteVat)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${esc(destinationCode)}</CodiceDestinatario>
      ${company.pec ? `<PECDestinatario>${esc(company.pec)}</PECDestinatario>` : ''}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese>${cedenteId}</IdFiscaleIVA>
        ${cedenteFiscalCode ? `<CodiceFiscale>${esc(cedenteFiscalCode)}</CodiceFiscale>` : ''}
        <Anagrafica><Denominazione>${esc(company.ragioneSociale)}</Denominazione></Anagrafica>
        <RegimeFiscale>${esc(company.regimeFiscale || 'RF01')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(company.indirizzo)}</Indirizzo>
        <CAP>${esc(company.cap || '')}</CAP>
        <Comune>${esc(company.comune || '')}</Comune>
        ${company.provincia ? `<Provincia>${esc(company.provincia)}</Provincia>` : ''}
        <Nazione>${esc(company.nazione || 'IT')}</Nazione>
      </Sede>
      ${company.pec ? `<Contatti><PECDomicilio>${esc(company.pec)}</PECDomicilio></Contatti>` : ''}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>${customerId}</IdFiscaleIVA>
        ${customerFiscalCode ? `<CodiceFiscale>${esc(customerFiscalCode)}</CodiceFiscale>` : ''}
        <Anagrafica><Denominazione>${esc(invoice.cliente.ragioneSociale)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(invoice.cliente.indirizzo)}</Indirizzo>
        <CAP>${esc(invoice.cliente.cap || '')}</CAP>
        <Comune>${esc(invoice.cliente.comune || '')}</Comune>
        ${invoice.cliente.provincia ? `<Provincia>${esc(invoice.cliente.provincia)}</Provincia>` : ''}
        <Nazione>${esc(customerForeign ? (invoice.cliente.nazione || 'XX').slice(0, 2).toUpperCase() : 'IT')}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${esc(tipoDocumento)}</TipoDocumento>
        <Divisa>${esc(invoice.divisa || 'EUR')}</Divisa>
        <Data>${esc(invoice.data)}</Data>
        <Numero>${esc(invoice.numeroDocumento || invoice.numero)}</Numero>
        ${invoice.causale ? `<Causale>${esc(invoice.causale)}</Causale>` : ''}
        ${invoice.marcaDaBollo?.addebitata ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${decimal(invoice.marcaDaBollo.importo)}</ImportoBollo></DatiBollo>` : ''}
        ${invoice.aliquotaRitenuta > 0 ? `<DatiRitenuta><TipoRitenuta>RT02</TipoRitenuta><ImportoRitenuta>${decimal(invoice.totali.ritenuta)}</ImportoRitenuta><AliquotaRitenuta>${decimal(invoice.aliquotaRitenuta)}</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>` : ''}
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${dettaglio}
${riepilogo}
    </DatiBeniServizi>
    ${invoice.pagamento?.metodo || invoice.pagamento?.scadenza ? `<DatiPagamento>
      <CondizioniPagamento>${invoice.pagamento?.incassata ? 'TP02' : 'TP02'}</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${paymentCode}</ModalitaPagamento>
        ${invoice.pagamento?.scadenza ? `<DataScadenzaPagamento>${esc(invoice.pagamento.scadenza)}</DataScadenzaPagamento>` : ''}
        <ImportoPagamento>${decimal(invoice.totali.totale)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>` : ''}
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}

export function downloadFatturaPaXml(invoice: IssuedInvoice, company: CompanyProfile) {
  const xml = buildFatturaPaXml(invoice, company)
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${digits(company.partitaIva)}_${alphanumeric(invoice.numero)}.xml`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
