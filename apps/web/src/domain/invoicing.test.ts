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
  conti: { clienti: 'Crediti v/clienti', ricavi: 'Ricavi da servizi', iva: 'IVA a debito', ritenute: 'Erario c/ritenute', cassa: 'Contributi previdenziali', gestione: 'Tipica', bollo: 'Debiti per imposta di bollo', incassi: 'Banca c/c' },
}

describe('motore fatturazione', () => {
  it('calcola imponibile, cassa, IVA, ritenuta e netto da incassare', () => {
    expect(calculateInvoiceTotals(invoiceDraft)).toEqual({
      imponibile: 200,
      cassa: 8,
      baseIva: 208,
      iva: 45.76,
      ritenuta: 40,
      bollo: 0,
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

  it('aggiunge il bollo al totale senza applicargli l’IVA e registra gli incassi sul conto selezionato', () => {
    const invoice: IssuedInvoice = {
      ...invoiceDraft,
      marcaDaBollo: { addebitata: true, importo: 2, identificativo: 'ID-123' },
      pagamento: { metodo: 'Bonifico', scadenza: '2026-12-10', incassata: true },
      numero: '2026/0001',
      stato: 'emessa',
      totali: calculateInvoiceTotals({
        ...invoiceDraft,
        marcaDaBollo: { addebitata: true, importo: 2, identificativo: 'ID-123' },
      }),
    }
    const entries = buildInvoicePosting(invoice)
    const debit = entries.reduce((sum, entry) => sum + Math.round(entry.dare * 100), 0)
    const credit = entries.reduce((sum, entry) => sum + Math.round(entry.avere * 100), 0)

    expect(invoice.totali).toMatchObject({ iva: 45.76, bollo: 2, totale: 215.76 })
    expect(entries[0]).toMatchObject({ conto: 'Banca c/c', dare: 215.76 })
    expect(entries.at(-1)).toMatchObject({ conto: 'Debiti per imposta di bollo', avere: 2 })
    expect(debit).toBe(credit)
  })

  it('rifiuta scadenze non valide e dati contabili mancanti per bollo e incassi', () => {
    const invalid = {
      ...invoiceDraft,
      pagamento: { metodo: 'Bonifico', scadenza: '2026-02-31', incassata: true },
      marcaDaBollo: { addebitata: true, importo: 2, identificativo: '' },
      conti: { ...invoiceDraft.conti, incassi: '', bollo: '' },
    }
    expect(validateInvoice(invalid)).toContain('Inserisci una data di scadenza valida.')
    expect(validateInvoice(invalid)).toContain('Configura il conto per gli incassi già ricevuti nelle Impostazioni.')
    expect(validateInvoice(invalid)).toContain('Configura il conto per la marca da bollo nelle Impostazioni.')
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