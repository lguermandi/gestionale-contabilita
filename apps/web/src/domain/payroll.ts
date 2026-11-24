export type WorkerType = 'subordinate' | 'occasional' | 'sports'
export type SubordinateContract =
  | 'Indeterminato'
  | 'Determinato'
  | 'Determinated'
  | 'Apprendistato'
  | 'Apprenticeship'
  | 'apprenticeship'
export type TfrDestination = 'company' | 'pension_fund'
export type PayslipStatus = 'Bozza' | 'Emesso' | 'Contabilizzato' | 'Pagato'

export interface LeaveProgress {
  ap: number
  maturati: number
  goduti: number
}

export interface WorkerProfile {
  id: string
  workerType: WorkerType
  nome: string
  cognome: string
  codiceFiscale: string
  codiceDipendente?: string
  matricola?: string
  dataNascita?: string
  prossimoScatto?: string
  indirizzo?: string
  cap?: string
  comune?: string
  provincia?: string
  nomeBanca?: string
  abi?: string
  cab?: string
  contoCorrente?: string
  voceTariffaInail?: string
  iban?: string
  email?: string
  dataAssunzione?: string
  dataFineRapporto?: string
  ccnl?: string
  qualifica?: string
  livello?: string
  mansione?: string
  mensilita: 13 | 14
  contractType?: SubordinateContract

  ral?: number
  pagaBaseMensile?: number
  pagaBaseOraria?: number
  contingenza?: number
  scattiAnzianita?: number
  superminimo?: number
  oreSettimanaliContrattuali?: number
  maggiorazioneStraordinariPercent?: number

  aliquotaInpsDipendente?: number
  aliquotaInpsAzienda?: number
  aliquotaInailAzienda?: number
  aliquotaAddizionaleRegionale?: number
  aliquotaAddizionaleComunale?: number
  ritenutaAccontoPercent?: number
  aliquotaGestioneSeparata?: number
  aliquotaInpsSportivi?: number

  tfrDestination?: TfrDestination
  fondoPensioneNome?: string
  contributoPensioneDipendentePercent?: number
  contributoPensioneAziendaPercent?: number

  ferieAp?: number
  ferieMaturate?: number
  ferieGodute?: number
  rolAp?: number
  rolMaturati?: number
  rolGoduti?: number
  tfrProgressivo?: number
}

export interface AttendanceInput {
  oreOrdinarie?: number
  oreStraordinario?: number
  oreFestivita?: number
  oreFerie?: number
  oreRol?: number
  oreMalattia?: number
  ferieMaturate?: number
  rolMaturati?: number
  compensoLordo?: number
  note?: string
}

export interface IrpefBracket {
  finoA: number
  aliquota: number
}

export interface PayrollFiscalConfig {
  year: number
  irpefBrackets?: IrpefBracket[]
  detrazioneLavoroDipendente?: number
  detrazioneAnnuaLavoroDipendente?: number
  sogliaOccasionali?: number
  sogliaBollo?: number
  importoBollo?: number
  sogliaSportiviPrimoLivello?: number
  sogliaSportiviSecondoLivello?: number
  aliquotaGestioneSeparata?: number
  aliquotaInpsSports?: number
  aliquotaIrpefSports?: number
}

export interface PayslipProgressivi {
  ferie: LeaveProgress
  rol: LeaveProgress
  tfrAccantonato: number
  quotaMese: number
  fondoPensioneAccantonato: number
  fondoPensioneQuotaDipendente: number
  fondoPensioneQuotaAzienda: number
}

export interface PayslipResult {
  workerId: string
  workerType: WorkerType
  year: number
  month: number
  competenze: number
  retribuzioneFissa: number
  imponibileInps: number
  inpsDipendente: number
  inpsAzienda: number
  inailAzienda: number
  imponibileIrpef: number
  irpefLordo: number
  detrazioni: number
  irpefNetta: number
  addizionaleRegionale: number
  addizionaleComunale: number
  ritenutaAcconto: number
  marcaDaBollo: number
  tfrQuotaMese: number
  pensionFundWorkerContribution: number
  pensionFundEmployerContribution: number
  pensionFundTfrContribution: number
  netto: number
  arrotondamento: number
  costoAzienda: number
  progressivi: PayslipProgressivi
  annualCumulativeBefore: number
  annualCumulativeAfter: number
  inpsGestioneSeparata: number
  inpsGestioneSeparataDipendente: number
  inpsGestioneSeparataAzienda: number
  irpefSports: number
  details: {
    pagaBase: number
    contingenza: number
    scattiAnzianita: number
    superminimo: number
    straordinario: number
    festivita: number
    ferie: number
    rol: number
    malattia: number
  }
}

