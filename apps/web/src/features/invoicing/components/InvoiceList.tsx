import { useMemo, useState } from 'react'
import { getInvoicePaymentStatus, type IssuedInvoice } from '../../../domain/invoicing'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

interface InvoiceListProps {
  invoices: IssuedInvoice[]
  year: number
  archivingInvoiceId: string
  onNewInvoice: () => void
  onPdf: (invoice: IssuedInvoice) => void
  onXml: (invoice: IssuedInvoice) => void
  onArchive: (invoice: IssuedInvoice) => void
  onPayments: (invoice: IssuedInvoice) => void
}

export function InvoiceList({
  invoices,
  year,
  archivingInvoiceId,
  onNewInvoice,
  onPdf,
  onXml,
  onArchive,
  onPayments,
}: InvoiceListProps) {
  const [query, setQuery] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState<'all' | 'paid' | 'open' | 'overdue'>('all')
  const [pageSize, setPageSize] = useState(10)
  const [pageNumber, setPageNumber] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('it')
    const normalizedCustomerQuery = customerQuery.trim().toLocaleLowerCase('it')
    const today = new Date().toISOString().slice(0, 10)
    return invoices.filter((invoice) => {
      const text = [
        invoice.numero,
        invoice.cliente.ragioneSociale,
        ...invoice.linee.map((line) => line.descrizione),
      ].join(' ').toLocaleLowerCase('it')
      const paymentStatus = getInvoicePaymentStatus(invoice, today)
      const statusMatches = status === 'all'
        || (status === 'paid' && paymentStatus === 'Saldata')
        || (status === 'open' && ['Da incassare', 'Parziale'].includes(paymentStatus))
        || (status === 'overdue' && paymentStatus === 'Scaduta')
      return (!normalizedQuery || text.includes(normalizedQuery))
        && (!normalizedCustomerQuery || invoice.cliente.ragioneSociale.toLocaleLowerCase('it').includes(normalizedCustomerQuery))
        && (!dateFrom || invoice.data >= dateFrom)
        && (!dateTo || invoice.data <= dateTo)
        && statusMatches
    })
  }, [customerQuery, dateFrom, dateTo, invoices, query, status])
  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / pageSize))
  const currentPage = Math.min(pageNumber, pageCount)
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setPageNumber(1)
  }

  function downloadSelectedInvoices() {
    const selected = invoices.filter((invoice) => selectedIds.includes(invoice.id))
    if (!selected.length) return
    const rows = [
      ['Numero', 'Data', 'Cliente', 'Oggetto', 'Totale EUR', 'Stato'],
      ...selected.map((invoice) => [
        invoice.numero,
        invoice.data,
        invoice.cliente.ragioneSociale,
        invoice.linee.map((line) => line.descrizione).join('; '),
        String(invoice.totali.totale),
        getInvoicePaymentStatus(invoice),
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => {
      const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value
      return `"${safeValue.replaceAll('"', '""')}"`
    }).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Fatture-selezionate-${year}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="border border-stone-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 p-5">
        <label className="min-w-60 flex-1 text-sm text-stone-600">Ricerca fatture
          <input className={`${inputClass} mt-1`} type="search" placeholder="Numero, cliente o descrizione…" value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} />
        </label>
        <button type="button" className="min-h-10 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-emerald-900" onClick={onNewInvoice}>Nuova fattura</button>
        <div className="grid w-full gap-3 md:grid-cols-4">
          <label className="text-sm text-stone-600">Cliente
            <input className={`${inputClass} mt-1`} type="search" value={customerQuery} onChange={(event) => updateFilter(setCustomerQuery, event.target.value)} placeholder="Cerca cliente" />
          </label>
          <label className="text-sm text-stone-600">Da
            <input className={`${inputClass} mt-1`} type="date" value={dateFrom} onChange={(event) => updateFilter(setDateFrom, event.target.value)} />
          </label>
          <label className="text-sm text-stone-600">A
            <input className={`${inputClass} mt-1`} type="date" value={dateTo} onChange={(event) => updateFilter(setDateTo, event.target.value)} />
          </label>
          <label className="text-sm text-stone-600">Stato
            <select className={`${inputClass} mt-1`} value={status} onChange={(event) => updateFilter(setStatus, event.target.value as typeof status)}>
              <option value="all">Tutti</option><option value="open">Da incassare</option><option value="paid">Incassate</option><option value="overdue">Scadute</option>
            </select>
          </label>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
          <span>Mostrati {pagedInvoices.length} risultati su {filteredInvoices.length}</span>
          <label className="flex items-center gap-2">Risultati per pagina
            <select className="min-h-9 border border-stone-300 bg-white px-2 text-sm text-stone-800" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageNumber(1) }}>
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>
        {selectedIds.length > 0 && <div className="flex w-full items-center justify-between bg-indigo-50 px-3 py-2 text-sm text-indigo-900"><span>{selectedIds.length} selezionate</span><button type="button" className="font-medium underline" onClick={downloadSelectedInvoices}>Esporta selezione CSV</button></div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-stone-500">
            <tr>
              <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Seleziona fatture visibili" checked={pagedInvoices.length > 0 && pagedInvoices.every((invoice) => selectedIds.includes(invoice.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...pagedInvoices.map((invoice) => invoice.id)])] : current.filter((id) => !pagedInvoices.some((invoice) => invoice.id === id)))} /></th>
              <th className="px-4 py-3">N.</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Oggetto</th><th className="px-4 py-3 text-right">Importo</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Stato</th><th className="px-4 py-3">Scadenza</th><th className="px-4 py-3"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pagedInvoices.map((invoice) => {
              const paymentStatus = getInvoicePaymentStatus(invoice)
              return (
                <tr key={invoice.id}>
                  <td className="px-4 py-4"><input type="checkbox" aria-label={`Seleziona fattura ${invoice.numero}`} checked={selectedIds.includes(invoice.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id))} /></td>
                  <td className="px-4 py-4 font-semibold">{invoice.numero}</td>
                  <td className="px-4 py-4">{invoice.cliente.ragioneSociale}</td>
                  <td className="max-w-56 truncate px-4 py-4" title={invoice.linee.map((line) => line.descrizione).join(', ')}>{invoice.linee.map((line) => line.descrizione).join(', ') || '—'}</td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums">{euro.format(invoice.totali.totale)}</td>
                  <td className="px-4 py-4">{new Date(`${invoice.data}T00:00:00`).toLocaleDateString('it-IT')}</td>
                  <td className="px-4 py-4"><span className={`inline-flex px-2 py-1 text-xs font-medium ${paymentStatus === 'Saldata' ? 'bg-emerald-100 text-emerald-900' : paymentStatus === 'Scaduta' ? 'bg-rose-100 text-rose-900' : paymentStatus === 'Autofattura' || paymentStatus === 'Nota di credito' ? 'bg-slate-100 text-slate-700' : paymentStatus === 'Parziale' ? 'bg-indigo-100 text-indigo-900' : 'bg-amber-100 text-amber-900'}`}>{paymentStatus}</span></td>
                  <td className="px-4 py-4">{invoice.pagamento?.scadenza ? new Date(`${invoice.pagamento.scadenza}T00:00:00`).toLocaleDateString('it-IT') : '—'}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button className="font-medium text-indigo-700 underline" type="button" onClick={() => onPayments(invoice)}>Pagamenti</button>
                      <button className="font-medium text-emerald-900 underline" type="button" onClick={() => onPdf(invoice)}>PDF</button>
                      <button className="font-medium text-indigo-700 underline" type="button" disabled={archivingInvoiceId === invoice.id} onClick={() => onXml(invoice)}>{archivingInvoiceId === invoice.id ? 'Archiviazione…' : 'XML su Drive'}</button>
                      <button className="font-medium text-stone-700 underline" type="button" disabled={archivingInvoiceId === invoice.id} onClick={() => onArchive(invoice)}>{archivingInvoiceId === invoice.id ? 'Archiviazione…' : invoice.archivio ? 'Aggiorna Drive' : 'Archivia'}</button>
                      {invoice.archivio?.folderUrl && <a className="font-medium text-stone-600 underline" href={invoice.archivio.folderUrl} target="_blank" rel="noreferrer">Drive</a>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!pagedInvoices.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={9}>{invoices.length ? 'Nessuna fattura corrisponde ai filtri.' : 'Nessuna fattura emessa per questo esercizio.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3 text-sm">
        <button type="button" className="min-h-9 px-3 text-stone-700 disabled:opacity-40" disabled={pageNumber <= 1} onClick={() => setPageNumber((current) => Math.max(1, current - 1))}>Precedente</button>
        <span className="text-xs text-stone-500">Pagina {currentPage} di {pageCount}</span>
        <button type="button" className="min-h-9 px-3 text-stone-700 disabled:opacity-40" disabled={currentPage >= pageCount} onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}>Successiva</button>
      </div>
    </section>
  )
}
