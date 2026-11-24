import { describe, expect, it } from 'vitest'
import {
  findAtecoByCode,
  getAtecoCodes,
  getAtecoDivisions,
  getAtecoSections,
  getDefaultForfettarioCoefficient,
  searchAtecoByTitle,
} from './ateco'

describe('catalogo ATECO 2025', () => {
  it('cerca un codice con o senza punti', () => {
    expect(findAtecoByCode('01.11.00')?.title).toContain('Coltivazione di cereali')
    expect(findAtecoByCode('011100')?.code).toBe('01.11.00')
    expect(findAtecoByCode('999999')).toBeUndefined()
  })

  it('cerca parole chiave nel titolo senza distinguere maiuscole e accenti', () => {
    expect(searchAtecoByTitle('COLTIVAZIONE DI CEREALI')).toHaveLength(1)
    expect(searchAtecoByTitle('caffe').some(({ title }) => title.toLocaleLowerCase('it-IT').includes('caffè'))).toBe(true)
    expect(searchAtecoByTitle('   ')).toEqual([])
  })

  it('filtra gerarchicamente sezioni, divisioni e codici', () => {
    expect(getAtecoSections()).toHaveLength(22)
    expect(getAtecoDivisions('A').every(({ section }) => section === 'A')).toBe(true)
    expect(getAtecoCodes('01').every(({ division, section }) => division === '01' && section === 'A')).toBe(true)
    expect(getAtecoCodes('01')).not.toHaveLength(0)
  })

  it('assegna coefficienti predefiniti alle divisioni forfettarie note', () => {
    expect(getDefaultForfettarioCoefficient('10.11.00')).toBe(40)
    expect(getDefaultForfettarioCoefficient('47.82.00')).toBe(40)
    expect(getDefaultForfettarioCoefficient('47.89')).toBe(54)
    expect(getDefaultForfettarioCoefficient('46.11.01')).toBe(62)
    expect(getDefaultForfettarioCoefficient('41.00.00')).toBe(86)
    expect(getDefaultForfettarioCoefficient('69.10.10')).toBe(78)
    expect(getDefaultForfettarioCoefficient('62.10.00')).toBe(67)
    expect(getDefaultForfettarioCoefficient('non valido')).toBeNull()
  })
})