export interface PayslipCalculationOptions {
  fiscalConfig?: PayrollFiscalConfig
  annualCumulativeBefore?: number
  progressivi?: Partial<PayslipProgressivi>
  netRounding?: 'cent' | 'euro'
}

export const DEFAULT_PAYROLL_CONFIG: PayrollFiscalConfig = {
  year: 2026,
  irpefBrackets: [
    { finoA: 28_000, aliquota: 23 },
    { finoA: 50_000, aliquota: 35 },
    { finoA: Number.POSITIVE_INFINITY, aliquota: 43 },
  ],
  detrazioneAnnuaLavoroDipendente: 1_880,
  sogliaOccasionali: 5_000,
  sogliaBollo: 77.47,
  importoBollo: 2,
  sogliaSportiviPrimoLivello: 5_000,
  sogliaSportiviSecondoLivello: 15_000,
  aliquotaGestioneSeparata: 33.72,
  aliquotaInpsSports: 33.72,
  aliquotaIrpefSports: 20,
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100)
const euros = (value: number) => Number((value / 100).toFixed(2))
const roundEuro = (value: number) => euros(cents(value))
const maxZero = (value: number) => Math.max(0, roundEuro(value))
const roundNet = (value: number, mode: 'cent' | 'euro' = 'cent') => {
  const netto = mode === 'euro' ? Math.round(value) : roundEuro(value)
  return { netto, arrotondamento: roundEuro(netto - value) }
}

export function formatItalianNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  }).format(value)
}

export function calculateAnnualIrpef(taxableAnnualIncome: number, brackets: IrpefBracket[] = DEFAULT_PAYROLL_CONFIG.irpefBrackets ?? []) {
  let remaining = Math.max(0, taxableAnnualIncome)
  let previousLimit = 0
  let tax = 0
  for (const bracket of brackets) {
    const limit = Number.isFinite(bracket.finoA) ? bracket.finoA : remaining + previousLimit
    const span = Math.max(0, Math.min(remaining, limit - previousLimit))
    tax += span * Math.max(0, bracket.aliquota) / 100
    remaining -= span
    previousLimit = limit
    if (remaining <= 0) break
  }
  return roundEuro(tax)
}

function getHourlyBase(profile: WorkerProfile) {
  if (profile.pagaBaseOraria && profile.pagaBaseOraria > 0) return profile.pagaBaseOraria
  const monthly = profile.pagaBaseMensile ?? (profile.ral ? profile.ral / 12 : 0)
  const weeklyHours = profile.oreSettimanaliContrattuali ?? 40
  return monthly > 0 ? monthly / (weeklyHours * 52 / 12) : 0
}

