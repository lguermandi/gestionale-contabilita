import { Fragment, useMemo, useState } from 'react'
import { buildAccountingReportsForYear } from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { buildBalanceSheetSections, type BalanceAccountRow, type BalanceSection, type BalanceRow } from './balanceSheet'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const balanceAmount = (amount: number | null) => amount === null ? '—' : amount === 0 ? '—' : euro.format(amount)

export function ReportsPage() {
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const historyLoading = useLedgerStore((state) => state.historyLoading)
  const historyError = useLedgerStore((state) => state.historyError)
  const year = useLedgerStore((state) => state.selectedYear)
  const loading = useLedgerStore((state) => state.loading)
  const error = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const reportTransactions = useMemo(() => [...historyTransactions, ...transactions], [historyTransactions, transactions])
  const reports = useMemo(() => buildAccountingReportsForYear(reportTransactions, year), [reportTransactions, year])
  const [view, setView] = useState<'sp' | 'ce' | 'liquidita'>('sp')
  const previousStatus = historyLoading ? 'loading' : historyError ? 'error' : 'ready'
  const previousError = historyError ?? ''
  const { statoPatrimoniale, contoEconomico, liquidita } = reports

  const previousReports = useMemo(
    () => buildAccountingReportsForYear(historyTransactions, year - 1),
    [historyTransactions, year],
  )
  const previousBalance = previousReports.statoPatrimoniale
  const balanceSections = buildBalanceSheetSections(
    signedBalanceRows(statoPatrimoniale.attivita, statoPatrimoniale.passivita),
    signedBalanceRows(previousBalance.attivita, previousBalance.passivita),
  )
  const activitySections = balanceSections.activity
  const liabilitySections = balanceSections.liability
  const totalActivity = sumRows(activitySections.flatMap((section) => section.subsections.flatMap((subsection) => subsection.rows)), 'corrente')
  const totalLiability = sumRows(liabilitySections.flatMap((section) => section.subsections.flatMap((subsection) => subsection.rows)), 'corrente')
  const hasBalanceRows = statoPatrimoniale.attivita.length > 0 || statoPatrimoniale.passivita.length > 0

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
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 bg-white px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Prospetto contabile · {year}</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-900">Stato Patrimoniale</h2>
              <p className="mt-1 text-sm text-stone-500">Impieghi e fonti a confronto con l’esercizio precedente</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Importi in euro
            </div>
          </div>
          <div className="grid lg:grid-cols-2">
            <BalanceSide
              title="Investimenti"
              sections={activitySections}
              total={totalActivity}
              previousTotal={previousStatus === 'ready' ? sumRows(activitySections.flatMap((section) => section.subsections.flatMap((subsection) => subsection.rows)), 'precedente') : null}
              year={year}
              previousYear={year - 1}
              previousReady={previousStatus === 'ready'}
              side="activity"
            />
            <BalanceSide
              title="Fonti di finanziamento"
              sections={liabilitySections}
              total={totalLiability}
              previousTotal={previousStatus === 'ready' ? sumRows(liabilitySections.flatMap((section) => section.subsections.flatMap((subsection) => subsection.rows)), 'precedente') : null}
              year={year}
              previousYear={year - 1}
              previousReady={previousStatus === 'ready'}
              side="liability"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
            <p className={`flex items-center gap-2 text-sm font-semibold ${!hasBalanceRows ? 'text-stone-500' : Math.abs(totalActivity - totalLiability) < 0.01 ? 'text-emerald-800' : 'text-rose-700'}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${!hasBalanceRows ? 'bg-stone-400' : Math.abs(totalActivity - totalLiability) < 0.01 ? 'bg-emerald-600' : 'bg-rose-600'}`} />
            {!hasBalanceRows ? 'Nessun saldo patrimoniale da esporre' : Math.abs(totalActivity - totalLiability) < 0.01 ? 'Stato Patrimoniale quadrato' : 'Stato Patrimoniale da verificare'}
            </p>
            {hasBalanceRows && Math.abs(totalActivity - totalLiability) >= 0.01 && (
            <p className="text-sm text-rose-700">Differenza: {euro.format(totalActivity - totalLiability)}</p>
            )}
          </div>
          {previousStatus === 'loading' && <p className="border-t border-stone-200 px-5 py-3 text-xs text-stone-500">Caricamento confronto {year - 1}…</p>}
          {previousStatus === 'error' && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900" role="status">
              Saldo di apertura e confronto {year - 1} incompleti: {previousError}
            </p>
          )}
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
  sections,
  total,
  previousTotal,
  year,
  previousYear,
  previousReady,
  side,
}: {
  title: string
  sections: BalanceSection[]
  total: number
  previousTotal: number | null
  year: number
  previousYear: number
  previousReady: boolean
  side: 'activity' | 'liability'
}) {
  const headingColor = side === 'activity' ? 'bg-amber-100' : 'bg-sky-100'
  return (
    <section className={`${side === 'liability' ? 'border-t border-stone-200 lg:border-l lg:border-t-0' : ''}`}>
      <header className={`border-b border-stone-300 px-4 py-3 sm:px-5 ${headingColor}`}>
        <div>
          <h3 className="text-center text-xs font-bold uppercase tracking-wider text-stone-900">{title}</h3>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] table-fixed text-sm">
          <colgroup><col className="w-[50%]" /><col className="w-[25%]" /><col className="w-[25%]" /></colgroup>
          <thead className="border-b border-stone-200 bg-white text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold sm:px-5">Voce</th>
              <th className="px-2 py-2.5 text-right font-semibold">{year}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{previousYear}</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.code}>
              <tr className={`border-y border-stone-300 ${headingColor}`}>
                <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-stone-700 sm:px-5" colSpan={3}>
                  <span className="mr-2">{section.code}</span>{section.title}
                </th>
              </tr>
              {section.subsections.map((subsection) => (
                <Fragment key={subsection.code}>
                  {(subsection.code || subsection.title) && (
                    <tr className="border-b border-stone-200 bg-stone-50">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-stone-700 sm:px-5" colSpan={3}>
                        {subsection.code && <span className="mr-2 text-stone-500">{subsection.code}</span>}{subsection.title}
                      </th>
                    </tr>
                  )}
                  {subsection.rows.map((row) => (
                    <tr key={row.conto} className="border-b border-dotted border-stone-300 hover:bg-stone-50">
                      <td className="break-words px-4 py-2 text-stone-700 sm:px-5">{row.conto}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-stone-800">{balanceAmount(row.corrente)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-stone-500">{previousReady ? balanceAmount(row.precedente) : '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {section.subsections.some((subsection) => subsection.rows.length > 0) && (
                <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-600">
                  <td className="px-4 py-2 sm:px-5">Totale {section.title.toLowerCase()}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{balanceAmount(sumRows(section.subsections.flatMap((subsection) => subsection.rows), 'corrente'))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{previousReady ? balanceAmount(sumRows(section.subsections.flatMap((subsection) => subsection.rows), 'precedente')) : '—'}</td>
                </tr>
              )}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-orange-400 bg-orange-100 text-sm font-bold text-stone-900">
            <tr>
              <td className="px-4 py-3 sm:px-5">Totale {side === 'activity' ? 'attività' : 'passività'}</td>
              <td className="px-2 py-3 text-right tabular-nums">{balanceAmount(total)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{previousReady && previousTotal !== null ? balanceAmount(previousTotal) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function signedBalanceRows(assets: BalanceRow[], liabilities: BalanceRow[]): BalanceRow[] {
  return [
    ...assets,
    ...liabilities.map(({ conto, saldo }) => ({ conto, saldo: -saldo })),
  ]
}

function sumRows(rows: BalanceAccountRow[], key: 'corrente' | 'precedente') {
  return Math.round(rows.reduce((sum, row) => sum + row[key], 0) * 100) / 100
}