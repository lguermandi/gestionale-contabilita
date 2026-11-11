import { Fragment, useMemo, useState } from 'react'
import { buildAccountingReportsForYear } from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { buildBalanceSheetSections, type BalanceAccountRow, type BalanceSection, type BalanceRow } from './balanceSheet'
import { buildCashFlowStatement, type CashFlowSection, type CashFlowStatement } from './cashFlow'
import { buildIncomeStatement, type IncomeStatement, type IncomeStatementSection } from './incomeStatement'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const balanceNumber = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const balanceAmount = (amount: number | null) => amount === null ? '—' : amount === 0 ? '—' : balanceNumber.format(amount)

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
  const incomeStatement = useMemo(() => buildIncomeStatement(reports.contoEconomico.righe), [reports.contoEconomico.righe])
  const [view, setView] = useState<'sp' | 'ce' | 'liquidita'>('sp')
  const [incomeView, setIncomeView] = useState<'scalar' | 'opposed'>('scalar')
  const previousStatus = historyLoading ? 'loading' : historyError ? 'error' : 'ready'
  const previousError = historyError ?? ''
  const { statoPatrimoniale } = reports

  const previousReports = useMemo(
    () => buildAccountingReportsForYear(historyTransactions, year - 1),
    [historyTransactions, year],
  )
  const previousBalance = previousReports.statoPatrimoniale
  const cashFlow = useMemo(() => buildCashFlowStatement(reports, previousReports), [reports, previousReports])
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
            <p className="text-sm text-rose-700">Differenza: {balanceAmount(totalActivity - totalLiability)}</p>
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
        <IncomeStatementView
          statement={incomeStatement}
          year={year}
          layout={incomeView}
          onLayoutChange={setIncomeView}
        />
      ) : (
        <CashFlowView
          statement={cashFlow}
          year={year}
          hasData={reports.saldi.length > 0}
          previousStatus={previousStatus}
          previousError={previousError}
        />
      )}
    </section>
  )
}

