import { jsPDF } from 'jspdf'
import type { AttendanceInput, PayslipResult, WorkerProfile } from '../../domain/payroll'
import { formatItalianNumber } from '../../domain/payroll'
import type { CompanyProfile } from '../../stores/profileStore'

const pageWidth = 210
const margin = 14
const contentWidth = pageWidth - margin * 2
const ink: [number, number, number] = [35, 44, 46]
const muted: [number, number, number] = [91, 99, 101]
const petrol: [number, number, number] = [19, 75, 76]
const pale: [number, number, number] = [235, 241, 240]

const money = (value: number) => formatItalianNumber(value, 2)
const fiveDecimals = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 5, maximumFractionDigits: 5 })
const quantity = (value: number) => fiveDecimals.format(value)
const optionalQuantity = (value?: number) => value === undefined ? '—' : quantity(value)
const rate = (value: number) => `${fiveDecimals.format(value)}%`
const dateText = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT') : '—'
const text = (value?: string | number | null) => value === undefined || value === null || value === '' ? '—' : String(value)

function drawCell(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  options: { bold?: boolean; valueSize?: number; align?: 'left' | 'right' } = {},
) {
  pdf.setDrawColor(127, 139, 140)
  pdf.setLineWidth(0.25)
  pdf.rect(x, y, width, height)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(...muted)
  pdf.text(label.toUpperCase(), x + 1.2, y + 2.8)
  pdf.setFont('helvetica', options.bold ? 'bold' : 'normal')
  pdf.setFontSize(options.valueSize ?? 7.5)
  pdf.setTextColor(...ink)
  const maxWidth = width - 2.4
  const fitted = pdf.splitTextToSize(value, maxWidth)[0] || '—'
  pdf.text(fitted, options.align === 'right' ? x + width - 1.2 : x + 1.2, y + height - 1.5, {
    align: options.align ?? 'left',
  })
}

function drawBand(pdf: jsPDF, label: string, y: number, height = 5) {
  pdf.setFillColor(...petrol)
  pdf.rect(margin, y, contentWidth, height, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(255, 255, 255)
  pdf.text(label.toLocaleUpperCase('it-IT'), margin + 2, y + height - 1.5)
}

function drawSectionHeader(pdf: jsPDF, label: string, x: number, y: number, width: number, height = 5) {
  pdf.setFillColor(...petrol)
  pdf.rect(x, y, width, height, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(255, 255, 255)
  pdf.text(label.toLocaleUpperCase('it-IT'), x + 1.5, y + height - 1.5)
}

function drawTableRow(
  pdf: jsPDF,
  y: number,
  height: number,
  columns: number[],
  values: string[],
  options: { bold?: boolean; fill?: boolean; color?: [number, number, number] } = {},
) {
  if (options.fill) {
    pdf.setFillColor(...pale)
    pdf.rect(margin, y, contentWidth, height, 'F')
  }
  pdf.setDrawColor(151, 160, 160)
  pdf.setLineWidth(0.2)
  pdf.rect(margin, y, contentWidth, height)
  columns.slice(1).forEach((offset) => pdf.line(margin + offset, y, margin + offset, y + height))
  pdf.setFont('helvetica', options.bold ? 'bold' : 'normal')
  pdf.setFontSize(6.7)
  pdf.setTextColor(...(options.color ?? ink))
  const aligns: Array<'left' | 'right'> = ['left', 'right', 'right', 'right', 'right']
  values.forEach((value, index) => {
    const x = margin + columns[index]
    const width = (columns[index + 1] ?? contentWidth) - columns[index]
    const align = aligns[index] ?? 'left'
    const fitted = pdf.splitTextToSize(value, width - 2)[0] || ''
    pdf.text(fitted, align === 'right' ? x + width - 1 : x + 1, y + height - 1.3, { align })
  })
}

function monthName(month: number) {
  const name = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date(2026, month - 1, 1))
  return `${name.charAt(0).toLocaleUpperCase('it-IT')}${name.slice(1)}`
}

function drawAddressCover(pdf: jsPDF, worker: WorkerProfile, company: CompanyProfile) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...ink)
  pdf.text(company.ragioneSociale || 'Datore di lavoro', margin, 24)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text([company.indirizzo, [company.cap, company.comune, company.provincia].filter(Boolean).join(' ')].filter(Boolean), margin, 30)

  pdf.setDrawColor(...petrol)
  pdf.setLineWidth(0.5)
  pdf.rect(105, 105, 85, 38)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...ink)
  pdf.text(`${worker.cognome} ${worker.nome}`, 110, 117)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text(worker.indirizzo || 'Indirizzo non indicato', 110, 124)
  pdf.text([worker.cap, worker.comune, worker.provincia].filter(Boolean).join(' ') || 'CAP e comune non indicati', 110, 130)
  pdf.setFontSize(6)
  pdf.setTextColor(...muted)
  pdf.text('FRONTESPIZIO PER BUSTA FINESTRATA', margin, 280)
}

