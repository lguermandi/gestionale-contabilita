import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { buildPayrollIssuePosting, buildPayrollPaymentPosting, type LedgerMovement } from '../../domain/accounting'
import type { PayslipResult, WorkerProfile } from '../../domain/payroll'
import { formatItalianNumber } from '../../domain/payroll'
import type { CompanyProfile } from '../../stores/profileStore'

const currency = (amount: number) => formatItalianNumber(amount, 2)
const period = (year: number, month: number) => `${String(month).padStart(2, '0')}/${year}`
const roundCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const amountEqual = (left: number, right: number) => roundCents(left) === roundCents(right)

interface JournalRow {
  operation: string
  account: string
  description: string
  debit: number
  credit: number
}

function assertBalanced(operation: string, rows: JournalRow[]) {
  const debit = rows.reduce((total, row) => total + roundCents(row.debit), 0)
  const credit = rows.reduce((total, row) => total + roundCents(row.credit), 0)
  if (debit !== credit) throw new Error(`Scrittura "${operation}" non quadrata: Dare ${currency(debit / 100)}, Avere ${currency(credit / 100)}.`)
}

function addMovements(rows: JournalRow[], operation: string, movements: LedgerMovement[]) {
  movements.forEach((movement) => rows.push({
    operation,
    account: movement.conto,
    description: movement.descrizione,
    debit: movement.dare,
    credit: movement.avere,
  }))
}

function getEmployerCost(payslip: PayslipResult, worker: WorkerProfile) {
  const tfr = worker.tfrDestination === 'pension_fund' ? payslip.pensionFundTfrContribution : payslip.tfrQuotaMese
  return payslip.competenze + payslip.inpsAzienda + payslip.inpsGestioneSeparataAzienda
    + payslip.inailAzienda + tfr + payslip.pensionFundEmployerContribution + (payslip.arrotondamento ?? 0)
}

function getF24Rows(payslips: PayslipResult[]) {
  const totals = new Map<string, number>()
  const add = (code: string, section: 'Erario' | 'INPS', amount: number) => {
    if (amount > 0) totals.set(`${section}|${code}`, (totals.get(`${section}|${code}`) ?? 0) + amount)
  }
  payslips.forEach((payslip) => {
    if (payslip.workerType === 'subordinate') {
      add('1001', 'Erario', payslip.irpefNetta)
      add('3802', 'Erario', payslip.addizionaleRegionale)
      add('3848', 'Erario', payslip.addizionaleComunale)
      add('DM10', 'INPS', payslip.inpsDipendente + payslip.inpsAzienda + payslip.inailAzienda)
    } else {
      if (payslip.workerType === 'occasional') add('1040', 'Erario', payslip.ritenutaAcconto)
      else add('1001', 'Erario', payslip.irpefSports)
      add('CXX', 'INPS', payslip.inpsGestioneSeparata)
    }
  })
  return Array.from(totals, ([key, amount]) => {
    const [section, code] = key.split('|') as ['Erario' | 'INPS', string]
    return { section, code, amount }
  })
}

