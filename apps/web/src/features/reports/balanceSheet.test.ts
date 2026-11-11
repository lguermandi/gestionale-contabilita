import { describe, expect, it } from 'vitest'
import { buildBalanceSheetSections } from './balanceSheet'

function findAccount(sections: ReturnType<typeof buildBalanceSheetSections>['activity'], conto: string) {
  return sections.flatMap((section) => section.subsections).flatMap((subsection) => subsection.rows).find((row) => row.conto === conto)
}

describe('classificazione dello stato patrimoniale', () => {
  it('mantiene riserve, utili e debiti tra le fonti anche con saldo Dare', () => {
    const report = buildBalanceSheetSections([
      { conto: 'Altre riserve', saldo: 438.01 },
      { conto: "Utile d'esercizio", saldo: 882.73 },
      { conto: 'Debiti tributari', saldo: 0.42 },
    ], [])

    expect(findAccount(report.activity, 'Altre riserve')).toBeUndefined()
    expect(findAccount(report.activity, "Utile d'esercizio")).toBeUndefined()
    expect(findAccount(report.activity, 'Debiti tributari')).toBeUndefined()
    expect(report.liability[0].subsections[3].rows[0]).toMatchObject({ conto: 'Altre riserve', corrente: -438.01 })
    expect(report.liability[0].subsections[4].rows[0]).toMatchObject({ conto: "Utile d'esercizio", corrente: -882.73 })
    expect(report.liability[2].subsections[1].rows[0]).toMatchObject({ conto: 'Debiti tributari', corrente: -0.42 })
  })

  it('sposta lo scoperto bancario tra i debiti e mantiene il confronto nel lato corretto', () => {
    const report = buildBalanceSheetSections(
      [{ conto: 'Banca BBVA', saldo: -1557.44 }],
      [{ conto: 'Banca BBVA', saldo: 466.68 }],
    )

    expect(findAccount(report.activity, 'Banca BBVA')).toMatchObject({ corrente: 0, precedente: 466.68 })
    expect(findAccount(report.liability, 'Banca BBVA')).toMatchObject({ corrente: 1557.44, precedente: 0 })
  })

  it('colloca beni materiali, crediti e liquidità nelle rispettive voci', () => {
    const report = buildBalanceSheetSections([
      { conto: 'Altri beni', saldo: 250 },
      { conto: 'Crediti v/altri', saldo: 100 },
      { conto: 'Banca Intesa', saldo: 50 },
    ], [])

    expect(report.activity[0].subsections[0].rows[0].conto).toBe('Altri beni')
    expect(report.activity[1].subsections[0].rows[0].conto).toBe('Crediti v/altri')
    expect(report.activity[1].subsections[1].rows[0].conto).toBe('Banca Intesa')
  })
})