export function calculatePayslip(
  profile: WorkerProfile,
  year: number,
  month: number,
  attendance: AttendanceInput = {},
  options: PayslipCalculationOptions = {},
): PayslipResult {
  const fiscalConfig = { ...DEFAULT_PAYROLL_CONFIG, ...options.fiscalConfig, year }
  const mensilita = profile.mensilita === 14 ? 14 : 13
  const pagaBase = roundEuro(profile.pagaBaseMensile ?? (profile.ral ? profile.ral / 12 : 0))
  const contingenza = roundEuro(profile.contingenza ?? 0)
  const scattiAnzianita = roundEuro(profile.scattiAnzianita ?? 0)
  const superminimo = roundEuro(profile.superminimo ?? 0)
  const retribuzioneFissa = roundEuro(pagaBase + contingenza + scattiAnzianita + superminimo)
  const hourlyBase = getHourlyBase(profile)
  const overtimeRate = 1 + (profile.maggiorazioneStraordinariPercent ?? 25) / 100

  if (profile.workerType === 'occasional') {
    const gross = roundEuro(attendance.compensoLordo ?? 0)
    const cumulativeBefore = maxZero(options.annualCumulativeBefore ?? 0)
    const threshold = fiscalConfig.sogliaOccasionali ?? 5_000
    const cumulativeAfter = roundEuro(cumulativeBefore + gross)
    const portionAboveThreshold = roundEuro(Math.max(0, cumulativeAfter - threshold))
    const gsRate = (fiscalConfig.aliquotaGestioneSeparata ?? 33.72) / 100
    const gsTotal = roundEuro(portionAboveThreshold * gsRate)
    const gsWorker = roundEuro(gsTotal / 3)
    const gsEmployer = roundEuro(gsTotal - gsWorker)
    const withholdingRate = (profile.ritenutaAccontoPercent ?? 20) / 100
    const ritenuta = roundEuro(gross * withholdingRate)
    const marca = gross > (fiscalConfig.sogliaBollo ?? 77.47) ? (fiscalConfig.importoBollo ?? 2) : 0
    const netResult = roundNet(gross - ritenuta - marca - gsWorker, options.netRounding)
    return buildBaseResult(profile, fiscalConfig.year, month, gross, gross, gross, netResult.netto, gross + gsEmployer + netResult.arrotondamento, {
      ritenutaAcconto: ritenuta,
      marcaDaBollo: marca,
      arrotondamento: netResult.arrotondamento,
      inpsGestioneSeparata: gsTotal,
      inpsGestioneSeparataDipendente: gsWorker,
      inpsGestioneSeparataAzienda: gsEmployer,
      annualCumulativeBefore: cumulativeBefore,
      annualCumulativeAfter: cumulativeAfter,
      retribuzioneFissa: 0,
      details: emptyDetails(),
      progressivi: emptyProgressivi(),
    })
  }

  if (profile.workerType === 'sports') {
    const gross = roundEuro(attendance.compensoLordo ?? 0)
    const cumulativeBefore = maxZero(options.annualCumulativeBefore ?? 0)
    const cumulativeAfter = roundEuro(cumulativeBefore + gross)
    const firstThreshold = fiscalConfig.sogliaSportiviPrimoLivello ?? 5_000
    const secondThreshold = fiscalConfig.sogliaSportiviSecondoLivello ?? 15_000
    let gsBase = 0
    let irpefSports = 0
    if (cumulativeBefore < secondThreshold) {
      gsBase = Math.max(0, Math.min(cumulativeAfter, secondThreshold) - Math.max(cumulativeBefore, firstThreshold))
      gsBase = Math.min(gsBase, gross)
    }
    if (cumulativeAfter > secondThreshold) {
      irpefSports = roundEuro(Math.max(0, cumulativeAfter - secondThreshold) * (fiscalConfig.aliquotaIrpefSports ?? 20) / 100)
    }
    const gsTotal = roundEuro(gsBase * 0.5 * (fiscalConfig.aliquotaInpsSports ?? 33.72) / 100)
    const gsWorker = roundEuro(gsTotal / 3)
    const gsEmployer = roundEuro(gsTotal - gsWorker)
    const ritenuta = gross > (fiscalConfig.sogliaBollo ?? 77.47) ? (fiscalConfig.importoBollo ?? 2) : 0
    const netResult = roundNet(gross - gsWorker - irpefSports - ritenuta, options.netRounding)
    return buildBaseResult(profile, fiscalConfig.year, month, gross, gross, gross, netResult.netto, gross + gsEmployer + netResult.arrotondamento, {
      marcaDaBollo: ritenuta,
      ritenutaAcconto: irpefSports,
      arrotondamento: netResult.arrotondamento,
      irpefSports,
      inpsGestioneSeparata: gsTotal,
      inpsGestioneSeparataDipendente: gsWorker,
      inpsGestioneSeparataAzienda: gsEmployer,
      annualCumulativeBefore: cumulativeBefore,
      annualCumulativeAfter: cumulativeAfter,
      retribuzioneFissa: 0,
      details: emptyDetails(),
      progressivi: emptyProgressivi(),
    })
  }

  const ordinaryHours = attendance.oreOrdinarie ?? 0
  const overtimeHours = attendance.oreStraordinario ?? 0
  const holidayHours = attendance.oreFestivita ?? 0
  const leaveHours = attendance.oreFerie ?? 0
  const rolHours = attendance.oreRol ?? 0
  const sicknessHours = attendance.oreMalattia ?? 0
  const overtime = overtimeHours * hourlyBase * overtimeRate
  const holidays = holidayHours * hourlyBase
  const leave = leaveHours * hourlyBase
  const rolAmount = rolHours * hourlyBase
  const sickness = sicknessHours * hourlyBase
  const regular = ordinaryHours > 0 ? ordinaryHours * hourlyBase : retribuzioneFissa
  const competenze = roundEuro(regular + overtime + holidays + leave + rolAmount + sickness)
  const imponibileInps = competenze
  const apprenticeshipContracts = new Set<SubordinateContract>(['Apprendistato', 'Apprenticeship', 'apprenticeship'])
  const inpsDipendenteRate = profile.contractType && apprenticeshipContracts.has(profile.contractType)
    ? 5.84
    : (profile.aliquotaInpsDipendente ?? 9.19)
  const inpsDipendente = roundEuro(imponibileInps * inpsDipendenteRate / 100)
  const inpsAzienda = roundEuro(imponibileInps * (profile.aliquotaInpsAzienda ?? 29) / 100)
  const inailAzienda = roundEuro(imponibileInps * (profile.aliquotaInailAzienda ?? 0) / 100)

  const monthlyGross = competenze
  const annualizedGross = roundEuro(monthlyGross * mensilita)
  const irpefLordo = calculateAnnualIrpef(annualizedGross, fiscalConfig.irpefBrackets)
  const detrazioneAnnua = fiscalConfig.detrazioneAnnuaLavoroDipendente ?? 1_880
  const detrazioni = roundEuro((fiscalConfig.detrazioneLavoroDipendente ?? detrazioneAnnua) / mensilita)
  const irpefNetta = maxZero(irpefLordo / mensilita - detrazioni)
  const addizionaleRegionale = roundEuro(imponibileInps * (profile.aliquotaAddizionaleRegionale ?? 0) / 100)
  const addizionaleComunale = roundEuro(imponibileInps * (profile.aliquotaAddizionaleComunale ?? 0) / 100)

  const retribuzioneUtileTfr = roundEuro(competenze)
  const tfrQuotaMese = roundEuro(retribuzioneUtileTfr / 13.5 - retribuzioneUtileTfr * 0.005)
  const tfrPrevious = roundEuro(options.progressivi?.tfrAccantonato ?? profile.tfrProgressivo ?? 0)
  const pensionFundWorker = profile.tfrDestination === 'pension_fund'
    ? roundEuro(competenze * (profile.contributoPensioneDipendentePercent ?? 0) / 100)
    : 0
  const pensionFundEmployer = profile.tfrDestination === 'pension_fund'
    ? roundEuro(competenze * (profile.contributoPensioneAziendaPercent ?? 0) / 100)
    : 0
  const pensionFundTfr = profile.tfrDestination === 'pension_fund' ? tfrQuotaMese : 0
  const netResult = roundNet(competenze - inpsDipendente - irpefNetta - addizionaleRegionale - addizionaleComunale - pensionFundWorker, options.netRounding)
  const netto = netResult.netto
  const tfrCompanyContribution = profile.tfrDestination === 'pension_fund' ? pensionFundTfr : tfrQuotaMese
  const costoAzienda = roundEuro(competenze + inpsAzienda + inailAzienda + pensionFundEmployer + tfrCompanyContribution + netResult.arrotondamento)

  const feriePrevious = options.progressivi?.ferie ?? {
    ap: profile.ferieAp ?? 0,
    maturati: profile.ferieMaturate ?? 0,
    goduti: profile.ferieGodute ?? 0,
  }
  const ferieMaturate = roundEuro((feriePrevious.maturati ?? 0) + (attendance.ferieMaturate ?? 0))
  const ferie = {
    ap: feriePrevious.ap,
    maturati: ferieMaturate,
    goduti: roundEuro((feriePrevious.goduti ?? 0) + (attendance.oreFerie ?? 0)),
  }
  const rolPrevious = options.progressivi?.rol ?? {
    ap: profile.rolAp ?? 0,
    maturati: profile.rolMaturati ?? 0,
    goduti: profile.rolGoduti ?? 0,
  }
  const rolProgress = {
    ap: rolPrevious.ap,
    maturati: roundEuro((rolPrevious.maturati ?? 0) + (attendance.rolMaturati ?? 0)),
    goduti: roundEuro((rolPrevious.goduti ?? 0) + (attendance.oreRol ?? 0)),
  }
  const progressivi: PayslipProgressivi = {
    ferie,
    rol: rolProgress,
    tfrAccantonato: roundEuro(tfrPrevious + (profile.tfrDestination === 'company' ? tfrQuotaMese : 0)),
    quotaMese: tfrQuotaMese,
    fondoPensioneAccantonato: roundEuro((options.progressivi?.fondoPensioneAccantonato ?? 0)
      + pensionFundTfr + pensionFundWorker + pensionFundEmployer),
    fondoPensioneQuotaDipendente: pensionFundWorker,
    fondoPensioneQuotaAzienda: pensionFundEmployer,
  }

  return buildBaseResult(profile, fiscalConfig.year, month, competenze, imponibileInps, competenze, netto, costoAzienda, {
    retribuzioneFissa,
    imponibileIrpef: competenze,
    inpsDipendente,
    inpsAzienda,
    inailAzienda,
    irpefLordo,
    detrazioni,
    irpefNetta,
    addizionaleRegionale,
    addizionaleComunale,
    tfrQuotaMese,
    pensionFundWorkerContribution: pensionFundWorker,
    pensionFundEmployerContribution: pensionFundEmployer,
    pensionFundTfrContribution: pensionFundTfr,
    arrotondamento: netResult.arrotondamento,
    progressivi,
    details: {
      pagaBase,
      contingenza,
      scattiAnzianita,
      superminimo,
      straordinario: roundEuro(overtime),
      festivita: roundEuro(holidays),
      ferie: roundEuro(leave),
      rol: roundEuro(rolAmount),
      malattia: roundEuro(sickness),
    },
  })
}

