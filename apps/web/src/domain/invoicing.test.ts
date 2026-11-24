import { describe, expect, it } from 'vitest'
import {
  buildInvoicePosting,
  calculateInvoiceTotals,
  getInvoicePaymentStatus,
  getInvoiceRemainingAmount,
  normalizeIssuedInvoice,
  validateInvoice,
  type InvoiceDraft,
  type IssuedInvoice,
} from './invoicing'
import { createInvoicePdf } from '../features/invoicing/invoicePdf'
import { buildFatturaPaXml, validateFatturaPaXml } from '../features/invoicing/fatturaPaXml'

const invoiceDraft: InvoiceDraft = {
  id: '00000000-0000-4000-8000-000000000001',
  data: '2026-11-10',
  documentType: 'TD01',
  revenueAccount: 'Ricavi da servizi',
  atecoCode: '62.01.00',
  regimeFiscale: 'RF01',
  bolloRiaddebitatoAlCliente: false,
  payments: [],
  cliente: { ragioneSociale: 'Cliente S.r.l.', indirizzo: 'Via Roma 1, Milano', partitaIva: '12345678901', email: 'amministrazione@example.it' },
  linee: [{ id: 'line-1', descrizione: 'Consulenza', quantita: 2, prezzoUnitario: 100 }],
  aliquotaIva: 22,
  aliquotaCassa: 4,
  contributionType: 'gestione_separata',
  contributionCode: 'TC22',
  aliquotaRitenuta: 20,
  note: '',
  conti: { clienti: 'Crediti v/clienti', ricavi: 'Ricavi da servizi', iva: 'IVA a debito', ritenute: 'Erario c/ritenute', cassa: 'Contributi previdenziali', gestione: 'Tipica', bollo: 'Debiti per imposta di bollo', incassi: 'Banca c/c' },
}

