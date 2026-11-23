import { describe, expect, it } from 'vitest'
import { buildTaxPreview } from './tax'

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
})
