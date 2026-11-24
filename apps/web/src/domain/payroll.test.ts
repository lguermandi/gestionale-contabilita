import { describe, expect, it } from 'vitest'
import { calculateAnnualIrpef, calculatePayslip, type WorkerProfile } from './payroll'
import { buildPayrollIssuePosting, buildPayrollPaymentPosting, validateTransaction } from './accounting'
import { calculatePayrollAnnualThreshold } from './tax'
import { buildPayrollTaxDeadlines } from '../features/tax/taxCalendar'

const subordinate: WorkerProfile = {
  id: 'dip-1',
  workerType: 'subordinate',
  nome: 'Mario',
  cognome: 'Rossi',
  codiceFiscale: 'RSSMRA80A01H501U',
  mensilita: 13,
  pagaBaseMensile: 2_000,
  oreSettimanaliContrattuali: 40,
  aliquotaInpsDipendente: 9.19,
  aliquotaInpsAzienda: 29,
  aliquotaInailAzienda: 1,
  aliquotaAddizionaleRegionale: 1,
  aliquotaAddizionaleComunale: 0.5,
  tfrDestination: 'company',
}

describe('dominio paghe', () => {
  it('calcola un cedolino subordinato, contributi, trattenute e TFR', () => {
    const payslip = calculatePayslip(subordinate, 2026, 11)
    expect(payslip.competenze).toBe(2_000)
    expect(payslip.inpsDipendente).toBe(183.8)
    expect(payslip.inpsAzienda).toBe(580)
    expect(payslip.inailAzienda).toBe(20)
    expect(payslip.tfrQuotaMese).toBe(138.15)
    expect(payslip.progressivi.tfrAccantonato).toBe(138.15)
    expect(payslip.netto).toBeGreaterThan(1_300)
    expect(payslip.costoAzienda).toBeGreaterThan(payslip.competenze)
  })

  it('applica aliquota apprendistato al 5,84%', () => {
    const payslip = calculatePayslip({
      ...subordinate,
      contractType: 'Apprenticeship',
    }, 2026, 11)
    expect(payslip.inpsDipendente).toBe(116.8)
  })

  it('calcola TFR e quote su fondo pensione', () => {
    const payslip = calculatePayslip({
      ...subordinate,
      tfrDestination: 'pension_fund',
      fondoPensioneNome: 'Cometa',
      contributoPensioneDipendentePercent: 1,
      contributoPensioneAziendaPercent: 1.5,
    }, 2026, 11)
    expect(payslip.pensionFundTfrContribution).toBe(138.15)
    expect(payslip.pensionFundWorkerContribution).toBe(20)
    expect(payslip.pensionFundEmployerContribution).toBe(30)
    expect(payslip.progressivi.fondoPensioneAccantonato).toBe(188.15)
  })

  it('calcola IRPEF progressiva configurabile', () => {
    expect(calculateAnnualIrpef(28_000)).toBe(6_440)
    expect(calculateAnnualIrpef(50_000)).toBe(14_140)
    expect(calculateAnnualIrpef(60_000)).toBe(18_440)
  })

  it('applica ritenuta, bollo e gestione separata oltre i 5.000 occasionali', () => {
    const occasional: WorkerProfile = {
      id: 'occ-1',
      workerType: 'occasional',
      nome: 'Anna',
      cognome: 'Bianchi',
      codiceFiscale: 'BNNANN90A41A001X',
      mensilita: 13,
    }
    const payslip = calculatePayslip(occasional, 2026, 11, { compensoLordo: 1_000 }, {
      annualCumulativeBefore: 4_800,
    })
    expect(payslip.ritenutaAcconto).toBe(200)
    expect(payslip.marcaDaBollo).toBe(2)
    expect(payslip.inpsGestioneSeparata).toBe(269.76)
    expect(payslip.inpsGestioneSeparataDipendente).toBe(89.92)
    expect(payslip.inpsGestioneSeparataAzienda).toBe(179.84)
  })

  it('applica le fasce 5.000 e 15.000 ai collaboratori sportivi', () => {
    const sports: WorkerProfile = {
      id: 'sport-1',
      workerType: 'sports',
      nome: 'Luca',
      cognome: 'Verdi',
      codiceFiscale: 'VRDLCU85A01A001X',
      mensilita: 13,
    }
    const secondBand = calculatePayslip(sports, 2026, 11, { compensoLordo: 3_000 }, {
      annualCumulativeBefore: 6_000,
    })
    expect(secondBand.inpsGestioneSeparata).toBeGreaterThan(0)
    expect(secondBand.irpefSports).toBe(0)

    const topBand = calculatePayslip(sports, 2026, 11, { compensoLordo: 2_000 }, {
      annualCumulativeBefore: 15_000,
    })
    expect(topBand.irpefSports).toBe(400)
  })

  it('genera una scrittura partita doppia e un bonifico in pareggio', () => {
    const payslip = calculatePayslip(subordinate, 2026, 11)
    const issue = {
      data: '2026-11-30',
      movimenti: buildPayrollIssuePosting(payslip, subordinate),
    }
    const payment = {
      data: '2026-11-25',
      movimenti: buildPayrollPaymentPosting(payslip, subordinate),
    }
    expect(validateTransaction(issue)).toEqual([])
    expect(validateTransaction(payment)).toEqual([])
  })

  it('genera le scadenze F24 del mese successivo', () => {
    const deadlines = buildPayrollTaxDeadlines(2026, 12, {
      irpef: 100,
      addizionali: 20,
      ritenuta1040: 30,
      inpsDipendenti: 200,
      inpsGestioneSeparata: 50,
      pensionFund: 40,
    })
    expect(deadlines.some((deadline) => deadline.f24.some((field) => field.code === '1001' && field.amount === 100))).toBe(true)
    expect(deadlines.some((deadline) => deadline.f24.some((field) => field.code === '1040' && field.amount === 30))).toBe(true)
    expect(deadlines.some((deadline) => deadline.f24.some((field) => field.code === 'DM10' && field.amount === 200))).toBe(true)
    expect(deadlines.some((deadline) => deadline.title === 'Fondo Pensione')).toBe(true)
  })

  it('calcola in tempo reale la soglia forfettario paghe', () => {
    const payslip = calculatePayslip(subordinate, 2026, 11)
    const threshold = calculatePayrollAnnualThreshold([{ ...payslip, competenze: 12_000 }], 2026)
    expect(threshold.attention).toBe(false)
    const exceeded = calculatePayrollAnnualThreshold([{ ...payslip, competenze: 20_001 }], 2026)
    expect(exceeded.exceeded).toBe(true)
  })
})
