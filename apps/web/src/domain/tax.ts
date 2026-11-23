import type { LedgerTransaction } from './accounting'

export type FiscalEntityType = 'persona_fisica' | 'societa' | 'ente'

export interface FiscalProfile {
  regimeFiscale?: string
  tipoSoggetto?: FiscalEntityType
  ateco?: string
  coefficienteRedditivita?: number
  aliquotaForfettario?: number
  nuovaAttivita?: boolean
  annoInizioAttivita?: number
  periodoIva?: 'mensile' | 'trimestrale'
  addizionaleRegionale?: number
  addizionaleComunale?: number
}

export interface TaxPreview {
  regime: string
  regimeLabel: string
  fatturato: number
  costi: number
  redditoContabile: number
  redditoForfettario: number
  coefficienteForfettario: number
  impostaSostitutiva: number
  irpef: number
  ires: number
  irap: number
  addizionali: number
  ivaDebito: number
  ivaCredito: number
  ivaNetta: number
  sogliaForfettario: number
  sogliaSubimento: number
  uscitaForfettario: boolean
  uscitaImmediataForfettario: boolean
  warnings: string[]
}

export const FISCAL_REGIME_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'RF01', label: 'RF01 - Ordinario' },
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

export function buildTaxPreview(
  _transactions: LedgerTransaction[],
  accounting: { utile: number; ricavi: number; costi: number },
  vatBalances: { debito: number; credito: number },
  profile: FiscalProfile,
  _year: number,
): TaxPreview {

  const revenueCents = cents(accounting.ricavi)
  const costsCents = cents(accounting.costi)
  const fatturato = euros(revenueCents)
  const costi = euros(costsCents)
  const redditoContabile = euros(cents(Math.max(accounting.utile, 0)))
  const regime = profile.regimeFiscale || 'RF01'
  const isFlat = regime === 'RF19'
  const isRF20 = regime === 'RF20'
  const coefficient = isFlat
    ? Math.max(0, Math.min(100, Number(profile.coefficienteRedditivita ?? 78))) / 100
    : 0
  const redditoForfettario = isFlat ? fatturato * coefficient : 0
  const flatRate = isFlat
    ? profile.aliquotaForfettario ?? (profile.nuovaAttivita ? 5 : 15)
    : 0
  const impostaSostitutiva = redditoForfettario * flatRate / 100
  const irpef = !isFlat && profile.tipoSoggetto !== 'societa' ? calculateIrpef(redditoContabile) : 0
  const ires = !isFlat && profile.tipoSoggetto === 'societa' ? redditoContabile * 0.24 : 0
  const irap = !isFlat && profile.tipoSoggetto === 'societa' ? redditoContabile * 0.039 : 0
  const addizionali = !isFlat && profile.tipoSoggetto === 'persona_fisica'
    ? redditoContabile * (((profile.addizionaleRegionale ?? 0) + (profile.addizionaleComunale ?? 0)) / 100)
    : 0
  const ivaNetta = cents(vatBalances.debito - vatBalances.credito)
  const warnings: string[] = []
  if (isFlat) {
    if (fatturato > 85_000) warnings.push('Il limite ordinario di permanenza nel regime forfettario (85.000 euro) risulta superato nei dati periodici disponibili.')
    if (fatturato > 100_000) warnings.push('Soglia critica: oltre 100.000 euro il regime forfettario può cessare immediatamente.')
  }
  if (isRF20) warnings.push('RF20: verifica operazioni extra-UE, requisiti soglia UE e fatturazione senza IVA.')
  if (!profile.ateco) warnings.push('Codice ATECO mancante: il coefficiente di redditività forfettario deve essere verificato.')

  return {
    regime,
    regimeLabel: getFiscalRegimeLabel(regime),
    fatturato,
    costi,
    redditoContabile,
    redditoForfettario,
    coefficienteForfettario: coefficient * 100,
    impostaSostitutiva,
    irpef,
    ires,
    irap,
    addizionali,
    ivaDebito: euros(cents(vatBalances.debito)),
    ivaCredito: euros(cents(vatBalances.credito)),
    ivaNetta: euros(ivaNetta),
    sogliaForfettario: 85_000,
    sogliaSubimento: 100_000,
    uscitaForfettario: isFlat && fatturato > 85_000,
    uscitaImmediataForfettario: isFlat && fatturato > 100_000,
    warnings,
  }
}
