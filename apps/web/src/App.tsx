import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { BrowserRouter, HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { buildAccountingReportsForYear } from './domain/accounting'
import { OfflineSyncController } from './offline/OfflineSyncController'
import { getWorkspaceSetupStatus, initializeWorkspace, loginToGas, logoutFromGas } from './api/ledgerApi'
import {
  chooseGoogleDriveDestination,
  createWorkspaceDriveFolder,
  preloadGoogleDrivePicker,
  shareWorkspaceFolderWithBackend,
  type CreatedDriveFolder,
  type GoogleDriveDestination,
} from './api/googleDrivePicker'
import { useGasSessionStore } from './stores/gasSessionStore'
import { useLedgerStore } from './stores/ledgerStore'
import { useOfflineSyncStore } from './stores/offlineSyncStore'
import { useProfileStore } from './stores/profileStore'

const navigation = [
  { label: 'Dashboard', to: '/' },
  { label: 'Partita doppia', to: '/partita-doppia' },
  { label: 'Bilancio', to: '/bilancio' },
  { label: 'Impostazioni', to: '/impostazioni' },
]

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const TransactionForm = lazy(() => import('./features/ledger/TransactionForm').then((module) => ({ default: module.TransactionForm })))
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const InvoicesPage = lazy(() => import('./features/invoicing/InvoicesPage').then((module) => ({ default: module.InvoicesPage })))
const ExpensesPage = lazy(() => import('./features/expenses/ExpensesPage').then((module) => ({ default: module.ExpensesPage })))
const CompanySettingsPage = lazy(() => import('./features/settings/CompanySettingsPage').then((module) => ({ default: module.CompanySettingsPage })))

function BusinessOnly({ children }: { children: ReactNode }) {
  const activeProfile = useProfileStore((state) => state.activeProfile)
  return activeProfile === 'business' ? <>{children}</> : <Navigate to="/" replace />
}

function GasSessionControl() {
  const token = useGasSessionStore((state) => state.token)
  const setToken = useGasSessionStore((state) => state.setToken)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const session = await loginToGas(username, password)
      setToken(session.token)
      setPassword('')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Accesso a GAS non riuscito.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    if (!token) return
    setSubmitting(true)
    setError('')
    try {
      await logoutFromGas(token)
      clearToken()
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Uscita da GAS non riuscita.')
    } finally {
      setSubmitting(false)
    }
  }

  if (token) {
    return (
      <div>
        <button type="button" disabled={submitting} className="text-sm font-medium text-emerald-900 underline disabled:opacity-50" onClick={() => void handleLogout()}>
          {submitting ? 'Uscita…' : 'Esci da GAS'}
        </button>
        {error && <p className="mt-1 text-xs text-rose-700" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <details className="relative w-full basis-full md:w-auto md:basis-auto">
      <summary className="min-h-10 cursor-pointer list-none border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">Accedi</summary>
      <form onSubmit={handleSubmit} className="absolute left-0 right-auto z-10 mt-2 grid w-72 max-w-[calc(100vw-2rem)] gap-3 border border-stone-200 bg-white p-4 shadow-lg md:left-auto md:right-0">
        <p className="text-sm font-medium text-stone-900">Sessione Google Apps Script</p>
        <label className="text-xs text-stone-600">Utente
          <input autoComplete="username" className="mt-1 min-h-10 w-full border border-stone-300 px-3 text-sm text-stone-900" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label className="text-xs text-stone-600">Password
          <input type="password" autoComplete="current-password" className="mt-1 min-h-10 w-full border border-stone-300 px-3 text-sm text-stone-900" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className="min-h-10 bg-emerald-800 px-3 text-sm font-medium text-white disabled:opacity-50">{submitting ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </details>
  )
}

function WorkspaceSetupGate({ onReady }: { onReady: () => void }) {
  const token = useGasSessionStore((state) => state.token)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const activeProfile = useProfileStore((state) => state.activeProfile)
  const setActiveProfile = useProfileStore((state) => state.setActiveProfile)
  const [workspaceStatus, setWorkspaceStatus] = useState<{
    token: string
    setupRequired: boolean
    username: string
    gasOwnerEmail: string
    error?: string
  } | null>(null)
  const [destination, setDestination] = useState<GoogleDriveDestination | null>(null)
  const [createdFolder, setCreatedFolder] = useState<CreatedDriveFolder | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [choosingDestination, setChoosingDestination] = useState(false)
  const [shareConfirmed, setShareConfirmed] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [completedWorkspace, setCompletedWorkspace] = useState<{
    token: string
    folderUrl: string
    spreadsheetUrl: string
  } | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!token || activeProfile !== 'business') return

    let active = true
    getWorkspaceSetupStatus(token)
      .then(({ setupRequired: required, username, gasOwnerEmail }) => {
        if (active) setWorkspaceStatus({
          token,
          setupRequired: required,
          username,
          gasOwnerEmail,
          error: required && !gasOwnerEmail
            ? 'Il deployment GAS non comunica l’account autorizzato. Configura APP_GAS_OWNER_EMAIL e pubblica una nuova versione.'
            : undefined,
        })
      })
      .catch((statusError: unknown) => {
        if (!active) return
        const rawMessage = statusError instanceof Error ? statusError.message : 'Impossibile verificare lo spazio aziendale.'
        const message = rawMessage.includes('Azione non supportata')
          ? 'Il backend GAS online non è aggiornato. Pubblica una nuova versione Apps Script con le API di configurazione Drive.'
          : rawMessage
        setWorkspaceStatus({ token, setupRequired: false, username: '', gasOwnerEmail: '', error: message })
        if (message.includes('SESSION_EXPIRED')) clearToken()
      })
    return () => { active = false }
  }, [activeProfile, clearToken, retryCount, token])

  const currentStatus = workspaceStatus?.token === token ? workspaceStatus : null
  const checking = Boolean(token && activeProfile === 'business' && !currentStatus)
  const setupRequired = currentStatus?.setupRequired ?? false
  const statusError = currentStatus?.error ?? ''
  const currentCompletedWorkspace = completedWorkspace?.token === token ? completedWorkspace : null

  useEffect(() => {
    if (!token || activeProfile !== 'business' || !setupRequired || Capacitor.isNativePlatform()) return

    let active = true
    void preloadGoogleDrivePicker().catch((error: unknown) => {
      if (active) setSetupError(error instanceof Error ? error.message : 'Configurazione Google Drive non riuscita.')
    })
    return () => { active = false }
  }, [activeProfile, setupRequired, token])

  async function handleChooseDestination() {
    if (Capacitor.isNativePlatform()) {
      setSetupError('Per creare lo spazio Drive, completa la configurazione dal browser web. Potrai poi usare lo spazio anche nell’app Android.')
      return
    }
    setChoosingDestination(true)
    setSetupError('')
    try {
      const selectedDestination = await chooseGoogleDriveDestination()
      if (!selectedDestination) return
      const sameDestination = destination?.accountEmail === selectedDestination.accountEmail
        && destination.parentFolder.id === selectedDestination.parentFolder.id
      setDestination(selectedDestination)
      if (!sameDestination) {
        setCreatedFolder(null)
        setShareConfirmed(false)
      }
    } catch (selectionError) {
      setSetupError(selectionError instanceof Error ? selectionError.message : 'Selezione Google Drive non riuscita.')
    } finally {
      setChoosingDestination(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !destination || !currentStatus?.gasOwnerEmail) return
    setSubmitting(true)
    setSetupError('')
    try {
      const workspaceFolder = createdFolder || await createWorkspaceDriveFolder(
        destination.accessToken,
        destination.parentFolder.id,
        `Gestionale contabile - ${currentStatus.username || 'Azienda'}`,
      )
      setCreatedFolder(workspaceFolder)
      await shareWorkspaceFolderWithBackend(
        destination.accessToken,
        workspaceFolder.id,
        currentStatus.gasOwnerEmail,
      )
      const workspace = await initializeWorkspace(token, workspaceFolder.id)
      setWorkspaceStatus({
        token,
        setupRequired: workspace.setupRequired,
        username: currentStatus.username,
        gasOwnerEmail: currentStatus.gasOwnerEmail,
      })
      setCompletedWorkspace({ token, folderUrl: workspace.folderUrl, spreadsheetUrl: workspace.spreadsheetUrl })
      onReady()
    } catch (setupError) {
      setSetupError(setupError instanceof Error ? setupError.message : 'Impossibile creare lo spazio aziendale.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleWorkspaceLogout() {
    if (!token) return
    try {
      await logoutFromGas(token)
      clearToken()
    } catch (logoutError) {
      setSetupError(logoutError instanceof Error ? logoutError.message : 'Uscita da GAS non riuscita.')
    }
  }

  if (!token || activeProfile !== 'business' || checking || (!setupRequired && !currentCompletedWorkspace && !statusError)) return null

  if (statusError && !setupRequired && !currentCompletedWorkspace) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-4">
        <section className="w-full max-w-lg bg-white p-6 shadow-xl" role="alert">
          <h2 className="text-lg font-semibold text-stone-900">Verifica dello spazio aziendale non riuscita</h2>
          <p className="mt-2 text-sm text-rose-700">{statusError}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" className="min-h-10 bg-emerald-800 px-4 text-sm font-medium text-white" onClick={() => setRetryCount((count) => count + 1)}>Riprova</button>
            <button type="button" className="min-h-10 border border-stone-300 px-4 text-sm text-stone-700" onClick={() => setActiveProfile('private')}>Torna a Privato</button>
          </div>
        </section>
      </div>
    )
  }

  if (!setupRequired) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-4">
        <section className="w-full max-w-lg bg-white p-6 shadow-xl" role="status">
          <h2 className="text-lg font-semibold text-stone-900">Spazio aziendale creato</h2>
          <p className="mt-2 text-sm text-stone-600">Cartelle e registri sono pronti.</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <a className="font-medium text-emerald-800 underline" href={currentCompletedWorkspace?.folderUrl} target="_blank" rel="noreferrer">Apri cartella</a>
            <a className="font-medium text-emerald-800 underline" href={currentCompletedWorkspace?.spreadsheetUrl} target="_blank" rel="noreferrer">Apri foglio contabile</a>
          </div>
          <button type="button" className="mt-5 min-h-10 bg-emerald-800 px-4 text-sm font-medium text-white" onClick={() => setCompletedWorkspace(null)}>
            Continua
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-4">
      <section className="w-full max-w-lg bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="workspace-setup-title">
        <h2 id="workspace-setup-title" className="text-lg font-semibold text-stone-900">Crea lo spazio aziendale</h2>
        <p className="mt-2 text-sm text-stone-600">
          Scegli l’account Google e la cartella in cui creare il nuovo spazio. I dati iniziali saranno vuoti.
          Creeremo il foglio contabile e le cartelle per fatture emesse, ricevute, estratti conto e documenti.
        </p>
      <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
        <button type="button" disabled={choosingDestination || submitting} className="min-h-11 border border-stone-300 px-4 text-left text-sm text-stone-800 disabled:opacity-50" onClick={() => void handleChooseDestination()}>
          {choosingDestination ? 'Apertura di Google Drive…' : destination ? 'Cambia account o cartella Drive' : 'Scegli account e cartella Drive'}
        </button>
        {destination && (
          <p className="text-sm text-stone-600" role="status">
            Account: <strong>{destination.accountEmail}</strong><br />
            Cartella scelta: <strong>{destination.parentFolder.name}</strong>
            {createdFolder && <><br />Nuova cartella: <strong>{createdFolder.name}</strong></>}
          </p>
        )}
        {currentStatus?.gasOwnerEmail && (
          <label className="flex items-start gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={shareConfirmed}
              onChange={(event) => setShareConfirmed(event.target.checked)}
            />
            <span>
              Autorizzo la condivisione della sola nuova cartella con {currentStatus.gasOwnerEmail}, necessaria perché il gestionale possa aggiornare i fogli.
            </span>
          </label>
        )}
        {statusError && <p className="text-sm text-rose-700" role="alert">{statusError}</p>}
        {setupError && <p className="text-sm text-rose-700" role="alert">{setupError}</p>}
        <button type="submit" disabled={submitting || choosingDestination || !destination || !shareConfirmed || !currentStatus?.gasOwnerEmail} className="min-h-11 bg-emerald-800 px-4 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Creazione in corso…' : createdFolder ? 'Completa creazione' : 'Crea cartella e fogli'}
        </button>
          <button type="button" disabled={submitting} className="min-h-10 text-sm text-stone-600 underline disabled:opacity-50" onClick={() => void handleWorkspaceLogout()}>
            Esci e accedi con un altro account
          </button>
          <button type="button" disabled={submitting} className="min-h-10 text-sm text-stone-600 underline disabled:opacity-50" onClick={() => setActiveProfile('private')}>
            Torna a Privato
          </button>
        </form>
      </section>
    </div>
  )
}

