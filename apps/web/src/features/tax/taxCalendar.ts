import type { TaxBreakdownStep, TaxPreview } from '../../domain/tax'
import type { IssuedInvoice } from '../../domain/invoicing'

export interface F24Field {
  section: 'Erario' | 'INPS'
  code: string
  year: number
  amount: number
}

export interface TaxDeadline {
  id: string
  date: string
  title: string
  description: string
  kind: 'iva' | 'redditi' | 'declaration' | 'inps' | 'bollo' | 'personal'
  amount: number
  breakdown: TaxBreakdownStep[]
  paymentInstructions: string
  f24: F24Field[]
  paid?: boolean
}

export interface ManualTaxDeadline extends Omit<TaxDeadline, 'kind' | 'breakdown' | 'paymentInstructions' | 'f24'> {
  kind?: 'personal'
  breakdown?: TaxBreakdownStep[]
  paymentInstructions?: string
  f24?: F24Field[]
}

export interface TaxCalendarOptions {
  preview?: TaxPreview
  manualDeadlines?: ManualTaxDeadline[]
  reverseChargeInvoices?: Pick<IssuedInvoice, 'id' | 'data' | 'numero' | 'documentType' | 'regimeFiscale' | 'totali'>[]
  includeBusinessDeadlines?: boolean
}

const paymentInstructions = 'Puoi pagare con modello F24 dal tuo home banking o dal sito dell’Agenzia delle Entrate. Verifica prima codici, anno e importo.'

function makeDeadline(
  year: number,
  id: string,
  date: string,
  title: string,
  description: string,
  kind: TaxDeadline['kind'],
  amount: number,
  f24: F24Field[] = [],
  breakdown: TaxBreakdownStep[] = [],
): TaxDeadline {
  return { id: `${year}-${id}`, date, title, description, kind, amount, breakdown, paymentInstructions, f24 }
}

