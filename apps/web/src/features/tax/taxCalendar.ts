export interface TaxDeadline {
  date: string
  title: string
  description: string
  kind: 'iva' | 'redditi' | 'declaration'
}

export function buildTaxCalendar(
  year: number,
  regime = 'RF01',
  periodicita: 'mensile' | 'trimestrale' = 'trimestrale',
): TaxDeadline[] {
  const calendar: TaxDeadline[] = []

  if (regime !== 'RF19') {
    if (periodicita === 'trimestrale') {
      calendar.push(
        { date: `${year}-05-18`, title: 'IVA - primo trimestre', description: 'Versamento entro il 16 maggio con maggiorazione dell’1% per liquidazione trimestrale.', kind: 'iva' },
        { date: `${year}-08-17`, title: 'IVA - secondo trimestre', description: 'Versamento entro il 16 agosto con maggiorazione dell’1% per liquidazione trimestrale.', kind: 'iva' },
        { date: `${year}-11-16`, title: 'IVA - terzo trimestre', description: 'Versamento entro il 16 novembre con maggiorazione dell’1% per liquidazione trimestrale.', kind: 'iva' },
      )
    } else {
      for (let month = 1; month <= 12; month += 1) {
        const payment = new Date(Date.UTC(year, month, 16))
        if (payment.getUTCFullYear() === year) {
          calendar.push({
            date: payment.toISOString().slice(0, 10),
            title: `IVA - liquidazione periodo ${month}`,
            description: `Versamento dell’IVA del mese ${month.toString().padStart(2, '0')}, se dovuta.`,
            kind: 'iva',
          })
        }
      }
    }
    calendar.push(
      { date: `${year}-12-28`, title: 'Acconto IVA', description: 'Versamento entro il 27 dicembre; nel 2026 il termine slitta al 28 dicembre perché il 27 è domenica.', kind: 'iva' },
    )
  }

  calendar.push(
    { date: `${year}-06-30`, title: 'Saldo e primo acconto imposte sui redditi', description: 'IRES, IRAP, IRPEF o imposta sostitutiva secondo soggetto e criteri applicabili.', kind: 'redditi' },
    { date: `${year}-07-31`, title: 'Trasmissione dichiarazione dei redditi', description: 'Termine ordinario da verificare per modello Redditi PF, SC, Sp o società.', kind: 'declaration' },
    { date: `${year}-11-30`, title: 'Secondo acconto imposte sui redditi', description: 'Acconto IRES, IRAP, IRPEF o imposta sostitutiva secondo metodo storico o previsionale.', kind: 'redditi' },
  )

  if (regime === 'RF19') {
    calendar.push({
      date: `${year}-07-20`,
      title: 'Forfettario - saldo e acconti',
      description: 'Verificare proroga, codici tributo imposta sostitutiva e limiti di fatturato.',
      kind: 'redditi',
    })
  }

  return calendar.sort((left, right) => left.date.localeCompare(right.date))
}
