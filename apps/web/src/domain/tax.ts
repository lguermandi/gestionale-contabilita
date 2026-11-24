import type { LedgerTransaction } from './accounting'

export type FiscalEntityType = 'persona_fisica' | 'societa' | 'ente'
export type SocialSecurityScheme = 'nessuna' | 'gestione_separata' | 'artigiani' | 'commercianti'

export interface AtecoActivity {
  codice: string
  coefficienteRedditivita: number
  principale?: boolean
}

export interface TaxBreakdownStep {
  label: string
  formula: string
  importo: number
  spiegazioneSemplice: string
}

export interface VatPeriodEstimate {
  id: string
  label: string
  amount: number
}

export interface FiscalProfile {
  regimeFiscale?: string
  tipoSoggetto?: FiscalEntityType
  ateco?: string
  coefficienteRedditivita?: number
  attivitaAteco?: AtecoActivity[]
  aliquotaForfettario?: number
  nuovaAttivita?: boolean
  annoInizioAttivita?: number
  periodoIva?: 'mensile' | 'trimestrale'
  addizionaleRegionale?: number
  addizionaleComunale?: number
  gestionePrevidenziale?: SocialSecurityScheme
  aliquotaGestioneSeparata?: number
  contributoFissoAnnuale?: number
  redditoMinimaleInps?: number
  aliquotaEccedenzaInps?: number
  saldoAnnoPrecedente?: number
}

export interface TaxPreview {
  regime: string
  regimeLabel: string
  gestionePrevidenziale: SocialSecurityScheme
  fatturato: number
  costi: number
  redditoContabile: number
  redditoForfettario: number
  coefficienteForfettario: number
  redditoPerAteco: Array<AtecoActivity & { ricavi: number; reddito: number }>
  contributiPrevidenziali: number
  imponibileForfettarioNetto: number
  impostaSostitutiva: number
  saldoAnnoPrecedente: number
  primoAcconto: number
  secondoAcconto: number
  impostaMargineIndicativa: number
  irpef: number
  ires: number
  irap: number
  addizionali: number
  ivaDebito: number
  ivaCredito: number
  ivaNetta: number
  ivaPeriodi: VatPeriodEstimate[]
  bolliTrimestrali: Array<{ trimestre: number; fatture: number; importo: number }>
  importoBolli: number
  sogliaForfettario: number
  sogliaSubimento: number
  uscitaForfettario: boolean
  uscitaImmediataForfettario: boolean
  breakdown: TaxBreakdownStep[]
  warnings: string[]
}

export interface TaxCalculationOptions {
  ricaviPerAteco?: Record<string, number>
  fattureBolloPerTrimestre?: number[]
  ivaPeriodi?: VatPeriodEstimate[]
}

export const FISCAL_REGIME_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'RF01', label: 'RF01 - Ordinario / semplificato' },
  { code: 'RF02', label: 'RF02 - Contribuenti minimi' },
  { code: 'RF04', label: 'RF04 - Agricoltura e attività connesse/pesca' },
  { code: 'RF05', label: 'RF05 - Vendita sali e tabacchi' },
  { code: 'RF06', label: 'RF06 - Commercio fiammiferi, carta da fumo, etc.' },
  { code: 'RF07', label: 'RF07 - Editoria' },
  { code: 'RF08', label: 'RF08 - Gestione servizi telefonia pubblica' },
  { code: 'RF09', label: 'RF09 - Rivendita documenti trasporto/lotta/sosta' },
  { code: 'RF10', label: 'RF10 - Intrattenimenti, giochi e altre attività art.74-ter' },
  { code: 'RF11', label: 'RF11 - Agenzie viaggi e turismo' },
  { code: 'RF12', label: 'RF12 - Agriturismo' },
  { code: 'RF13', label: 'RF13 - Vendita domicilio' },
  { code: 'RF14', label: 'RF14 - Rivendita beni usati, oggetti d’arte, antiquariato o da collezione' },
  { code: 'RF15', label: 'RF15 - Agenzie vendite all’asta di oggetti d’arte/antiquariato/collezione' },
  { code: 'RF16', label: 'RF16 - IVA per cassa P.A.' },
  { code: 'RF17', label: 'RF17 - IVA per cassa' },
  { code: 'RF18', label: 'RF18 - Altro' },
  { code: 'RF19', label: 'RF19 - Regime forfettario' },
  { code: 'RF20', label: 'RF20 - Regime transfrontaliero di franchigia IVA' },
]

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100)
const euros = (value: number) => Number((value / 100).toFixed(2))
const roundEuro = (value: number) => euros(cents(value))

