import { describe, expect, it } from 'vitest'
import { buildIncomeStatement } from './incomeStatement'

describe('conto economico civilistico gestionale', () => {
  it('costruisce i subtotali scalari e classifica i conti riconoscibili', () => {
    const statement = buildIncomeStatement([
      { conto: 'Ricavi vendite', gestione: 'Tipica', ricavi: 1000, costi: 0, saldo: 1000 },
      { conto: 'Altri proventi', gestione: 'Tipica', ricavi: 100, costi: 0, saldo: 100 },
      { conto: 'Costi materiali', gestione: 'Tipica', ricavi: 0, costi: 200, saldo: -200 },
      { conto: 'Consulenze professionali', gestione: 'Tipica', ricavi: 0, costi: 150, saldo: -150 },
      { conto: 'Interessi passivi', gestione: 'Finanziaria', ricavi: 0, costi: 20, saldo: -20 },
      { conto: 'Imposte sul reddito', gestione: 'Fiscale', ricavi: 0, costi: 30, saldo: -30 },
    ])

    expect(statement).toMatchObject({
      productionValue: 1100,
      productionCosts: 350,
      operatingResult: 750,
      financialResult: -20,
      preTaxResult: 730,
      incomeTaxes: -30,
      netResult: 700,
    })
    expect(statement.sections.find(({ code }) => code === 'A')?.items[0].rows[0]).not.toHaveProperty('gestione')
    expect(statement.sections.find(({ code }) => code === 'A')?.items.map(({ code }) => code)).toEqual(['1', '5'])
    expect(statement.negativeSections.find(({ code }) => code === 'B')?.items.map(({ code }) => code)).toEqual(['6', '7'])
  })

  it('colloca le voci non riconosciute tra le altre e gestisce perdite e sezioni opposte', () => {
    const statement = buildIncomeStatement([
      { conto: 'Entrata non classificata', gestione: 'Tipica', ricavi: 40, costi: 0, saldo: 40 },
      { conto: 'Uscita non classificata', gestione: 'Tipica', ricavi: 0, costi: 75, saldo: -75 },
    ])

    expect(statement.positiveSections[0].items[0]).toMatchObject({ code: '5', rows: [{ conto: 'Entrata non classificata' }] })
    expect(statement.negativeSections[0].items[0]).toMatchObject({ code: '14', rows: [{ conto: 'Uscita non classificata' }] })
    expect(statement.netResult).toBe(-35)
  })

  it('classifica come A1 stipendio e ricavi x lavori e mantiene in A le altre entrate del foglio', () => {
    const accounts = ['stipendio', 'ricavi x lavori', 'donazione', 'entrate diverse', 'paghetta', 'rimborso']
    const statement = buildIncomeStatement(accounts.map((conto) => ({
      conto,
      gestione: 'Tipica',
      ricavi: 10,
      costi: 0,
      saldo: 10,
    })))
    const production = statement.sections.find(({ code }) => code === 'A')

    expect(production?.items.find(({ code }) => code === '1')?.rows.map(({ conto }) => conto).sort()).toEqual([
      'ricavi x lavori',
      'stipendio',
    ].sort())
    expect(production?.items.find(({ code }) => code === '5')?.rows.map(({ conto }) => conto).sort()).toEqual([
      'donazione',
      'entrate diverse',
      'paghetta',
      'rimborso',
    ].sort())
    expect(production?.total).toBe(60)
    expect(statement.sections.find(({ code }) => code === 'B')?.items).toEqual([])
  })
})
