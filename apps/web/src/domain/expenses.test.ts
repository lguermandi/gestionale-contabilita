import { describe, expect, it } from 'vitest'
import { calculateExpenseTotals, validateExpense, type ExpenseDraft } from './expenses'

const expense: ExpenseDraft = {
  id: '00000000-0000-4000-8000-000000000001',
  tipo: 'fattura',
  data: '2026-11-11',
  numeroDocumento: 'FT-10',
  fornitore: {
    id: '00000000-0000-4000-8000-000000000002',
    ragioneSociale: 'Fornitore S.r.l.',
    indirizzo: 'Via Roma 1',
    partitaIva: '12345678901',
    codiceFiscale: '',
    email: '',
  },
  descrizione: 'Materiale ufficio',
  righe: [{ id: 'line-1', conto: 'Acquisti', imponibile: 100, aliquotaIva: 22 }],
  conti: { ivaCredito: 'IVA a credito', fornitori: 'Debiti v/fornitori', gestione: 'Tipica' },
  note: '',
}

describe('gestione spese', () => {
  it('calcola il totale in centesimi', () => {
    expect(calculateExpenseTotals(expense)).toEqual({
      imponibile: 100,
      iva: 22,
      totale: 122,
      ivaPerAliquota: [{ aliquota: 22, imponibile: 100, iva: 22 }],
    })
  })

  it('calcola IVA e imponibili distinti su più conti e aliquote', () => {
    const mixedExpense = {
      ...expense,
      righe: [
        { id: 'line-1', conto: 'Trasporti', imponibile: 50, aliquotaIva: 10 },
        { id: 'line-2', conto: 'Materie prime', imponibile: 100, aliquotaIva: 22 },
      ],
    }

    expect(calculateExpenseTotals(mixedExpense)).toMatchObject({
      imponibile: 150,
      iva: 27,
      totale: 177,
      ivaPerAliquota: [
        { aliquota: 10, imponibile: 50, iva: 5 },
        { aliquota: 22, imponibile: 100, iva: 22 },
      ],
    })
    expect(validateExpense(mixedExpense)).toEqual([])
  })

  it('valida documento, fornitore e formato degli allegati', () => {
    expect(validateExpense(expense)).toEqual([])
    expect(validateExpense({
      ...expense,
      fornitore: { ...expense.fornitore, partitaIva: '', codiceFiscale: '' },
      allegato: { nome: 'ricevuta.exe', mimeType: 'application/octet-stream', base64: 'AA==' },
    })).toContain('Carica un allegato PDF, JPG o PNG.')
  })
})
