import { useEffect, useMemo, useState } from 'react'
import { fetchTransactions } from '../../api/ledgerApi'
import { buildAccountingReports, type LedgerTransaction } from '../../domain/accounting'
import { getLocalTransactions } from '../../offline/offlineLedger'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const balanceAmount = (amount: number | null) => amount === null ? '—' : amount === 0 ? '—' : euro.format(amount)
const noTransactions: LedgerTransaction[] = []
type BalanceRow = { conto: string; saldo: number }
type BalanceSection = { code: string; title: string; rows: Array<{ conto: string; corrente: number; precedente: number }> }

export function ReportsPage() {
  const transactions = useLedgerStore((state) => state.transactions)
  const year = useLedgerStore((state) => state.selectedYear)
  const loading = useLedgerStore((state) => state.loading)
  const error = useLedgerStore((state) => state.error)
  const token = useGasSessionStore((state) => state.token)
  const entity = useProfileStore((state) => state.activeProfile)
  const reports = useMemo(() => buildAccountingReports(transactions), [transactions])
  const [view, setView] = useState<'sp' | 'ce' | 'liquidita'>('sp')
  const [previousResult, setPreviousResult] = useState<{
    requestKey: string | null
    status: 'ready' | 'error'
    transactions: LedgerTransaction[]
    error: string
  }>({ requestKey: null, status: 'error', transactions: [], error: '' })
  const previousRequestKey = useMemo(() => `${year - 1}:${entity}:${token ?? 'offline'}`, [entity, token, year])
  const previousStatus = previousResult.requestKey === previousRequestKey ? previousResult.status : 'loading'
  const previousTransactions = previousResult.requestKey === previousRequestKey ? previousResult.transactions : noTransactions
  const previousError = previousResult.requestKey === previousRequestKey ? previousResult.error : ''
  const { statoPatrimoniale, contoEconomico, liquidita } = reports

  useEffect(() => {
    let cancelled = false

    async function loadPreviousYear() {
      try {
        const localRecords = await getLocalTransactions(year - 1, entity)
        const local = localRecords.map((record) => record.transaction)
        if (!token && !local.length) {
          if (!cancelled) {
            setPreviousResult({
              requestKey: previousRequestKey,
              status: 'error',
              transactions: [],
              error: 'Accedi a GAS per caricare i dati dell’esercizio precedente.',
            })
          }
          return
        }
        let loaded = local
        let comparisonError = ''
        if (token) {
          try {
            const remote = await fetchTransactions(year - 1, token, entity)
            const merged = new Map(remote.map((transaction) => [transaction.id, transaction]))
            local.forEach((transaction) => merged.set(transaction.id, transaction))
            loaded = [...merged.values()]
          } catch (loadError) {
            comparisonError = loadError instanceof Error ? loadError.message : 'Impossibile caricare il confronto con l’esercizio precedente.'
            if (!local.length) throw loadError
          }
        }
        if (!cancelled) {
          setPreviousResult({ requestKey: previousRequestKey, status: 'ready', transactions: loaded, error: comparisonError })
        }
      } catch (loadError) {
        if (!cancelled) {
          setPreviousResult({
            requestKey: previousRequestKey,
            status: 'error',
            transactions: [],
            error: loadError instanceof Error ? loadError.message : 'Impossibile caricare il confronto con l’esercizio precedente.',
          })
        }
      }
    }

    void loadPreviousYear()
    return () => { cancelled = true }
  }, [entity, previousRequestKey, token, year])

  const previousReports = useMemo(() => buildAccountingReports(previousTransactions), [previousTransactions])
  const previousBalance = previousReports.statoPatrimoniale
  const activitySections = makeBalanceSections(
    statoPatrimoniale.attivita.map(({ conto, saldo }) => ({ conto, saldo })),
    previousBalance.attivita.map(({ conto, saldo }) => ({ conto, saldo })),
    'activity',
  )
  const liabilitySections = makeBalanceSections(statoPatrimoniale.passivita, previousBalance.passivita, 'liability')
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
              title="Attività"
              subtitle="Impieghi"
              sections={activitySections}
              total={statoPatrimoniale.totaleAttivita}
              previousTotal={previousStatus === 'ready' ? previousBalance.totaleAttivita : null}
              year={year}
              previousYear={year - 1}
              previousReady={previousStatus === 'ready'}
              side="activity"
            />
            <BalanceSide
              title="Passività e patrimonio netto"
              subtitle="Fonti"
              sections={liabilitySections}
              total={statoPatrimoniale.totalePassivita}
              previousTotal={previousStatus === 'ready' ? previousBalance.totalePassivita : null}
              year={year}
              previousYear={year - 1}
              previousReady={previousStatus === 'ready'}
              side="liability"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
            <p className={`flex items-center gap-2 text-sm font-semibold ${!hasBalanceRows ? 'text-stone-500' : Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'text-emerald-800' : 'text-rose-700'}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${!hasBalanceRows ? 'bg-stone-400' : Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'bg-emerald-600' : 'bg-rose-600'}`} />
              {!hasBalanceRows ? 'Nessun saldo patrimoniale da esporre' : Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) < 0.01 ? 'Stato Patrimoniale quadrato' : 'Stato Patrimoniale da verificare'}
            </p>
            {hasBalanceRows && Math.abs(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita) >= 0.01 && (
              <p className="text-sm text-rose-700">Differenza: {euro.format(statoPatrimoniale.totaleAttivita - statoPatrimoniale.totalePassivita)}</p>
            )}
          </div>
          {previousStatus === 'loading' && <p className="border-t border-stone-200 px-5 py-3 text-xs text-stone-500">Caricamento confronto {year - 1}…</p>}
          {previousStatus === 'error' && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900" role="status">
              Confronto {year - 1} non disponibile: {previousError}
            </p>
          )}
          {previousStatus === 'ready' && previousError && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900" role="status">
              Impossibile aggiornare il confronto {year - 1}; sono mostrati i dati locali disponibili. {previousError}
            </p>
          )}
          {previousStatus === 'ready' && !token && (
            <p className="border-t border-stone-200 px-5 py-3 text-xs text-stone-500">Confronto {year - 1} basato sui dati presenti in questo dispositivo.</p>
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
  subtitle,
  sections,
  total,
  previousTotal,
  year,
  previousYear,
  previousReady,
  side,
}: {
  title: string
  subtitle: string
  sections: BalanceSection[]
  total: number
  previousTotal: number | null
  year: number
  previousYear: number
  previousReady: boolean
  side: 'activity' | 'liability'
}) {
  return (
    <section className={`${side === 'liability' ? 'border-t border-stone-200 lg:border-l lg:border-t-0' : ''}`}>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-4 sm:px-5">
        <div>
          <h3 className="font-semibold text-stone-900">{title}</h3>
          <p className="mt-1 text-xs uppercase tracking-wider text-stone-500">{subtitle}</p>
        </div>
        <span className={`rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${side === 'activity' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>
          {side === 'activity' ? 'Dare' : 'Avere'}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] table-fixed text-sm">
          <colgroup><col className="w-[46%]" /><col className="w-[27%]" /><col className="w-[27%]" /></colgroup>
          <thead className="border-b border-stone-200 bg-white text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold sm:px-5">Voce</th>
              <th className="px-2 py-2.5 text-right font-semibold">{year}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{previousYear}</th>
            </tr>
          </thead>
          {sections.some((section) => section.rows.length > 0) ? sections.map((section) => (
            <tbody key={section.code}>
              <tr className="border-y border-stone-200 bg-stone-100/80">
                <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-stone-700 sm:px-5" colSpan={3}>
                  <span className="mr-2 text-emerald-800">{section.code}</span>{section.title}
                </th>
              </tr>
              {section.rows.length ? section.rows.map((row) => (
                <tr key={row.conto} className="border-b border-dotted border-stone-300 last:border-solid hover:bg-stone-50">
                  <td className="break-words px-4 py-2 text-stone-700 sm:px-5">{row.conto}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-stone-800">{balanceAmount(row.corrente)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-stone-500">{previousReady ? balanceAmount(row.precedente) : '—'}</td>
                </tr>
              )) : (
                <tr className="border-b border-stone-100">
                  <td className="px-4 py-2 text-xs italic text-stone-400 sm:px-5">Nessuna voce</td>
                  <td className="px-2 py-2 text-right text-stone-300">—</td>
                  <td className="px-3 py-2 text-right text-stone-300">—</td>
                </tr>
              )}
              {section.rows.length > 0 && (
                <tr className="border-b border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-600">
                  <td className="px-4 py-2 sm:px-5">Totale {section.title.toLowerCase()}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{balanceAmount(sumRows(section.rows, 'corrente'))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{previousReady ? balanceAmount(sumRows(section.rows, 'precedente')) : '—'}</td>
                </tr>
              )}
            </tbody>
          )) : (
            <tbody><tr><td className="px-4 py-8 text-center text-sm text-stone-500 sm:px-5" colSpan={3}>Nessun saldo da esporre per l’esercizio {year}.</td></tr></tbody>
          )}
          <tfoot className="border-t-2 border-amber-400 bg-amber-50 text-sm font-bold text-stone-900">
            <tr>
              <td className="px-4 py-3 sm:px-5">Totale {side === 'activity' ? 'attività' : 'passività e patrimonio netto'}</td>
              <td className="px-2 py-3 text-right tabular-nums">{balanceAmount(total)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{previousReady && previousTotal !== null ? balanceAmount(previousTotal) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function makeBalanceSections(currentRows: BalanceRow[], previousRows: BalanceRow[], side: 'activity' | 'liability'): BalanceSection[] {
  const sections = side === 'activity'
    ? [
      { code: 'A)', title: 'Immobilizzazioni' },
      { code: 'B.I)', title: 'Rimanenze' },
      { code: 'B.II)', title: 'Crediti e altre attività' },
      { code: 'B.III)', title: 'Disponibilità liquide' },
      { code: 'B.IV)', title: 'Altre attività correnti' },
      { code: 'C)', title: 'Ratei e risconti attivi' },
    ]
    : [
      { code: 'A)', title: 'Patrimonio netto' },
      { code: 'B)', title: 'Fondi rischi e oneri' },
      { code: 'C)', title: 'Debiti' },
      { code: 'D)', title: 'Ratei e risconti passivi' },
      { code: 'E)', title: 'Altre passività' },
    ]
  const grouped = sections.map((section) => ({ ...section, rows: [] as BalanceSection['rows'] }))
  const byName = new Map<string, { conto: string; corrente: number; precedente: number }>()

  currentRows.forEach(({ conto, saldo }) => {
    byName.set(conto, { conto, corrente: saldo, precedente: 0 })
  })
  previousRows.forEach(({ conto, saldo }) => {
    const row = byName.get(conto)
    if (row) row.precedente = saldo
    else byName.set(conto, { conto, corrente: 0, precedente: saldo })
  })

  byName.forEach((row) => {
    const name = normalizeAccountName(row.conto)
    let sectionIndex: number
    if (/ratei|risconti/.test(name)) {
      sectionIndex = side === 'activity' ? 5 : 3
    } else if (side === 'activity') {
      if (/immobil|terren|fabbric|impiant|macchin|attrezz|autovett|automez|arred|brevet|marchi|software|azion|etf|titoli|obbligaz|partecipaz/.test(name)) sectionIndex = 0
      else if (/rimanenz|magazzin|scort/.test(name)) sectionIndex = 1
      else if (/credit|client|tribut|erario|depositi|anticipi/.test(name)) sectionIndex = 2
      else if (/banca|cassa|liquidit|conto corrente|portafoglio|denaro/.test(name)) sectionIndex = 3
      else sectionIndex = 4
    } else if (/capitale|patrimonio netto|riserv|utile|perdita|risultato d'esercizio|titolare/.test(name)) {
      sectionIndex = 0
    } else if (/fond[oi]|rischi|oneri|accantonament/.test(name)) {
      sectionIndex = 1
    } else if (/debit|mutu|fornitor|carta|iva a debito/.test(name)) {
      sectionIndex = 2
    } else {
      sectionIndex = 4
    }
    grouped[sectionIndex].rows.push(row)
  })

  grouped.forEach((section) => section.rows.sort((left, right) => left.conto.localeCompare(right.conto, 'it')))
  return grouped
}

function normalizeAccountName(name: string) {
  return name.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sumRows(rows: BalanceSection['rows'], key: 'corrente' | 'precedente') {
  return Math.round(rows.reduce((sum, row) => sum + row[key], 0) * 100) / 100
}