function CashFlowView({
  statement,
  year,
  hasData,
  previousStatus,
  previousError,
}: {
  statement: CashFlowStatement
  year: number
  hasData: boolean
  previousStatus: 'loading' | 'error' | 'ready'
  previousError: string
}) {
  return (
    <section className="overflow-hidden border border-stone-200 bg-white shadow-sm">
      <header className="border-b border-stone-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Prospetto contabile · {year}</p>
        <h2 className="mt-1 text-xl font-semibold text-stone-900">Rendiconto finanziario di liquidità</h2>
        <p className="mt-1 text-sm text-stone-500">Metodo indiretto · importi in euro</p>
      </header>
      <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-950">
        Le voci sono classificate in base al nome dei conti. Verifica la classificazione e il raccordo prima di utilizzare il prospetto come rendiconto ufficiale.
      </p>
      {previousStatus === 'loading' && (
        <p className="border-b border-stone-200 px-5 py-3 text-xs text-stone-500">Caricamento dei saldi di apertura e del confronto {year - 1}…</p>
      )}
      {previousStatus === 'error' && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900" role="status">
          Saldi iniziali e confronto {year - 1} incompleti: {previousError}
        </p>
      )}
      {!hasData ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">Nessun dato contabile per questo esercizio.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase tracking-wide text-stone-600">
              <tr><th className="px-5 py-3 font-semibold">Voce</th><th className="px-5 py-3 text-right font-semibold">Esercizio {year}</th></tr>
            </thead>
            <tbody>
              <CashFlowTotalRow code="A)" label="Disponibilità monetaria iniziale" amount={statement.openingCash} />
              <CashFlowSectionRows section={statement.operating} />
              <CashFlowSectionRows section={statement.investing} />
              <CashFlowSectionRows section={statement.financing} />
              {statement.unclassified !== 0 && (
                <CashFlowTotalRow
                  label="Flussi non classificati / raccordo liquidità"
                  amount={statement.unclassified}
                  warning
                />
              )}
              <CashFlowTotalRow code="E)" label="Flusso monetario netto del periodo" amount={statement.netChange} />
            </tbody>
            <tfoot className="border-t-2 border-emerald-800 bg-emerald-50">
              <CashFlowTotalRow code="F)" label="Disponibilità monetaria finale" amount={statement.closingCash} />
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function CashFlowSectionRows({ section }: { section: CashFlowSection }) {
  return (
    <>
      <tr className="border-y border-stone-300 bg-stone-100">
        <th className="px-5 py-2.5 text-left font-semibold text-stone-800">{section.code}) {section.title}</th>
        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{euro.format(section.total)}</td>
      </tr>
      {section.rows.map((row) => (
        <tr key={row.label} className="border-b border-dotted border-stone-200">
          <td className="px-5 py-2 pl-9 text-stone-700">{row.label}</td>
          <td className="px-5 py-2 text-right tabular-nums text-stone-700">{euro.format(row.amount)}</td>
        </tr>
      ))}
    </>
  )
}

function CashFlowTotalRow({
  code,
  label,
  amount,
  warning = false,
}: {
  code?: string
  label: string
  amount: number
  warning?: boolean
}) {
  return (
    <tr className={`border-b border-stone-200 font-semibold ${warning ? 'bg-amber-50 text-amber-900' : 'text-stone-800'}`}>
      <td className="px-5 py-2.5">{code && <span className="mr-2">{code}</span>}{label}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">{euro.format(amount)}</td>
    </tr>
  )
}

function IncomeStatementView({
  statement,
  year,
  layout,
  onLayoutChange,
}: {
  statement: IncomeStatement
  year: number
  layout: 'scalar' | 'opposed'
  onLayoutChange: (layout: 'scalar' | 'opposed') => void
}) {
  const hasRows = statement.sections.some((section) => section.items.length > 0)
  return (
    <section className="overflow-hidden border border-stone-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 px-5 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Prospetto contabile · {year}</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-900">Conto economico</h2>
          <p className="mt-1 text-sm text-stone-500">Schema gestionale ispirato all’art. 2425 del Codice civile</p>
        </div>
        <div className="inline-flex border border-stone-300 p-1" role="group" aria-label="Forma del conto economico">
          <button type="button" aria-pressed={layout === 'scalar'} className={`min-h-9 px-3 text-sm font-medium ${layout === 'scalar' ? 'bg-emerald-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`} onClick={() => onLayoutChange('scalar')}>Scalare</button>
          <button type="button" aria-pressed={layout === 'opposed'} className={`min-h-9 px-3 text-sm font-medium ${layout === 'opposed' ? 'bg-emerald-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`} onClick={() => onLayoutChange('opposed')}>Sezioni contrapposte</button>
        </div>
      </header>
      <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-950">
        La classificazione è indicativa e basata sul nome dei conti e sulla gestione: verifica le voci e completa quelle non mappate prima di usare il prospetto come bilancio civilistico.
      </p>
      {!hasRows ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">Nessun conto economico per questo esercizio.</p>
      ) : layout === 'scalar' ? (
        <ScalarIncomeStatement statement={statement} />
      ) : (
        <OpposedIncomeStatement statement={statement} />
      )}
    </section>
  )
}

