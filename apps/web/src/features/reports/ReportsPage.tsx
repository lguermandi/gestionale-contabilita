import { useMemo, useState } from 'react'
import { buildAccountingReports } from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export function ReportsPage() {
  const transactions = useLedgerStore((state) => state.transactions)
  const year = useLedgerStore((state) => state.selectedYear)
  const loading = useLedgerStore((state) => state.loading)
  const error = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const reports = useMemo(() => buildAccountingReports(transactions), [transactions])
  const [view, setView] = useState<'sp' | 'ce' | 'liquidita'>('sp')
  const { statoPatrimoniale, contoEconomico, liquidita } = reports

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-6 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Situazione contabile</p>
        <h1 className="text-2xl font-semibold text-stone-900">Bilancio</h1>
        <p className="mt-2 text-sm text-stone-600">Stato Patrimoniale e Conto Economico dell’esercizio {year}.</p>
      </div>
      {error && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per caricare i dati dell’esercizio.</p>}
      <div className="mb-5 flex border-b border-stone-300" role="tablist" aria-label="Prospetto di bilancio">
        <button role="tab" aria-selected={view === 'sp'} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === 'sp' ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-stone-500'}`} onClick={() => setView('sp')}>Stato Patrimoniale</button>
        <button role="tab" aria-selected={view === 'ce'} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === 'ce' ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-stone-500'}`} onClick={() => setView('ce')}>Conto Economico</button>
        <button role="tab" aria-selected={view === 'liquidita'} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === 'liquidita' ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-stone-500'}`} onClick={() => setView('liquidita')}>Liquidità</button>
      </div>
      {loading && <p className="mb-4 text-sm text-stone-500">Aggiornamento dati…</p>}

      {view === 'sp' ? (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Prospetto contabile</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-900">Stato Patrimoniale</h2>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-medium text-stone-600">Esercizio {year}</span>
          </div>
          <div className="grid lg:grid-cols-2">
            <BalanceSide
              title="Attività"
              subtitle="Impieghi"
              rows={statoPatrimoniale.attivita.map((account) => ({ conto: account.conto, saldo: account.saldo }))}
              total={statoPatrimoniale.totaleAttivita}
              side="left"
            />
            <BalanceSide
              title="Passività e patrimonio netto"
              subtitle="Fonti"
              rows={statoPatrimoniale.passivita}
              total={statoPatrimoniale.totalePassivita}
              side="right"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
            <p className={`flex items-center gap-2 text-sm font-semibold ${Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'text-emerald-800' : 'text-rose-700'}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'bg-emerald-600' : 'bg-rose-600'}`} />
              {Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'Stato Patrimoniale quadrato' : 'Stato Patrimoniale da verificare'}
            </p>
            {Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) >= 0.01 && (
              <p className="text-sm text-rose-700">Differenza: {euro.format(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita)}</p>
            )}
          </div>
        </div>
      ) : view === 'ce' ? (
        <section className="border border-stone-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-stone-100 text-xs uppercase text-stone-600"><tr><th className="px-5 py-3 font-semibold">Conto</th><th className="px-5 py-3 font-semibold">Gestione</th><th className="px-5 py-3 text-right font-semibold">Ricavi</th><th className="px-5 py-3 text-right font-semibold">Costi</th><th className="px-5 py-3 text-right font-semibold">Saldo</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {contoEconomico.righe.map((line) => <tr key={line.conto}><td className="px-5 py-3">{line.conto}</td><td className="px-5 py-3">{line.gestione}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(line.ricavi)}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(line.costi)}</td><td className="px-5 py-3 text-right font-medium tabular-nums">{euro.format(line.saldo)}</td></tr>)}
                {!contoEconomico.righe.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={5}>Nessun conto economico per questo esercizio.</td></tr>}
              </tbody>
              <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold"><tr><td className="px-5 py-3" colSpan={2}>Totali</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(contoEconomico.ricavi)}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(contoEconomico.costi)}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(contoEconomico.utile)}</td></tr></tfoot>
            </table>
          </div>
        </section>
      ) : (
        <section className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-4">
            <h2 className="font-semibold text-stone-900">Rendiconto finanziario di liquidità</h2>
            <p className="mt-1 text-sm text-stone-500">Variazioni nette giornaliere dei conti riconosciuti come cassa o banca.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-stone-100 text-xs uppercase text-stone-600"><tr><th className="px-5 py-3 font-semibold">Data</th><th className="px-5 py-3 text-right font-semibold">Variazione netta</th><th className="px-5 py-3 text-right font-semibold">Saldo progressivo</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {liquidita.map((entry) => <tr key={entry.data}><td className="px-5 py-3">{new Date(`${entry.data}T00:00:00`).toLocaleDateString('it-IT')}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(entry.variazione)}</td><td className="px-5 py-3 text-right font-medium tabular-nums">{euro.format(entry.saldo)}</td></tr>)}
                {!liquidita.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={3}>Nessun movimento di liquidità per questo esercizio.</td></tr>}
              </tbody>
              {liquidita.length > 0 && <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold"><tr><td className="px-5 py-3">Totale esercizio</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(liquidita.reduce((sum, entry) => sum + entry.variazione, 0))}</td><td className="px-5 py-3 text-right tabular-nums">{euro.format(liquidita.at(-1)?.saldo ?? 0)}</td></tr></tfoot>}
            </table>
          </div>
        </section>
      )}
    </section>
  )
}

function BalanceSide({
  title,
  subtitle,
  rows,
  total,
  side,
}: {
  title: string
  subtitle: string
  rows: Array<{ conto: string; saldo: number }>
  total: number
  side: 'left' | 'right'
}) {
  return (
    <section className={`${side === 'right' ? 'border-t border-stone-200 lg:border-l lg:border-t-0' : ''}`}>
      <div className="flex min-h-20 items-center justify-between gap-3 border-b border-stone-200 bg-emerald-50/70 px-5 py-4">
        <div>
          <h3 className="font-semibold text-stone-900">{title}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-stone-500">{subtitle}</p>
        </div>
        <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-900/10">
          {side === 'left' ? 'Dare' : 'Avere'}
        </span>
      </div>
      <div className="border-b border-stone-200 bg-stone-50/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
        Sezione {title}
      </div>
      <div className="min-h-36 divide-y divide-stone-100">
        {rows.length ? rows.map((row) => (
          <div key={row.conto} className="flex min-h-11 items-center justify-between gap-4 px-5 py-2.5 text-sm hover:bg-stone-50">
            <span className="text-stone-700">{row.conto}</span>
            <span className="shrink-0 text-right font-medium tabular-nums text-stone-800">{euro.format(row.saldo)}</span>
          </div>
        )) : <p className="px-5 py-8 text-sm text-stone-500">Nessun saldo da esporre.</p>}
      </div>
      <div className="flex min-h-14 items-center justify-between gap-4 border-t-2 border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-stone-900">
        <span>Totale {side === 'left' ? 'attività' : 'passività e patrimonio netto'}</span>
        <span className="tabular-nums">{euro.format(total)}</span>
      </div>
    </section>
  )
}