import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { fetchCreditNotes, fetchCustomers, fetchInvoices, issueCreditNote, issueInvoice, saveCustomer } from '../../api/ledgerApi'
import {
  calculateInvoiceTotals,
  validateInvoice,
  type CreditNoteDraft,
  type InvoiceCustomer,
  type InvoiceDraft,
  type IssuedCreditNote,
  type InvoiceLine,
  type IssuedInvoice,
} from '../../domain/invoicing'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useEntityStore } from '../../stores/entityStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'
import { downloadInvoicePdf } from './invoicePdf'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function currentDate(year: number) {
  const now = new Date()
  return year === now.getFullYear()
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : `${year}-01-01`
}

function newLine(): InvoiceLine {
  return { id: createId(), descrizione: '', quantita: 1, prezzoUnitario: 0 }
}

function newDraft(year: number, accounts: InvoiceDraft['conti']): InvoiceDraft {
  return {
    id: createId(),
    data: currentDate(year),
    cliente: { ragioneSociale: '', indirizzo: '', partitaIva: '', email: '', nazione: 'Italia' },
    linee: [newLine()],
    aliquotaIva: 22,
    aliquotaCassa: 0,
    aliquotaRitenuta: 0,
    note: '',
    conti: {
      ...accounts,
      bollo: accounts.bollo || 'Debiti per imposta di bollo',
      incassi: accounts.incassi || 'Banca c/c',
    },
    pagamento: { metodo: '', scadenza: '', incassata: false },
    marcaDaBollo: { addebitata: false, importo: 2, identificativo: '' },
  }
}

function emptyCustomer(): InvoiceCustomer {
  return {
    id: createId(),
    ragioneSociale: '',
    indirizzo: '',
    partitaIva: '',
    codiceFiscale: '',
    email: '',
    nazione: 'Italia',
    tipologia: 'Società',
    cap: '',
    comune: '',
    telefono: '',
  }
}

