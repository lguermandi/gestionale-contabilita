import catalog from '../data/ateco2025.json'

export interface AtecoSection {
  code: string
  title: string
}

export interface AtecoDivision {
  code: string
  section: string
  title: string
}

export interface AtecoCode {
  code: string
  title: string
  division: string
  section: string
}

const sections = catalog.sections as AtecoSection[]
const divisions = catalog.divisions as AtecoDivision[]
const codes = catalog.codes as AtecoCode[]
const codeByDigits = new Map(codes.map((item) => [normalizeAtecoCode(item.code), item]))

function normalizeAtecoCode(code: string) {
  return code.replace(/\D/g, '')
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').trim()
}

export function getAtecoSections() {
  return sections
}

export function getAtecoDivisions(sectionCode?: string) {
  return sectionCode
    ? divisions.filter((division) => division.section === sectionCode)
    : divisions
}

export function getAtecoCodes(divisionCode?: string) {
  return divisionCode
    ? codes.filter((item) => item.division === divisionCode)
    : codes
}

export function findAtecoByCode(code: string) {
  return codeByDigits.get(normalizeAtecoCode(code))
}

export function searchAtecoByTitle(keyword: string) {
  const query = normalizeSearchText(keyword)
  if (!query) return []
  return codes.filter((item) => normalizeSearchText(item.title).includes(query))
}

export function searchAteco(query: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []
  const isCodeQuery = /^[\d.\s]+$/.test(query.trim())
  const numericQuery = isCodeQuery ? normalizeAtecoCode(query) : ''
  return codes.filter((item) => (
    normalizeSearchText(item.title).includes(normalizedQuery)
    || (numericQuery.length > 0 && normalizeAtecoCode(item.code).includes(numericQuery))
  ))
}

const forfettarioCoefficients = {
  constructionAndRealEstate: new Set(['41', '42', '43', '68']),
  foodAndRetail: new Set(['10', '11', '46', '47', '55', '56']),
  professionalAndCare: new Set(['64', '65', '66', '69', '70', '71', '72', '73', '74', '75', '85', '86', '87', '88']),
}

export function getDefaultForfettarioCoefficient(atecoCode: string): number | null {
  const normalizedCode = normalizeAtecoCode(atecoCode)
  const activity = findAtecoByCode(atecoCode)
  // The ambulant-trade split is only present in legacy groups, not in the 2025 catalog.
  if (!activity && (normalizedCode === '4782' || normalizedCode === '4789')) return 54
  if (!activity) return null

  if (/\bcommercio ambulante\b/i.test(activity.title)) return 54
  if (activity.code.startsWith('46.1') || activity.code.startsWith('47.91') || activity.code.startsWith('47.92')) return 62
  if (forfettarioCoefficients.constructionAndRealEstate.has(activity.division)) return 86
  if (forfettarioCoefficients.foodAndRetail.has(activity.division)) return 40
  if (forfettarioCoefficients.professionalAndCare.has(activity.division)) return 78
  return 67
}