export function createPayrollAccountingPdf(
  payslips: PayslipResult[],
  workers: WorkerProfile[],
  company: CompanyProfile,
  year: number,
  month: number,
) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]))
  const document = new jsPDF({ format: 'a4', unit: 'mm', compress: true })
  const teal: [number, number, number] = [19, 75, 76]
  const date = period(year, month)
  const subtitle = `${company.ragioneSociale || 'Azienda'} · Periodo ${date}`
  const header = () => {
    document.setFillColor(...teal)
    document.rect(0, 0, 210, 17, 'F')
    document.setFont('helvetica', 'bold')
    document.setFontSize(12)
    document.setTextColor(255, 255, 255)
    document.text('PROSPETTO CONTABILE MENSILE · USO INTERNO', 14, 8)
    document.setFont('helvetica', 'normal')
    document.setFontSize(7)
    document.text(subtitle, 14, 13)
  }
  header()

  document.setFont('helvetica', 'bold')
  document.setFontSize(9)
  document.setTextColor(35, 44, 46)
  document.text('1. COSTO AZIENDA PER COLLABORATORE', 14, 24)
  const costRows = payslips.map((payslip) => {
    const worker = workerById.get(payslip.workerId)
    if (!worker) throw new Error(`Anagrafica non trovata per il cedolino ${payslip.workerId}.`)
    const employerCost = getEmployerCost(payslip, worker)
    const workerType = payslip.workerType === 'subordinate' ? 'Dipendente' : payslip.workerType === 'occasional' ? 'Prest. occasionale' : 'Coll. sportivo'
    return [
      `${worker.cognome} ${worker.nome}`,
      workerType,
      currency(payslip.competenze),
      currency(payslip.inpsAzienda + payslip.inpsGestioneSeparataAzienda),
      currency(payslip.inailAzienda),
      currency(payslip.tfrQuotaMese),
      currency(payslip.pensionFundEmployerContribution),
      currency(employerCost),
    ]
  })
  const totalCost = payslips.reduce((total, payslip) => {
    const worker = workerById.get(payslip.workerId)
    return total + (worker ? getEmployerCost(payslip, worker) : 0)
  }, 0)
  costRows.push(['TOTALE MENSILE', '', currency(payslips.reduce((total, item) => total + item.competenze, 0)), currency(payslips.reduce((total, item) => total + item.inpsAzienda + item.inpsGestioneSeparataAzienda, 0)), currency(payslips.reduce((total, item) => total + item.inailAzienda, 0)), currency(payslips.reduce((total, item) => total + item.tfrQuotaMese, 0)), currency(payslips.reduce((total, item) => total + item.pensionFundEmployerContribution, 0)), currency(totalCost)])
  autoTable(document, {
    startY: 27,
    head: [['Collaboratore', 'Tipologia', 'Lordo', 'INPS c/azienda', 'INAIL', 'Quota TFR', 'Fondo c/azienda', 'Costo Totale Azienda']],
    body: costRows,
    theme: 'grid',
    margin: { left: 14, right: 14, top: 21, bottom: 14 },
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: teal, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 33 },
      1: { cellWidth: 23 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: header,
  })

  let y = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45
  y += 9
  if (y > 260) {
    document.addPage()
    header()
    y = 24
  }
  document.setFont('helvetica', 'bold')
  document.setFontSize(9)
  document.setTextColor(35, 44, 46)
  document.text('2. SCHEMA SCRITTURE IN PARTITA DOPPIA', 14, y)

  const journals: Array<{ name: string; rows: JournalRow[] }> = []
  payslips.forEach((payslip) => {
    const worker = workerById.get(payslip.workerId)
    if (!worker) throw new Error(`Anagrafica non trovata per il cedolino ${payslip.workerId}.`)
    const name = `${worker.cognome} ${worker.nome}`
    const liquidation: JournalRow[] = []
    addMovements(liquidation, 'Liquidazione paghe', buildPayrollIssuePosting(payslip, worker))
    assertBalanced(`Liquidazione paghe - ${name}`, liquidation)
    journals.push({ name: `Liquidazione paghe · ${name}`, rows: liquidation })
    const payment: JournalRow[] = []
    addMovements(payment, 'Pagamento bonifico netto', buildPayrollPaymentPosting(payslip, worker))
    assertBalanced(`Pagamento bonifico - ${name}`, payment)
    journals.push({ name: `Pagamento bonifico netto · ${name}`, rows: payment })
  })

  const f24Rows = getF24Rows(payslips)
  const fundTotal = payslips.reduce((total, payslip) => total
    + payslip.pensionFundTfrContribution
    + payslip.pensionFundWorkerContribution
    + payslip.pensionFundEmployerContribution, 0)
  const f24Total = f24Rows.reduce((total, item) => total + item.amount, 0)
  if (f24Total > 0) {
    const rows: JournalRow[] = [
      ...f24Rows.map((item) => ({
        operation: 'Versamento F24',
        account: item.section === 'INPS' ? 'Debiti v/INPS' : 'Erario c/ritenute',
        description: `${item.code} · ${item.section}`,
        debit: item.amount,
        credit: 0,
      })),
      { operation: 'Versamento F24', account: 'Banca c/c', description: 'Pagamento F24', debit: 0, credit: f24Total },
    ]
    assertBalanced('Versamento F24', rows)
    journals.push({ name: 'Versamento F24', rows })
  }
  if (fundTotal > 0) {
    const rows: JournalRow[] = [
      { operation: 'Versamento Fondo Pensione', account: 'Debiti v/Fondo Pensione', description: 'Contributi e TFR del periodo', debit: fundTotal, credit: 0 },
      { operation: 'Versamento Fondo Pensione', account: 'Banca c/c', description: 'Pagamento fondo pensione', debit: 0, credit: fundTotal },
    ]
    assertBalanced('Versamento Fondo Pensione', rows)
    journals.push({ name: 'Versamento Fondo Pensione', rows })
  }

  const journalBody: string[][] = []
  journals.forEach(({ name, rows }) => {
    journalBody.push([name, '', '', '', ''])
    rows.forEach((row) => journalBody.push([row.operation, row.account, row.description, currency(row.debit), currency(row.credit)]))
    const debit = rows.reduce((total, row) => total + row.debit, 0)
    const credit = rows.reduce((total, row) => total + row.credit, 0)
    if (!amountEqual(debit, credit)) throw new Error(`Totali Dare/Avere non coincidenti nella scrittura "${name}".`)
    journalBody.push(['Verifica Dare = Avere', '', '', currency(debit), currency(credit)])
  })
  autoTable(document, {
    startY: y + 3,
    head: [['Operazione', 'Conto', 'Descrizione', 'Dare', 'Avere']],
    body: journalBody.length ? journalBody : [['Nessuna scrittura disponibile', '', '', '', '']],
    theme: 'grid',
    margin: { left: 14, right: 14, top: 21, bottom: 14 },
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.4 },
    headStyles: { fillColor: teal, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 39 }, 2: { cellWidth: 68 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      const firstCell = Array.isArray(data.row.raw) ? data.row.raw[0] : ''
      if (data.section === 'body' && typeof firstCell === 'string'
        && (firstCell.startsWith('Liquidazione') || firstCell.startsWith('Pagamento') || firstCell.startsWith('Versamento'))) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [235, 241, 240]
      }
    },
    didDrawPage: header,
  })

  y = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
  y += 9
  if (y > 255) {
    document.addPage()
    header()
    y = 24
  }
  document.setFont('helvetica', 'bold')
  document.setFontSize(9)
  document.setTextColor(35, 44, 46)
  document.text('3. DISTINTA F24 · SCADENZA 16 DEL MESE SUCCESSIVO', 14, y)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const deadline = `16/${String(nextMonth).padStart(2, '0')}/${nextYear}`
  autoTable(document, {
    startY: y + 3,
    head: [['Sezione', 'Codice Tributo / Causale', 'Periodo', 'Scadenza', 'Importo da versare']],
    body: [
      ...f24Rows.map((item) => [item.section, item.code, date, deadline, currency(item.amount)]),
      ['Fondo Pensione', 'Bonifico fondo', date, deadline, currency(fundTotal)],
      ['TOTALE DISTINTA', '', '', '', currency(f24Total + fundTotal)],
    ],
    theme: 'grid',
    margin: { left: 14, right: 14, top: 21, bottom: 14 },
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: teal, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    didDrawPage: header,
  })
  return document
}

export function downloadPayrollAccountingPdf(
  payslips: PayslipResult[],
  workers: WorkerProfile[],
  company: CompanyProfile,
  year: number,
  month: number,
) {
  createPayrollAccountingPdf(payslips, workers, company, year, month)
    .save(`Prospetto_Contabile_${year}-${String(month).padStart(2, '0')}.pdf`)
}

export function payrollAccountingPdfToBase64(
  payslips: PayslipResult[],
  workers: WorkerProfile[],
  company: CompanyProfile,
  year: number,
  month: number,
) {
  const dataUri = createPayrollAccountingPdf(payslips, workers, company, year, month).output('datauristring')
  return dataUri.slice(dataUri.indexOf(',') + 1)
}