function emptyDetails(): PayslipResult['details'] {
  return { pagaBase: 0, contingenza: 0, scattiAnzianita: 0, superminimo: 0, straordinario: 0, festivita: 0, ferie: 0, rol: 0, malattia: 0 }
}

function emptyProgressivi(): PayslipProgressivi {
  return {
    ferie: { ap: 0, maturati: 0, goduti: 0 },
    rol: { ap: 0, maturati: 0, goduti: 0 },
    tfrAccantonato: 0,
    quotaMese: 0,
    fondoPensioneAccantonato: 0,
    fondoPensioneQuotaDipendente: 0,
    fondoPensioneQuotaAzienda: 0,
  }
}

function buildBaseResult(
  profile: WorkerProfile,
  year: number,
  month: number,
  competenze: number,
  imponibileInps: number,
  imponibileIrpef: number,
  netto: number,
  costoAzienda: number,
  overrides: Partial<PayslipResult>,
): PayslipResult {
  return {
    workerId: profile.id,
    workerType: profile.workerType,
    year,
    month,
    competenze,
    retribuzioneFissa: overrides.retribuzioneFissa ?? 0,
    imponibileInps,
    inpsDipendente: overrides.inpsDipendente ?? 0,
    inpsAzienda: overrides.inpsAzienda ?? 0,
    inailAzienda: overrides.inailAzienda ?? 0,
    imponibileIrpef,
    irpefLordo: overrides.irpefLordo ?? 0,
    detrazioni: overrides.detrazioni ?? 0,
    irpefNetta: overrides.irpefNetta ?? 0,
    addizionaleRegionale: overrides.addizionaleRegionale ?? 0,
    addizionaleComunale: overrides.addizionaleComunale ?? 0,
    ritenutaAcconto: overrides.ritenutaAcconto ?? 0,
    marcaDaBollo: overrides.marcaDaBollo ?? 0,
    tfrQuotaMese: overrides.tfrQuotaMese ?? 0,
    pensionFundWorkerContribution: overrides.pensionFundWorkerContribution ?? 0,
    pensionFundEmployerContribution: overrides.pensionFundEmployerContribution ?? 0,
    pensionFundTfrContribution: overrides.pensionFundTfrContribution ?? 0,
    netto,
    arrotondamento: overrides.arrotondamento ?? 0,
    costoAzienda,
    progressivi: overrides.progressivi ?? emptyProgressivi(),
    annualCumulativeBefore: overrides.annualCumulativeBefore ?? 0,
    annualCumulativeAfter: overrides.annualCumulativeAfter ?? 0,
    inpsGestioneSeparata: overrides.inpsGestioneSeparata ?? 0,
    inpsGestioneSeparataDipendente: overrides.inpsGestioneSeparataDipendente ?? 0,
    inpsGestioneSeparataAzienda: overrides.inpsGestioneSeparataAzienda ?? 0,
    irpefSports: overrides.irpefSports ?? 0,
    details: overrides.details ?? emptyDetails(),
  }
}
