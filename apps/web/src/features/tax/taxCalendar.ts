export interface TaxDeadline {
  date: string
  title: string
  description: string
  kind: 'iva' | 'redditi' | 'declaration'
}

export function buildTaxCalendar(year: number): TaxDeadline[] {
  return [
    { date: `${year}-02-16`, title: 'IVA - liquidazione trimestrale', description: 'Liquidazione IVA del quarto trimestre precedente e presentazione modello LIPE, se dovuta.', kind: 'iva' },
    { date: `${year}-05-18`, title: 'IVA - liquidazione trimestrale', description: 'Liquidazione IVA del primo trimestre e presentazione LIPE, se dovuta.', kind: 'iva' },
    { date: `${year}-06-30`, title: 'Versamento saldo imposte', description: 'Saldo IRES, IRAP e altri tributi dell’esercizio precedente, con le maggiorazioni o detrazioni applicabili.', kind: 'redditi' },
    { date: `${year}-07-31`, title: 'Dichiarazioni dei redditi', description: 'Termine ordinario di trasmissione delle dichiarazioni: verificare proroghe e tipologia di modello.', kind: 'declaration' },
    { date: `${year}-08-17`, title: 'IVA - liquidazione trimestrale', description: 'Liquidazione IVA del secondo trimestre e presentazione LIPE, se dovuta.', kind: 'iva' },
    { date: `${year}-11-16`, title: 'IVA - liquidazione trimestrale', description: 'Liquidazione IVA del terzo trimestre e presentazione LIPE, se dovuta.', kind: 'iva' },
    { date: `${year}-11-30`, title: 'Primo acconto imposte', description: 'Acconto IRES, IRAP e ritenute dovuto secondo i criteri applicabili alla specifica attività.', kind: 'redditi' },
  ]
}
