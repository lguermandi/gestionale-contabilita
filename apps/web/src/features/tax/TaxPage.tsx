import { useMemo, useState } from 'react'
import { buildAccountingReportsForYear, type AccountBalance } from '../../domain/accounting'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'
import { buildTaxCalendar, type TaxDeadline } from './taxCalendar'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const kindLabels: Record<TaxDeadline['kind'], string> = {
  iva: 'IVA',
  redditi: 'Imposte sui redditi',
  declaration: 'Dichiarazione',
}

function findAccountBalance(accounts: AccountBalance[], names: string[]) {
  const wanted = names.map((name) => name.toLocaleLowerCase('it')).filter(Boolean)
  return accounts
    .filter((account) => wanted.some((name) => account.conto.toLocaleLowerCase('it').includes(name)))
    .reduce((total, account) => total + account.saldo, 0)
}

export function TaxPage() {
  const year = useLedgerStore((state) => state.selectedYear)
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const profile = useProfileStore((state) => state.companyProfile)
  const [showPast, setShowPast] = useState(false)
  const reports = useMemo(
    () => buildAccountingReportsForYear([...historyTransactions, ...transactions], year),
    [historyTransactions, transactions, year],
  )

  const vatDebit = findAccountBalance(reports.saldi, [profile.conti.iva ?? '', 'IVA a debito'])
  const vatCredit = findAccountBalance(reports.saldi, [profile.conti.ivaCredito ?? '', 'IVA a credito'])
  const vatNet = vatDebit - vatCredit
  const vatDue = vatNet > 0 ? vatNet : 0
  const vatCreditBalance = vatNet < 0 ? Math.abs(vatNet) : 0
  const taxableIncome = Math.max(reports.contoEconomico.utile, 0)
  const iresEstimate = taxableIncome * 0.24
  const irapEstimate = taxableIncome * 0.039
  const today = new Date().toISOString().slice(0, 10)
  const deadlines = buildTaxCalendar(year).filter((item) => showPast || item.date >= today)

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-6 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">Area fiscale · {year}</p>
        <h1 className="text-2xl font-semibold text-stone-950">Tasse e scadenze</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">
          Indicazioni operative basate sui dati contabili disponibili. Importi e scadenze possono cambiare: verifica sempre con il tuo consulente fiscale.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">IVA da versare</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{euro.format(vatDue)}</p>
          <p className="mt-2 text-xs text-stone-500">Differenza IVA a debito meno credito</p>
        </article>
        <article className="border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">Credito IVA</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{euro.format(vatCreditBalance)}</p>
          <p className="mt-2 text-xs text-stone-500">Credito da liquidazione o riporto</p>
        </article>
        <article className="border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">IRES indicativa</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{euro.format(iresEstimate)}</p>
          <p className="mt-2 text-xs text-stone-500">Stima al 24% del risultato positivo</p>
        </article>
        <article className="border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-600">IRAP indicativa</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{euro.format(irapEstimate)}</p>
          <p className="mt-2 text-xs text-stone-500">Stima orientativa al 3,90%</p>
        </article>
      </div>

      <section className="mb-6 border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Prima di effettuare un versamento</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          L’app non sostituisce la liquidazione fiscale: controlla compensazioni, acconti, esenzioni, regimi speciali, ritenute e contributi.
          La base IRES e IRAP effettiva può essere diversa dal risultato contabile.
        </p>
      </section>

      <section className="border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Calendario fiscale</h2>
            <p className="mt-1 text-sm text-stone-500">Scadenze principali, soggette alle proroghe ufficiali</p>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />
            Mostra scadenze passate
          </label>
        </div>
        <div className="divide-y divide-stone-200">
          {deadlines.length ? deadlines.map((deadline) => (
            <article key={`${deadline.date}-${deadline.title}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[140px_170px_1fr] sm:items-start">
              <time dateTime={deadline.date} className="font-semibold text-stone-900">
                {new Date(`${deadline.date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </time>
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{kindLabels[deadline.kind]}</span>
              <div>
                <h3 className="font-medium text-stone-900">{deadline.title}</h3>
                <p className="mt-1 text-sm leading-6 text-stone-600">{deadline.description}</p>
              </div>
            </article>
          )) : (
            <p className="px-5 py-8 text-sm text-stone-500">Nessuna scadenza futura mostrata per questa selezione.</p>
          )}
        </div>
      </section>
    </section>
  )
}