describe('motore fatturazione', () => {
  it('applica valori predefiniti ai campi mancanti delle fatture GAS legacy', () => {
    const storedInvoice = {
      ...invoiceDraft,
      documentType: undefined,
      tipoDocumento: 'TD17' as const,
      payments: undefined,
      bolloRiaddebitatoAlCliente: undefined,
      marcaDaBollo: { addebitata: true, importo: 2, identificativo: '' },
      numero: '2026/0001',
      stato: 'emessa' as const,
      totali: calculateInvoiceTotals(invoiceDraft),
    }

    expect(normalizeIssuedInvoice(storedInvoice)).toMatchObject({
      documentType: 'TD17',
      payments: [],
      linkedIssueTransactionId: invoiceDraft.id,
      bolloRiaddebitatoAlCliente: true,
    })
    expect(normalizeIssuedInvoice({ ...storedInvoice, tipoDocumento: undefined })).toMatchObject({
      documentType: 'TD01',
      payments: [],
      bolloRiaddebitatoAlCliente: true,
    })
  })

  it('calcola imponibile, cassa, IVA, ritenuta e netto da incassare', () => {
    expect(calculateInvoiceTotals(invoiceDraft)).toEqual({
      imponibile: 200,
      cassa: 8,
      baseIva: 208,
      iva: 45.76,
      ivaPerAliquota: [{ aliquota: 22, baseIva: 208, iva: 45.76 }],
      ritenuta: 40,
      bollo: 0,
      bolloRiaddebitato: false,
      totale: 213.76,
    })
    expect(validateInvoice(invoiceDraft)).toEqual([])
  })

  it('calcola e riepiloga l’IVA separatamente per aliquota', () => {
    const mixedRates: InvoiceDraft = {
      ...invoiceDraft,
      aliquotaCassa: 0,
      aliquotaRitenuta: 0,
      linee: [
        { id: 'line-1', descrizione: 'Servizio ordinario', quantita: 1, prezzoUnitario: 100, aliquotaIva: 22 },
        { id: 'line-2', descrizione: 'Servizio agevolato', quantita: 1, prezzoUnitario: 100, aliquotaIva: 10 },
      ],
    }

    expect(calculateInvoiceTotals(mixedRates)).toMatchObject({
      imponibile: 200,
      iva: 32,
      totale: 232,
      ivaPerAliquota: [
        { aliquota: 10, baseIva: 100, iva: 10 },
        { aliquota: 22, baseIva: 100, iva: 22 },
      ],
    })
  })

  it('applica bollo automatico e non applica ritenuta sulle fatture forfettarie', () => {
    const flatInvoice = {
      ...invoiceDraft,
      regimeFiscale: 'RF19',
      ritenutaAttiva: true,
    }

    expect(calculateInvoiceTotals(flatInvoice)).toMatchObject({
      iva: 0,
      ritenuta: 0,
      bollo: 2,
      bolloRiaddebitato: false,
      totale: 208,
    })
  })

  it('genera una scrittura in partita doppia quadrata', () => {
    const invoice: IssuedInvoice = { ...invoiceDraft, numero: '2026/0001', stato: 'emessa', totali: calculateInvoiceTotals(invoiceDraft) }
    const entries = buildInvoicePosting(invoice)
    const debit = entries.reduce((sum, entry) => sum + Math.round(entry.dare * 100), 0)
    const credit = entries.reduce((sum, entry) => sum + Math.round(entry.avere * 100), 0)

    expect(debit).toBe(credit)
    expect(debit).toBe(25376)
  })

  it('riconosce saldi e residui dei pagamenti parziali e legacy', () => {
    const invoice: IssuedInvoice = {
      ...invoiceDraft,
      numero: '2026/0001',
      stato: 'emessa',
      pagamento: { metodo: 'Bonifico', scadenza: '2026-12-10', incassata: false },
      payments: [{ data: '2026-11-20', importo: 100, conto: 'Banca c/c' }],
      totali: { ...calculateInvoiceTotals(invoiceDraft), totale: 213.76 },
    }

    expect(getInvoiceRemainingAmount(invoice)).toBe(113.76)
    expect(getInvoicePaymentStatus(invoice, '2026-12-01')).toBe('Parziale')
    expect(getInvoicePaymentStatus(invoice, '2026-12-11')).toBe('Scaduta')
    expect(getInvoicePaymentStatus({ ...invoice, payments: [{ data: '2026-11-20', importo: 213.76, conto: 'Banca c/c' }] }, '2026-12-11')).toBe('Saldata')
    expect(getInvoicePaymentStatus({ ...invoice, payments: [], pagamento: { ...invoice.pagamento!, incassata: true } })).toBe('Saldata')
  })

  it('aggiunge il bollo al totale senza applicargli l’IVA e registra l’incasso sul conto configurato', () => {
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

  it('usa il conto di ricavo selezionato e contabilizza il bollo non riaddebitato a costo', () => {
    const draft: InvoiceDraft = {
      ...invoiceDraft,
      revenueAccount: 'Consulenze professionali',
      aliquotaIva: 0,
      aliquotaCassa: 0,
      aliquotaRitenuta: 0,
      linee: [{ id: 'line-1', descrizione: 'Servizio esente', quantita: 1, prezzoUnitario: 100, aliquotaIva: 0 }],
    }
    const invoice: IssuedInvoice = {
      ...draft,
      numero: '2026/0002',
      stato: 'emessa',
      totali: calculateInvoiceTotals(draft),
    }
    const entries = buildInvoicePosting(invoice)
    const debit = entries.reduce((sum, entry) => sum + Math.round(entry.dare * 100), 0)
    const credit = entries.reduce((sum, entry) => sum + Math.round(entry.avere * 100), 0)

    expect(invoice.totali).toMatchObject({ bollo: 2, bolloRiaddebitato: false, totale: 100 })
    expect(entries).toContainEqual(expect.objectContaining({ conto: 'Consulenze professionali', avere: 100 }))
    expect(entries).toContainEqual(expect.objectContaining({ conto: 'Imposte e tasse indirette', dare: 2 }))
    expect(debit).toBe(credit)
  })

  it('registra reverse charge neutro in ordinario e indetraibile a costo in forfettario', () => {
    const reverseChargeDraft: InvoiceDraft = {
      ...invoiceDraft,
      documentType: 'TD17',
      regimeFiscale: 'RF01',
      costAccount: 'Licenze software e servizi digitali',
      aliquotaIva: 22,
      aliquotaCassa: 0,
      aliquotaRitenuta: 0,
      linee: [{ id: 'line-1', descrizione: 'Servizio estero', quantita: 1, prezzoUnitario: 100, aliquotaIva: 22 }],
      conti: { ...invoiceDraft.conti, ivaCredito: 'IVA a credito', fornitori: 'Debiti v/fornitori', ivaAutofatture: 'Debito IVA autofatture' },
    }
    const ordinaryInvoice: IssuedInvoice = {
      ...reverseChargeDraft,
      numero: '2026/0003',
      stato: 'emessa',
      totali: calculateInvoiceTotals(reverseChargeDraft),
    }
    const ordinaryEntries = buildInvoicePosting(ordinaryInvoice)
    expect(ordinaryEntries).toContainEqual(expect.objectContaining({ conto: 'IVA a credito', dare: 22 }))
    expect(ordinaryEntries).toContainEqual(expect.objectContaining({ conto: 'IVA a debito', avere: 22 }))
    expect(ordinaryEntries.reduce((sum, entry) => sum + entry.dare, 0)).toBe(ordinaryEntries.reduce((sum, entry) => sum + entry.avere, 0))

    const flatDraft = { ...reverseChargeDraft, regimeFiscale: 'RF19' }
    const flatInvoice: IssuedInvoice = {
      ...flatDraft,
      numero: '2026/0004',
      stato: 'emessa',
      totali: calculateInvoiceTotals(flatDraft),
    }
    const flatEntries = buildInvoicePosting(flatInvoice)
    expect(flatInvoice.totali.bollo).toBe(0)
    expect(flatEntries).toContainEqual(expect.objectContaining({ conto: 'Licenze software e servizi digitali', dare: 122 }))
    expect(flatEntries).toContainEqual(expect.objectContaining({ conto: 'Debito IVA autofatture', avere: 22 }))
    expect(flatEntries.reduce((sum, entry) => sum + entry.dare, 0)).toBe(flatEntries.reduce((sum, entry) => sum + entry.avere, 0))
  })

  it('storna in Dare e Avere le voci di una nota di credito TD04', () => {
    const draft = { ...invoiceDraft, documentType: 'TD04' as const }
    expect(validateInvoice(draft)).toContain('Indica il numero della fattura collegata alla nota di credito.')
    expect(validateInvoice({
      ...draft,
      linkedInvoiceNumber: '2026/0001',
      linkedInvoiceDate: '2026-11-10',
    })).toEqual([])
    const creditNote: IssuedInvoice = {
      ...draft,
      numero: '2026/NC001',
      stato: 'emessa',
      totali: calculateInvoiceTotals(draft),
    }
    const entries = buildInvoicePosting(creditNote)

    expect(entries[0]).toMatchObject({ conto: 'Crediti v/clienti', avere: creditNote.totali.totale })
    expect(entries).toContainEqual(expect.objectContaining({ conto: 'Ricavi da servizi', dare: creditNote.totali.imponibile }))
    expect(entries.reduce((sum, entry) => sum + entry.dare, 0)).toBe(entries.reduce((sum, entry) => sum + entry.avere, 0))
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

  it('genera XML FatturaPA con intestazione, riga, riepilogo IVA e bollo', () => {
    const invoice: IssuedInvoice = {
      ...invoiceDraft,
      cliente: {
        ...invoiceDraft.cliente,
        indirizzo: 'Via Roma 1',
        comune: 'Milano',
        provincia: 'MI',
        cap: '20100',
        nazione: 'Italia',
      },
      tipoDocumento: 'TD01',
      divisa: 'EUR',
      numero: '2026/0001',
      stato: 'emessa',
      totali: calculateInvoiceTotals(invoiceDraft),
    }
    const company = {
      ragioneSociale: 'Studio Demo S.r.l.',
      indirizzo: 'Via Roma 1',
      comune: 'Milano',
      provincia: 'MI',
      cap: '20100',
      nazione: 'IT',
      partitaIva: '12345678901',
      codiceFiscale: 'RSSMRA80A01F205Z',
      regimeFiscale: 'RF01',
      email: '',
      pec: 'studio@pec.it',
      codiceDestinatario: '0000000',
      telefono: '',
      conti: invoiceDraft.conti,
    }
    const xml = buildFatturaPaXml(invoice, company)
    expect(xml).toContain('<FatturaElettronica')
    expect(xml).toContain('<TipoDocumento>TD01</TipoDocumento>')
    expect(xml).toContain('<AliquotaIVA>22.00</AliquotaIVA>')
    expect(xml).toContain('<NumeroLinea>1</NumeroLinea>')
    expect(validateFatturaPaXml(invoice, company)).toEqual([])

    const creditNote: IssuedInvoice = {
      ...invoice,
      documentType: 'TD04',
      tipoDocumento: 'TD04',
      linkedInvoiceNumber: invoice.numero,
      linkedInvoiceDate: invoice.data,
    }
    const creditNoteXml = buildFatturaPaXml(creditNote, company)
    expect(creditNoteXml).toContain('<TipoDocumento>TD04</TipoDocumento>')
    expect(creditNoteXml).toContain('<PrezzoTotale>-200.00</PrezzoTotale>')
    expect(creditNoteXml).toContain('<DatiFattureCollegate><IdDocumento>2026/0001</IdDocumento>')
  })

  it('esporta TD17 con il fornitore come cedente, la cassa e la ritenuta', () => {
    const draft: InvoiceDraft = {
      ...invoiceDraft,
      documentType: 'TD17',
      contributionType: 'gestione_separata',
      contributionCode: 'TC22',
      aliquotaCassa: 4,
      marcaDaBollo: { addebitata: false, dovuta: true, importo: 2, identificativo: 'ID-BOLLO' },
      cliente: {
        ...invoiceDraft.cliente,
        ragioneSociale: 'Fornitore estero',
        partitaIva: '123456789',
        nazione: 'DE',
        indirizzo: 'Musterstrasse 1',
        cap: '10115',
        comune: 'Berlin',
      },
    }
    const invoice: IssuedInvoice = {
      ...draft,
      numero: '2026/0005',
      stato: 'emessa',
      totali: calculateInvoiceTotals(draft),
    }
    const company = {
      ragioneSociale: 'Studio Demo S.r.l.',
      indirizzo: 'Via Roma 1',
      comune: 'Milano',
      provincia: 'MI',
      cap: '20100',
      nazione: 'IT',
      partitaIva: '12345678901',
      codiceFiscale: 'RSSMRA80A01F205Z',
      regimeFiscale: 'RF01',
      email: '',
      pec: '',
      codiceDestinatario: '0000000',
      telefono: '',
      conti: invoiceDraft.conti,
    }

    const xml = buildFatturaPaXml(invoice, company)
    expect(xml).toContain('<TipoDocumento>TD17</TipoDocumento>')
    expect(xml).toContain('<Anagrafica><Denominazione>Fornitore estero</Denominazione></Anagrafica>')
    expect(xml).toContain('<Anagrafica><Denominazione>Studio Demo S.r.l.</Denominazione></Anagrafica>')
    expect(xml).toContain('<TipoCassa>TC22</TipoCassa>')
    expect(xml).toContain('<ImportoRitenuta>40.00</ImportoRitenuta>')
    expect(xml).toContain('<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>')
    expect(xml).toContain('<SoggettoEmittente>CC</SoggettoEmittente>')
  })
})