export function formatItalianNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits, minimumFractionDigits: 2 }).format(value)
}

export function getFiscalRegimeLabel(code: string) {
  return FISCAL_REGIME_OPTIONS.find((option) => option.code === code)?.label || code
}

function calculateIrpef(income: number) {
  let tax = 0
  tax += Math.min(income, 28_000) * 0.23
  if (income > 28_000) tax += Math.min(income - 28_000, 22_000) * 0.33
  if (income > 50_000) tax += (income - 50_000) * 0.43
  return tax
}

function getActivities(profile: FiscalProfile): AtecoActivity[] {
  const configured = profile.attivitaAteco?.filter((activity) => activity.codice.trim())
  if (configured?.length) return configured
  if (profile.ateco) {
    return [{ codice: profile.ateco, coefficienteRedditivita: profile.coefficienteRedditivita ?? 78 }]
  }
  return []
}

function calculateSocialContributions(profile: FiscalProfile, grossIncome: number) {
  const scheme = profile.gestionePrevidenziale ?? 'nessuna'
  if (scheme === 'gestione_separata') {
    const rate = Math.max(0, profile.aliquotaGestioneSeparata ?? 26.07) / 100
    return { amount: roundEuro(grossIncome * rate), formula: `${formatItalianNumber(grossIncome)} × ${formatItalianNumber(rate * 100)}%` }
  }
  if (scheme === 'artigiani' || scheme === 'commercianti') {
    const fixed = Math.max(0, profile.contributoFissoAnnuale ?? 4_400)
    const minimum = Math.max(0, profile.redditoMinimaleInps ?? 18_555)
    const excessRate = Math.max(0, profile.aliquotaEccedenzaInps ?? 24) / 100
    const excess = Math.max(0, grossIncome - minimum) * excessRate
    return {
      amount: roundEuro(fixed + excess),
      formula: `${formatItalianNumber(fixed)} quota fissa + max(0; ${formatItalianNumber(grossIncome)} − ${formatItalianNumber(minimum)}) × ${formatItalianNumber(excessRate * 100)}%`,
    }
  }
  return { amount: 0, formula: 'Non configurati' }
}

