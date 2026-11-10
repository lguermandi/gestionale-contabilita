import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildAccountingReports } from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const dateFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' })

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="border-t-2 border-emerald-800 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-stone-900">{euro.format(value)}</p>
      <p className="mt-1 text-xs text-stone-500">{note}</p>
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
  const latestTransactions = [...transactions].sort((left, right) => right.data.localeCompare(left.data)).slice(0, 5)

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-7 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Quadro generale</p>
        <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-2 text-sm text-stone-600">Situazione contabile dell’esercizio {year}.</p>
      </div>

      {error && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per caricare i dati dell’esercizio.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Liquidità" value={reports.liquidita.at(-1)?.saldo ?? 0} note="Saldo progressivo dei conti di cassa e banca" />
        <Metric label="Attività" value={reports.statoPatrimoniale.totaleAttivita} note="Saldi patrimoniali in Dare" />
        <Metric label="Ricavi" value={reports.contoEconomico.ricavi} note="Conti economici con gestione valorizzata" />
        <Metric label="Risultato" value={reports.contoEconomico.utile} note="Ricavi meno costi dell’esercizio" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section className="border border-stone-200 bg-white p-5">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-semibold text-stone-900">Andamento liquidità</h2>
              <p className="mt-1 text-xs text-stone-500">Saldo cumulato dei conti riconosciuti come cassa o banca</p>
            </div>
            {loading && <span className="text-xs text-stone-500">Aggiornamento…</span>}
          </div>
          {reports.liquidita.length ? (
            <div className="h-72 w-full" role="img" aria-label={`Storico liquidità ${year}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reports.liquidita} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="liquidity-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#087f5b" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#087f5b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="data" tickFormatter={(value: string) => dateFormat.format(new Date(`${value}T00:00:00`))} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickFormatter={(value: number) => euro.format(value)} tickLine={false} axisLine={false} width={90} />
                  <Tooltip labelFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString('it-IT')} formatter={(value) => [euro.format(Number(value)), 'Saldo']} />
                  <Area type="monotone" dataKey="saldo" stroke="#087f5b" strokeWidth={2} fill="url(#liquidity-fill)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-72 place-items-center border border-dashed border-stone-300 text-sm text-stone-500">
              {loading ? 'Caricamento dati…' : 'Nessun movimento di liquidità per questo esercizio.'}
            </div>
          )}
        </section>

        <section className="border border-stone-200 bg-white p-5">
          <h2 className="font-semibold text-stone-900">Ultime registrazioni</h2>
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
        <div className="flex items-baseline justify-between border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">Saldi dei conti</h2>
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