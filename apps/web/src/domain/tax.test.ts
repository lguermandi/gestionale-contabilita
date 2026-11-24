import { describe, expect, it } from 'vitest'
import { buildTaxPreview } from './tax'
import { buildTaxCalendar } from '../features/tax/taxCalendar'

describe('previsione fiscale', () => {
  it('calcola il forfettario con coefficiente e aliquota sostitutiva', () => {
    const preview = buildTaxPreview([], { utile: 20_000, ricavi: 40_000, costi: 20_000 }, { debito: 0, credito: 0 }, {
      regimeFiscale: 'RF19',
      tipoSoggetto: 'persona_fisica',
      ateco: '74.10',
      coefficienteRedditivita: 78,
      aliquotaForfettario: 15,
    }, 2026)
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
    }, 2026)
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
    }, 2026, { ricaviPerAteco: { '62.01': 10_000, '47.91': 20_000 } })

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
      ricaviPerAteco: { '62.01': 50_000, '47.91': 35_000 },
    })
    const aboveLimit = buildTaxPreview([], { utile: 0, ricavi: 0, costi: 0 }, { debito: 0, credito: 0 }, profile, 2026, {
      ricaviPerAteco: { '62.01': 50_001, '47.91': 35_000 },
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
    }, 2026, { fattureBolloPerTrimestre: [1, 0, 2, 1] })
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
    }, 2026)

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
})