function ScalarIncomeStatement({ statement }: { statement: IncomeStatement }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-stone-100 text-xs uppercase tracking-wide text-stone-600">
          <tr><th className="px-5 py-3 font-semibold">Voce</th><th className="px-5 py-3 text-right font-semibold">Esercizio</th></tr>
        </thead>
        {statement.sections.filter((section) => section.items.length > 0).map((section) => (
          <tbody key={section.code}>
            <tr className="border-y border-stone-300 bg-stone-100">
              <th className="px-5 py-2.5 text-left font-semibold text-stone-800" colSpan={2}>{section.code === '20' ? '20)' : `${section.code})`} {section.title}</th>
            </tr>
            {section.items.map((item) => (
              <Fragment key={`${section.code}:${item.code}`}>
                <tr className="bg-stone-50/70">
                  <th className="px-5 py-2 text-left text-xs font-semibold text-stone-700" colSpan={2}>
                    {item.code && <span className="mr-2 text-stone-500">{item.code}.</span>}{item.title}
                  </th>
                </tr>
                {item.rows.map((row) => (
                  <tr key={`${row.conto}:${row.side}`} className="border-b border-dotted border-stone-200 hover:bg-stone-50">
                    <td className="px-5 py-2 text-stone-700">{row.conto}<span className="ml-2 text-xs text-stone-400">{row.gestione}</span></td>
                    <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums text-stone-700">{euro.format(row.side === 'positive' ? row.importo : -row.importo)}</td>
                  </tr>
                ))}
                <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-600">
                  <td className="px-5 py-2">Totale {item.code && `${item.code}. `}{item.title.toLowerCase()}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{euro.format(item.total)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="border-b border-stone-200 bg-white font-semibold text-stone-800">
              <td className="px-5 py-2.5">Totale {section.code === '20' ? '20' : section.code}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{euro.format(section.total)}</td>
            </tr>
          </tbody>
        ))}
        <tfoot className="border-t-2 border-emerald-800 bg-emerald-50">
          <SummaryRows statement={statement} />
        </tfoot>
      </table>
    </div>
  )
}

function OpposedIncomeStatement({ statement }: { statement: IncomeStatement }) {
  return (
    <>
      <div className="grid lg:grid-cols-2">
        <IncomeStatementSide title="Componenti positivi" sections={statement.positiveSections} side="positive" />
        <IncomeStatementSide title="Componenti negativi" sections={statement.negativeSections} side="negative" />
      </div>
      <div className="border-t border-stone-200">
        <table className="w-full text-sm">
          <tbody><SummaryRows statement={statement} /></tbody>
        </table>
      </div>
    </>
  )
}

function IncomeStatementSide({ title, sections, side }: { title: string; sections: IncomeStatementSection[]; side: 'positive' | 'negative' }) {
  return (
    <section className={side === 'negative' ? 'border-t border-stone-200 lg:border-l lg:border-t-0' : ''}>
      <h3 className={`border-b border-stone-300 px-5 py-3 text-center text-xs font-bold uppercase tracking-wider ${side === 'positive' ? 'bg-emerald-50 text-emerald-950' : 'bg-orange-50 text-orange-950'}`}>{title}</h3>
      {sections.map((section) => (
        <div key={section.code}>
          <h4 className="border-b border-stone-200 bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-800">{section.code === '20' ? '20)' : `${section.code})`} {section.title}</h4>
          {section.items.map((item) => (
            <div key={`${section.code}:${item.code}`} className="border-b border-stone-100">
              <p className="px-4 pb-1 pt-2 text-xs font-medium text-stone-500">{item.code && `${item.code}. `}{item.title}</p>
              {item.rows.map((row) => (
                <div key={`${row.conto}:${row.side}`} className="flex items-start justify-between gap-3 px-4 py-1.5 text-sm">
                  <span className="text-stone-700">{row.conto}<span className="ml-2 text-xs text-stone-400">{row.gestione}</span></span>
                  <span className="whitespace-nowrap text-right tabular-nums text-stone-700">{euro.format(row.importo)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 px-4 pb-2 pt-1 text-xs font-semibold text-stone-600">
                <span>Totale voce</span><span className="whitespace-nowrap tabular-nums">{euro.format(item.rows.reduce((sum, row) => sum + row.importo, 0))}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between gap-3 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-700">
            <span>Totale {section.code}</span><span className="whitespace-nowrap tabular-nums">{euro.format(Math.abs(section.total))}</span>
          </div>
        </div>
      ))}
    </section>
  )
}

function SummaryRows({ statement }: { statement: IncomeStatement }) {
  const rows = [
    { label: 'A) Valore della produzione', value: statement.productionValue, emphasis: false },
    { label: 'B) Costi della produzione', value: -statement.productionCosts, emphasis: false },
    { label: 'Differenza tra valore e costi della produzione (A - B)', value: statement.operatingResult, emphasis: true },
    { label: 'C) Proventi e oneri finanziari', value: statement.financialResult, emphasis: false },
    { label: 'D) Rettifiche di valore di attività e passività finanziarie', value: statement.adjustmentsResult, emphasis: false },
    { label: 'Risultato prima delle imposte', value: statement.preTaxResult, emphasis: true },
    { label: '20) Imposte sul reddito dell’esercizio', value: statement.incomeTaxes, emphasis: false },
    { label: 'Utile (perdita) dell’esercizio', value: statement.netResult, emphasis: true },
  ]
  return (
    <>
      {rows.map((row) => (
        <tr key={row.label} className={row.emphasis ? 'border-t border-emerald-200 font-bold text-stone-900' : 'border-t border-stone-100 text-stone-700'}>
          <td className="px-5 py-2.5">{row.label}</td>
          <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums">{euro.format(row.value)}</td>
        </tr>
      ))}
    </>
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