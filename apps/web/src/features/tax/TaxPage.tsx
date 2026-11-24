import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  fetchInvoices,
  getTaxNotificationSettings,
  saveTaxNotificationSettings,
  saveTransaction,
  sendTaxNotificationTest,
  type TaxNotificationSettings,
} from '../../api/ledgerApi'
import { buildAccountingReportsForYear, type LedgerTransaction } from '../../domain/accounting'
import type { IssuedInvoice } from '../../domain/invoicing'
import { buildTaxPreview, formatItalianNumber } from '../../domain/tax'
import { useEntityStore } from '../../stores/entityStore'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'
import { buildTaxCalendar, type ManualTaxDeadline, type TaxDeadline } from './taxCalendar'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const inputClass = 'mt-1 min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'

interface LocalTaxData {
  paidIds: string[]
  manualDeadlines: ManualTaxDeadline[]
  ricaviPerAteco: Record<string, number>
}

const emptyLocalTaxData: LocalTaxData = { paidIds: [], manualDeadlines: [], ricaviPerAteco: {} }
const defaultNotificationSettings: TaxNotificationSettings = { email: '', daysBefore: 14, enabled: false }

function todayString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `tax-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readLocalTaxData(key: string) {
  try {
    const serialized = window.localStorage.getItem(key)
    if (!serialized) return { data: emptyLocalTaxData, error: '' }
    const parsed = JSON.parse(serialized) as Partial<LocalTaxData>
    return {
      data: {
        paidIds: Array.isArray(parsed.paidIds) ? parsed.paidIds.filter((id): id is string => typeof id === 'string') : [],
        manualDeadlines: Array.isArray(parsed.manualDeadlines) ? parsed.manualDeadlines : [],
        ricaviPerAteco: parsed.ricaviPerAteco && typeof parsed.ricaviPerAteco === 'object' ? parsed.ricaviPerAteco : {},
      },
      error: '',
    }
  } catch (error) {
    return {
      data: emptyLocalTaxData,
      error: error instanceof Error ? `I dati fiscali locali non sono leggibili: ${error.message}` : 'I dati fiscali locali non sono leggibili.',
    }
  }
}

function findAccountBalance(accounts: Array<{ conto: string; saldo: number }>, names: string[]) {
  const wanted = names.map((name) => name.toLocaleLowerCase('it')).filter(Boolean)
  return accounts
    .filter((account) => wanted.some((name) => account.conto.toLocaleLowerCase('it').includes(name)))
    .reduce((total, account) => total + account.saldo, 0)
}

function buildVatPeriodEstimates(
  transactions: LedgerTransaction[],
  year: number,
  periodicity: 'mensile' | 'trimestrale',
  vatDebitAccounts: string[],
  vatCreditAccounts: string[],
) {
  const periods = periodicity === 'mensile'
    ? Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0')
      return { id: `m${month}`, label: `Mese ${month}`, debit: 0, credit: 0 }
    })
    : Array.from({ length: 4 }, (_, index) => ({ id: `q${index + 1}`, label: `${index + 1}° trimestre`, debit: 0, credit: 0 }))
  const debitNames = vatDebitAccounts.map((name) => name.toLocaleLowerCase('it')).filter(Boolean)
  const creditNames = vatCreditAccounts.map((name) => name.toLocaleLowerCase('it')).filter(Boolean)

  transactions.forEach((transaction) => {
    if (Number(transaction.data.slice(0, 4)) !== year) return
    const month = Number(transaction.data.slice(5, 7))
    if (month < 1 || month > 12) return
    const period = periods[periodicity === 'mensile' ? month - 1 : Math.floor((month - 1) / 3)]
    transaction.movimenti.forEach((movement) => {
      const account = movement.conto.toLocaleLowerCase('it')
      if (debitNames.some((name) => account.includes(name))) period.debit += movement.avere - movement.dare
      if (creditNames.some((name) => account.includes(name))) period.credit += movement.dare - movement.avere
    })
  })

  return periods.map((period) => ({
    id: period.id,
    label: period.label,
    amount: Number((period.debit - period.credit).toFixed(2)),
  }))
}

function countStampDutyInvoices(invoices: IssuedInvoice[]) {
  const counts = [0, 0, 0, 0]
  invoices.forEach((invoice) => {
    if (invoice.totali.iva === 0 && invoice.totali.imponibile > 77.47) {
      const month = Number(invoice.data.slice(5, 7))
      if (month >= 1 && month <= 12) counts[Math.floor((month - 1) / 3)] += 1
    }
  })
  return counts
}

function makeNotificationDeadline(deadline: TaxDeadline, paidIds: string[]) {
  return {
    id: deadline.id,
    calendarYear: Number(deadline.id.slice(0, 4)) || Number(deadline.date.slice(0, 4)),
    kind: deadline.kind,
    date: deadline.date,
    title: deadline.title,
    description: deadline.description,
    amount: deadline.amount,
    paid: deadline.paid || paidIds.includes(deadline.id),
    f24: deadline.f24,
  }
}

function mergeRemoteTaxData(current: LocalTaxData, remoteDeadlines: Array<{
  id: string
  calendarYear: number
  date: string
  title: string
  description: string
  amount: number
  kind?: TaxDeadline['kind']
  paid?: boolean
  f24: TaxDeadline['f24']
}>, year: number): LocalTaxData {
  const matchingDeadlines = remoteDeadlines.filter((deadline) => deadline.calendarYear === year)
  const manualById = new Map(current.manualDeadlines.map((deadline) => [deadline.id, deadline]))
  matchingDeadlines.filter((deadline) => deadline.kind === 'personal').forEach((deadline) => {
    if (!manualById.has(deadline.id)) {
      manualById.set(deadline.id, {
        id: deadline.id,
        date: deadline.date,
        title: deadline.title,
        description: deadline.description,
        amount: deadline.amount,
        kind: 'personal',
        f24: deadline.f24,
      })
    }
  })
  return {
    ...current,
    paidIds: [...new Set([...current.paidIds, ...matchingDeadlines.filter((deadline) => deadline.paid).map((deadline) => deadline.id)])],
    manualDeadlines: [...manualById.values()],
  }
}

export function TaxPage() {
  const year = useLedgerStore((state) => state.selectedYear)
  const entityId = useEntityStore((state) => state.activeEntityId)
  const spreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const storageScope = `tax-deadlines:${entityId || spreadsheetId || 'no-entity'}:${year}`
  return <TaxPageContent key={storageScope} year={year} localStorageKey={storageScope} />
}

function TaxPageContent({ year, localStorageKey }: { year: number; localStorageKey: string }) {
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const refresh = useLedgerStore((state) => state.refresh)
  const profile = useProfileStore((state) => state.companyProfile)
  const token = useGasSessionStore((state) => state.token)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const spreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const entityId = useEntityStore((state) => state.activeEntityId)
  const entity = useEntityStore((state) => state.entities.find((item) => item.id === state.activeEntityId))
  const isPrivate = entity?.tipologia !== 'Azienda'
  const [initialLocalData] = useState(() => readLocalTaxData(localStorageKey))
  const [localData, setLocalData] = useState<LocalTaxData>(initialLocalData.data)
  const [storageError, setStorageError] = useState(initialLocalData.error)
  const [showPast, setShowPast] = useState(false)
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([])
  const [invoiceScope, setInvoiceScope] = useState('')
  const [previousYearInvoices, setPreviousYearInvoices] = useState<IssuedInvoice[]>([])
  const [previousInvoiceScope, setPreviousInvoiceScope] = useState('')
  const [invoiceError, setInvoiceError] = useState('')
  const [invoiceErrorScope, setInvoiceErrorScope] = useState('')
  const [notificationSettings, setNotificationSettings] = useState<TaxNotificationSettings>(defaultNotificationSettings)
  const [notificationLoadedScope, setNotificationLoadedScope] = useState('')
  const [notificationMessage, setNotificationMessage] = useState('')
  const [notificationError, setNotificationError] = useState('')
  const [notificationErrorScope, setNotificationErrorScope] = useState('')
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [payingDeadlineId, setPayingDeadlineId] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualDate, setManualDate] = useState(`${year}-12-31`)
  const [manualAmount, setManualAmount] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualF24Code, setManualF24Code] = useState('')
  const [manualF24Section, setManualF24Section] = useState<'Erario' | 'INPS'>('Erario')

  const allTransactions = useMemo(
    () => [...historyTransactions, ...transactions],
    [historyTransactions, transactions],
  )
  const reports = useMemo(() => buildAccountingReportsForYear(allTransactions, year), [allTransactions, year])
  const vatDebit = findAccountBalance(reports.saldi, [profile.conti.iva ?? '', 'IVA a debito'])
  const vatCredit = findAccountBalance(reports.saldi, [profile.conti.ivaCredito ?? '', 'IVA a credito'])
  const vatNet = vatDebit - vatCredit
  const vatPeriods = useMemo(() => buildVatPeriodEstimates(
    transactions,
    year,
    profile.periodoIva ?? 'trimestrale',
    [profile.conti.iva ?? '', 'IVA a debito'],
    [profile.conti.ivaCredito ?? '', 'IVA a credito'],
  ), [profile.conti.iva, profile.conti.ivaCredito, profile.periodoIva, transactions, year])
  const currentInvoices = useMemo(
    () => invoiceScope === `${year}:${spreadsheetId}:${token}` ? invoices : [],
    [invoiceScope, invoices, spreadsheetId, token, year],
  )
  const calendarInvoices = useMemo(() => [
    ...new Map([
      ...(previousInvoiceScope === `${year - 1}:${spreadsheetId}:${token}` ? previousYearInvoices : []),
      ...currentInvoices,
    ].map((invoice) => [invoice.id, invoice])).values(),
  ], [currentInvoices, previousInvoiceScope, previousYearInvoices, spreadsheetId, token, year])
  const issuedInvoicesThisYear = useMemo(
    () => currentInvoices.filter((invoice) => invoice.data.slice(0, 4) === String(year)),
    [currentInvoices, year],
  )
  const stampDutyCounts = useMemo(() => countStampDutyInvoices(issuedInvoicesThisYear), [issuedInvoicesThisYear])
  const taxPreview = useMemo(() => buildTaxPreview(
    allTransactions,
    reports.contoEconomico,
    { debito: Math.max(vatNet, 0), credito: Math.max(-vatNet, 0) },
    profile,
    year,
    {
      invoices: invoiceScope === `${year}:${spreadsheetId}:${token}` ? currentInvoices : undefined,
      fattureBolloPerTrimestre: stampDutyCounts,
      ivaPeriodi: vatPeriods,
    },
  ), [allTransactions, currentInvoices, invoiceScope, profile, reports.contoEconomico, stampDutyCounts, spreadsheetId, token, vatNet, vatPeriods, year])
  const calendar = useMemo(() => buildTaxCalendar(year, profile.regimeFiscale, profile.periodoIva, {
    preview: taxPreview,
    manualDeadlines: localData.manualDeadlines,
    reverseChargeInvoices: calendarInvoices,
    includeBusinessDeadlines: !isPrivate,
  }).map((deadline) => ({ ...deadline, paid: localData.paidIds.includes(deadline.id) })), [
    calendarInvoices, isPrivate, localData.manualDeadlines, localData.paidIds, profile.periodoIva, profile.regimeFiscale, taxPreview, year,
  ])
  const today = todayString()
  const upcoming = calendar.filter((deadline) => !deadline.paid && deadline.date >= today)
  const nextDeadline = upcoming[0]
  const totalToSetAside = upcoming.reduce((total, deadline) => total + Math.max(0, deadline.amount), 0)
  const thresholdProgress = Math.min(100, taxPreview.fatturato / taxPreview.sogliaForfettario * 100)
  const notificationScope = `${token}:${spreadsheetId}:${entityId}:${year}`
  const currentInvoiceError = invoiceErrorScope === `${year}:${spreadsheetId}:${token}` ? invoiceError : ''
  const currentNotificationSettings = notificationLoadedScope === notificationScope
    ? notificationSettings
    : defaultNotificationSettings
  const currentNotificationError = notificationErrorScope === notificationScope ? notificationError : ''

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let active = true
    const scope = `${year}:${spreadsheetId}:${token}`
    void Promise.allSettled([
      fetchInvoices(year, token, spreadsheetId),
      fetchInvoices(year - 1, token, spreadsheetId),
    ]).then(([currentResult, previousResult]) => {
      if (!active) return
      if (currentResult.status === 'fulfilled') {
        setInvoices(currentResult.value)
        setInvoiceScope(scope)
      }
      if (previousResult.status === 'fulfilled') {
        setPreviousYearInvoices(previousResult.value)
        setPreviousInvoiceScope(`${year - 1}:${spreadsheetId}:${token}`)
      }
      const failures = [currentResult, previousResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (!failures.length) {
        setInvoiceError('')
        setInvoiceErrorScope('')
        return
      }
      const message = failures.map(({ reason }) => reason instanceof Error ? reason.message : String(reason)).join(' ')
      setInvoiceError(`Impossibile leggere tutte le fatture per i bolli e le scadenze IVA delle autofatture. ${message}`)
      setInvoiceErrorScope(scope)
      if (message.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { active = false }
  }, [clearToken, spreadsheetId, token, year])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let active = true
    const scope = `${token}:${spreadsheetId}:${entityId}:${year}`
    void getTaxNotificationSettings(token, spreadsheetId).then((result) => {
      if (!active) return
      setNotificationSettings(result.settings)
      setNotificationLoadedScope(scope)
      setNotificationError('')
      setNotificationErrorScope('')
      setLocalData((current) => mergeRemoteTaxData(current, result.deadlines, year))
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Impossibile leggere le preferenze email.'
      setNotificationError(message)
      setNotificationErrorScope(scope)
      if (message.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { active = false }
  }, [clearToken, entityId, spreadsheetId, token, year])

  async function persistNotifications(deadlines: TaxDeadline[], settings = notificationSettings) {
    if (!token || !spreadsheetId || !entityId) {
      setNotificationError('Accedi e seleziona un’entità per salvare le notifiche.')
      return false
    }
    setNotificationBusy(true)
    setNotificationError('')
    setNotificationErrorScope(notificationScope)
    setNotificationMessage('')
    try {
      await saveTaxNotificationSettings(
        token,
        spreadsheetId,
        entityId,
        entity?.nomeEntita || 'Entità contabile',
        year,
        settings,
        deadlines.map((deadline) => makeNotificationDeadline(deadline, localData.paidIds)),
      )
      setNotificationLoadedScope(notificationScope)
      setNotificationMessage('Preferenze e scadenze email salvate.')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossibile salvare le notifiche email.'
      setNotificationError(message)
      if (message.includes('SESSION_EXPIRED')) clearToken()
      return false
    } finally {
      setNotificationBusy(false)
    }
  }

  function updateLocalData(updater: (current: LocalTaxData) => LocalTaxData) {
    const updated = updater(localData)
    setLocalData(updated)
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(updated))
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Impossibile salvare i dati fiscali locali.')
    }
  }

  function addManualDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(manualAmount || 0)
    const deadline: ManualTaxDeadline = {
      id: createId(),
      date: manualDate,
      title: manualTitle.trim(),
      description: manualDescription.trim() || 'Scadenza personale inserita manualmente.',
      amount,
      f24: manualF24Code.trim() ? [{
        section: manualF24Section,
        code: manualF24Code.trim(),
        year: Number(manualDate.slice(0, 4)),
        amount,
      }] : [],
    }
    updateLocalData((current) => ({ ...current, manualDeadlines: [...current.manualDeadlines, deadline] }))
    setManualTitle('')
    setManualAmount('')
    setManualDescription('')
    setManualF24Code('')
  }

  async function copyF24(deadline: TaxDeadline) {
    const text = deadline.f24.map((field) =>
      [field.section, field.code, field.year, formatItalianNumber(field.amount)].join('\t'),
    ).join('\n')
    if (!text) {
      setCopyMessage('Non sono disponibili dati F24 da copiare per questa scadenza.')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage('Dati F24 copiati.')
    } catch (error) {
      setCopyMessage(error instanceof Error ? `Copia non riuscita: ${error.message}` : 'Copia negli appunti non riuscita.')
    }
  }

  async function markAsPaid(deadline: TaxDeadline, recordMovement: boolean) {
    if (payingDeadlineId) return
    setPayingDeadlineId(deadline.id)
    setActionError('')
    setActionMessage('')
    if (recordMovement && deadline.amount > 0) {
      if (!token || !spreadsheetId) {
        setActionError('Accedi a GAS per registrare il pagamento in Partita Doppia.')
        setPayingDeadlineId('')
        return
      }
      const date = todayString()
      const account = isPrivate
        ? 'Spese tributarie personali'
        : deadline.kind === 'inps'
          ? 'Debiti v/INPS e istituti previdenziali'
          : deadline.kind === 'bollo'
            ? profile.conti.bollo || 'Debiti per imposta di bollo'
            : 'Debiti per imposte correnti'
      const transaction: LedgerTransaction = {
        id: createId(),
        data: date,
        totale: deadline.amount,
        movimenti: [
          { conto: account, descrizione: `Pagamento: ${deadline.title}`, gestione: isPrivate ? 'Personale' : '', dare: deadline.amount, avere: 0 },
          { conto: profile.conti.incassi || 'Banca c/c', descrizione: `Pagamento: ${deadline.title}`, gestione: '', dare: 0, avere: deadline.amount },
        ],
      }
      try {
        await saveTransaction(token, transaction, isPrivate ? 'private' : 'business', spreadsheetId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Impossibile registrare il pagamento.'
        setActionError(message)
        if (message.includes('SESSION_EXPIRED')) clearToken()
        setPayingDeadlineId('')
        return
      }
    }
    const nextPaidIds = [...new Set([...localData.paidIds, deadline.id])]
    updateLocalData((current) => ({ ...current, paidIds: nextPaidIds }))
    setActionMessage(recordMovement && deadline.amount > 0
      ? 'Scadenza segnata come pagata e movimento registrato.'
      : 'Scadenza segnata come pagata.')
    const updatedDeadlines = calendar.map((item) => item.id === deadline.id ? { ...item, paid: true } : item)
    if (token && spreadsheetId && entityId && notificationLoadedScope === notificationScope) {
      await persistNotifications(updatedDeadlines, notificationSettings)
    }
    if (recordMovement && year === new Date().getFullYear()) {
      void refresh(year, token, isPrivate ? 'private' : 'business', spreadsheetId)
    }
    setPayingDeadlineId('')
  }

  async function sendTestEmail() {
    if (!token || !spreadsheetId) {
      setNotificationError('Accedi a GAS e seleziona un’entità per inviare il test.')
      return
    }
    setNotificationBusy(true)
    setNotificationError('')
    setNotificationErrorScope(notificationScope)
    setNotificationMessage('')
    try {
      await sendTaxNotificationTest(token, spreadsheetId, entity?.nomeEntita || 'Entità contabile', currentNotificationSettings)
      setNotificationMessage(`Email di test inviata a ${currentNotificationSettings.email}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invio dell’email di test non riuscito.'
      setNotificationError(message)
      if (message.includes('SESSION_EXPIRED')) clearToken()
    } finally {
      setNotificationBusy(false)
    }
  }

  const visibleDeadlines = calendar.filter((deadline) => showPast || deadline.date >= today)
  const activities = profile.attivitaAteco?.length
    ? profile.attivitaAteco
    : profile.ateco
      ? [{ codice: profile.ateco, coefficienteRedditivita: profile.coefficienteRedditivita ?? 78 }]
      : []
  const selectedDeadlineCount = upcoming.length

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <header className="mb-6 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">Area fiscale · {year}</p>
        <h1 className="text-2xl font-semibold text-stone-950">Tasse e scadenze</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Una guida pratica per capire cosa accantonare, cosa pagare e quali dati preparare. Gli importi sono stime basate sui dati registrati.
        </p>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-950">Da accantonare per le prossime scadenze</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-950">{euro.format(totalToSetAside)}</p>
          <p className="mt-2 text-xs text-emerald-800">{selectedDeadlineCount} scadenze future non ancora segnate come pagate</p>
        </article>
        <article className="border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">Prossima scadenza</p>
          <p className="mt-3 text-lg font-semibold text-stone-950">{nextDeadline?.title || 'Nessuna scadenza imminente'}</p>
          {nextDeadline && <p className="mt-2 text-sm text-stone-600">{new Date(`${nextDeadline.date}T12:00:00`).toLocaleDateString('it-IT')} · {euro.format(nextDeadline.amount)}</p>}
        </article>
        {profile.regimeFiscale === 'RF19' && !isPrivate && (
          <article className="border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-stone-600">Soglia ricavi forfettario</p>
              <p className="text-sm font-semibold text-stone-900">{euro.format(taxPreview.fatturato)} / {euro.format(taxPreview.sogliaForfettario)}</p>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-label="Avanzamento verso la soglia forfettaria" aria-valuenow={Math.min(100, thresholdProgress)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full ${thresholdProgress >= 100 ? 'bg-rose-600' : 'bg-emerald-700'}`} style={{ width: `${thresholdProgress}%` }} />
            </div>
            <p className="mt-2 text-xs text-stone-500">{thresholdProgress.toFixed(1)}% della soglia di permanenza; verifica l’uscita immediata oltre 100.000 €.</p>
          </article>
        )}
      </section>

      {!isPrivate && (
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-600">Ricavi registrati</p>
            <p className="mt-3 text-xl font-semibold text-stone-950">{euro.format(taxPreview.fatturato)}</p>
            <p className="mt-2 text-xs text-stone-500">{taxPreview.regimeLabel}</p>
          </article>
          <article className="border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-600">{profile.regimeFiscale === 'RF19' ? 'Imposta sostitutiva stimata' : 'Imposte indicative sul margine'}</p>
            <p className="mt-3 text-xl font-semibold text-stone-950">{euro.format(profile.regimeFiscale === 'RF19' ? taxPreview.impostaSostitutiva : taxPreview.impostaMargineIndicativa)}</p>
            <p className="mt-2 text-xs text-stone-500">{profile.regimeFiscale === 'RF19' ? `Imponibile netto ${euro.format(taxPreview.imponibileForfettarioNetto)}` : 'Stima gestionale, non dichiarativa'}</p>
          </article>
          <article className="border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-600">Contributi INPS stimati</p>
            <p className="mt-3 text-xl font-semibold text-stone-950">{euro.format(taxPreview.contributiPrevidenziali)}</p>
            <p className="mt-2 text-xs text-stone-500">{profile.gestionePrevidenziale || 'Gestione non configurata'}</p>
          </article>
          <article className="border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-600">IVA netta / credito</p>
            <p className="mt-3 text-xl font-semibold text-stone-950">{euro.format(taxPreview.ivaNetta)}</p>
            <p className="mt-2 text-xs text-stone-500">A debito {euro.format(taxPreview.ivaDebito)} · a credito {euro.format(taxPreview.ivaCredito)}</p>
          </article>
        </section>
      )}

      {profile.regimeFiscale === 'RF19' && !isPrivate && activities.length > 0 && (
        <section className="mb-6 border border-stone-200 bg-white p-5">
          <h2 className="font-semibold text-stone-950">Incassi annui per codice ATECO</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Importi calcolati dai pagamenti effettivamente registrati nell’anno, ripartiti per ATECO in base alle righe delle fatture. Le fatture non incassate e le fatture legacy senza date di pagamento non sono conteggiate.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activities.map((activity) => (
              <article key={activity.codice} className="border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <p>ATECO {activity.codice} · coefficiente {activity.coefficienteRedditivita}%</p>
                <p className="mt-1 font-semibold tabular-nums">{euro.format(taxPreview.redditoPerAteco.find((item) => item.codice === activity.codice)?.ricavi || 0)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {taxPreview.warnings.length > 0 && !isPrivate && (
        <section className="mb-6 border border-amber-300 bg-amber-50 p-5" role="status">
          <h2 className="font-semibold text-amber-950">Dati da controllare</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
            {taxPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}

      {currentInvoiceError && <p className="mb-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">Stima bolli non aggiornata: {currentInvoiceError}</p>}
      {storageError && <p className="mb-4 border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900" role="alert">{storageError}</p>}

      {isPrivate && (
        <section className="mb-6 border border-stone-200 bg-white p-5">
          <h2 className="font-semibold text-stone-950">Le tue scadenze personali</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Aggiungi promemoria come TARI, IMU, bollo auto o imposta di bollo sui depositi. I promemoria manuali sono memorizzati su questo dispositivo.</p>
          <form onSubmit={addManualDeadline} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-stone-700">Nome scadenza
              <input className={inputClass} required maxLength={120} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
            </label>
            <label className="block text-sm text-stone-700">Data
              <input className={inputClass} type="date" required value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
            </label>
            <label className="block text-sm text-stone-700">Importo (€)
              <input className={inputClass} type="number" min="0" step="0.01" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} />
            </label>
            <label className="block text-sm text-stone-700">Codice F24 (facoltativo)
              <input className={inputClass} maxLength={20} value={manualF24Code} onChange={(event) => setManualF24Code(event.target.value)} />
            </label>
            {manualF24Code && (
              <label className="block text-sm text-stone-700">Sezione F24
                <select className={inputClass} value={manualF24Section} onChange={(event) => setManualF24Section(event.target.value as 'Erario' | 'INPS')}>
                  <option value="Erario">Erario</option>
                  <option value="INPS">INPS</option>
                </select>
              </label>
            )}
            <label className="block text-sm text-stone-700 sm:col-span-2">Nota o istruzioni
              <input className={inputClass} maxLength={250} value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} />
            </label>
            <button type="submit" className="min-h-10 justify-self-start bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-700">Aggiungi promemoria</button>
          </form>
        </section>
      )}

      <section className="mb-6 border border-stone-200 bg-white p-5">
          <h2 className="font-semibold text-stone-950">Promemoria email</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">Ricevi un’email prima delle scadenze non pagate. L’invio automatico parte solo se lo attivi e installi il trigger Apps Script.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <label className="block text-sm text-stone-700">Email destinatario
              <input className={inputClass} type="email" value={currentNotificationSettings.email} disabled={notificationLoadedScope !== notificationScope}
                onChange={(event) => setNotificationSettings((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="block text-sm text-stone-700">Giorni di anticipo
              <input className={inputClass} type="number" min="1" max="60" value={currentNotificationSettings.daysBefore} disabled={notificationLoadedScope !== notificationScope}
                onChange={(event) => setNotificationSettings((current) => ({ ...current, daysBefore: Number(event.target.value) }))} />
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={currentNotificationSettings.enabled} disabled={notificationLoadedScope !== notificationScope}
                onChange={(event) => setNotificationSettings((current) => ({ ...current, enabled: event.target.checked }))} />
              Attiva notifiche
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={notificationBusy || notificationLoadedScope !== notificationScope}
              onClick={() => void persistNotifications(calendar)}
              className="min-h-10 bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {notificationBusy ? 'Salvataggio…' : 'Salva preferenze e scadenze'}
            </button>
            <button type="button" disabled={notificationBusy || !currentNotificationSettings.email || notificationLoadedScope !== notificationScope}
              onClick={() => void sendTestEmail()}
              className="min-h-10 border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50">
              Invia email di test
            </button>
          </div>
          {currentNotificationError && <p className="mt-3 text-sm text-rose-700" role="alert">{currentNotificationError}</p>}
          {notificationMessage && <p className="mt-3 text-sm text-emerald-800" role="status">{notificationMessage}</p>}
      </section>

      {actionError && <p className="mb-4 text-sm text-rose-700" role="alert">{actionError}</p>}
      {actionMessage && <p className="mb-4 text-sm text-emerald-800" role="status">{actionMessage}</p>}
      {copyMessage && <p className="mb-4 text-sm text-stone-600" role="status">{copyMessage}</p>}

      <section className="border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Calendario e guida pratica</h2>
            <p className="mt-1 text-sm text-stone-500">Apri una scadenza per vedere cosa significa e preparare il pagamento.</p>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />
            Mostra scadenze passate
          </label>
        </div>
        <div className="divide-y divide-stone-200">
          {visibleDeadlines.length ? visibleDeadlines.map((deadline) => (
            <details key={deadline.id} className="group px-5 py-4">
              <summary className="grid cursor-pointer list-none gap-3 sm:grid-cols-[140px_160px_1fr_auto] sm:items-center">
                <time dateTime={deadline.date} className="font-semibold text-stone-900">
                  {new Date(`${deadline.date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                </time>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{deadline.kind}</span>
                <span>
                  <span className="block font-medium text-stone-900">{deadline.title}{deadline.paid ? ' · Pagata' : ''}</span>
                  <span className="mt-1 block text-sm leading-5 text-stone-600">{deadline.description}</span>
                </span>
                <span className="text-right font-semibold text-stone-950">{euro.format(deadline.amount)}</span>
              </summary>
              <div className="mt-4 grid gap-5 border-t border-stone-100 pt-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Cos’è</h3>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{deadline.description}</p>
                  <h3 className="mt-4 text-sm font-semibold text-stone-900">Quanto pagare e come è calcolato</h3>
                  <p className="mt-1 font-semibold text-stone-950">{euro.format(deadline.amount)}</p>
                  {deadline.breakdown.length ? (
                    <ol className="mt-2 space-y-2">
                      {deadline.breakdown.map((step, index) => (
                        <li key={`${step.label}-${index}`} className="border-l-2 border-emerald-200 pl-3 text-sm">
                          <p className="font-medium text-stone-900">{step.label}: {euro.format(step.importo)}</p>
                          <p className="text-stone-600">{step.formula}</p>
                          <p className="text-stone-500">{step.spiegazioneSemplice}</p>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="mt-1 text-sm text-stone-500">Nessun passaggio di calcolo disponibile per questa scadenza.</p>}
                  <h3 className="mt-4 text-sm font-semibold text-stone-900">Come e dove pagare</h3>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{deadline.paymentInstructions}</p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-900">Dati da riportare nel modello F24</h3>
                    {deadline.f24.length > 0 && <button type="button" className="min-h-9 border border-stone-300 px-3 text-sm hover:bg-stone-50" onClick={() => void copyF24(deadline)}>Copia dati</button>}
                  </div>
                  {deadline.f24.length ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead><tr className="border-b border-stone-200 text-xs uppercase text-stone-500"><th className="py-2 pr-3">Sezione</th><th className="py-2 pr-3">Codice</th><th className="py-2 pr-3">Anno</th><th className="py-2 text-right">Importo</th></tr></thead>
                        <tbody>{deadline.f24.map((field, index) => (
                          <tr key={`${field.code}-${index}`} className="border-b border-stone-100">
                            <td className="py-2 pr-3">{field.section}</td><td className="py-2 pr-3 font-mono">{field.code}</td><td className="py-2 pr-3">{field.year}</td><td className="py-2 text-right">{euro.format(field.amount)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <p className="mt-2 text-sm text-stone-500">Dati F24 non applicabili o non disponibili per questa scadenza.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!deadline.paid ? (
                      <>
                        <button type="button" disabled={Boolean(payingDeadlineId)} onClick={() => void markAsPaid(deadline, false)} className="min-h-10 border border-emerald-700 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">Segna come pagata</button>
                        {deadline.amount > 0 && <button type="button" disabled={Boolean(payingDeadlineId)} onClick={() => void markAsPaid(deadline, true)} className="min-h-10 bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{payingDeadlineId === deadline.id ? 'Registrazione…' : 'Pagata + registra in Partita Doppia'}</button>}
                      </>
                    ) : <span className="self-center text-sm font-medium text-emerald-800">Questa scadenza risulta pagata.</span>}
                    {deadline.kind === 'personal' && <button type="button" onClick={() => updateLocalData((current) => ({
                      ...current,
                      manualDeadlines: current.manualDeadlines.filter((item) => item.id !== deadline.id),
                      paidIds: current.paidIds.filter((id) => id !== deadline.id),
                    }))} className="min-h-10 px-3 text-sm text-rose-700 hover:underline">Elimina promemoria</button>}
                  </div>
                </div>
              </div>
            </details>
          )) : <p className="px-5 py-8 text-sm text-stone-500">Nessuna scadenza da mostrare. Puoi aggiungere un promemoria personale qui sopra.</p>}
        </div>
      </section>

      <p className="mt-6 text-xs leading-5 text-stone-500">
        Le scadenze e gli importi sono stime basate sui dati inseriti e sui parametri configurati. Non sostituiscono il commercialista, la dichiarazione dei redditi o le istruzioni ufficiali dell’Agenzia delle Entrate e dell’INPS: controlla sempre codici F24, aliquote, compensazioni e termini aggiornati.
      </p>
      {invoiceScope !== `${year}:${spreadsheetId}:${token}` && !currentInvoiceError && <span className="sr-only" role="status">Caricamento fatture per il calcolo indicativo dei bolli.</span>}
      {notificationLoadedScope && notificationLoadedScope !== notificationScope && <span className="sr-only">Preferenze email appartenenti a un altro contesto.</span>}
    </section>
  )
}