export function buildTaxCalendar(
  year: number,
  regime = 'RF01',
  periodicita: 'mensile' | 'trimestrale' = 'trimestrale',
  options: TaxCalendarOptions = {},
): TaxDeadline[] {
  const calendar: TaxDeadline[] = []
  const preview = options.preview
  const flat = regime === 'RF19'
  const includeBusinessDeadlines = options.includeBusinessDeadlines !== false

  if (includeBusinessDeadlines && flat) {
    const reverseChargePayments = new Map<string, { amount: number; taxYear: number; taxMonth: number; invoices: string[] }>()
    options.reverseChargeInvoices?.forEach((invoice) => {
      if (!['TD16', 'TD17', 'TD18', 'TD19'].includes(invoice.documentType)) return
      if ((invoice.regimeFiscale || regime) !== 'RF19' || invoice.totali.iva <= 0) return
      const dateParts = /^(\d{4})-(\d{2})-\d{2}$/.exec(invoice.data)
      if (!dateParts) return
      const issueYear = Number(dateParts[1])
      const issueMonth = Number(dateParts[2])
      if (issueMonth < 1 || issueMonth > 12) return
      const dueDate = new Date(Date.UTC(issueYear, issueMonth, 16)).toISOString().slice(0, 10)
      if (Number(dueDate.slice(0, 4)) !== year) return
      const key = `${dueDate}:${issueYear}:${issueMonth}`
      const current = reverseChargePayments.get(key) || {
        amount: 0,
        taxYear: issueYear,
        taxMonth: issueMonth,
        invoices: [],
      }
      current.amount = Math.round((current.amount + invoice.totali.iva + Number.EPSILON) * 100) / 100
      current.invoices.push(invoice.numero || invoice.id)
      reverseChargePayments.set(key, current)
    })
    reverseChargePayments.forEach((payment, key) => {
      const date = key.slice(0, 10)
      const month = String(payment.taxMonth).padStart(2, '0')
      calendar.push(makeDeadline(
        year,
        `autofatture-iva-${payment.taxYear}-${month}`,
        date,
        `IVA autofatture - periodo ${month}/${payment.taxYear}`,
        `Versamento dell’IVA integrata con autofatture TD16–TD19 emesse nel mese ${month}; documenti: ${payment.invoices.join(', ')}.`,
        'iva',
        payment.amount,
        [{
          section: 'Erario',
          code: String(6000 + payment.taxMonth).padStart(4, '0'),
          year: payment.taxYear,
          amount: payment.amount,
        }],
        [{
          label: `IVA autofatture ${month}/${payment.taxYear}`,
          formula: `${payment.invoices.length} documenti con IVA integrata`,
          importo: payment.amount,
          spiegazioneSemplice: 'Per il regime forfettario l’IVA integrata sulle autofatture non è detraibile e va versata.',
        }],
      ))
    })
  }

  if (includeBusinessDeadlines && !flat && regime !== 'RF20') {
    if (periodicita === 'trimestrale') {
      const quarters = [
        { id: 'q1', date: `${year}-05-18`, title: 'IVA - primo trimestre', description: 'Versamento della liquidazione IVA del primo trimestre, se dovuta.', amount: Math.max(0, preview?.ivaPeriodi.find((period) => period.id === 'q1')?.amount ?? 0) },
        { id: 'q2', date: `${year}-08-17`, title: 'IVA - secondo trimestre', description: 'Versamento della liquidazione IVA del secondo trimestre, se dovuta.', amount: Math.max(0, preview?.ivaPeriodi.find((period) => period.id === 'q2')?.amount ?? 0) },
        { id: 'q3', date: `${year}-11-16`, title: 'IVA - terzo trimestre', description: 'Versamento della liquidazione IVA del terzo trimestre, se dovuta.', amount: Math.max(0, preview?.ivaPeriodi.find((period) => period.id === 'q3')?.amount ?? 0) },
      ]
      quarters.forEach((quarter, index) => {
        calendar.push(makeDeadline(
          year,
          `iva-${quarter.id}`,
          quarter.date,
          quarter.title,
          quarter.description,
          'iva',
          quarter.amount,
          quarter.amount > 0 ? [{ section: 'Erario', code: String(6031 + index), year, amount: quarter.amount }] : [],
        ))
      })
    } else {
      for (let month = 1; month <= 12; month += 1) {
        const payment = new Date(Date.UTC(year, month, 16))
        const monthId = String(month).padStart(2, '0')
        const periodId = `m${monthId}`
        const amount = Math.max(0, preview?.ivaPeriodi.find((period) => period.id === periodId)?.amount ?? 0)
        calendar.push(makeDeadline(
          year,
          `iva-${periodId}`,
          payment.toISOString().slice(0, 10),
          `IVA - liquidazione di ${monthId}`,
          `Versamento dell’IVA del mese ${monthId}, se dovuta.`,
          'iva',
          amount,
          amount > 0 ? [{ section: 'Erario', code: String(6000 + month).padStart(4, '0'), year, amount }] : [],
        ))
      }
    }

    calendar.push(makeDeadline(
      year,
      'acconto-iva',
      `${year}-12-28`,
      'Acconto IVA',
      'Acconto IVA annuale: verifica metodo di calcolo e scadenza effettiva.',
      'iva',
      0,
    ))
  }

  if (includeBusinessDeadlines && flat && preview) {
    const saldo = preview.saldoAnnoPrecedente
    const firstAdvance = preview.primoAcconto
    const juneBreakdown = preview.breakdown.filter((step) => ['Saldo anno precedente', '1° acconto (stima 40%)'].includes(step.label))
    const juneFields: F24Field[] = [
      ...(saldo > 0 ? [{ section: 'Erario' as const, code: '1792', year: year - 1, amount: saldo }] : []),
      ...(firstAdvance > 0 ? [{ section: 'Erario' as const, code: '1790', year, amount: firstAdvance }] : []),
    ]
    calendar.push(makeDeadline(
      year,
      'forfettario-saldo-acconto1',
      `${year}-06-30`,
      'Imposta sostitutiva - saldo e 1° acconto',
      'Versamento del saldo dell’anno precedente (se inserito) e della prima quota di acconto stimata.',
      'redditi',
      saldo + firstAdvance,
      juneFields,
      juneBreakdown,
    ))
    calendar.push(makeDeadline(
      year,
      'forfettario-acconto2',
      `${year}-11-30`,
      'Imposta sostitutiva - 2° acconto',
      'Versamento della seconda quota di acconto stimata per l’imposta sostitutiva.',
      'redditi',
      preview.secondoAcconto,
      preview.secondoAcconto > 0 ? [{ section: 'Erario', code: '1791', year, amount: preview.secondoAcconto }] : [],
      preview.breakdown.filter((step) => step.label === '2° acconto (stima 60%)'),
    ))
  } else if (includeBusinessDeadlines && !flat && regime !== 'RF20') {
    calendar.push(makeDeadline(
      year,
      'saldo-acconto-imposte',
      `${year}-06-30`,
      'Saldo e primo acconto imposte',
      'Scadenza indicativa per saldo e acconti; importi e codici dipendono dalla dichiarazione.',
      'redditi',
      preview?.impostaMargineIndicativa ?? 0,
      [],
      preview?.breakdown.filter((step) => step.label === 'Imposte indicative sul margine') ?? [],
    ))
    calendar.push(makeDeadline(
      year,
      'dichiarazione-redditi',
      `${year}-10-31`,
      'Dichiarazione dei redditi',
      'Promemoria gestionale: verifica con il professionista il termine di trasmissione applicabile.',
      'declaration',
      0,
    ))
    calendar.push(makeDeadline(
      year,
      'secondo-acconto-imposte',
      `${year}-11-30`,
      'Secondo acconto imposte',
      'Importo da determinare dalla dichiarazione e dal metodo di acconto scelto.',
      'redditi',
      0,
    ))
  }

  if (includeBusinessDeadlines && preview) {
    const quarterly = preview.bolliTrimestrali
    const februaryEnd = new Date(Date.UTC(year + 1, 2, 0)).getUTCDate()
    const dueDates = [`${year}-05-31`, `${year}-09-30`, `${year}-11-30`, `${year + 1}-02-${String(februaryEnd).padStart(2, '0')}`]
    quarterly.forEach((quarter, index) => {
      const amount = quarter.importo
      calendar.push(makeDeadline(
        year,
        `bollo-q${quarter.trimestre}`,
        dueDates[index],
        `Bollo fatture elettroniche - ${quarter.trimestre}° trimestre`,
        `${quarter.fatture} fatture soggette a bollo × 2,00 €. Scadenza da verificare sul portale Fatture e Corrispettivi.`,
        'bollo',
        amount,
        amount > 0 ? [{ section: 'Erario', code: `252${quarter.trimestre}`, year, amount }] : [],
        amount > 0 ? [{
          label: `Bollo ${quarter.trimestre}° trimestre`,
          formula: `${quarter.fatture} fatture × 2,00 €`,
          importo: amount,
          spiegazioneSemplice: 'Importo stimato sulle fatture esenti IVA sopra 77,47 euro rilevate nel trimestre.',
        }] : [],
      ))
    })

    if (flat) {
      const socialCode = profileSocialCode(preview)
      if (preview.contributiPrevidenziali > 0 && socialCode) {
        if (preview.gestionePrevidenziale === 'artigiani' || preview.gestionePrevidenziale === 'commercianti') {
          const dates = [`${year}-05-18`, `${year}-08-20`, `${year}-11-16`, `${year + 1}-02-16`]
          dates.forEach((date, index) => {
            const amount = index < 3
              ? Math.round(preview.contributiPrevidenziali / 4 * 100) / 100
              : Math.round((preview.contributiPrevidenziali - preview.contributiPrevidenziali / 4 * 3) * 100) / 100
            calendar.push(makeDeadline(
              year,
              `inps-quota-${index + 1}`,
              date,
              `Contributi INPS - quota ${index + 1}`,
              'Stima rateizzata dei contributi Artigiani/Commercianti, inclusa la quota fissa e l’eventuale eccedenza.',
              'inps',
              amount,
              [{ section: 'INPS', code: socialCode, year, amount }],
            ))
          })
        } else {
          const firstPart = Math.round(preview.contributiPrevidenziali * 0.4 * 100) / 100
          const secondPart = Math.round((preview.contributiPrevidenziali - firstPart) * 100) / 100
          calendar.push(makeDeadline(
            year,
            'inps-primo-acconto',
            `${year}-06-30`,
            'Contributi previdenziali - prima quota stimata',
            'Stima gestionale dei contributi; importo e scadenze dipendono dalla gestione INPS.',
            'inps',
            firstPart,
            [{ section: 'INPS', code: socialCode, year, amount: firstPart }],
          ))
          calendar.push(makeDeadline(
            year,
            'inps-secondo-acconto',
            `${year}-11-30`,
            'Contributi previdenziali - seconda quota stimata',
            'Stima gestionale dei contributi; controlla la posizione previdenziale INPS.',
            'inps',
            secondPart,
            [{ section: 'INPS', code: socialCode, year, amount: secondPart }],
          ))
        }
      }
    }
  }

  options.manualDeadlines?.forEach((deadline) => {
    calendar.push({
      ...deadline,
      kind: 'personal',
      breakdown: deadline.breakdown ?? [],
      paymentInstructions: deadline.paymentInstructions ?? 'Segui le istruzioni dell’avviso o dell’ente creditore. Verifica importi e modalità prima del pagamento.',
      f24: deadline.f24 ?? [],
    })
  })

  return calendar.sort((left, right) => left.date.localeCompare(right.date))
}

function profileSocialCode(preview: TaxPreview) {
  if (preview.gestionePrevidenziale === 'artigiani') return 'AF'
  if (preview.gestionePrevidenziale === 'commercianti') return 'CF'
  if (preview.gestionePrevidenziale === 'gestione_separata') return 'PXX'
  return ''
}
