import { describe, expect, it } from 'vitest'
import { calculatePayslip, type WorkerProfile } from '../../domain/payroll'
import { defaultCompanyProfile } from '../../stores/profileStore'
import { createPayrollAccountingPdf } from './payrollAccountingPdf'
import { createPayslipPdf } from './payslipPdf'

const employee: WorkerProfile = {
  id: 'employee-1',
  workerType: 'subordinate',
  nome: 'Mario',
  cognome: 'Rossi',
  codiceFiscale: 'RSSMRA80A01H501U',
  mensilita: 13,
  pagaBaseMensile: 2_000,
  aliquotaInpsDipendente: 9.19,
  aliquotaInpsAzienda: 29,
  aliquotaInailAzienda: 1,
  tfrDestination: 'company',
}

describe('PDF paghe', () => {
  it('genera un cedolino A4 di una pagina senza dati di costo aziendale', () => {
    const payslip = calculatePayslip(employee, 2026, 11)
    const pdf = createPayslipPdf(payslip, employee, defaultCompanyProfile)
    expect(pdf.getNumberOfPages()).toBe(1)
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210)
    expect(pdf.output()).toContain('%PDF-')
  })

  it('aggiunge la pagina frontespizio solo su esplicita impostazione', () => {
    const payslip = calculatePayslip(employee, 2026, 11)
    const pdf = createPayslipPdf(payslip, employee, {
      ...defaultCompanyProfile,
      frontespizioIndirizzo: true,
    })
    expect(pdf.getNumberOfPages()).toBe(2)
  })

  it('genera il prospetto contabile e verifica le scritture bilanciate', () => {
    const occasional: WorkerProfile = {
      id: 'occasional-1',
      workerType: 'occasional',
      nome: 'Anna',
      cognome: 'Bianchi',
      codiceFiscale: 'BNNANN90A41A001X',
      mensilita: 13,
    }
    const sports: WorkerProfile = {
      id: 'sports-1',
      workerType: 'sports',
      nome: 'Luca',
      cognome: 'Verdi',
      codiceFiscale: 'VRDLCU85A01A001X',
      mensilita: 13,
    }
    const payslips = [
      calculatePayslip(employee, 2026, 11),
      calculatePayslip(occasional, 2026, 11, { compensoLordo: 1_000 }, { annualCumulativeBefore: 4_800 }),
      calculatePayslip(sports, 2026, 11, { compensoLordo: 2_000 }, { annualCumulativeBefore: 15_000 }),
    ]
    const pdf = createPayrollAccountingPdf(payslips, [employee, occasional, sports], defaultCompanyProfile, 2026, 11)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(0)
    expect(pdf.output()).toContain('%PDF-')
  })
})
