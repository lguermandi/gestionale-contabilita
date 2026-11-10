import { describe, expect, it } from 'vitest'
import { buildInvoicePosting, calculateInvoiceTotals, validateInvoice, type InvoiceDraft, type IssuedInvoice } from './invoicing'
import { createInvoicePdf } from '../features/invoicing/invoicePdf'

const invoiceDraft: InvoiceDraft = {
  id: '00000000-0000-4000-8000-000000000001',
  data: '2026-11-10',
  cliente: { ragioneSociale: 'Cliente S.r.l.', indirizzo: 'Via Roma 1, Milano', partitaIva: '12345678901', email: 'amministrazione@example.it' },
  linee: [{ id: 'line-1', descrizione: 'Consulenza', quantita: 2, prezzoUnitario: 100 }],
  aliquotaIva: 22,
  aliquotaCassa: 4,
  aliquotaRitenuta: 20,
  note: '',
  conti: { clienti: 'Crediti v/clienti', ricavi: 'Ricavi da servizi', iva: 'IVA a debito', ritenute: 'Erario c/ritenute', cassa: 'Contributi previdenziali', gestione: 'Tipica' },
}

describe('motore fatturazione', () => {
  it('calcola imponibile, cassa, IVA, ritenuta e netto da incassare', () => {
    expect(calculateInvoiceTotals(invoiceDraft)).toEqual({
      imponibile: 200,
      cassa: 8,
      baseIva: 208,
      iva: 45.76,
      ritenuta: 40,
      totale: 213.76,
    })
    expect(validateInvoice(invoiceDraft)).toEqual([])
  })

  it('genera una scrittura in partita doppia quadrata', () => {
    const invoice: IssuedInvoice = { ...invoiceDraft, numero: '2026/0001', stato: 'emessa', totali: calculateInvoiceTotals(invoiceDraft) }
    const entries = buildInvoicePosting(invoice)
    const debit = entries.reduce((sum, entry) => sum + Math.round(entry.dare * 100), 0)
    const credit = entries.reduce((sum, entry) => sum + Math.round(entry.avere * 100), 0)

    expect(debit).toBe(credit)
    expect(debit).toBe(25376)
  })

  it('genera un PDF leggibile con intestazione e righe fattura', () => {
    const invoice: IssuedInvoice = { ...invoiceDraft, numero: '2026/0001', stato: 'emessa', totali: calculateInvoiceTotals(invoiceDraft) }
    const company = {
      ragioneSociale: 'Studio Demo S.r.l.',
      indirizzo: 'Via Roma 1, Milano',
      partitaIva: '12345678901',
      codiceFiscale: '',
      email: '',
      pec: '',
      codiceDestinatario: '',
      telefono: '',
      conti: invoiceDraft.conti,
    }
    const pdf = createInvoicePdf(invoice, company).output('arraybuffer')
    const signature = new TextDecoder().decode(pdf.slice(0, 5))

    expect(signature).toBe('%PDF-')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })
})