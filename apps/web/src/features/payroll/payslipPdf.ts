import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PayslipResult, WorkerProfile } from '../../domain/payroll'
import { formatItalianNumber } from '../../domain/payroll'
import type { CompanyProfile } from '../../stores/profileStore'

const left = 14
const right = 196

function number(value: number) {
  return formatItalianNumber(value, 2)
}

export function createPayslipPdf(payslip: PayslipResult, worker: WorkerProfile, company: CompanyProfile) {
  const document = new jsPDF({ format: 'a4', unit: 'mm' })
  const isSubordinate = payslip.workerType === 'subordinate'
  document.setFillColor(6, 95, 70)
  document.rect(0, 0, 210, 18, 'F')
  document.setTextColor(255, 255, 255)
  document.setFont('helvetica', 'bold')
  document.setFontSize(15)
  document.text(isSubordinate ? 'CEDOLINO PAGHE' : 'PROSPETTO COMPENSO', left, 12)

  document.setTextColor(41, 37, 36)
  document.setFontSize(9)
  document.setFont('helvetica', 'bold')
  document.text(company.ragioneSociale || 'Dati azienda', left, 27)
  document.setFont('helvetica', 'normal')
  const companyDetails = [
    company.indirizzo,
    company.partitaIva ? `P. IVA ${company.partitaIva}` : '',
    company.codiceFiscale ? `C.F. ${company.codiceFiscale}` : '',
  ].filter(Boolean)
  companyDetails.forEach((line, index) => document.text(line, left, 33 + index * 4))

  document.setFont('helvetica', 'bold')
  document.text(`${worker.cognome} ${worker.nome}`, 112, 27)
  document.setFont('helvetica', 'normal')
  const workerDetails = [
    `C.F. ${worker.codiceFiscale}`,
    worker.qualifica ? `Qualifica: ${worker.qualifica}` : '',
    worker.livello ? `Livello: ${worker.livello}` : '',
    worker.ccnl ? `CCNL: ${worker.ccnl}` : '',
    worker.iban ? `IBAN: ${worker.iban}` : '',
  ].filter(Boolean)
  workerDetails.forEach((line, index) => document.text(line, 112, 33 + index * 4))

  document.setFont('helvetica', 'bold')
  document.setFontSize(10)
  document.text(`Periodo ${String(payslip.month).padStart(2, '0')}/${payslip.year}`, right, 27, { align: 'right' })

  if (isSubordinate) {
    autoTable(document, {
      startY: 55,
      head: [['Elemento fisso', 'Importo']],
      body: [
        ['Paga base', number(payslip.details.pagaBase)],
        ['Contingenza', number(payslip.details.contingenza)],
        ['Scatti', number(payslip.details.scattiAnzianita)],
        ['Superminimo', number(payslip.details.superminimo)],
        ['Totale retribuzione fissa', number(payslip.retribuzioneFissa)],
      ],
      theme: 'grid',
      margin: { left, right: 112 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60] },
      columnStyles: { 1: { halign: 'right' } },
    })

    autoTable(document, {
      startY: 55,
      head: [['Codice', 'Descrizione', 'Ore', 'Competenze', 'Trattenute']],
      body: [
        ['001', 'Retribuzione ordinaria', '', number(payslip.details.pagaBase || payslip.retribuzioneFissa), ''],
        ['002', 'Straordinari', '', number(payslip.details.straordinario), ''],
        ['003', 'Festività', '', number(payslip.details.festivita), ''],
        ['004', 'Ferie', '', number(payslip.details.ferie), ''],
        ['005', 'ROL / Permessi', '', number(payslip.details.rol), ''],
        ['006', 'INPS dipendente', '', '', number(payslip.inpsDipendente)],
        ['007', 'IRPEF netta', '', '', number(payslip.irpefNetta)],
        ['008', 'Addizionale regionale', '', '', number(payslip.addizionaleRegionale)],
        ['009', 'Addizionale comunale', '', '', number(payslip.addizionaleComunale)],
      ],
      theme: 'grid',
      margin: { left: 112, right: 14 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  } else {
    autoTable(document, {
      startY: 55,
      head: [['Voce', 'Importo']],
      body: [
        ['Compenso lordo', number(payslip.competenze)],
        ['Ritenuta / IRPEF', number(payslip.ritenutaAcconto)],
        ['Marca da bollo', number(payslip.marcaDaBollo)],
        ...(payslip.inpsGestioneSeparataDipendente
          ? [['Quota INPS collaboratore', number(payslip.inpsGestioneSeparataDipendente)]]
          : []),
        ['Totale INPS Gestione Separata', number(payslip.inpsGestioneSeparata)],
        ['NETTO', number(payslip.netto)],
      ],
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60] },
      columnStyles: { 1: { halign: 'right' } },
    })
  }

  let y = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 105) + 10
  if (isSubordinate) {
    autoTable(document, {
      startY: y,
      head: [['Progressivi', 'AP', 'Maturati', 'Goduti', 'Residuo']],
      body: [
        ['Ferie', number(payslip.progressivi.ferie.ap), number(payslip.progressivi.ferie.maturati), number(payslip.progressivi.ferie.goduti), number(payslip.progressivi.ferie.ap + payslip.progressivi.ferie.maturati - payslip.progressivi.ferie.goduti)],
        ['ROL / Permessi', number(payslip.progressivi.rol.ap), number(payslip.progressivi.rol.maturati), number(payslip.progressivi.rol.goduti), number(payslip.progressivi.rol.ap + payslip.progressivi.rol.maturati - payslip.progressivi.rol.goduti)],
      ],
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
    y = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8
  }

  autoTable(document, {
    startY: y,
    head: [['Riepilogo fiscale', 'Importo']],
    body: isSubordinate ? [
      ['Imponibile INPS', number(payslip.imponibileInps)],
      ['Contributi INPS', number(payslip.inpsDipendente)],
      ['Imponibile IRPEF', number(payslip.imponibileIrpef)],
      ['IRPEF lorda', number(payslip.irpefLordo)],
      ['Detrazioni', number(payslip.detrazioni)],
      ['IRPEF netta', number(payslip.irpefNetta)],
      ['Addizionali', number(payslip.addizionaleRegionale + payslip.addizionaleComunale)],
      ['TFR accantonato', number(payslip.progressivi.tfrAccantonato)],
      ['TFR quota mese', number(payslip.tfrQuotaMese)],
      ['NETTO IN BUSTA', number(payslip.netto)],
    ] : [
      ['Cumulativo annuo', number(payslip.annualCumulativeAfter)],
      ['INPS Gestione Separata', number(payslip.inpsGestioneSeparata)],
      ['Ritenuta / IRPEF', number(payslip.ritenutaAcconto + payslip.irpefSports)],
      ['Marca da bollo', number(payslip.marcaDaBollo)],
      ['NETTO', number(payslip.netto)],
    ],
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })

  const footerY = Math.min(278, ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 12)
  document.setFont('helvetica', 'italic')
  document.setFontSize(7)
  document.setTextColor(87, 83, 78)
  const footer = isSubordinate
    ? 'Prospetto gestionale interno – non sostituisce il LUL vidimato ai sensi di legge'
    : 'Ricevuta gestionale ai fini del compenso – verifica fiscale e ritenute secondo la normativa vigente'
  document.text(document.splitTextToSize(footer, 182), left, footerY)
  return document
}

export function downloadPayslipPdf(payslip: PayslipResult, worker: WorkerProfile, company: CompanyProfile) {
  const name = `${worker.cognome}_${worker.nome}`.replace(/\s+/g, '_')
  createPayslipPdf(payslip, worker, company).save(`Cedolino_${payslip.year}-${String(payslip.month).padStart(2, '0')}_${name}.pdf`)
}

export function payslipPdfToBase64(payslip: PayslipResult, worker: WorkerProfile, company: CompanyProfile) {
  const dataUri = createPayslipPdf(payslip, worker, company).output('datauristring')
  return dataUri.slice(dataUri.indexOf(',') + 1)
}
