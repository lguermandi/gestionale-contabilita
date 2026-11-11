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

  document.setFont('helvetica', 'bold')
  document.setFontSize(15)
  document.setTextColor(6, 95, 70)
  document.text(company.ragioneSociale, left, 22)
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  document.setTextColor(41, 37, 36)
  const issuerDetails = [
    company.indirizzo,
    company.partitaIva ? `P. IVA ${company.partitaIva}` : '',
    company.codiceFiscale ? `C.F. ${company.codiceFiscale}` : '',
    company.email,
    company.pec ? `PEC ${company.pec}` : '',
    company.codiceDestinatario ? `Codice destinatario ${company.codiceDestinatario}` : '',
    company.telefono,
  ].filter(Boolean)
  issuerDetails.forEach((line, index) => document.text(line, left, 29 + index * 5))

  document.setFont('helvetica', 'bold')
  document.setFontSize(10)
  document.setTextColor(87, 83, 78)
  document.text('FATTURA', right, 22, { align: 'right' })
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
  document.text('CLIENTE', left, buyerTop)
  document.setFontSize(10)
  document.setTextColor(41, 37, 36)
  document.text(invoice.cliente.ragioneSociale, left, buyerTop + 7)
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  const buyerDetails = [
    invoice.cliente.indirizzo,
    [invoice.cliente.cap, invoice.cliente.comune, invoice.cliente.nazione].filter(Boolean).join(' '),
    invoice.cliente.partitaIva && `P. IVA ${invoice.cliente.partitaIva}`,
    invoice.cliente.codiceFiscale && `C.F. ${invoice.cliente.codiceFiscale}`,
    invoice.cliente.email,
  ].filter(Boolean) as string[]
  buyerDetails.forEach((line, index) => document.text(line, left, buyerTop + 13 + index * 5))

  const tableTop = buyerTop + Math.max(20, 13 + buyerDetails.length * 5)
  autoTable(document, {
    startY: tableTop,
    head: [['Descrizione', 'Quantità', 'Prezzo unitario', 'Importo']],
    body: invoice.linee.map((line) => [
      line.descrizione,
      line.quantita.toLocaleString('it-IT'),
      euro.format(line.prezzoUnitario),
      euro.format(line.quantita * line.prezzoUnitario),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60], fontStyle: 'bold' },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [214, 211, 209], textColor: [41, 37, 36] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 38 }, 3: { halign: 'right', cellWidth: 34 } },
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
    ['Imponibile', euro.format(invoice.totali.imponibile)],
    ...(invoice.totali.cassa > 0 ? [[`Cassa previdenziale ${invoice.aliquotaCassa}%`, euro.format(invoice.totali.cassa)]] : []),
    [`IVA ${invoice.aliquotaIva}% su ${euro.format(invoice.totali.baseIva)}`, euro.format(invoice.totali.iva)],
    ...(invoice.totali.ritenuta > 0 ? [[`Ritenuta ${invoice.aliquotaRitenuta}%`, `- ${euro.format(invoice.totali.ritenuta)}`]] : []),
    ...((invoice.totali.bollo || 0) > 0 ? [['Marca da bollo', euro.format(invoice.totali.bollo)]] : []),
    ['Totale da pagare', euro.format(invoice.totali.totale)],
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