function AppShell() {
  const activeProfile = useProfileStore((state) => state.activeProfile)
  const setActiveProfile = useProfileStore((state) => state.setActiveProfile)
  const year = useLedgerStore((state) => state.selectedYear)
  const setYear = useLedgerStore((state) => state.setSelectedYear)
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const refresh = useLedgerStore((state) => state.refresh)
  const ledgerError = useLedgerStore((state) => state.error)
  const online = useOfflineSyncStore((state) => state.online)
  const syncing = useOfflineSyncStore((state) => state.syncing)
  const pending = useOfflineSyncStore((state) => state.pending)
  const token = useGasSessionStore((state) => state.token)
  const reports = useMemo(
    () => buildAccountingReportsForYear([...historyTransactions, ...transactions], year),
    [historyTransactions, transactions, year],
  )
  const years = Array.from({ length: 10 }, (_, index) => new Date().getFullYear() + 1 - index)
  const visibleNavigation = activeProfile === 'business'
    ? [...navigation.slice(0, 3), { label: 'Fatturazione', to: '/fatturazione' }, { label: 'Spese', to: '/spese' }, navigation[3]]
    : navigation

  useEffect(() => {
    void refresh(year, token, activeProfile)
  }, [activeProfile, refresh, token, year])

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 md:flex">
      <OfflineSyncController />
      <aside className="border-b border-stone-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center gap-3 px-5 md:h-20">
          <span className="grid size-9 place-items-center bg-emerald-800 text-sm font-bold text-white">GC</span>
          <span className="font-semibold">Gestionale contabile</span>
        </div>
        <nav aria-label="Navigazione principale" className="grid grid-cols-2 gap-1 px-3 pb-3 sm:flex sm:flex-wrap md:block md:px-3 md:py-4">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block min-h-11 px-3 py-3 text-sm sm:shrink-0 md:min-h-0 md:py-2 ${isActive
                  ? 'bg-emerald-50 font-semibold text-emerald-900'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-5 py-2 md:flex-nowrap md:px-8">
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-stone-600">
              <span className="hidden sm:inline">Esercizio</span>
              <select aria-label="Esercizio contabile" className="min-h-10 border border-stone-300 bg-white px-3 text-stone-900 focus:border-emerald-700 focus:outline-none" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <span className="text-xs text-stone-500" role="status">{syncing ? 'Sincronizzazione…' : online ? (pending ? `${pending} in coda` : ledgerError ? 'Dati non aggiornati' : 'Online') : `Offline · ${pending} in coda`}</span>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="hidden text-stone-600 sm:inline">Profilo</span>
            <select aria-label="Profilo contabile attivo" className="min-h-10 border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-emerald-700 focus:outline-none" value={activeProfile} onChange={(event) => setActiveProfile(event.target.value as 'private' | 'business')}>
              <option value="private">Privato</option>
              <option value="business">Azienda / Partita IVA</option>
            </select>
          </label>
          <GasSessionControl />
        </header>

        <WorkspaceSetupGate onReady={() => void refresh(year, token, activeProfile)} />

        <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-5 py-10 text-sm text-stone-500 md:px-8">Caricamento vista…</div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/partita-doppia" element={<TransactionForm key={`${activeProfile}-${year}`} year={year} entity={activeProfile} accounts={reports.conti} managements={reports.gestioni} onSaved={() => void refresh(year, token, activeProfile)} />} />
            <Route path="/bilancio" element={<ReportsPage />} />
            <Route path="/fatturazione" element={<BusinessOnly><InvoicesPage key={year} year={year} /></BusinessOnly>} />
            <Route path="/spese" element={<BusinessOnly><ExpensesPage key={year} year={year} /></BusinessOnly>} />
            <Route path="/impostazioni" element={<CompanySettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}

function App() {
  return Capacitor.isNativePlatform() ? (
    <HashRouter><AppShell /></HashRouter>
  ) : (
    <BrowserRouter basename={import.meta.env.BASE_URL}><AppShell /></BrowserRouter>
  )
}

export default App
