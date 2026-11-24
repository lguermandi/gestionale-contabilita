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
  const documentType = invoice.documentType || invoice.tipoDocumento || 'TD01'
  const reverseCharge = ['TD16', 'TD17', 'TD18', 'TD19'].includes(documentType)
  const amountSign = documentType === 'TD04' ? -1 : 1
  const customerCountry = (invoice.cliente.nazione || 'Italia').toLocaleLowerCase('it')
  const customerForeign = customerCountry !== 'italia' && customerCountry !== 'it'
  const companyParty = {
    name: company.ragioneSociale,
    vat: digits(company.partitaIva),
    fiscalCode: alphanumeric(company.codiceFiscale).toUpperCase(),
    address: company.indirizzo,
    cap: company.cap || '',
    comune: company.comune || '',
    provincia: company.provincia || '',
    nation: company.nazione || 'IT',
  }
  const customerParty = {
    name: invoice.cliente.ragioneSociale,
    vat: alphanumeric(invoice.cliente.partitaIva),
    fiscalCode: alphanumeric(invoice.cliente.codiceFiscale || '').toUpperCase(),
    address: invoice.cliente.indirizzo,
    cap: invoice.cliente.cap || '',
    comune: invoice.cliente.comune || '',
    provincia: invoice.cliente.provincia || '',
    nation: customerForeign ? (invoice.cliente.nazione || 'XX').slice(0, 2).toUpperCase() : 'IT',
  }
  const supplier = reverseCharge ? customerParty : companyParty
  const recipient = reverseCharge ? companyParty : customerParty
  const destinationCode = reverseCharge
    ? company.codiceDestinatario || '0000000'
    : invoice.cliente.codiceDestinatario || '0000000'
  const supplierVatXml = supplier.vat
    ? `<IdFiscaleIVA><IdPaese>${esc(supplier.nation)}</IdPaese><IdCodice>${esc(supplier.vat)}</IdCodice></IdFiscaleIVA>`
    : ''
  const recipientVatXml = recipient.vat
    ? `<IdFiscaleIVA><IdPaese>${esc(recipient.nation)}</IdPaese><IdCodice>${esc(recipient.vat)}</IdCodice></IdFiscaleIVA>`
    : ''

  const vatGroups = new Map<number, { base: number; vat: number }>()
  if (invoice.totali.ivaPerAliquota?.length) {
    invoice.totali.ivaPerAliquota.forEach((item) => vatGroups.set(item.aliquota, { base: item.baseIva, vat: item.iva }))
  } else {
    for (const line of invoice.linee) {
      const rate = company.regimeFiscale === 'RF19' && !reverseCharge ? 0 : (line.aliquotaIva ?? invoice.aliquotaIva)
      const base = Math.round(line.quantita * line.prezzoUnitario * 100) / 100
      const current = vatGroups.get(rate) || { base: 0, vat: 0 }
      current.base += base
      current.vat += Math.round(base * rate) / 100
      vatGroups.set(rate, current)
    }
  }

  const dettaglio = invoice.linee.map((line, index) => {
    const originalRate = line.aliquotaIva ?? invoice.aliquotaIva
    const rate = company.regimeFiscale === 'RF19' && !reverseCharge ? 0 : originalRate
    const natura = company.regimeFiscale === 'RF19' && !reverseCharge
      ? 'N2.2'
      : (line.naturaIva || (rate === 0 ? 'N1' : ''))
    return `      <DettaglioLinee>
        <NumeroLinea>${index + 1}</NumeroLinea>
        <Descrizione>${esc(line.descrizione)}</Descrizione>
        <Quantita>${decimal(line.quantita)}</Quantita>
        <PrezzoUnitario>${decimal(line.prezzoUnitario * amountSign)}</PrezzoUnitario>
        <PrezzoTotale>${decimal(line.quantita * line.prezzoUnitario * amountSign)}</PrezzoTotale>
        <AliquotaIVA>${decimal(rate)}</AliquotaIVA>
        ${natura ? `<Natura>${esc(natura)}</Natura>` : ''}
        ${line.riferimentoAmministrazione ? `<RiferimentoAmministrazione>${esc(line.riferimentoAmministrazione)}</RiferimentoAmministrazione>` : ''}
      </DettaglioLinee>`
  }).join('\n')

  const riepilogo = [...vatGroups.entries()].sort(([left], [right]) => left - right).map(([rate, values]) => {
    const natura = company.regimeFiscale === 'RF19' && !reverseCharge
      ? 'N2.2'
      : (invoice.linee.find((line) => (line.aliquotaIva ?? invoice.aliquotaIva) === rate)?.naturaIva || (rate === 0 ? 'N1' : ''))
    return `      <DatiRiepilogo>
        <AliquotaIVA>${decimal(rate)}</AliquotaIVA>
        ${natura ? `<Natura>${esc(natura)}</Natura>` : ''}
        <ImponibileImporto>${decimal(values.base * amountSign)}</ImponibileImporto>
        <Imposta>${decimal(values.vat * amountSign)}</Imposta>
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
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${esc(companyParty.vat)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${esc(destinationCode)}</CodiceDestinatario>
      ${!reverseCharge && company.pec ? `<PECDestinatario>${esc(company.pec)}</PECDestinatario>` : ''}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        ${supplierVatXml}
        ${supplier.fiscalCode ? `<CodiceFiscale>${esc(supplier.fiscalCode)}</CodiceFiscale>` : ''}
        <Anagrafica><Denominazione>${esc(supplier.name)}</Denominazione></Anagrafica>
        <RegimeFiscale>${esc(reverseCharge ? 'RF01' : company.regimeFiscale || 'RF01')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(supplier.address)}</Indirizzo>
        <CAP>${esc(supplier.cap)}</CAP>
        <Comune>${esc(supplier.comune)}</Comune>
        ${supplier.provincia ? `<Provincia>${esc(supplier.provincia)}</Provincia>` : ''}
        <Nazione>${esc(supplier.nation)}</Nazione>
      </Sede>
      ${!reverseCharge && company.pec ? `<Contatti><PECDomicilio>${esc(company.pec)}</PECDomicilio></Contatti>` : ''}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${recipientVatXml}
        ${recipient.fiscalCode ? `<CodiceFiscale>${esc(recipient.fiscalCode)}</CodiceFiscale>` : ''}
        <Anagrafica><Denominazione>${esc(recipient.name)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(recipient.address)}</Indirizzo>
        <CAP>${esc(recipient.cap)}</CAP>
        <Comune>${esc(recipient.comune)}</Comune>
        ${recipient.provincia ? `<Provincia>${esc(recipient.provincia)}</Provincia>` : ''}
        <Nazione>${esc(recipient.nation)}</Nazione>
      </Sede>
    </CessionarioCommittente>
    ${reverseCharge ? '<SoggettoEmittente>CC</SoggettoEmittente>' : ''}
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${esc(documentType)}</TipoDocumento>
        <Divisa>${esc(invoice.divisa || 'EUR')}</Divisa>
        <Data>${esc(invoice.data)}</Data>
        <Numero>${esc(invoice.numeroDocumento || invoice.numero)}</Numero>
        ${invoice.totali.ritenuta > 0 ? `<DatiRitenuta><TipoRitenuta>RT02</TipoRitenuta><ImportoRitenuta>${decimal(invoice.totali.ritenuta * amountSign)}</ImportoRitenuta><AliquotaRitenuta>${decimal(invoice.aliquotaRitenuta)}</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>` : ''}
        ${invoice.totali.bollo > 0 ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${decimal(invoice.totali.bollo * amountSign)}</ImportoBollo></DatiBollo>` : ''}
        ${invoice.totali.cassa > 0 ? `<DatiCassaPrevidenziale><TipoCassa>${esc(invoice.contributionType === 'gestione_separata' ? 'TC22' : invoice.contributionCode || 'TC22')}</TipoCassa><AlCassa>${decimal(invoice.aliquotaCassa)}</AlCassa><ImportoContributoCassa>${decimal(invoice.totali.cassa * amountSign)}</ImportoContributoCassa><ImponibileCassa>${decimal(invoice.totali.imponibile * amountSign)}</ImponibileCassa><AliquotaIVA>${decimal(invoice.aliquotaIva)}</AliquotaIVA><Ritenuta>NO</Ritenuta></DatiCassaPrevidenziale>` : ''}
        <ImportoTotaleDocumento>${decimal((invoice.totali.totale + (invoice.totali.ritenuta || 0)) * amountSign)}</ImportoTotaleDocumento>
        ${invoice.causale ? `<Causale>${esc(invoice.causale)}</Causale>` : ''}
      </DatiGeneraliDocumento>
      ${invoice.linkedInvoiceNumber ? `<DatiFattureCollegate><IdDocumento>${esc(invoice.linkedInvoiceNumber)}</IdDocumento>${invoice.linkedInvoiceDate ? `<Data>${esc(invoice.linkedInvoiceDate)}</Data>` : ''}</DatiFattureCollegate>` : ''}
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
        <ImportoPagamento>${decimal(invoice.totali.totale * amountSign)}</ImportoPagamento>
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
