import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { BrowserRouter, HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { buildAccountingReports } from './domain/accounting'
import { loginToGas } from './api/ledgerApi'
import { useGasSessionStore } from './stores/gasSessionStore'
import { useLedgerStore } from './stores/ledgerStore'
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

  if (token) {
    return <button type="button" className="text-sm font-medium text-emerald-900 underline" onClick={clearToken}>Esci da GAS</button>
  }

  return (
    <details className="relative">
      <summary className="min-h-10 cursor-pointer list-none border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">Accedi a GAS</summary>
      <form onSubmit={handleSubmit} className="absolute right-0 z-10 mt-2 grid w-72 gap-3 border border-stone-200 bg-white p-4 shadow-lg">
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

function AppShell() {
  const activeProfile = useProfileStore((state) => state.activeProfile)
  const setActiveProfile = useProfileStore((state) => state.setActiveProfile)
  const year = useLedgerStore((state) => state.selectedYear)
  const setYear = useLedgerStore((state) => state.setSelectedYear)
  const transactions = useLedgerStore((state) => state.transactions)
  const refresh = useLedgerStore((state) => state.refresh)
  const ledgerError = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const reports = useMemo(() => buildAccountingReports(transactions), [transactions])
  const years = Array.from({ length: 10 }, (_, index) => new Date().getFullYear() + 1 - index)
  const visibleNavigation = activeProfile === 'business'
    ? [...navigation.slice(0, 3), { label: 'Fatturazione', to: '/fatturazione' }, navigation[3]]
    : navigation

  useEffect(() => {
    void refresh(year, token, activeProfile)
  }, [activeProfile, refresh, token, year])

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 md:flex">
      <aside className="border-b border-stone-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center gap-3 px-5 md:h-20">
          <span className="grid size-9 place-items-center bg-emerald-800 text-sm font-bold text-white">GC</span>
          <span className="font-semibold">Gestionale contabile</span>
        </div>
        <nav aria-label="Navigazione principale" className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:px-3 md:py-4">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block shrink-0 px-3 py-2 text-sm ${isActive
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
            <span className="hidden text-xs text-stone-500 lg:inline" role="status">{ledgerError ? 'Dati non aggiornati' : 'Backend contabile'}</span>
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

        <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-5 py-10 text-sm text-stone-500 md:px-8">Caricamento vista…</div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/partita-doppia" element={<TransactionForm key={`${activeProfile}-${year}`} year={year} entity={activeProfile} accounts={reports.conti} managements={reports.gestioni} onSaved={() => void refresh(year, token, activeProfile)} />} />
            <Route path="/bilancio" element={<ReportsPage />} />
            <Route path="/fatturazione" element={<BusinessOnly><InvoicesPage key={year} year={year} /></BusinessOnly>} />
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
    <BrowserRouter><AppShell /></BrowserRouter>
  )
}

export default App