function drawBody(
  pdf: jsPDF,
  payslip: PayslipResult,
  worker: WorkerProfile,
  company: CompanyProfile,
  attendance: AttendanceInput,
  pageNumber: number,
) {
  const subordinate = payslip.workerType === 'subordinate'
  const label = subordinate ? 'CEDOLINO PAGA' : 'PROSPETTO COMPENSO'
  const companyFields = [
    ['Codice Azienda', company.codiceAzienda],
    ['Ragione Sociale', company.ragioneSociale],
    ['Indirizzo', company.indirizzo],
    ['Codice Fiscale', company.codiceFiscale],
    ['Posizione INPS', company.posizioneInps],
    ['PAT INAIL', company.patInail],
    ['Filiale/Dipendenza', company.filiale],
    ['Unità locale sede', company.unitaLocale],
    ['Centro di costo', company.centroDiCosto],
  ] as const

  drawBand(pdf, label, 8, 5)
  const companyY = 13
  const companyRowHeight = 5.2
  const leftWidth = 124
  const cellWidth = leftWidth / 3
  companyFields.forEach(([fieldLabel, value], index) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    drawCell(pdf, margin + column * cellWidth, companyY + row * companyRowHeight, cellWidth, companyRowHeight, fieldLabel, text(value))
  })
  const periodX = margin + leftWidth
  const periodWidth = contentWidth - leftWidth
  pdf.setFillColor(...pale)
  pdf.rect(periodX, companyY, periodWidth, companyRowHeight * 3, 'F')
  pdf.setDrawColor(...petrol)
  pdf.setLineWidth(0.5)
  pdf.rect(periodX, companyY, periodWidth, companyRowHeight * 3)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(...petrol)
  pdf.text('PERIODO DI RETRIBUZIONE', periodX + 3, companyY + 5)
  pdf.setTextColor(...ink)
  pdf.setFontSize(12)
  pdf.text(`${monthName(payslip.month)} ${payslip.year}`, periodX + 3, companyY + 12)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text(`Elaborato: ${new Date().toLocaleString('it-IT')}`, periodX + 3, companyY + 18)
  pdf.text(`Pagina ${pageNumber}`, periodX + 3, companyY + 23)

  drawBand(pdf, 'Anagrafica, presenze ed elementi della retribuzione', 30, 5)
  const y = 35
  const widths = [30, 67, 45, 30, 26]
  const employeeCells = [
    ['Codice dipendente', text(worker.codiceDipendente)],
    ['COGNOME E NOME', `${worker.cognome} ${worker.nome}`],
    ['Codice Fiscale', worker.codiceFiscale],
    ['Matricola', text(worker.matricola)],
    ['Tipologia', subordinate ? 'Dipendente' : worker.workerType === 'sports' ? 'Coll. sportivo' : 'Occasionale'],
  ]
  let x = margin
  employeeCells.forEach(([fieldLabel, value], index) => {
    drawCell(pdf, x, y, widths[index], 8, fieldLabel, value, { bold: index === 1, valueSize: index === 1 ? 8.5 : 7.3 })
    x += widths[index]
  })
  const contractFields: Array<[string, string]> = [
    ['Data di Nascita', dateText(worker.dataNascita)],
    ['Data Assunzione', dateText(worker.dataAssunzione)],
    ['Data Cessazione', dateText(worker.dataFineRapporto)],
    ['Qualifica', text(worker.qualifica)],
    ['Livello', text(worker.livello)],
    ['Tipo contratto', text(worker.contractType ?? (worker.workerType === 'occasional' ? 'Prest. occasionale' : worker.workerType === 'sports' ? 'Coll. sportivo' : 'T.Indeterminato'))],
    ['PROSSIMO SCATTO', dateText(worker.prossimoScatto)],
  ]
  const contractWidths = [25, 25, 25, 30, 20, 38, 35]
  x = margin
  contractFields.forEach(([fieldLabel, value], index) => {
    drawCell(pdf, x, y + 8, contractWidths[index], 7, fieldLabel, value, { valueSize: 6.7 })
    x += contractWidths[index]
  })

  const attendanceY = y + 15
  const presenceWidths = [45, 41, 46, 50]
  const presenceGroups = [
    ['INPS', `Sett. —  Giorni —  Ore ${optionalQuantity(attendance.oreOrdinarie)}`],
    ['MINIMALE', '—'],
    ['LAVORATO', `Gg —  Ore ${optionalQuantity(attendance.oreOrdinarie)}  Straord. ${optionalQuantity(attendance.oreStraordinario)}`],
    ['IRPEF', 'Giorni detrazione —'],
  ]
  x = margin
  presenceGroups.forEach(([fieldLabel, value], index) => {
    drawCell(pdf, x, attendanceY, presenceWidths[index], 7, fieldLabel, value, { valueSize: 6.4 })
    x += presenceWidths[index]
  })
  drawSectionHeader(pdf, 'Elementi della retribuzione', margin, attendanceY + 7, contentWidth)
  const elementNames = ['Retr. Naz. / Paga Base', 'Contingenza', 'Scatti', 'Superminimo', 'Altri elementi', 'TOTALE']
  const elementValues = [
    worker.pagaBaseOraria && worker.pagaBaseOraria > 0
      ? `${fiveDecimals.format(worker.pagaBaseOraria)} €/h`
      : money(payslip.details.pagaBase),
    money(payslip.details.contingenza),
    money(payslip.details.scattiAnzianita),
    money(payslip.details.superminimo),
    '—',
    money(payslip.retribuzioneFissa || payslip.competenze),
  ]
  const elementWidth = contentWidth / elementNames.length
  elementNames.forEach((fieldLabel, index) => drawCell(
    pdf,
    margin + index * elementWidth,
    attendanceY + 12,
    elementWidth,
    8,
    fieldLabel,
    elementValues[index],
    { bold: index === elementNames.length - 1, align: 'right', valueSize: 7 },
  ))

  const tableY = 73
  const columns = [0, 79, 107, 136, 159, contentWidth]
  drawTableRow(pdf, tableY, 6, columns, ['VOCI VARIABILI DEL MESE', 'IMPORTO BASE', 'RIFERIMENTO', 'TRATTENUTE', 'COMPETENZE'], { bold: true, fill: true, color: [255, 255, 255] })
  pdf.setFillColor(...petrol)
  pdf.rect(margin, tableY, contentWidth, 6, 'F')
  pdf.setDrawColor(151, 160, 160)
  pdf.setLineWidth(0.2)
  columns.slice(1, -1).forEach((offset) => pdf.line(margin + offset, tableY, margin + offset, tableY + 6))
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.3)
  pdf.setTextColor(255, 255, 255)
  ;['VOCI VARIABILI DEL MESE', 'IMPORTO BASE', 'RIFERIMENTO', 'TRATTENUTE', 'COMPETENZE'].forEach((item, index) => {
    const width = columns[index + 1] - columns[index]
    pdf.text(item, margin + columns[index] + 1, tableY + 4, { maxWidth: width - 2 })
  })

  const contributionRate = worker.aliquotaInpsDipendente ?? (worker.contractType?.toLowerCase().includes('apprend') ? 5.84 : 9.19)
  const hourlyRate = worker.pagaBaseOraria
    ?? ((worker.pagaBaseMensile ?? ((worker.ral ?? 0) / 12)) / ((worker.oreSettimanaliContrattuali ?? 40) * 52 / 12))
  const rows: Array<{ block?: boolean; values: string[]; bold?: boolean }> = subordinate ? [
    { values: ['Z00001  Retribuzione ordinaria', money(payslip.competenze - payslip.details.straordinario - payslip.details.festivita - payslip.details.ferie - payslip.details.rol - payslip.details.malattia), `${optionalQuantity(attendance.oreOrdinarie)} ORE × ${fiveDecimals.format(hourlyRate)} €/h`, '', money(payslip.competenze - payslip.details.straordinario - payslip.details.festivita - payslip.details.ferie - payslip.details.rol - payslip.details.malattia)] },
    { values: ['001119  Maggiorazioni / straordinari', money(payslip.details.straordinario), `${optionalQuantity(attendance.oreStraordinario)} ORE · ${rate(worker.maggiorazioneStraordinariPercent ?? 25)}`, '', money(payslip.details.straordinario)] },
    { values: ['Z50000  13ª mensilità', '—', '—', '', ''] },
    { values: ['Z51009  Ferie non godute', money(payslip.details.ferie), `${optionalQuantity(attendance.oreFerie)} ORE`, '', money(payslip.details.ferie)] },
    { values: ['Z51010  Permessi ROL non goduti', money(payslip.details.rol), `${optionalQuantity(attendance.oreRol)} ORE`, '', money(payslip.details.rol)] },
    { values: ['001545  E.D.R. / premi', money(payslip.details.festivita + payslip.details.malattia), 'Festività / malattia', '', money(payslip.details.festivita + payslip.details.malattia)] },
    { block: true, values: ['', '', '', '', ''] },
    { values: ['Z00055  Fondi bilaterali / FIS', '—', '—', '', ''] },
    { values: ['Z00875  Contributi IVS / INPS lavoratore', money(payslip.imponibileInps), rate(contributionRate), money(payslip.inpsDipendente), ''] },
    { block: true, values: ['', '', '', '', ''] },
    { values: ['F02000  Imponibile IRPEF', money(payslip.imponibileIrpef), 'Imponibile fiscale', '', ''] },
    { values: ['F02010  IRPEF lorda', money(payslip.irpefLordo), 'Aliquota progressiva', '', ''] },
    { values: ['F02500  Detrazioni lavoro dipendente', '', '', '', money(payslip.detrazioni)] },
    { values: ['F03020  Ritenute IRPEF', '', '', money(payslip.irpefNetta), ''] },
    { values: ['Addizionale regionale / comunale', '', '', money(payslip.addizionaleRegionale + payslip.addizionaleComunale), ''] },
    ...(payslip.pensionFundWorkerContribution > 0 ? [{ values: ['Trattenuta volontaria Fondo Pensione', '', '', money(payslip.pensionFundWorkerContribution), ''] }] : []),
    { block: true, values: ['', '', '', '', ''] },
    { values: ['Retribuzione utile T.F.R.', money(payslip.competenze), 'Base di calcolo', '', ''] },
    { values: ['Quota T.F.R.', '', '', '', money(payslip.tfrQuotaMese)] },
    { values: ['Imp. INAIL', money(payslip.imponibileInps), text(worker.voceTariffaInail), '', ''] },
  ] : [
    { values: ['Compenso lordo', money(payslip.competenze), 'Compenso del periodo', '', money(payslip.competenze)] },
    { values: ['Ritenuta d’acconto / IRPEF', '', rate(worker.ritenutaAccontoPercent ?? 20), money(payslip.ritenutaAcconto + payslip.irpefSports), ''] },
    { values: ['Contributi Gestione Separata', money(payslip.imponibileInps), rate(worker.aliquotaGestioneSeparata ?? worker.aliquotaInpsSportivi ?? 33.72), money(payslip.inpsGestioneSeparataDipendente), ''] },
    { values: ['Marca da bollo', '', '', money(payslip.marcaDaBollo), ''] },
    { values: ['Progressivo soglia annua', money(payslip.annualCumulativeAfter), worker.workerType === 'sports' ? 'Soglie 5.000 / 15.000 €' : 'Soglia 5.000 €', '', ''] },
  ]
  const rowHeight = 4.7
  let rowY = tableY + 6
  rows.forEach((row) => {
    if (row.block) {
      pdf.setDrawColor(151, 160, 160)
      pdf.setLineWidth(0.2)
      pdf.line(margin, rowY + 1.8, margin + contentWidth, rowY + 1.8)
      rowY += 3.2
      return
    }
    drawTableRow(pdf, rowY, rowHeight, columns, row.values, { bold: row.bold })
    rowY += rowHeight
  })

  const totalsY = 174
  const halfWidth = contentWidth / 2
  drawSectionHeader(pdf, 'Progressivi', margin, totalsY, halfWidth, 5)
  drawSectionHeader(pdf, 'T.F.R.', margin + halfWidth, totalsY, halfWidth, 5)
  const progressLabels = ['Imp. INPS', 'Imp. INAIL', 'Imp. IRPEF', 'IRPEF pagata']
  const progressValues = ['—', '—', '—', '—']
  progressLabels.forEach((field, index) => {
    drawCell(pdf, margin + (index % 2) * (halfWidth / 2), totalsY + 5 + Math.floor(index / 2) * 8, halfWidth / 2, 8, field, progressValues[index], { align: 'right', valueSize: 6.7 })
  })
  const tfrLabels = ['F.do 31/12', 'Rivalutaz.', 'Imp. rival.', 'Quota anno', 'TFR a fondi', 'Anticipi']
  const tfrValues = [
    money(worker.tfrProgressivo ?? 0),
    '—',
    '—',
    '—',
    money(payslip.pensionFundTfrContribution),
    '—',
  ]
  const tfrWidth = halfWidth / tfrLabels.length
  tfrLabels.forEach((field, index) => drawCell(pdf, margin + halfWidth + index * tfrWidth, totalsY + 5, tfrWidth, 16, field, tfrValues[index], { align: 'right', valueSize: 6.4 }))

  const lowerY = 200
  const rateWidth = 111
  drawSectionHeader(pdf, 'Ratei', margin, lowerY, rateWidth, 5)
  drawSectionHeader(pdf, 'Totali', margin + rateWidth, lowerY, contentWidth - rateWidth, 5)
  const rateHeadings = ['Voce', 'Residuo AP', 'Maturato', 'Goduto', 'Saldo', 'Unità']
  const rateColumns = [0, 26, 43, 60, 77, 94, rateWidth]
  drawTableRow(pdf, lowerY + 5, 5, rateColumns, rateHeadings, { bold: true, fill: true })
  const ferieSaldo = payslip.progressivi.ferie.ap + payslip.progressivi.ferie.maturati - payslip.progressivi.ferie.goduti
  const rolSaldo = payslip.progressivi.rol.ap + payslip.progressivi.rol.maturati - payslip.progressivi.rol.goduti
  drawTableRow(pdf, lowerY + 10, 5, rateColumns, ['Ferie', quantity(payslip.progressivi.ferie.ap), quantity(payslip.progressivi.ferie.maturati), quantity(payslip.progressivi.ferie.goduti), quantity(ferieSaldo), 'ORE'])
  drawTableRow(pdf, lowerY + 15, 5, rateColumns, ['Permessi (ROL)', quantity(payslip.progressivi.rol.ap), quantity(payslip.progressivi.rol.maturati), quantity(payslip.progressivi.rol.goduti), quantity(rolSaldo), 'ORE'])
  const totalX = margin + rateWidth
  const totalWidth = contentWidth - rateWidth
  drawCell(pdf, totalX, lowerY + 5, totalWidth, 6, 'TOTALE COMPETENZE', money(payslip.competenze), { bold: true, align: 'right' })
  const deductions = payslip.competenze - payslip.netto
  drawCell(pdf, totalX, lowerY + 11, totalWidth, 6, 'TOTALE TRATTENUTE', money(deductions), { bold: true, align: 'right' })
  drawCell(pdf, totalX, lowerY + 17, totalWidth, 5, 'ARROTONDAMENTO', money(payslip.arrotondamento ?? 0), { align: 'right' })
  pdf.setDrawColor(...petrol)
  pdf.setLineWidth(0.8)
  pdf.setFillColor(...pale)
  pdf.rect(totalX, lowerY + 22, totalWidth, 10, 'FD')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(...petrol)
  pdf.text('NETTO DEL MESE', totalX + 2, lowerY + 26)
  pdf.setFontSize(11)
  pdf.setTextColor(...ink)
  pdf.text(money(payslip.netto), totalX + totalWidth - 2, lowerY + 30, { align: 'right' })

  drawSectionHeader(pdf, 'Comunicazioni', margin, 237, rateWidth, 5)
  drawCell(pdf, margin, 242, rateWidth, 25, '', [
    worker.fondoPensioneNome && payslip.pensionFundTfrContribution ? `TFR conferito a ${worker.fondoPensioneNome}.` : '',
    payslip.workerType !== 'subordinate'
      ? `Progressivo annuo: ${money(payslip.annualCumulativeAfter)} · soglia ${worker.workerType === 'sports' ? '5.000 / 15.000' : '5.000'} euro.`
      : '',
  ].filter(Boolean).join(' ') || 'Nessuna comunicazione.', { valueSize: 7 })
  drawSectionHeader(pdf, 'Coordinate bancarie di accredito', margin + rateWidth, 237, contentWidth - rateWidth, 5)
  const bankCoordinates = [
    worker.nomeBanca,
    worker.iban,
    !worker.iban && worker.abi ? `ABI ${worker.abi}` : '',
    !worker.iban && worker.cab ? `CAB ${worker.cab}` : '',
    !worker.iban && worker.contoCorrente ? `C/C ${worker.contoCorrente}` : '',
  ].filter(Boolean).join(' · ')
  drawCell(pdf, margin + rateWidth, 242, contentWidth - rateWidth, 25, 'Nome Banca / IBAN / ABI-CAB-C/C', bankCoordinates || '—', { valueSize: 7 })
  pdf.setDrawColor(151, 160, 160)
  pdf.setLineWidth(0.2)
  pdf.line(margin, 273, margin + contentWidth, 273)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(...muted)
  pdf.text(`${company.ragioneSociale || 'Datore di lavoro'} · C.F. ${company.codiceFiscale || '—'} · Documento riepilogativo dei dati retributivi elaborati.`, margin, 278)
}

