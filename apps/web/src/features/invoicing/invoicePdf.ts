import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { IssuedInvoice } from '../../domain/invoicing'
import type { CompanyProfile } from '../../stores/profileStore'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const dateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })

export function createInvoicePdf(invoice: IssuedInvoice, company: CompanyProfile) {
  const document = new jsPDF({ format: 'a4', unit: 'mm' })
  const left = 18
  const right = 192
  const date = dateFormatter.format(new Date(`${invoice.data}T00:00:00`))
  const reverseCharge = ['TD16', 'TD17', 'TD18', 'TD19'].includes(invoice.documentType)
  const amountSign = invoice.documentType === 'TD04' ? -1 : 1
  const title = invoice.documentType === 'TD04'
    ? 'NOTA DI CREDITO'
    : reverseCharge
      ? 'AUTOFATTURA / INTEGRAZIONE'
      : invoice.documentType === 'TD24' ? 'FATTURA DIFFERITA' : 'FATTURA'
  const issuerName = reverseCharge ? invoice.cliente.ragioneSociale : company.ragioneSociale
  const issuerAddress = reverseCharge ? invoice.cliente.indirizzo : company.indirizzo
  const issuerVat = reverseCharge ? invoice.cliente.partitaIva : company.partitaIva
  const issuerFiscalCode = reverseCharge ? invoice.cliente.codiceFiscale : company.codiceFiscale
  const recipientName = reverseCharge ? company.ragioneSociale : invoice.cliente.ragioneSociale
  const recipientAddress = reverseCharge ? company.indirizzo : invoice.cliente.indirizzo
  const recipientVat = reverseCharge ? company.partitaIva : invoice.cliente.partitaIva
  const recipientFiscalCode = reverseCharge ? company.codiceFiscale : invoice.cliente.codiceFiscale

  document.setFont('helvetica', 'bold')
  document.setFontSize(15)
  document.setTextColor(6, 95, 70)
  document.text(issuerName, left, 22)
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  document.setTextColor(41, 37, 36)
  const issuerDetails = [
    issuerAddress,
    issuerVat ? `P. IVA ${issuerVat}` : '',
    issuerFiscalCode ? `C.F. ${issuerFiscalCode}` : '',
    !reverseCharge ? company.email : invoice.cliente.email,
    !reverseCharge && company.pec ? `PEC ${company.pec}` : '',
    !reverseCharge && company.codiceDestinatario ? `Codice destinatario ${company.codiceDestinatario}` : '',
    !reverseCharge ? company.telefono : invoice.cliente.telefono,
  ].filter((line): line is string => Boolean(line))
  issuerDetails.forEach((line, index) => document.text(line, left, 29 + index * 5))

  document.setFont('helvetica', 'bold')
  document.setFontSize(10)
  document.setTextColor(87, 83, 78)
  document.text(`${invoice.documentType} · ${title}`, right, 22, { align: 'right' })
  document.setFontSize(17)
  document.setTextColor(28, 25, 23)
  document.text(invoice.numero, right, 31, { align: 'right' })
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  document.text(`Data: ${date}`, right, 38, { align: 'right' })

  const buyerTop = Math.max(issuerDetails.length * 5 + 38, 64)
  document.setFont('helvetica', 'bold')
  document.setFontSize(8)
  document.setTextColor(4, 120, 87)
  document.text(reverseCharge ? 'CESSIONARIO / COMMITTENTE' : 'CLIENTE', left, buyerTop)
  document.setFontSize(10)
  document.setTextColor(41, 37, 36)
  document.text(recipientName, left, buyerTop + 7)
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  const buyerDetails = [
    recipientAddress,
    reverseCharge
      ? [company.cap, company.comune, company.nazione].filter(Boolean).join(' ')
      : [invoice.cliente.cap, invoice.cliente.comune, invoice.cliente.nazione].filter(Boolean).join(' '),
    recipientVat && `P. IVA ${recipientVat}`,
    recipientFiscalCode && `C.F. ${recipientFiscalCode}`,
    reverseCharge ? company.email : invoice.cliente.email,
  ].filter(Boolean) as string[]
  buyerDetails.forEach((line, index) => document.text(line, left, buyerTop + 13 + index * 5))

  const tableTop = buyerTop + Math.max(20, 13 + buyerDetails.length * 5)
  autoTable(document, {
    startY: tableTop,
    head: [['Descrizione', 'Quantità', 'Prezzo unitario', 'IVA', 'Importo']],
    body: invoice.linee.map((line) => [
      line.descrizione,
      line.quantita.toLocaleString('it-IT'),
      euro.format(line.prezzoUnitario * amountSign),
      `${invoice.regimeFiscale === 'RF19' && !reverseCharge ? 0 : line.aliquotaIva ?? invoice.aliquotaIva}%`,
      euro.format(line.quantita * line.prezzoUnitario * amountSign),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60], fontStyle: 'bold' },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [214, 211, 209], textColor: [41, 37, 36] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 34 } },
    margin: { left, right: 18 },
  })

  const tableBottom = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableTop
  let summaryTop = tableBottom + 12
  if (summaryTop > 240) {
    document.addPage()
    summaryTop = 22
  }
  if (invoice.note) {
    document.setFont('helvetica', 'normal')
    document.setFontSize(9)
    document.setTextColor(87, 83, 78)
    document.text(document.splitTextToSize(`Note: ${invoice.note}`, 85), left, summaryTop)
  }

  const totalsRows = [
    ['Imponibile', euro.format(invoice.totali.imponibile * amountSign)],
    ...(invoice.totali.cassa > 0 ? [[
      `${invoice.contributionType === 'gestione_separata' ? 'Rivalsa INPS' : 'Cassa previdenziale'} ${invoice.aliquotaCassa}%`,
      euro.format(invoice.totali.cassa * amountSign),
    ]] : []),
    ...(invoice.totali.ivaPerAliquota?.length
      ? invoice.totali.ivaPerAliquota.map((item) => [`IVA ${item.aliquota}% su ${euro.format(item.baseIva * amountSign)}`, euro.format(item.iva * amountSign)])
      : [[`IVA ${invoice.aliquotaIva}% su ${euro.format(invoice.totali.baseIva * amountSign)}`, euro.format(invoice.totali.iva * amountSign)]]),
    ...(invoice.totali.ritenuta > 0 ? [[`Ritenuta ${invoice.aliquotaRitenuta}%`, euro.format(-invoice.totali.ritenuta * amountSign)]] : []),
    ...((invoice.totali.bollo || 0) > 0
      ? [[`Marca da bollo${invoice.totali.bolloRiaddebitato ? '' : ' (a carico emittente)'}`, euro.format(invoice.totali.bollo * amountSign)]]
      : []),
    ['Totale documento', euro.format(invoice.totali.totale * amountSign)],
  ]
  autoTable(document, {
    startY: summaryTop,
    body: totalsRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: [41, 37, 36] },
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', cellWidth: 38 } },
    margin: { left: right - 93, right: 18 },
    didParseCell: (data) => {
      if (data.row.index === totalsRows.length - 1) data.cell.styles.fontStyle = 'bold'
    },
  })

  const paymentTop = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? summaryTop
  const paymentDetails = [
    invoice.pagamento?.metodo ? `Modalità di pagamento: ${invoice.pagamento.metodo}` : '',
    invoice.pagamento?.scadenza
      ? `Scadenza: ${dateFormatter.format(new Date(`${invoice.pagamento.scadenza}T00:00:00`))}`
      : '',
    invoice.pagamento?.incassata ? 'Pagamento già ricevuto.' : '',
    invoice.marcaDaBollo?.identificativo ? `ID marca da bollo: ${invoice.marcaDaBollo.identificativo}` : '',
  ].filter(Boolean)
  if (paymentDetails.length) {
    let detailsTop = paymentTop + 12
    if (detailsTop > 270) {
      document.addPage()
      detailsTop = 22
    }
    document.setFont('helvetica', 'normal')
    document.setFontSize(9)
    document.setTextColor(87, 83, 78)
    document.text(paymentDetails, left, detailsTop)
  }

  return document
}

export function downloadInvoicePdf(invoice: IssuedInvoice, company: CompanyProfile) {
  createInvoicePdf(invoice, company).save(`Fattura-${invoice.numero.replace('/', '-')}.pdf`)
}
