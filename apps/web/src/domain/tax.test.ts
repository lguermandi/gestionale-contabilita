import { describe, expect, it } from 'vitest'
import { buildTaxPreview, calculateCollectedRevenueByAteco } from './tax'
import { buildTaxCalendar } from '../features/tax/taxCalendar'

function paidInvoiceReceipt(
  amount: number,
  atecoCode = '74.10',
  data = '2026-03-10',
  payments = [{ data, importo: amount }],
) {
  return {
    data,
    atecoCode,
    linee: [{ quantita: 1, prezzoUnitario: amount, atecoCode }],
    totali: { imponibile: amount, cassa: 0, totale: amount },
    payments,
  }
}

describe('previsione fiscale', () => {
  it('calcola il forfettario con coefficiente e aliquota sostitutiva', () => {
    const preview = buildTaxPreview([], { utile: 20_000, ricavi: 40_000, costi: 20_000 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      tipoSoggetto: 'persona_fisica',
      ateco: '74.10',
      coefficienteRedditivita: 78,
      aliquotaForfettario: 15,
    }, 2026, { invoices: [paidInvoiceReceipt(40_000)] })
    expect(preview.redditoForfettario).toBe(31_200)
    expect(preview.impostaSostitutiva).toBe(4_680)
    expect(preview.ivaNetta).toBe(0)
  })

  it('calcola IRES e IRAP per una società nel regime ordinario', () => {
    const preview = buildTaxPreview([], { utile: 100_000, ricavi: 180_000, costi: 80_000 }, { debito: 22_000, credito: 10_000 }, {
      regimeFiscale: 'RF01',
      tipoSoggetto: 'societa',
    }, 2026)
    expect(preview.ires).toBe(24_000)
    expect(preview.irap).toBe(3_900)
    expect(preview.ivaNetta).toBe(12_000)
  })

  it('segnala il superamento delle soglie forfettarie', () => {
    const preview = buildTaxPreview([], { utile: 100_000, ricavi: 101_000, costi: 1_000 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      tipoSoggetto: 'persona_fisica',
      ateco: '62',
      coefficienteRedditivita: 67,
    }, 2026, { invoices: [paidInvoiceReceipt(101_000, '62')] })
    expect(preview.uscitaForfettario).toBe(true)
    expect(preview.uscitaImmediataForfettario).toBe(true)
  })

  it('calcola separatamente il reddito per ogni codice ATECO', () => {
    const preview = buildTaxPreview([], { utile: 30_000, ricavi: 30_000, costi: 0 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      attivitaAteco: [
        { codice: '62.01', coefficienteRedditivita: 78 },
        { codice: '47.91', coefficienteRedditivita: 40 },
      ],
      aliquotaForfettario: 15,
    }, 2026, { invoices: [{
      data: '2026-04-01',
      linee: [
        { quantita: 1, prezzoUnitario: 10_000, atecoCode: '62.01' },
        { quantita: 1, prezzoUnitario: 20_000, atecoCode: '47.91' },
      ],
      totali: { imponibile: 30_000, cassa: 0, totale: 30_000 },
      payments: [{ data: '2026-04-15', importo: 30_000 }],
    }] })

    expect(preview.fatturato).toBe(30_000)
    expect(preview.redditoPerAteco.map(({ codice, reddito }) => [codice, reddito])).toEqual([
      ['62.01', 7_800],
      ['47.91', 8_000],
    ])
    expect(preview.redditoForfettario).toBe(15_800)
    expect(preview.impostaSostitutiva).toBe(2_370)
  })

  it('applica le soglie ai ricavi complessivi, senza uscita alla soglia esatta', () => {
    const profile = {
      regimeFiscale: 'RF19',
      attivitaAteco: [
        { codice: '62.01', coefficienteRedditivita: 78 },
        { codice: '47.91', coefficienteRedditivita: 40 },
      ],
    }
    const atLimit = buildTaxPreview([], { utile: 0, ricavi: 0, costi: 0 }, { debito: 0, credito: 0 }, profile, 2026, {
      invoices: [{
        data: '2026-02-01',
        linee: [
          { quantita: 1, prezzoUnitario: 50_000, atecoCode: '62.01' },
          { quantita: 1, prezzoUnitario: 35_000, atecoCode: '47.91' },
        ],
        totali: { imponibile: 85_000, cassa: 0, totale: 85_000 },
        payments: [{ data: '2026-02-15', importo: 85_000 }],
      }],
    })
    const aboveLimit = buildTaxPreview([], { utile: 0, ricavi: 0, costi: 0 }, { debito: 0, credito: 0 }, profile, 2026, {
      invoices: [{
        data: '2026-02-01',
        linee: [
          { quantita: 1, prezzoUnitario: 50_001, atecoCode: '62.01' },
          { quantita: 1, prezzoUnitario: 35_000, atecoCode: '47.91' },
        ],
        totali: { imponibile: 85_001, cassa: 0, totale: 85_001 },
        payments: [{ data: '2026-02-15', importo: 85_001 }],
      }],
    })

    expect(atLimit.fatturato).toBe(85_000)
    expect(atLimit.uscitaForfettario).toBe(false)
    expect(aboveLimit.uscitaForfettario).toBe(true)
    expect(aboveLimit.uscitaImmediataForfettario).toBe(false)
  })

  it('stima bollo trimestrale e prepara i codici tributo F24', () => {
    const preview = buildTaxPreview([], { utile: 20_000, ricavi: 40_000, costi: 20_000 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      ateco: '62.01',
      coefficienteRedditivita: 78,
      aliquotaForfettario: 15,
      saldoAnnoPrecedente: 300,
    }, 2026, {
      invoices: [paidInvoiceReceipt(40_000, '62.01')],
      fattureBolloPerTrimestre: [1, 0, 2, 1],
    })
    const calendar = buildTaxCalendar(2026, 'RF19', 'trimestrale', { preview })

    expect(preview.bolliTrimestrali.map(({ importo }) => importo)).toEqual([2, 0, 4, 2])
    expect(preview.importoBolli).toBe(8)
    expect(calendar.find((deadline) => deadline.id === '2026-bollo-q1')?.f24).toEqual([
      { section: 'Erario', code: '2521', year: 2026, amount: 2 },
    ])
    expect(calendar.find((deadline) => deadline.id === '2026-bollo-q4')?.date).toBe('2027-02-28')
    expect(calendar.find((deadline) => deadline.id === '2026-forfettario-saldo-acconto1')?.f24.map(({ code }) => code)).toEqual(['1792', '1790'])
    expect(calendar.find((deadline) => deadline.id === '2026-forfettario-acconto2')?.f24[0].code).toBe('1791')
  })

  it('genera scadenze F24 IVA per autofatture forfettarie entro il 16 del mese successivo', () => {
    const totals = (iva: number) => ({
      imponibile: 100,
      cassa: 0,
      baseIva: 100,
      iva,
      ivaPerAliquota: [{ aliquota: 22, baseIva: 100, iva }],
      ritenuta: 0,
      bollo: 0,
      totale: 100 + iva,
    })
    const calendar = buildTaxCalendar(2026, 'RF19', 'trimestrale', {
      reverseChargeInvoices: [
        { id: 'dec-1', data: '2025-12-10', numero: '2025/001', documentType: 'TD17', regimeFiscale: 'RF19', totali: totals(22) },
        { id: 'dec-2', data: '2025-12-20', numero: '2025/002', documentType: 'TD18', regimeFiscale: 'RF19', totali: totals(11) },
        { id: 'jan-1', data: '2026-01-05', numero: '2026/001', documentType: 'TD19', regimeFiscale: 'RF19', totali: totals(22) },
        { id: 'ordinary', data: '2025-12-20', numero: '2025/003', documentType: 'TD17', regimeFiscale: 'RF01', totali: totals(22) },
      ],
    })

    expect(calendar.filter((deadline) => deadline.kind === 'iva').map(({ date, f24 }) => ({ date, f24 }))).toEqual([
      { date: '2026-01-16', f24: [{ section: 'Erario', code: '6012', year: 2025, amount: 33 }] },
      { date: '2026-02-16', f24: [{ section: 'Erario', code: '6001', year: 2026, amount: 22 }] },
    ])
  })

  it('calcola contributi INPS con quota fissa ed eccedenza', () => {
    const preview = buildTaxPreview([], { utile: 40_000, ricavi: 40_000, costi: 0 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      ateco: '62.01',
      coefficienteRedditivita: 100,
      aliquotaForfettario: 15,
      gestionePrevidenziale: 'artigiani',
      contributoFissoAnnuale: 4_000,
      redditoMinimaleInps: 20_000,
      aliquotaEccedenzaInps: 20,
    }, 2026, { invoices: [paidInvoiceReceipt(40_000, '62.01')] })

    expect(preview.contributiPrevidenziali).toBe(8_000)
    expect(preview.imponibileForfettarioNetto).toBe(32_000)
    expect(preview.impostaSostitutiva).toBe(4_800)
  })

  it('genera F24 IVA periodico e mantiene il calendario privato sulle sole scadenze manuali', () => {
    const preview = buildTaxPreview([], { utile: 10_000, ricavi: 20_000, costi: 10_000 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF01',
      tipoSoggetto: 'persona_fisica',
    }, 2026, { ivaPeriodi: [{ id: 'q1', label: '1° trimestre', amount: 123.45 }] })
    const businessCalendar = buildTaxCalendar(2026, 'RF01', 'trimestrale', { preview })
    const privateCalendar = buildTaxCalendar(2026, 'RF19', 'trimestrale', {
      preview,
      includeBusinessDeadlines: false,
      manualDeadlines: [{
        id: 'tari-test',
        date: '2026-06-30',
        title: 'TARI',
        description: 'Promemoria personale',
        amount: 120,
      }],
    })

    expect(businessCalendar.find((deadline) => deadline.id === '2026-iva-q1')?.f24[0]).toEqual({
      section: 'Erario',
      code: '6031',
      year: 2026,
      amount: 123.45,
    })
    expect(privateCalendar.map((deadline) => deadline.title)).toEqual(['TARI'])
  })

  it('conta gli incassi nell’anno di pagamento e li ripartisce per ATECO sulle fatture multi-riga', () => {
    const activities = [
      { codice: '62.01', coefficienteRedditivita: 78 },
      { codice: '47.91', coefficienteRedditivita: 40 },
    ]
    const receipts = calculateCollectedRevenueByAteco([
      {
        data: '2025-12-10',
        linee: [
          { quantita: 1, prezzoUnitario: 600, atecoCode: '62.01' },
          { quantita: 1, prezzoUnitario: 400, atecoCode: '47.91' },
        ],
        totali: { imponibile: 1_000, cassa: 0, totale: 1_000 },
        payments: [
          { data: '2025-12-20', importo: 500 },
          { data: '2026-01-05', importo: 300 },
        ],
      },
      {
        ...paidInvoiceReceipt(900, '62.01', '2026-02-01'),
        payments: [],
      },
    ], 2026, activities)

    expect(receipts).toEqual({ '62.01': 180, '47.91': 120 })
  })

  it('non considera fatture non incassate o pagamenti fuori dall’anno selezionato', () => {
    const preview = buildTaxPreview([], { utile: 50_000, ricavi: 50_000, costi: 0 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      ateco: '62.01',
      coefficienteRedditivita: 78,
    }, 2026, {
      invoices: [{
        ...paidInvoiceReceipt(50_000, '62.01', '2025-12-01'),
        payments: [{ data: '2025-12-31', importo: 25_000 }],
      }],
    })

    expect(preview.fatturato).toBe(0)
    expect(preview.redditoForfettario).toBe(0)
  })
})
