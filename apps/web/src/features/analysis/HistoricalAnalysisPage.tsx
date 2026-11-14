import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { buildDailyPositionStatistics, buildHistoricalStatistics } from './historicalStatistics'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroPrecise = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const dayLabel = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })

function formatDayLabel(date: string, formatter: Intl.DateTimeFormat) {
  return formatter.format(new Date(`${date}T00:00:00`))
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="border border-stone-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-sm font-medium text-stone-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-stone-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{note}</p>
    </article>
  )
}

function ChartPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border border-stone-200 bg-white p-5 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      </div>
      <div className="h-72 w-full">{children}</div>
    </section>
  )
}

export function HistoricalAnalysisPage() {
  const year = useLedgerStore((state) => state.selectedYear)
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const historyLoading = useLedgerStore((state) => state.historyLoading)
  const historyError = useLedgerStore((state) => state.historyError)
  const loading = useLedgerStore((state) => state.loading)
  const error = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const statistics = useMemo(
    () => buildHistoricalStatistics([...historyTransactions, ...transactions], year),
    [historyTransactions, transactions, year],
  )
  const dailyStatistics = useMemo(
    () => buildDailyPositionStatistics([...historyTransactions, ...transactions], year),
    [historyTransactions, transactions, year],
  )
  const latest = statistics.at(-1)

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Andamento nel tempo · {year}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">Analisi storiche</h1>
          <p className="mt-2 text-sm text-stone-600">Confronta entrate, uscite, patrimonio e liquidità degli esercizi registrati.</p>
        </div>
        {(loading || historyLoading) && <span className="text-sm text-stone-500">Aggiornamento dati…</span>}
      </div>

      {error && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {historyError && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">Storico incompleto: {historyError}</p>}
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per caricare lo storico completo.</p>}

      {latest && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Entrate" value={euroPrecise.format(latest.income)} note={`Esercizio ${latest.year}`} />
            <Metric label="Uscite" value={euroPrecise.format(latest.expenses)} note={`Esercizio ${latest.year}`} />
            <Metric label="Risparmio netto" value={euroPrecise.format(latest.result)} note={latest.savingRate === null ? 'Nessuna entrata nell’esercizio' : `Tasso di risparmio ${latest.savingRate.toFixed(1)}%`} />
            <Metric label="Patrimonio netto stimato" value={euroPrecise.format(latest.netWorth)} note="Attività meno debiti rilevati dai conti" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Entrate e uscite" description="Confronto degli importi registrati in ogni esercizio">
              <div className="h-full w-full" role="img" aria-label="Grafico storico delle entrate e delle uscite">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statistics} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value: number) => euro.format(value)} tickLine={false} axisLine={false} width={90} />
                    <Tooltip formatter={(value) => euroPrecise.format(Number(value))} />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="income" name="Entrate" fill="#059669" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name="Uscite" fill="#e87962" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>

            <ChartPanel title="Risparmio per esercizio" description="Differenza tra entrate e uscite e relativo tasso di risparmio">
              <div className="h-full w-full" role="img" aria-label="Grafico storico del risparmio netto e del tasso di risparmio">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={statistics} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="amount" tickFormatter={(value: number) => euro.format(value)} tickLine={false} axisLine={false} width={90} />
                    <YAxis yAxisId="rate" orientation="right" tickFormatter={(value: number) => `${value}%`} tickLine={false} axisLine={false} width={48} />
                    <Tooltip formatter={(value, name) => [name === 'Tasso di risparmio' ? `${Number(value).toFixed(1)}%` : euroPrecise.format(Number(value)), name]} />
                    <Legend verticalAlign="top" height={36} />
                    <Bar yAxisId="amount" dataKey="result" name="Risparmio netto" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="rate" type="monotone" dataKey="savingRate" name="Tasso di risparmio" stroke="#7c3aed" strokeWidth={2.5} connectNulls dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>

            <ChartPanel title="Evoluzione giornaliera del patrimonio" description="Saldi di fine giornata, riportati anche nei giorni senza movimenti">
              <div className="h-full w-full" role="img" aria-label="Grafico storico dell’evoluzione patrimoniale">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyStatistics} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(date: string) => formatDayLabel(date, monthLabel)} interval="preserveStartEnd" minTickGap={36} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value: number) => euro.format(value)} tickLine={false} axisLine={false} width={90} />
                    <Tooltip labelFormatter={(date) => formatDayLabel(String(date), dayLabel)} formatter={(value) => euroPrecise.format(Number(value))} />
                    <Legend verticalAlign="top" height={36} />
                    <Line type="stepAfter" dataKey="assets" name="Attività" stroke="#059669" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="stepAfter" dataKey="debts" name="Debiti" stroke="#e87962" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="stepAfter" dataKey="netWorth" name="Patrimonio netto stimato" stroke="#5965e8" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>

            <ChartPanel title="Liquidità giorno per giorno" description="Saldo di cassa e banca a fine giornata, con riporto nei giorni senza movimenti">
              <div className="h-full w-full" role="img" aria-label="Grafico storico della liquidità">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyStatistics} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(date: string) => formatDayLabel(date, monthLabel)} interval="preserveStartEnd" minTickGap={36} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(value: number) => euro.format(value)} tickLine={false} axisLine={false} width={90} />
                    <Tooltip labelFormatter={(date) => formatDayLabel(String(date), dayLabel)} formatter={(value) => euroPrecise.format(Number(value))} />
                    <Line type="stepAfter" dataKey="liquidity" name="Liquidità" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>
          </div>
          <p className="mt-4 text-xs leading-5 text-stone-500">I grafici patrimoniali mostrano i saldi a fine giornata, riportati anche quando non ci sono movimenti. Il patrimonio netto è una stima: sottrae i debiti riconosciuti dai nomi dei conti alle attività.</p>
        </>
      )}
      {!latest && (
        <div className="grid min-h-64 place-items-center border border-dashed border-stone-300 bg-white px-6 text-center text-sm text-stone-500">
          {loading || historyLoading ? 'Caricamento dello storico…' : 'Non ci sono ancora dati storici da visualizzare.'}
        </div>
      )}
    </section>
  )
}