export function createPayslipPdf(
  payslip: PayslipResult,
  worker: WorkerProfile,
  company: CompanyProfile,
  attendance: AttendanceInput = {},
) {
  const document = new jsPDF({ format: 'a4', unit: 'mm', compress: true })
  let pageNumber = 1
  if (company.frontespizioIndirizzo) {
    drawAddressCover(document, worker, company)
    document.addPage('a4', 'portrait')
    pageNumber = 2
  }
  drawBody(document, payslip, worker, company, attendance, pageNumber)
  return document
}

export function downloadPayslipPdf(
  payslip: PayslipResult,
  worker: WorkerProfile,
  company: CompanyProfile,
  attendance: AttendanceInput = {},
) {
  const name = `${worker.cognome}_${worker.nome}`.replace(/\s+/g, '_')
  createPayslipPdf(payslip, worker, company, attendance).save(`Cedolino_${payslip.year}-${String(payslip.month).padStart(2, '0')}_${name}.pdf`)
}

export function payslipPdfToBase64(
  payslip: PayslipResult,
  worker: WorkerProfile,
  company: CompanyProfile,
  attendance: AttendanceInput = {},
) {
  const dataUri = createPayslipPdf(payslip, worker, company, attendance).output('datauristring')
  return dataUri.slice(dataUri.indexOf(',') + 1)
}
