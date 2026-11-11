import { describe, expect, it } from 'vitest'
import { buildBalanceSheetSections } from './balanceSheet'

function findAccount(sections: ReturnType<typeof buildBalanceSheetSections>['activity'], conto: string) {
  return sections.flatMap((section) => section.subsections).flatMap((subsection) => subsection.rows).find((row) => row.conto === conto)
}

describe('classificazione dello stato patrimoniale', () => {
  it('mantiene riserve, utili e debiti tra le fonti anche con saldo Dare', () => {
    const report = buildBalanceSheetSections([
      { conto: 'Capitale sociale', saldo: -1000 },
      { conto: 'Altre riserve', saldo: 438.01 },
      { conto: 'Riserve legali', saldo: -300 },
      { conto: 'Riserve statutarie', saldo: -200 },
      { conto: "Utile d'esercizio", saldo: 882.73 },
      { conto: 'Debiti tributari', saldo: 0.42 },
    ], [])

    expect(report.liability[0].subsections[0].rows[0]).toMatchObject({ conto: 'Capitale sociale', corrente: 1000 })
    expect(findAccount(report.activity, 'Altre riserve')).toBeUndefined()
    expect(findAccount(report.activity, "Utile d'esercizio")).toBeUndefined()
    expect(findAccount(report.activity, 'Debiti tributari')).toBeUndefined()
    expect(report.liability[0].subsections[3].rows[0]).toMatchObject({ conto: 'Altre riserve', corrente: -438.01 })
    expect(report.liability[0].subsections[1].rows[0]).toMatchObject({ conto: 'Riserve legali', corrente: 300 })
    expect(report.liability[0].subsections[2].rows[0]).toMatchObject({ conto: 'Riserve statutarie', corrente: 200 })
    expect(report.liability[0].subsections[4].rows[0]).toMatchObject({ conto: "Utile d'esercizio", corrente: -882.73 })
    expect(report.liability[2].subsections[1].rows[0]).toMatchObject({ conto: 'Debiti tributari', corrente: -0.42 })
  })

  it('mantiene le banche tra le disponibilità liquide e il confronto nel lato corretto', () => {
    const report = buildBalanceSheetSections(
      [{ conto: 'Banca BBVA', saldo: -1557.44 }],
      [{ conto: 'Banca BBVA', saldo: 466.68 }],
    )

    expect(findAccount(report.activity, 'Banca BBVA')).toMatchObject({ corrente: -1557.44, precedente: 466.68 })
    expect(findAccount(report.liability, 'Banca BBVA')).toBeUndefined()
  })

  it('colloca beni, investimenti finanziari, fondi e liquidità nelle rispettive voci', () => {
    const report = buildBalanceSheetSections([
      { conto: 'Altri beni', saldo: 250 },
      { conto: 'Crediti v/altri', saldo: 100 },
      { conto: 'Banca Intesa', saldo: 50 },
      { conto: 'Chiave macc. coffee cApp', saldo: 0.3 },
      { conto: 'Portafoglio', saldo: 32.9 },
      { conto: 'Denaro in cassa Rastignano', saldo: 50 },
      { conto: 'ETF', saldo: -195 },
      { conto: 'Carta YOU', saldo: -820.72 },
      { conto: 'F.do imposte e tasse', saldo: -17.5 },
    ], [])

    expect(report.activity[0].subsections[0].rows[0].conto).toBe('Altri beni')
    expect(findAccount(report.activity, 'ETF')).toMatchObject({ corrente: -195 })
    expect(report.activity[1].subsections[0].rows[0].conto).toBe('Crediti v/altri')
    expect(report.activity[1].subsections[1].rows[0].conto).toBe('Banca Intesa')
    expect(findAccount(report.activity, 'Chiave macc. coffee cApp')).toBeDefined()
    expect(findAccount(report.activity, 'Portafoglio')).toBeDefined()
    expect(findAccount(report.activity, 'Denaro in cassa Rastignano')).toBeDefined()
    expect(findAccount(report.liability, 'Carta YOU')).toMatchObject({ corrente: 820.72 })
    expect(findAccount(report.liability, 'F.do imposte e tasse')).toMatchObject({ corrente: 17.5 })
  })

  it('colloca i titoli di debito pubblico tra le immobilizzazioni finanziarie', () => {
    const report = buildBalanceSheetSections([
      { conto: 'Titoli di debito pubblico', saldo: 2076.1 },
    ], [])

    expect(report.activity[0].subsections[1].rows[0]).toMatchObject({
      conto: 'Titoli di debito pubblico',
      corrente: 2076.1,
    })
    expect(findAccount(report.liability, 'Titoli di debito pubblico')).toBeUndefined()
  })
})
