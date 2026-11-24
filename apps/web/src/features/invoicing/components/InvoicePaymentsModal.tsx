import { useState, type FormEvent } from 'react'
import type { LedgerTransaction } from '../../../domain/accounting'
import type { InvoicePayment } from '../../../domain/invoicing'

const inputClass = 'mt-1 min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface DocumentPaymentInput {
  data: string
  importo: number
  conto: string
}

export interface InvoicePaymentsModalProps {
  documentLabel: string
  documentNumber: string
  counterparty: string
  status: string
  total: number
  paid: number
  remaining: number
  dueDate?: string
  payments: InvoicePayment[]
  transactions: LedgerTransaction[]
  cashAccounts: string[]
  canPay: boolean
  busy: boolean
  errorMessage?: string
  onClose: () => void
  onRegister: (payment: DocumentPaymentInput) => void
}

export function InvoicePaymentsModal({
  documentLabel,
  documentNumber,
  counterparty,
  status,
  total,
  paid,
  remaining,
  dueDate,
  payments,
  transactions,
  cashAccounts,
  canPay,
  busy,
  errorMessage,
  onClose,
  onRegister,
}: InvoicePaymentsModalProps) {
  const [data, setData] = useState(localDate)
  const [importo, setImporto] = useState(remaining.toFixed(2))
  const [conto, setConto] = useState(cashAccounts[0] || '')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cents = Math.round((Number(importo) + Number.EPSILON) * 100)
    const parsedDate = new Date(`${data}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== data) {
      setError('Inserisci una data di pagamento valida.')
      return
    }
    if (!Number.isFinite(cents) || cents <= 0 || cents > Math.round(remaining * 100)) {
      setError(`Importo non valido. Residuo: ${euro.format(remaining)}.`)
      return
    }
    if (!conto.trim()) {
      setError('Seleziona il conto bancario o di cassa.')
      return
    }
    setError('')
    onRegister({ data, importo: cents / 100, conto })
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="invoice-payments-title">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{documentLabel} · {documentNumber}</p>
            <h2 id="invoice-payments-title" className="mt-1 text-xl font-semibold text-stone-950">Pagamenti e scritture collegate</h2>
            <p className="mt-1 text-sm text-stone-600">{counterparty}</p>
          </div>
          <button type="button" className="size-9 text-xl text-stone-500 hover:bg-stone-100" aria-label="Chiudi" onClick={onClose}>×</button>
        </div>

        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-stone-500">Documento</dt><dd className="mt-1 font-semibold">{euro.format(total)}</dd></div>
          <div><dt className="text-stone-500">Pagato</dt><dd className="mt-1 font-semibold">{euro.format(paid)}</dd></div>
          <div><dt className="text-stone-500">Residuo</dt><dd className="mt-1 font-semibold">{euro.format(remaining)}</dd></div>
          <div><dt className="text-stone-500">Stato</dt><dd className="mt-1 font-semibold">{status}</dd></div>
        </dl>
        {dueDate && <p className="mb-5 text-sm text-stone-600">Scadenza: {new Date(`${dueDate}T00:00:00`).toLocaleDateString('it-IT')}</p>}

        <section className="mb-5 border-t border-stone-200 pt-4">
          <h3 className="mb-2 font-semibold text-stone-900">Incassi o pagamenti registrati</h3>
          {payments.length ? (
            <ul className="divide-y divide-stone-100">
              {[...payments].sort((left, right) => left.data.localeCompare(right.data)).map((payment) => (
                <li key={payment.linkedTransactionId || `${payment.data}:${payment.importo}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>{new Date(`${payment.data}T00:00:00`).toLocaleDateString('it-IT')} · {payment.conto}</span>
                  <span className="font-medium tabular-nums">{euro.format(payment.importo)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">Nessun pagamento parziale registrato.</p>}
        </section>

        <section className="mb-5 border-t border-stone-200 pt-4">
          <h3 className="mb-2 font-semibold text-stone-900">Prima Nota</h3>
          {transactions.length ? (
            <ul className="divide-y divide-stone-100">
              {[...transactions].sort((left, right) => left.data.localeCompare(right.data)).map((transaction) => (
                <li key={transaction.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>{new Date(`${transaction.data}T00:00:00`).toLocaleDateString('it-IT')} · {transaction.movimenti[0]?.descrizione || transaction.id}</span>
                  <span className="font-medium tabular-nums">{euro.format(transaction.totale)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">Le scritture collegate non sono caricate nell’esercizio corrente.</p>}
        </section>

        {canPay && remaining > 0 && (
          <form onSubmit={submit} className="grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-3">
            <label className="block text-sm text-stone-700">Data pagamento
              <input className={inputClass} type="date" value={data} onChange={(event) => setData(event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700">Importo
              <input className={inputClass} type="number" min="0.01" max={remaining} step="0.01" value={importo} onChange={(event) => setImporto(event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700">Banca / cassa
              <select className={inputClass} value={conto} onChange={(event) => setConto(event.target.value)} required>
                {cashAccounts.map((account) => <option key={account} value={account}>{account}</option>)}
              </select>
            </label>
            {error && <p className="sm:col-span-3 text-sm text-rose-800" role="alert">{error}</p>}
            {errorMessage && <p className="sm:col-span-3 text-sm text-rose-800" role="alert">{errorMessage}</p>}
            <div className="flex justify-end gap-3 sm:col-span-3">
              <button type="button" className="min-h-10 px-4 text-sm text-stone-700" onClick={onClose}>Chiudi</button>
              <button type="submit" className="min-h-10 bg-stone-950 px-5 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !cashAccounts.length}>{busy ? 'Registrazione…' : 'Registra pagamento'}</button>
            </div>
          </form>
        )}
        {!canPay && <p className="border-t border-stone-200 pt-4 text-sm text-stone-600">Questo documento non genera un credito o debito da saldare.</p>}
      </section>
    </div>
  )
}
