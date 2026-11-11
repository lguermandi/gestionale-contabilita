import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { buildAccountingReports, buildMonthlyIncomeSeries } from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const euroWithoutDecimals = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const monthFormat = new Intl.DateTimeFormat('it-IT', { month: 'short' })

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="rounded-sm border border-stone-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-sm font-medium text-stone-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-stone-950">{euro.format(value)}</p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{note}</p>
    </article>
  )
}

export function DashboardPage() {
  const year = useLedgerStore((state) => state.selectedYear)
  const transactions = useLedgerStore((state) => state.transactions)
  const loading = useLedgerStore((state) => state.loading)
  const error = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const reports = useMemo(() => buildAccountingReports(transactions), [transactions])
  const monthlyIncome = useMemo(() => buildMonthlyIncomeSeries(transactions, year), [transactions, year])
  const monthLabels = useMemo(() => monthlyIncome.map(({ mese }) => monthFormat.format(new Date(year, mese - 1, 1))), [monthlyIncome, year])
  const latestTransactions = useMemo(
    () => [...transactions].sort((left, right) => right.data.localeCompare(left.data)).slice(0, 5),
    [transactions],
  )
  const hasIncomeData = monthlyIncome.some(({ ricavi, costi }) => ricavi > 0 || costi > 0)

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Quadro generale · {year}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">La tua dashboard</h1>
          <p className="mt-2 text-sm text-stone-600">La situazione contabile, aggiornata in un colpo d’occhio.</p>
        </div>
        <Link to="/partita-doppia" className="inline-flex min-h-11 items-center justify-center bg-stone-950 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
          Nuova registrazione
        </Link>
      </div>

      {error && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per caricare i dati dell’esercizio.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Liquidità" value={reports.liquidita.at(-1)?.saldo ?? 0} note="Saldo progressivo dei conti di cassa e banca" />
        <Metric label="Attività" value={reports.statoPatrimoniale.totaleAttivita} note="Saldi patrimoniali in Dare" />
        <Metric label="Ricavi" value={reports.contoEconomico.ricavi} note="Conti economici con gestione valorizzata" />
        <Metric label="Risultato" value={reports.contoEconomico.utile} note="Ricavi meno costi dell’esercizio" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <section className="border border-stone-200 bg-white p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-stone-950">Andamento economico</h2>
              <p className="mt-1 text-sm text-stone-500">Ricavi e costi registrati mese per mese</p>
            </div>
            {loading && <span className="text-xs text-stone-500">Aggiornamento…</span>}
          </div>
          {hasIncomeData ? (
            <div className="h-72 w-full" role="img" aria-label={`Andamento mensile di ricavi e costi ${year}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyIncome} margin={{ top: 12, right: 12, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="mese" tickFormatter={(month: number) => monthLabels[month - 1]} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value: number) => euroWithoutDecimals.format(value)} tickLine={false} axisLine={false} width={90} />
                  <Tooltip labelFormatter={(month) => monthFormat.format(new Date(year, Number(month) - 1, 1))} formatter={(value) => euro.format(Number(value))} />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="ricavi" name="Ricavi" stroke="#5965e8" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="costi" name="Costi" stroke="#e87962" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-72 place-items-center border border-dashed border-stone-300 text-sm text-stone-500">
              {loading ? 'Caricamento dati…' : 'Nessun ricavo o costo registrato per questo esercizio.'}
            </div>
          )}
        </section>

        <section className="border border-stone-200 bg-white p-5 md:p-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-stone-950">Ultime registrazioni</h2>
            <Link to="/partita-doppia" className="text-xs font-medium text-emerald-800 underline underline-offset-2">Apri registro</Link>
          </div>
          <div className="mt-4 divide-y divide-stone-200">
            {latestTransactions.length ? latestTransactions.map((transaction) => (
              <article key={transaction.id} className="py-3 first:pt-0">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium text-stone-800">{transaction.movimenti[0]?.descrizione || transaction.movimenti[0]?.conto}</span>
                  <span className="shrink-0 tabular-nums text-stone-700">{euro.format(transaction.totale)}</span>
                </div>
                <p className="mt-1 text-xs text-stone-500">{new Date(`${transaction.data}T00:00:00`).toLocaleDateString('it-IT')} · {transaction.movimenti.length} righe</p>
              </article>
            )) : <p className="py-5 text-sm text-stone-500">Nessuna registrazione nell’esercizio.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 border border-stone-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Saldi dei conti</h2>
            <p className="mt-1 text-xs text-stone-500">Riepilogo dei principali conti dell’esercizio</p>
          </div>
          <span className="text-xs text-stone-500">{reports.saldi.length} conti</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase text-stone-600">
              <tr><th className="px-5 py-3 font-semibold">Conto</th><th className="px-5 py-3 text-right font-semibold">Dare</th><th className="px-5 py-3 text-right font-semibold">Avere</th><th className="px-5 py-3 text-right font-semibold">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {reports.saldi.slice(0, 12).map((account) => (
                <tr key={account.conto}>
                  <td className="px-5 py-3">{account.conto}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{euro.format(account.totale_dare)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{euro.format(account.totale_avere)}</td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">{euro.format(account.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}