export function buildTaxPreview(
  _transactions: LedgerTransaction[],
  accounting: { utile: number; ricavi: number; costi: number },
  vatBalances: { debito: number; credito: number },
  profile: FiscalProfile,
  _year: number,
  options: TaxCalculationOptions = {},
): TaxPreview {
  const costi = roundEuro(accounting.costi)
  const redditoContabile = roundEuro(Math.max(accounting.utile, 0))
  const regime = profile.regimeFiscale || 'RF01'
  const isFlat = regime === 'RF19'
  const isRF20 = regime === 'RF20'
  const activities = isFlat ? getActivities(profile) : []
  const warnings: string[] = []
  const breakdown: TaxBreakdownStep[] = []

  let redditoPerAteco: TaxPreview['redditoPerAteco'] = []
  let fatturato = roundEuro(accounting.ricavi)
  if (isFlat && activities.length) {
    const hasManualReceipts = options.ricaviPerAteco !== undefined
    redditoPerAteco = activities.map((activity) => {
      const coefficient = Math.max(0, Math.min(100, Number(activity.coefficienteRedditivita))) / 100
      const receipts = hasManualReceipts
        ? Math.max(0, Number(options.ricaviPerAteco?.[activity.codice] ?? 0))
        : activities.length === 1 ? fatturato : 0
      return {
        ...activity,
        ricavi: roundEuro(receipts),
        coefficienteRedditivita: coefficient * 100,
        reddito: roundEuro(receipts * coefficient),
      }
    })
    fatturato = hasManualReceipts
      ? roundEuro(redditoPerAteco.reduce((total, item) => total + item.ricavi, 0))
      : roundEuro(accounting.ricavi)
    if (!hasManualReceipts) {
      warnings.push(activities.length > 1
        ? 'Inserisci gli incassi annui per ciascun ATECO: il sistema non ripartisce i ricavi con una media arbitraria.'
        : 'I ricavi contabili sono usati solo come proxy degli incassi: inserisci gli incassi effettivamente ricevuti per applicare il principio di cassa.')
    }
    redditoPerAteco.forEach((item) => {
      breakdown.push({
        label: `Reddito lordo ATECO ${item.codice}`,
        formula: `${formatItalianNumber(item.ricavi)} × ${formatItalianNumber(item.coefficienteRedditivita)}%`,
        importo: item.reddito,
        spiegazioneSemplice: 'Gli incassi di questa attività sono moltiplicati per il suo coefficiente di redditività.',
      })
    })
  } else if (isFlat) {
    warnings.push('Codice ATECO mancante: inserisci il codice e il relativo coefficiente prima di usare questa stima.')
    redditoPerAteco = []
  }

  const redditoForfettario = isFlat
    ? roundEuro(redditoPerAteco.reduce((total, item) => total + item.reddito, 0))
    : 0
  const contributionResult = isFlat
    ? calculateSocialContributions(profile, redditoForfettario)
    : { amount: 0, formula: 'Non applicabile' }
  const imponibileForfettarioNetto = isFlat
    ? roundEuro(Math.max(0, redditoForfettario - contributionResult.amount))
    : 0
  const flatRate = isFlat
    ? Number(profile.aliquotaForfettario ?? (profile.nuovaAttivita ? 5 : 15))
    : 0
  const impostaSostitutiva = isFlat
    ? roundEuro(imponibileForfettarioNetto * flatRate / 100)
    : 0
  const saldoAnnoPrecedente = isFlat ? roundEuro(Math.max(0, profile.saldoAnnoPrecedente ?? 0)) : 0
  const primoAcconto = isFlat ? roundEuro(impostaSostitutiva * 0.4) : 0
  const secondoAcconto = isFlat ? roundEuro(impostaSostitutiva - primoAcconto) : 0

  if (isFlat) {
    breakdown.push({
      label: 'Reddito lordo complessivo',
      formula: redditoPerAteco.map((item) => formatItalianNumber(item.reddito)).join(' + ') || 'Nessun reddito ATECO calcolabile',
      importo: redditoForfettario,
      spiegazioneSemplice: 'Somma dei redditi calcolati separatamente per ogni codice ATECO.',
    })
    breakdown.push({
      label: 'Contributi previdenziali stimati',
      formula: contributionResult.formula,
      importo: contributionResult.amount,
      spiegazioneSemplice: 'Stima in base alla gestione INPS e alle aliquote configurate; i contributi riducono la base dell’imposta sostitutiva.',
    })
    breakdown.push({
      label: 'Imponibile netto',
      formula: `${formatItalianNumber(redditoForfettario)} − ${formatItalianNumber(contributionResult.amount)}`,
      importo: imponibileForfettarioNetto,
      spiegazioneSemplice: 'Reddito forfettario al netto dei contributi previdenziali stimati.',
    })
    breakdown.push({
      label: `Imposta sostitutiva (${formatItalianNumber(flatRate)}%)`,
      formula: `${formatItalianNumber(imponibileForfettarioNetto)} × ${formatItalianNumber(flatRate)}%`,
      importo: impostaSostitutiva,
      spiegazioneSemplice: 'Imposta calcolata sull’imponibile netto, con aliquota 5% o 15%.',
    })
    breakdown.push({
      label: 'Saldo anno precedente',
      formula: profile.saldoAnnoPrecedente === undefined
        ? 'Dato anno precedente non inserito'
        : `Importo inserito: ${formatItalianNumber(profile.saldoAnnoPrecedente)}`,
      importo: saldoAnnoPrecedente,
      spiegazioneSemplice: 'Il saldo dipende dalla dichiarazione dell’anno precedente; senza quel dato la stima è zero.',
    })
    breakdown.push({
      label: '1° acconto (stima 40%)',
      formula: `${formatItalianNumber(impostaSostitutiva)} × 40%`,
      importo: primoAcconto,
      spiegazioneSemplice: 'Prima quota stimata degli acconti, da verificare in dichiarazione.',
    })
    breakdown.push({
      label: '2° acconto (stima 60%)',
      formula: `${formatItalianNumber(impostaSostitutiva)} − ${formatItalianNumber(primoAcconto)}`,
      importo: secondoAcconto,
      spiegazioneSemplice: 'Seconda quota stimata degli acconti, da verificare in dichiarazione.',
    })
    if (profile.gestionePrevidenziale === undefined || profile.gestionePrevidenziale === 'nessuna') {
      warnings.push('Gestione previdenziale non configurata: i contributi stimati sono pari a zero.')
    }
    if (profile.saldoAnnoPrecedente === undefined) {
      warnings.push('Saldo fiscale dell’anno precedente non inserito: il relativo importo è escluso dalle scadenze.')
    }
    if (fatturato > 85_000) warnings.push('Ricavi oltre 85.000 euro: verifica l’uscita dal regime forfettario secondo le regole applicabili.')
    if (fatturato > 100_000) warnings.push('Ricavi oltre 100.000 euro: verifica l’uscita immediata dal regime forfettario.')
  }

  const irpef = !isFlat && profile.tipoSoggetto !== 'societa' ? roundEuro(calculateIrpef(redditoContabile)) : 0
  const ires = !isFlat && profile.tipoSoggetto === 'societa' ? roundEuro(redditoContabile * 0.24) : 0
  const irap = !isFlat && profile.tipoSoggetto === 'societa' ? roundEuro(redditoContabile * 0.039) : 0
  const addizionali = !isFlat && profile.tipoSoggetto === 'persona_fisica'
    ? roundEuro(redditoContabile * (((profile.addizionaleRegionale ?? 0) + (profile.addizionaleComunale ?? 0)) / 100))
    : 0
  const impostaMargineIndicativa = roundEuro(irpef + ires + irap + addizionali)
  if (!isFlat && regime !== 'RF20') {
    breakdown.push({
      label: 'Margine contabile positivo',
      formula: `Ricavi ${formatItalianNumber(accounting.ricavi)} − costi ${formatItalianNumber(costi)}`,
      importo: redditoContabile,
      spiegazioneSemplice: 'È una base gestionale semplificata, non la base imponibile fiscale definitiva.',
    })
    breakdown.push({
      label: 'Imposte indicative sul margine',
      formula: `IRPEF ${formatItalianNumber(irpef)} + IRES ${formatItalianNumber(ires)} + IRAP ${formatItalianNumber(irap)} + addizionali ${formatItalianNumber(addizionali)}`,
      importo: impostaMargineIndicativa,
      spiegazioneSemplice: 'Stima orientativa: deduzioni, detrazioni, basi imponibili e regole effettive possono cambiare il risultato.',
    })
  }

  const ivaDebito = roundEuro(vatBalances.debito)
  const ivaCredito = roundEuro(vatBalances.credito)
  const ivaNetta = roundEuro(ivaDebito - ivaCredito)
  const ivaPeriodi = options.ivaPeriodi ?? [{
    id: 'annual',
    label: 'Saldo IVA annuale dai saldi contabili',
    amount: ivaNetta,
  }]
  if (!isFlat && regime !== 'RF20') {
    breakdown.push({
      label: 'IVA netta stimata',
      formula: `${formatItalianNumber(ivaDebito)} IVA a debito − ${formatItalianNumber(ivaCredito)} IVA a credito`,
      importo: ivaNetta,
      spiegazioneSemplice: 'Differenza contabile indicativa; compensazioni e liquidazioni periodiche vanno verificate.',
    })
  }
  const bolliTrimestrali = [0, 1, 2, 3].map((index) => {
    const fatture = Math.max(0, Math.floor(options.fattureBolloPerTrimestre?.[index] ?? 0))
    return { trimestre: index + 1, fatture, importo: roundEuro(fatture * 2) }
  })
  const importoBolli = roundEuro(bolliTrimestrali.reduce((total, item) => total + item.importo, 0))
  if (importoBolli) {
    breakdown.push({
      label: 'Imposta di bollo fatture',
      formula: `${bolliTrimestrali.reduce((total, item) => total + item.fatture, 0)} fatture × 2,00 €`,
      importo: importoBolli,
      spiegazioneSemplice: 'Stima delle fatture esenti IVA sopra 77,47 euro rilevate per trimestre.',
    })
  }
  if (isRF20) warnings.push('RF20: verifica operazioni extra-UE, requisiti soglia UE e fatturazione senza IVA.')
  if (profile.tipoSoggetto === 'persona_fisica' && !isFlat && regime !== 'RF20') {
    warnings.push('Le imposte ordinarie sul margine sono indicative e non includono deduzioni, detrazioni o altre componenti personali.')
  }

  return {
    regime,
    regimeLabel: getFiscalRegimeLabel(regime),
    gestionePrevidenziale: profile.gestionePrevidenziale ?? 'nessuna',
    fatturato,
    costi,
    redditoContabile,
    redditoForfettario,
    coefficienteForfettario: redditoPerAteco.length === 1 ? redditoPerAteco[0].coefficienteRedditivita : 0,
    redditoPerAteco,
    contributiPrevidenziali: contributionResult.amount,
    imponibileForfettarioNetto,
    impostaSostitutiva,
    saldoAnnoPrecedente,
    primoAcconto,
    secondoAcconto,
    impostaMargineIndicativa,
    irpef,
    ires,
    irap,
    addizionali,
    ivaDebito,
    ivaCredito,
    ivaNetta,
    ivaPeriodi,
    bolliTrimestrali,
    importoBolli,
    sogliaForfettario: 85_000,
    sogliaSubimento: 100_000,
    uscitaForfettario: isFlat && fatturato > 85_000,
    uscitaImmediataForfettario: isFlat && fatturato > 100_000,
    breakdown,
    warnings,
  }
}