export function InvoicesPage({ year }: { year: number }) {
  const token = useGasSessionStore((state) => state.token)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const spreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const refreshLedger = useLedgerStore((state) => state.refresh)
  const company = useProfileStore((state) => state.companyProfile)
  const setCompanyProfile = useProfileStore((state) => state.setCompanyProfile)
  const [draft, setDraft] = useState(() => newDraft(year, company.conti))
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([])
  const [customers, setCustomers] = useState<InvoiceCustomer[]>([])
  const [customerScope, setCustomerScope] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [page, setPage] = useState<'invoice' | 'archive' | 'customers' | 'credit-note'>('archive')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceCustomerQuery, setInvoiceCustomerQuery] = useState('')
  const [invoiceFrom, setInvoiceFrom] = useState('')
  const [invoiceTo, setInvoiceTo] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState<'all' | 'paid' | 'open' | 'overdue'>('all')
  const [invoicePageSize, setInvoicePageSize] = useState(10)
  const [invoicePageNumber, setInvoicePageNumber] = useState(1)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [customerDraft, setCustomerDraft] = useState<InvoiceCustomer | null>(null)
  const [customerError, setCustomerError] = useState('')
  const [customerLoadError, setCustomerLoadError] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [creditNotes, setCreditNotes] = useState<IssuedCreditNote[]>([])
  const [creditNoteScope, setCreditNoteScope] = useState('')
  const [creditDate, setCreditDate] = useState(() => currentDate(year))
  const [creditInvoiceId, setCreditInvoiceId] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditError, setCreditError] = useState('')
  const [creditSaving, setCreditSaving] = useState(false)
  const [invoiceScope, setInvoiceScope] = useState('')
  const [loadError, setLoadError] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const totals = useMemo(() => calculateInvoiceTotals(draft), [draft])
  const visibleInvoices = useMemo(
    () => invoiceScope === `${year}:${token}:${spreadsheetId}` ? invoices : [],
    [invoiceScope, invoices, spreadsheetId, token, year],
  )
  const scopedCreditNotes = creditNoteScope === `${year}:${token}:${spreadsheetId}` ? creditNotes : []
  const availableToCredit = (invoice: IssuedInvoice) => {
    const alreadyCreditedCents = scopedCreditNotes
      .filter((note) => note.fatturaId === invoice.id)
      .reduce((sum, note) => sum + Math.round(note.importo * 100), 0)
    return Math.max(0, Math.round(invoice.totali.totale * 100) - alreadyCreditedCents) / 100
  }
  const filteredInvoices = useMemo(() => {
    const query = invoiceQuery.trim().toLocaleLowerCase('it')
    const customerQuery = invoiceCustomerQuery.trim().toLocaleLowerCase('it')
    const today = new Date().toISOString().slice(0, 10)
    return visibleInvoices.filter((invoice) => {
      const text = [
        invoice.numero,
        invoice.cliente.ragioneSociale,
        ...invoice.linee.map((line) => line.descrizione),
      ].join(' ').toLocaleLowerCase('it')
      const paid = invoice.pagamento?.incassata === true
      const overdue = !paid && Boolean(invoice.pagamento?.scadenza && invoice.pagamento.scadenza < today)
      const statusMatches = invoiceStatus === 'all'
        || (invoiceStatus === 'paid' && paid)
        || (invoiceStatus === 'open' && !paid && !overdue)
        || (invoiceStatus === 'overdue' && overdue)
      return (!query || text.includes(query))
        && (!customerQuery || invoice.cliente.ragioneSociale.toLocaleLowerCase('it').includes(customerQuery))
        && (!invoiceFrom || invoice.data >= invoiceFrom)
        && (!invoiceTo || invoice.data <= invoiceTo)
        && statusMatches
    })
  }, [invoiceCustomerQuery, invoiceFrom, invoiceQuery, invoiceStatus, invoiceTo, visibleInvoices])
  const invoicePageCount = Math.max(1, Math.ceil(filteredInvoices.length / invoicePageSize))
  const safeInvoicePageNumber = Math.min(invoicePageNumber, invoicePageCount)
  const pagedInvoices = filteredInvoices.slice((safeInvoicePageNumber - 1) * invoicePageSize, safeInvoicePageNumber * invoicePageSize)
  const scopedCustomers = useMemo(
    () => customerScope === `${token}:${spreadsheetId}` ? customers : [],
    [customerScope, customers, spreadsheetId, token],
  )
  const visibleCustomers = useMemo(() => {
    const query = customerQuery.trim().toLocaleLowerCase('it')
    return scopedCustomers.filter((customer) => !query || [
      customer.ragioneSociale, customer.partitaIva, customer.codiceFiscale,
      customer.email, customer.tipologia, customer.telefono,
    ].some((value) => value?.toLocaleLowerCase('it').includes(query)))
  }, [customerQuery, scopedCustomers])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    fetchInvoices(year, token, spreadsheetId).then((result) => {
      if (!cancelled) {
        setInvoices(result)
        setInvoiceScope(`${year}:${token}:${spreadsheetId}`)
        setLoadError('')
      }
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : 'Impossibile caricare le fatture.'
      setLoadError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, spreadsheetId, token, year])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    fetchCreditNotes(year, token, spreadsheetId).then((result) => {
      if (!cancelled) {
        setCreditNotes(result)
        setCreditNoteScope(`${year}:${token}:${spreadsheetId}`)
      }
    }).catch((error: unknown) => {
      if (!cancelled) setCreditError(error instanceof Error ? error.message : 'Impossibile caricare le note di credito.')
    })
    return () => { cancelled = true }
  }, [clearToken, spreadsheetId, token, year])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    fetchCustomers(token, spreadsheetId).then((result) => {
      if (!cancelled) {
        setCustomers(result)
        setCustomerScope(`${token}:${spreadsheetId}`)
        setCustomerLoadError('')
      }
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : 'Impossibile caricare i clienti.'
      setCustomerLoadError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, spreadsheetId, token])

  function updateCustomer(key: keyof InvoiceDraft['cliente'], value: string) {
    setDraft((current) => ({ ...current, cliente: { ...current.cliente, [key]: value } }))
  }

  function updateLine(id: string, key: keyof Omit<InvoiceLine, 'id'>, value: string) {
    setDraft((current) => ({
      ...current,
      linee: current.linee.map((line) => line.id === id
        ? { ...line, [key]: key === 'descrizione' ? value : Number(value) }
        : line),
    }))
  }

  function selectCustomer(id: string) {
    const selected = customers.find((customer) => customer.id === id)
    if (selected) setDraft((current) => ({ ...current, cliente: { ...selected } }))
    else setDraft((current) => ({ ...current, cliente: { ...current.cliente, id: undefined } }))
  }

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !spreadsheetId || !customerDraft) return
    setSavingCustomer(true)
    setCustomerError('')
    try {
      const saved = await saveCustomer(token, customerDraft, spreadsheetId || undefined)
      setCustomers((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort(
        (left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'),
      ))
      setCustomerScope(`${token}:${spreadsheetId}`)
      setDraft((current) => ({ ...current, cliente: { ...saved } }))
      setCustomerDraft(null)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Salvataggio cliente non riuscito.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setCustomerError(text)
    } finally {
      setSavingCustomer(false)
    }
  }

  async function handleCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreditError('')
    if (!token) {
      setCreditError('Accedi a GAS per emettere una nota di credito.')
      return
    }
    if (!spreadsheetId) {
      setCreditError('Seleziona un’entità aziendale prima di emettere una nota di credito.')
      return
    }
    if (creditDate.slice(0, 4) !== String(year)) {
      setCreditError(`La data della nota deve appartenere all’esercizio ${year}.`)
      return
    }
    const original = visibleInvoices.find((invoice) => invoice.id === creditInvoiceId)
    if (!original) {
      setCreditError('Seleziona una fattura originaria emessa.')
      return
    }
    const amount = Number(creditAmount)
    const remaining = availableToCredit(original)
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setCreditError(`Importo non valido. Residuo stornabile: ${euro.format(remaining)}.`)
      return
    }
    const creditNote: CreditNoteDraft = {
      id: createId(),
      data: creditDate,
      fatturaId: original.id,
      importo: amount,
      note: creditReason,
    }
    setCreditSaving(true)
    try {
      const issued = await issueCreditNote(token, creditNote, spreadsheetId || undefined)
      setCreditNotes((current) => [issued, ...current.filter((note) => note.id !== issued.id)])
      setCreditNoteScope(`${year}:${token}:${spreadsheetId}`)
      setCreditAmount('')
      setCreditReason('')
      setCreditError('')
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Emissione della nota di credito non riuscita.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setCreditError(text)
    } finally {
      setCreditSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const validationErrors = validateInvoice(draft)
    if (draft.data.slice(0, 4) !== String(year)) validationErrors.push(`La data deve appartenere all’esercizio ${year}.`)
    if (!company.ragioneSociale.trim() || !company.indirizzo.trim() || !company.partitaIva.trim()) {
      validationErrors.push('Completa ragione sociale, sede legale e partita IVA nelle Impostazioni.')
    }
    setErrors([...new Set(validationErrors)])
    if (validationErrors.length) return
    if (!token) {
      setMessage('Accedi a GAS dalla barra superiore prima di emettere la fattura.')
      return
    }
    if (!spreadsheetId) {
      setMessage('Seleziona un’entità aziendale prima di emettere la fattura.')
      return
    }

    setSaving(true)
    try {
      const invoice = await issueInvoice(token, draft, spreadsheetId || undefined)
      setInvoices((current) => [invoice, ...current.filter((item) => item.id !== invoice.id)])
      setInvoiceScope(`${year}:${token}:${spreadsheetId}`)
      void refreshLedger(year, token, 'business', spreadsheetId)
      setCompanyProfile({ ...company, conti: draft.conti })
      try {
        downloadInvoicePdf(invoice, company)
        setMessage(`Fattura ${invoice.numero} emessa e PDF scaricato.`)
      } catch {
        setMessage(`Fattura ${invoice.numero} emessa; il PDF può essere scaricato dallo storico.`)
      }
      setDraft(newDraft(year, draft.conti))
      setErrors([])
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Emissione della fattura non riuscita.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setMessage(text)
    } finally {
      setSaving(false)
    }
  }

  function handlePdf(invoice: IssuedInvoice) {
    try {
      downloadInvoicePdf(invoice, company)
    } catch {
      setMessage('Impossibile generare il PDF in questo momento.')
    }
  }

  function downloadSelectedInvoices() {
    const selected = visibleInvoices.filter((invoice) => selectedInvoiceIds.includes(invoice.id))
    if (!selected.length) return
    const rows = [
      ['Numero', 'Data', 'Cliente', 'Oggetto', 'Totale EUR', 'Stato'],
      ...selected.map((invoice) => [
        invoice.numero,
        invoice.data,
        invoice.cliente.ragioneSociale,
        invoice.linee.map((line) => line.descrizione).join('; '),
        String(invoice.totali.totale),
        invoice.pagamento?.incassata ? 'Incassata' : 'Da incassare',
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
    <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Profilo Azienda / Partita IVA</p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">{page === 'invoice' ? 'Nuova fattura' : page === 'customers' ? 'Lista clienti' : page === 'credit-note' ? 'Nuova nota di credito' : 'Fatture emesse'}</h1>
          <p className="mt-2 text-sm text-stone-600">Fatture numerate, anagrafica clienti e registrazione contabile per {year}.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`min-h-10 px-4 text-sm font-medium ${page === 'archive' ? 'bg-indigo-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`} onClick={() => setPage('archive')}>Fatture</button>
          <button type="button" className={`min-h-10 px-4 text-sm font-medium ${page === 'invoice' ? 'bg-stone-950 text-white' : 'border border-stone-300 bg-white text-stone-700'}`} onClick={() => setPage('invoice')}>Nuova fattura</button>
          <button type="button" className={`min-h-10 px-4 text-sm font-medium ${page === 'credit-note' ? 'bg-indigo-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`} onClick={() => setPage('credit-note')}>Note di credito</button>
          <button type="button" className={`min-h-10 px-4 text-sm font-medium ${page === 'customers' ? 'bg-stone-950 text-white' : 'border border-stone-300 bg-white text-stone-700'}`} onClick={() => setPage('customers')}>Clienti ({scopedCustomers.length})</button>
        </div>
      </div>
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per leggere ed emettere fatture e salvare i clienti.</p>}
      {page === 'invoice' && (!company.ragioneSociale || !company.indirizzo || !company.partitaIva) && (
        <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          I dati dell’emittente sono incompleti. <Link className="font-semibold underline" to="/impostazioni">Completa le Impostazioni</Link> prima di emettere.
        </p>
      )}
      {loadError && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{loadError}</p>}
      {customerLoadError && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{customerLoadError}</p>}

      {page === 'customers' ? (
        <section className="border border-stone-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 p-5">
            <label className="min-w-60 flex-1 text-sm text-stone-600">Ricerca clienti
              <input className={`${inputClass} mt-1`} type="search" placeholder="Nome, partita IVA, email…" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} />
            </label>
            <button type="button" className="min-h-10 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-emerald-900" onClick={() => { setCustomerDraft(emptyCustomer()); setCustomerError('') }}>Nuovo cliente</button>
            <p className="w-full text-xs text-stone-500">Mostrati {visibleCustomers.length} clienti su {scopedCustomers.length}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Tipologia</th><th className="px-5 py-3">Telefono</th><th className="px-5 py-3">Partita IVA / CF</th><th className="px-5 py-3"><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {visibleCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-5 py-4 font-semibold">{customer.ragioneSociale}</td>
                    <td className="px-5 py-4">{customer.email || '—'}</td>
                    <td className="px-5 py-4">{customer.tipologia || '—'}</td>
                    <td className="px-5 py-4">{customer.telefono || '—'}</td>
                    <td className="px-5 py-4">{customer.partitaIva || customer.codiceFiscale || '—'}</td>
                    <td className="px-5 py-4 text-right"><button type="button" className="font-medium text-emerald-900 underline" onClick={() => { setCustomerDraft({ ...emptyCustomer(), ...customer }); setCustomerError('') }}>Modifica</button></td>
                  </tr>
                ))}
                {!visibleCustomers.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={6}>{scopedCustomers.length ? 'Nessun cliente corrisponde alla ricerca.' : 'Nessun cliente salvato. Aggiungi il primo cliente.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : page === 'archive' ? (
        <section className="border border-stone-200 bg-white">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 p-5">
            <label className="min-w-60 flex-1 text-sm text-stone-600">Ricerca fatture
              <input className={`${inputClass} mt-1`} type="search" placeholder="Numero, cliente o descrizione…" value={invoiceQuery} onChange={(event) => { setInvoiceQuery(event.target.value); setInvoicePageNumber(1) }} />
            </label>
            <button type="button" className="min-h-10 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-emerald-900" onClick={() => setPage('invoice')}>Nuova fattura</button>
            <div className="grid w-full gap-3 md:grid-cols-4">
              <label className="text-sm text-stone-600">Cliente
                <input className={`${inputClass} mt-1`} type="search" value={invoiceCustomerQuery} onChange={(event) => { setInvoiceCustomerQuery(event.target.value); setInvoicePageNumber(1) }} placeholder="Cerca cliente" />
              </label>
              <label className="text-sm text-stone-600">Da
                <input className={`${inputClass} mt-1`} type="date" value={invoiceFrom} onChange={(event) => { setInvoiceFrom(event.target.value); setInvoicePageNumber(1) }} />
              </label>
              <label className="text-sm text-stone-600">A
                <input className={`${inputClass} mt-1`} type="date" value={invoiceTo} onChange={(event) => { setInvoiceTo(event.target.value); setInvoicePageNumber(1) }} />
              </label>
              <label className="text-sm text-stone-600">Stato
                <select className={`${inputClass} mt-1`} value={invoiceStatus} onChange={(event) => { setInvoiceStatus(event.target.value as typeof invoiceStatus); setInvoicePageNumber(1) }}>
                  <option value="all">Tutti</option><option value="open">Da incassare</option><option value="paid">Incassate</option><option value="overdue">Scadute</option>
                </select>
              </label>
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
              <span>Mostrati {pagedInvoices.length} risultati su {filteredInvoices.length}</span>
              <label className="flex items-center gap-2">Risultati per pagina
                <select className="min-h-9 border border-stone-300 bg-white px-2 text-sm text-stone-800" value={invoicePageSize} onChange={(event) => { setInvoicePageSize(Number(event.target.value)); setInvoicePageNumber(1) }}>
                  {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            {selectedInvoiceIds.length > 0 && <div className="flex w-full items-center justify-between bg-indigo-50 px-3 py-2 text-sm text-indigo-900"><span>{selectedInvoiceIds.length} selezionate</span><button type="button" className="font-medium underline" onClick={downloadSelectedInvoices}>Esporta selezione CSV</button></div>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Seleziona fatture visibili" checked={pagedInvoices.length > 0 && pagedInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id))} onChange={(event) => setSelectedInvoiceIds((current) => event.target.checked ? [...new Set([...current, ...pagedInvoices.map((invoice) => invoice.id)])] : current.filter((id) => !pagedInvoices.some((invoice) => invoice.id === id)))} /></th><th className="px-4 py-3">N.</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Oggetto</th><th className="px-4 py-3 text-right">Importo</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Stato</th><th className="px-4 py-3">Scadenza</th><th className="px-4 py-3"><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {pagedInvoices.map((invoice) => {
                  const overdue = !invoice.pagamento?.incassata && Boolean(invoice.pagamento?.scadenza && invoice.pagamento.scadenza < new Date().toISOString().slice(0, 10))
                  return (
                    <tr key={invoice.id}>
                      <td className="px-4 py-4"><input type="checkbox" aria-label={`Seleziona fattura ${invoice.numero}`} checked={selectedInvoiceIds.includes(invoice.id)} onChange={(event) => setSelectedInvoiceIds((current) => event.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id))} /></td>
                      <td className="px-4 py-4 font-semibold">{invoice.numero}</td>
                      <td className="px-4 py-4">{invoice.cliente.ragioneSociale}</td>
                      <td className="max-w-56 truncate px-4 py-4" title={invoice.linee.map((line) => line.descrizione).join(', ')}>{invoice.linee.map((line) => line.descrizione).join(', ') || '—'}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">{euro.format(invoice.totali.totale)}</td>
                      <td className="px-4 py-4">{new Date(`${invoice.data}T00:00:00`).toLocaleDateString('it-IT')}</td>
                      <td className="px-4 py-4"><span className={`inline-flex px-2 py-1 text-xs font-medium ${invoice.pagamento?.incassata ? 'bg-emerald-100 text-emerald-900' : overdue ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900'}`}>{invoice.pagamento?.incassata ? 'Incassata' : overdue ? 'Scaduta' : 'Da incassare'}</span></td>
                      <td className="px-4 py-4">{invoice.pagamento?.scadenza ? new Date(`${invoice.pagamento.scadenza}T00:00:00`).toLocaleDateString('it-IT') : '—'}</td>
                      <td className="px-4 py-4 text-right"><button className="font-medium text-emerald-900 underline" type="button" onClick={() => handlePdf(invoice)}>PDF</button></td>
                    </tr>
                  )
                })}
                {!pagedInvoices.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={9}>{visibleInvoices.length ? 'Nessuna fattura corrisponde ai filtri.' : 'Nessuna fattura emessa per questo esercizio.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3 text-sm">
            <button type="button" className="min-h-9 px-3 text-stone-700 disabled:opacity-40" disabled={invoicePageNumber <= 1} onClick={() => setInvoicePageNumber((current) => Math.max(1, current - 1))}>Precedente</button>
            <span className="text-xs text-stone-500">Pagina {safeInvoicePageNumber} di {invoicePageCount}</span>
            <button type="button" className="min-h-9 px-3 text-stone-700 disabled:opacity-40" disabled={safeInvoicePageNumber >= invoicePageCount} onClick={() => setInvoicePageNumber((current) => Math.min(invoicePageCount, current + 1))}>Successiva</button>
          </div>
        </section>
      ) : page === 'credit-note' ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(350px,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={(event) => void handleCreditNote(event)} className="space-y-5 border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-950">Intestazione</h2>
            <label className="block text-sm text-stone-700">Data
              <input className={`${inputClass} mt-1`} type="date" value={creditDate} onChange={(event) => setCreditDate(event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700">Fattura originaria
              <select className={`${inputClass} mt-1`} value={creditInvoiceId} onChange={(event) => {
                const id = event.target.value
                setCreditInvoiceId(id)
                const invoice = visibleInvoices.find((item) => item.id === id)
                setCreditAmount(invoice ? String(availableToCredit(invoice).toFixed(2)) : '')
              }} required>
                <option value="">Seleziona fattura</option>
                {visibleInvoices.filter((invoice) => availableToCredit(invoice) > 0).map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>{invoice.numero} — {invoice.cliente.ragioneSociale} ({euro.format(availableToCredit(invoice))} residui)</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-stone-700">Importo da stornare
              <input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" max={visibleInvoices.find((invoice) => invoice.id === creditInvoiceId) ? availableToCredit(visibleInvoices.find((invoice) => invoice.id === creditInvoiceId)!) : undefined} value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700">Causale / note
              <textarea className="mt-1 min-h-24 w-full border border-stone-300 bg-white p-3 text-sm focus:border-emerald-700 focus:outline-none" maxLength={500} value={creditReason} onChange={(event) => setCreditReason(event.target.value)} />
            </label>
            <p className="text-xs leading-5 text-stone-500">La nota sarà collegata alla fattura selezionata e registrerà lo storno proporzionale di imponibile, IVA, ritenuta e bollo. Il residuo non può essere stornato oltre il totale ancora disponibile.</p>
            {creditError && <p className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{creditError}</p>}
            <button type="submit" className="min-h-11 w-full bg-stone-950 px-5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={creditSaving || !token || !visibleInvoices.length}>{creditSaving ? 'Emissione…' : 'Salva nota di credito'}</button>
          </form>

          <section className="space-y-5">
            <article className="min-h-72 border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
                <div><h2 className="text-xl font-semibold text-stone-950">Nota di credito</h2><p className="mt-1 text-sm text-stone-500">Anteprima · {creditDate ? new Date(`${creditDate}T00:00:00`).toLocaleDateString('it-IT') : ''}</p></div>
                <span className="text-xs font-medium uppercase text-stone-500">Collegata alla fattura</span>
              </div>
              <div className="grid gap-5 py-5 sm:grid-cols-2">
                <div><p className="font-medium text-indigo-600">{company.ragioneSociale || 'La tua attività'}</p><p className="mt-2 text-sm text-stone-500">{company.indirizzo}<br />{company.partitaIva && `P. IVA ${company.partitaIva}`}</p></div>
                <div className="sm:text-right"><p className="text-xs uppercase text-stone-500">Destinatario</p><p className="mt-1 font-medium">{visibleInvoices.find((invoice) => invoice.id === creditInvoiceId)?.cliente.ragioneSociale || 'Seleziona fattura originaria'}</p></div>
              </div>
              <div className="flex justify-between border-t border-stone-200 py-4 text-sm"><span>Storno proporzionale della fattura {visibleInvoices.find((invoice) => invoice.id === creditInvoiceId)?.numero || '—'}</span><span className="font-semibold tabular-nums">{euro.format(Number(creditAmount) || 0)}</span></div>
              {creditReason && <p className="border-t border-stone-100 pt-4 text-sm text-stone-600">{creditReason}</p>}
            </article>
            <section className="border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 className="font-semibold text-stone-950">Note di credito emesse</h2><span className="text-xs text-stone-500">{scopedCreditNotes.length} · {year}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-4 py-3">Numero</th><th className="px-4 py-3">Fattura originale</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3 text-right">Importo</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {scopedCreditNotes.map((note) => <tr key={note.id}><td className="px-4 py-3 font-medium">{note.numero}</td><td className="px-4 py-3">{note.fatturaNumero}</td><td className="px-4 py-3">{note.cliente.ragioneSociale}</td><td className="px-4 py-3 text-right tabular-nums">{euro.format(note.importo)}</td></tr>)}
                    {!scopedCreditNotes.length && <tr><td className="px-4 py-6 text-center text-stone-500" colSpan={4}>Nessuna nota di credito emessa nell’esercizio.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="grid items-start gap-6 xl:grid-cols-[minmax(350px,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-5">
              <section className="border border-stone-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-stone-950">Intestazione</h2>
                  <button type="button" className="text-sm font-medium text-emerald-900 underline" onClick={() => { setCustomerDraft(emptyCustomer()); setCustomerError('') }}>Aggiungi cliente</button>
                </div>
                <label className="mb-4 block text-sm text-stone-700">Cliente salvato
                  <select className={`${inputClass} mt-1`} value={draft.cliente.id || ''} onChange={(event) => selectCustomer(event.target.value)}>
                    <option value="">Inserisci i dati manualmente</option>
                    {scopedCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.ragioneSociale}</option>)}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-stone-700 sm:col-span-2">Ragione sociale
                    <input className={inputClass} value={draft.cliente.ragioneSociale} maxLength={200} onChange={(event) => updateCustomer('ragioneSociale', event.target.value)} required />
                  </label>
                  <label className="block text-sm text-stone-700 sm:col-span-2">Indirizzo
                    <input className={inputClass} value={draft.cliente.indirizzo} maxLength={200} onChange={(event) => updateCustomer('indirizzo', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Partita IVA
                    <input className={inputClass} value={draft.cliente.partitaIva} maxLength={32} onChange={(event) => updateCustomer('partitaIva', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Codice fiscale
                    <input className={inputClass} value={draft.cliente.codiceFiscale || ''} maxLength={32} onChange={(event) => updateCustomer('codiceFiscale', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">CAP
                    <input className={inputClass} value={draft.cliente.cap || ''} maxLength={16} onChange={(event) => updateCustomer('cap', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Comune
                    <input className={inputClass} value={draft.cliente.comune || ''} maxLength={100} onChange={(event) => updateCustomer('comune', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Email
                    <input className={inputClass} type="email" value={draft.cliente.email} maxLength={200} onChange={(event) => updateCustomer('email', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Telefono
                    <input className={inputClass} type="tel" value={draft.cliente.telefono || ''} maxLength={32} onChange={(event) => updateCustomer('telefono', event.target.value)} />
                  </label>
                  <label className="block text-sm text-stone-700">Tipologia
                    <select className={inputClass} value={draft.cliente.tipologia || 'Società'} onChange={(event) => updateCustomer('tipologia', event.target.value)}>
                      {['Società', 'Professionista', 'Privato', 'Pubblica amministrazione', 'Associazione', 'Altro'].map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm text-stone-700">Data emissione
                    <input className={inputClass} type="date" value={draft.data} onChange={(event) => setDraft((current) => ({ ...current, data: event.target.value }))} required />
                  </label>
                </div>
              </section>

              <section className="overflow-hidden border border-stone-200 bg-white">
                <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-semibold text-stone-950">Prestazioni</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[570px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-3 py-3">Descrizione</th><th className="w-20 px-3 py-3 text-right">Q.tà</th><th className="w-28 px-3 py-3 text-right">Prezzo</th><th className="w-24 px-3 py-3 text-right">Importo</th><th className="w-10"><span className="sr-only">Azioni</span></th></tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {draft.linee.map((line) => (
                        <tr key={line.id}>
                          <td className="p-2"><input className={inputClass} aria-label="Descrizione prestazione" value={line.descrizione} maxLength={200} onChange={(event) => updateLine(line.id, 'descrizione', event.target.value)} required /></td>
                          <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Quantità" type="number" min="0.01" step="0.01" value={line.quantita} onChange={(event) => updateLine(line.id, 'quantita', event.target.value)} required /></td>
                          <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Prezzo unitario" type="number" min="0" step="0.01" value={line.prezzoUnitario} onChange={(event) => updateLine(line.id, 'prezzoUnitario', event.target.value)} required /></td>
                          <td className="px-2 text-right tabular-nums">{euro.format(line.quantita * line.prezzoUnitario)}</td>
                          <td className="p-2"><button className="size-10 text-lg text-stone-500 disabled:opacity-30" type="button" title="Rimuovi prestazione" aria-label="Rimuovi prestazione" disabled={draft.linee.length <= 1} onClick={() => setDraft((current) => ({ ...current, linee: current.linee.filter((item) => item.id !== line.id) }))}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-stone-200 px-5 py-3"><button className="w-full border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50" type="button" onClick={() => setDraft((current) => ({ ...current, linee: [...current.linee, newLine()] }))}>Aggiungi prestazione</button></div>
              </section>

              <section className="border border-stone-200 bg-white p-5">
                <h2 className="mb-4 font-semibold text-stone-950">Pagamento e note</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-stone-700">Metodo di pagamento
                    <select className={`${inputClass} mt-1`} value={draft.pagamento?.metodo || ''} onChange={(event) => setDraft((current) => ({ ...current, pagamento: { ...current.pagamento!, metodo: event.target.value } }))}>
                      <option value="">Da concordare</option>
                      {['Bonifico', 'Carta', 'PayPal', 'Contanti', 'Altro'].map((method) => <option key={method}>{method}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm text-stone-700">Scadenza
                    <input className={`${inputClass} mt-1`} type="date" value={draft.pagamento?.scadenza || ''} onChange={(event) => setDraft((current) => ({ ...current, pagamento: { ...current.pagamento!, scadenza: event.target.value } }))} />
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" checked={draft.pagamento?.incassata || false} onChange={(event) => setDraft((current) => ({ ...current, pagamento: { ...current.pagamento!, incassata: event.target.checked } }))} />
                  Fattura già incassata
                </label>
                {draft.pagamento?.incassata && <p className="mt-2 text-xs text-stone-500">L’incasso sarà registrato nel conto “{draft.conti.incassi}”. Puoi modificarlo nelle Impostazioni.</p>}
                <div className="mt-4 border-t border-stone-200 pt-4">
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input type="checkbox" checked={draft.marcaDaBollo?.addebitata || false} onChange={(event) => setDraft((current) => ({ ...current, marcaDaBollo: { ...current.marcaDaBollo!, addebitata: event.target.checked } }))} />
                    Addebita marca da bollo
                  </label>
                  {draft.marcaDaBollo?.addebitata && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm text-stone-700">Importo
                        <input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" value={draft.marcaDaBollo.importo} onChange={(event) => setDraft((current) => ({ ...current, marcaDaBollo: { ...current.marcaDaBollo!, importo: Number(event.target.value) } }))} />
                      </label>
                      <label className="block text-sm text-stone-700">ID marca da bollo
                        <input className={`${inputClass} mt-1`} maxLength={100} value={draft.marcaDaBollo.identificativo} onChange={(event) => setDraft((current) => ({ ...current, marcaDaBollo: { ...current.marcaDaBollo!, identificativo: event.target.value } }))} />
                      </label>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <RateInput label="IVA (%)" value={draft.aliquotaIva} onChange={(value) => setDraft((current) => ({ ...current, aliquotaIva: value }))} />
                  <RateInput label="Cassa (%)" value={draft.aliquotaCassa} onChange={(value) => setDraft((current) => ({ ...current, aliquotaCassa: value }))} />
                  <RateInput label="Ritenuta (%)" value={draft.aliquotaRitenuta} onChange={(value) => setDraft((current) => ({ ...current, aliquotaRitenuta: value }))} />
                </div>
                <label className="mt-4 block text-sm text-stone-700">Note
                  <textarea className="mt-1 min-h-20 w-full border border-stone-300 bg-white p-3 text-sm focus:border-emerald-700 focus:outline-none" value={draft.note} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
                </label>
              </section>
            </div>

            <div className="space-y-4 xl:sticky xl:top-5">
              <InvoicePreview draft={draft} company={company} totals={totals} />
              {errors.length > 0 && <ul className="list-disc border border-rose-200 bg-rose-50 px-8 py-3 text-sm text-rose-800" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
              {message && <p className="text-sm text-stone-700" role="status">{message}</p>}
              <button className="min-h-12 w-full bg-stone-950 px-5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={saving || !token || !company.ragioneSociale || !company.partitaIva}>{saving ? 'Emissione…' : 'Salva fattura e scarica PDF'}</button>
            </div>
          </form>

        </>
      )}

      {customerDraft && (
        <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomerDraft(null) }}>
          <form onSubmit={(event) => void handleSaveCustomer(event)} className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="customer-dialog-title" className="text-xl font-semibold text-stone-950">{customers.some((customer) => customer.id === customerDraft.id) ? 'Modifica cliente' : 'Nuovo cliente'}</h2>
              <button type="button" className="size-9 text-xl text-stone-500 hover:bg-stone-100" aria-label="Chiudi" onClick={() => setCustomerDraft(null)}>×</button>
            </div>
            <p className="mb-4 text-sm font-medium text-stone-700">Informazioni di fatturazione</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-stone-600">Nazione
                <input className={inputClass} value={customerDraft.nazione || 'Italia'} maxLength={80} onChange={(event) => setCustomerDraft((current) => current && ({ ...current, nazione: event.target.value }))} />
              </label>
              <label className="block text-sm text-stone-600">Tipologia
                <select className={inputClass} value={customerDraft.tipologia || 'Società'} onChange={(event) => setCustomerDraft((current) => current && ({ ...current, tipologia: event.target.value }))}>
                  {['Società', 'Professionista', 'Privato', 'Pubblica amministrazione', 'Associazione', 'Altro'].map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <CustomerInput label="Partita IVA" field="partitaIva" value={customerDraft} onChange={setCustomerDraft} />
              <CustomerInput label="Codice fiscale" field="codiceFiscale" value={customerDraft} onChange={setCustomerDraft} />
              <CustomerInput label="Ragione sociale" field="ragioneSociale" value={customerDraft} onChange={setCustomerDraft} required />
              <CustomerInput label="CAP" field="cap" value={customerDraft} onChange={setCustomerDraft} />
              <CustomerInput label="Comune" field="comune" value={customerDraft} onChange={setCustomerDraft} />
              <CustomerInput label="Indirizzo" field="indirizzo" value={customerDraft} onChange={setCustomerDraft} />
              <CustomerInput label="Email" field="email" value={customerDraft} onChange={setCustomerDraft} type="email" />
              <CustomerInput label="Telefono" field="telefono" value={customerDraft} onChange={setCustomerDraft} type="tel" />
            </div>
            {customerError && <p className="mt-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{customerError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="min-h-10 px-4 text-sm text-stone-700 hover:bg-stone-100" onClick={() => setCustomerDraft(null)}>Annulla</button>
              <button type="submit" className="min-h-10 bg-stone-950 px-5 text-sm font-medium text-white disabled:opacity-50" disabled={savingCustomer || !token}>{savingCustomer ? 'Salvataggio…' : 'Salva cliente'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-sm text-stone-700">{label}<input className={`${inputClass} text-right tabular-nums`} type="number" min="0" max="100" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} required /></label>
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt className="text-stone-600">{label}</dt><dd className="shrink-0 tabular-nums">{euro.format(value)}</dd></div>
}

function CustomerInput({
  label,
  field,
  value,
  onChange,
  required = false,
  type = 'text',
}: {
  label: string
  field: keyof InvoiceCustomer
  value: InvoiceCustomer
  onChange: (update: (current: InvoiceCustomer | null) => InvoiceCustomer | null) => void
  required?: boolean
  type?: string
}) {
  return (
    <label className={`block text-sm text-stone-600 ${field === 'ragioneSociale' || field === 'indirizzo' ? 'sm:col-span-2' : ''}`}>
      {label}
      <input
        className={inputClass}
        type={type}
        value={String(value[field] || '')}
        required={required}
        maxLength={200}
        onChange={(event) => onChange((current) => current && ({ ...current, [field]: event.target.value }))}
      />
    </label>
  )
}

function InvoicePreview({
  draft,
  company,
  totals,
}: {
  draft: InvoiceDraft
  company: ReturnType<typeof useProfileStore.getState>['companyProfile']
  totals: ReturnType<typeof calculateInvoiceTotals>
}) {
  return (
    <section className="border border-stone-200 bg-slate-100 p-4 md:p-6">
      <article className="min-h-[560px] bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
          <div><h2 className="text-xl font-semibold text-stone-950">Fattura</h2><p className="mt-1 text-sm text-stone-500">Anteprima · {draft.data ? new Date(`${draft.data}T00:00:00`).toLocaleDateString('it-IT') : 'Data emissione'}</p></div>
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Bozza</span>
        </div>
        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div><p className="text-sm font-semibold text-indigo-600">{company.ragioneSociale || 'La tua attività'}</p><p className="mt-2 whitespace-pre-line text-xs leading-5 text-stone-600">{[company.indirizzo, company.partitaIva && `P. IVA ${company.partitaIva}`, company.email].filter(Boolean).join('\n') || 'Dati emittente'}</p></div>
          <div className="sm:text-right"><p className="text-xs uppercase text-stone-500">Destinatario</p><p className="mt-1 font-medium text-stone-950">{draft.cliente.ragioneSociale || 'Nome cliente'}</p><p className="mt-2 whitespace-pre-line text-xs leading-5 text-stone-600">{[draft.cliente.indirizzo, [draft.cliente.cap, draft.cliente.comune].filter(Boolean).join(' '), draft.cliente.partitaIva && `P. IVA ${draft.cliente.partitaIva}`, draft.cliente.codiceFiscale && `C.F. ${draft.cliente.codiceFiscale}`].filter(Boolean).join('\n')}</p></div>
        </div>
        <div className="border-t border-stone-200">
          <div className="flex justify-between py-3 text-xs font-semibold uppercase text-stone-500"><span>Descrizione</span><span>Importo</span></div>
          {draft.linee.map((line) => <div key={line.id} className="flex justify-between gap-3 border-t border-stone-100 py-3 text-sm"><span>{line.descrizione || 'Prestazione'} <span className="text-xs text-stone-500">× {line.quantita}</span></span><span className="shrink-0 tabular-nums">{euro.format(line.quantita * line.prezzoUnitario)}</span></div>)}
        </div>
        <dl className="mt-6 space-y-2 border-t border-stone-200 pt-4 text-sm">
          <TotalRow label="Totale prestazioni" value={totals.imponibile} />
          {totals.cassa > 0 && <TotalRow label="Cassa previdenziale" value={totals.cassa} />}
          <TotalRow label={`IVA (${draft.aliquotaIva}%)`} value={totals.iva} />
          {totals.ritenuta > 0 && <TotalRow label="Ritenuta d’acconto" value={-totals.ritenuta} />}
          {totals.bollo > 0 && <TotalRow label="Marca da bollo" value={totals.bollo} />}
          <div className="flex justify-between border-t border-stone-300 pt-3 text-base font-semibold"><dt>Totale</dt><dd className="tabular-nums">{euro.format(totals.totale)}</dd></div>
        </dl>
        <div className="mt-8 grid gap-5 border-t border-stone-200 pt-5 text-xs sm:grid-cols-2">
          <div><p className="mb-2 font-semibold text-stone-800">Modalità di pagamento</p><p className="text-stone-600">{draft.pagamento?.metodo || 'Da concordare'}</p>{draft.pagamento?.scadenza && <p className="mt-2 text-stone-600">Da saldare entro il {new Date(`${draft.pagamento.scadenza}T00:00:00`).toLocaleDateString('it-IT')}</p>}{draft.pagamento?.incassata && <p className="mt-2 font-medium text-emerald-800">Pagamento già ricevuto</p>}</div>
          <div><p className="mb-2 font-semibold text-stone-800">Note</p><p className="whitespace-pre-line text-stone-600">{draft.note || '—'}</p>{draft.marcaDaBollo?.addebitata && draft.marcaDaBollo.identificativo && <p className="mt-2 text-stone-600">ID marca da bollo: {draft.marcaDaBollo.identificativo}</p>}</div>
        </div>
      </article>
    </section>
  )
}
