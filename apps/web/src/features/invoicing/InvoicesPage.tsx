import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { fetchInvoices, issueInvoice } from '../../api/ledgerApi'
import {
  calculateInvoiceTotals,
  validateInvoice,
  type InvoiceDraft,
  type InvoiceLine,
  type IssuedInvoice,
} from '../../domain/invoicing'
import { useGasSessionStore } from '../../stores/gasSessionStore'
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
    cliente: { ragioneSociale: '', indirizzo: '', partitaIva: '', email: '' },
    linee: [newLine()],
    aliquotaIva: 22,
    aliquotaCassa: 0,
    aliquotaRitenuta: 0,
    note: '',
    conti: { ...accounts },
  }
}

export function InvoicesPage({ year }: { year: number }) {
  const token = useGasSessionStore((state) => state.token)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const refreshLedger = useLedgerStore((state) => state.refresh)
  const company = useProfileStore((state) => state.companyProfile)
  const setCompanyProfile = useProfileStore((state) => state.setCompanyProfile)
  const [draft, setDraft] = useState(() => newDraft(year, company.conti))
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([])
  const [invoiceScope, setInvoiceScope] = useState('')
  const [loadError, setLoadError] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const totals = useMemo(() => calculateInvoiceTotals(draft), [draft])
  const visibleInvoices = invoiceScope === `${year}:${token}` ? invoices : []

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchInvoices(year, token).then((result) => {
      if (!cancelled) {
        setInvoices(result)
        setInvoiceScope(`${year}:${token}`)
        setLoadError('')
      }
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : 'Impossibile caricare le fatture.'
      setLoadError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, token, year])

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

    setSaving(true)
    try {
      const invoice = await issueInvoice(token, draft)
      setInvoices((current) => [invoice, ...current.filter((item) => item.id !== invoice.id)])
      setInvoiceScope(`${year}:${token}`)
      void refreshLedger(year, token, 'business')
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

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-6 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Profilo Azienda / Partita IVA</p>
        <h1 className="text-2xl font-semibold text-stone-900">Fatturazione</h1>
        <p className="mt-2 text-sm text-stone-600">Emissione numerata, PDF e registrazione automatica nella contabilità aziendale {year}.</p>
      </div>
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per leggere ed emettere fatture.</p>}
      {(!company.ragioneSociale || !company.indirizzo || !company.partitaIva) && (
        <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          I dati dell’emittente sono incompleti. <Link className="font-semibold underline" to="/impostazioni">Completa le Impostazioni</Link> prima di emettere.
        </p>
      )}
      {loadError && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{loadError}</p>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="border border-stone-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-stone-900">Cliente e documento</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-stone-700 sm:col-span-2">Cliente / Ragione sociale
              <input className={inputClass} value={draft.cliente.ragioneSociale} maxLength={200} onChange={(event) => updateCustomer('ragioneSociale', event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700 sm:col-span-2">Indirizzo
              <input className={inputClass} value={draft.cliente.indirizzo} maxLength={200} onChange={(event) => updateCustomer('indirizzo', event.target.value)} />
            </label>
            <label className="block text-sm text-stone-700">Partita IVA / Codice fiscale
              <input className={inputClass} value={draft.cliente.partitaIva} maxLength={32} onChange={(event) => updateCustomer('partitaIva', event.target.value)} required />
            </label>
            <label className="block text-sm text-stone-700">Email
              <input className={inputClass} type="email" value={draft.cliente.email} maxLength={200} onChange={(event) => updateCustomer('email', event.target.value)} />
            </label>
            <label className="block max-w-xs text-sm text-stone-700">Data emissione
              <input className={inputClass} type="date" value={draft.data} onChange={(event) => setDraft((current) => ({ ...current, data: event.target.value }))} required />
            </label>
          </div>
        </section>

        <section className="overflow-hidden border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-semibold text-stone-900">Voci fattura</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-stone-100 text-xs uppercase text-stone-600"><tr><th className="px-3 py-3 font-semibold">Descrizione</th><th className="w-28 px-3 py-3 text-right font-semibold">Quantità</th><th className="w-36 px-3 py-3 text-right font-semibold">Prezzo unitario</th><th className="w-36 px-3 py-3 text-right font-semibold">Importo</th><th className="w-12 px-3 py-3"><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {draft.linee.map((line) => (
                  <tr key={line.id}>
                    <td className="p-2"><input className={inputClass} aria-label="Descrizione voce" value={line.descrizione} maxLength={200} onChange={(event) => updateLine(line.id, 'descrizione', event.target.value)} required /></td>
                    <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Quantità" type="number" min="0.01" step="0.01" value={line.quantita} onChange={(event) => updateLine(line.id, 'quantita', event.target.value)} required /></td>
                    <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Prezzo unitario" type="number" min="0" step="0.01" value={line.prezzoUnitario} onChange={(event) => updateLine(line.id, 'prezzoUnitario', event.target.value)} required /></td>
                    <td className="px-3 text-right tabular-nums">{euro.format(line.quantita * line.prezzoUnitario)}</td>
                    <td className="p-2"><button className="size-10 text-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30" type="button" title="Rimuovi voce" aria-label="Rimuovi voce" disabled={draft.linee.length <= 1} onClick={() => setDraft((current) => ({ ...current, linee: current.linee.filter((item) => item.id !== line.id) }))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-stone-200 px-5 py-3"><button className="text-sm font-medium text-emerald-900 underline" type="button" onClick={() => setDraft((current) => ({ ...current, linee: [...current.linee, newLine()] }))}>Aggiungi voce</button></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="border border-stone-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-stone-900">Aliquote e note</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <RateInput label="IVA (%)" value={draft.aliquotaIva} onChange={(value) => setDraft((current) => ({ ...current, aliquotaIva: value }))} />
              <RateInput label="Cassa previdenziale (%)" value={draft.aliquotaCassa} onChange={(value) => setDraft((current) => ({ ...current, aliquotaCassa: value }))} />
              <RateInput label="Ritenuta (%)" value={draft.aliquotaRitenuta} onChange={(value) => setDraft((current) => ({ ...current, aliquotaRitenuta: value }))} />
            </div>
            <label className="mt-4 block text-sm text-stone-700">Note
              <textarea className="mt-1 min-h-20 w-full border border-stone-300 bg-white p-3 text-sm focus:border-emerald-700 focus:outline-none" value={draft.note} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </label>
          </div>
          <div className="border border-stone-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-stone-900">Riepilogo</h2>
            <dl className="space-y-2 text-sm">
              <TotalRow label="Imponibile" value={totals.imponibile} />
              {totals.cassa > 0 && <TotalRow label="Cassa" value={totals.cassa} />}
              <TotalRow label={`IVA (${draft.aliquotaIva}%)`} value={totals.iva} />
              {totals.ritenuta > 0 && <TotalRow label="Ritenuta" value={-totals.ritenuta} />}
              <div className="mt-3 flex justify-between border-t border-stone-300 pt-3 font-semibold"><dt>Da incassare</dt><dd className="tabular-nums">{euro.format(totals.totale)}</dd></div>
            </dl>
          </div>
        </section>

        {errors.length > 0 && <ul className="list-disc border border-rose-200 bg-rose-50 px-8 py-3 text-sm text-rose-800" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        {message && <p className="text-sm text-stone-700" role="status">{message}</p>}
        <div className="flex justify-end"><button className="min-h-11 bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={saving || !token || !company.ragioneSociale || !company.partitaIva}>{saving ? 'Emissione…' : 'Emetti fattura e scarica PDF'}</button></div>
      </form>

      <section className="mt-10 border border-stone-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-stone-200 px-5 py-4"><h2 className="font-semibold text-stone-900">Fatture emesse</h2><span className="text-xs text-stone-500">{visibleInvoices.length} documenti · {year}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase text-stone-600"><tr><th className="px-5 py-3 font-semibold">Numero</th><th className="px-5 py-3 font-semibold">Data</th><th className="px-5 py-3 font-semibold">Cliente</th><th className="px-5 py-3 text-right font-semibold">Totale</th><th className="px-5 py-3 font-semibold">Stato</th><th className="px-5 py-3"><span className="sr-only">PDF</span></th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {visibleInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-5 py-3 font-medium">{invoice.numero}</td>
                  <td className="px-5 py-3">{new Date(`${invoice.data}T00:00:00`).toLocaleDateString('it-IT')}</td>
                  <td className="px-5 py-3">{invoice.cliente.ragioneSociale}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{euro.format(invoice.totali.totale)}</td>
                  <td className="px-5 py-3 text-emerald-800">Emessa</td>
                  <td className="px-5 py-3 text-right"><button className="font-medium text-emerald-900 underline" type="button" onClick={() => handlePdf(invoice)}>Scarica PDF</button></td>
                </tr>
              ))}
              {!visibleInvoices.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={6}>Nessuna fattura emessa per questo esercizio.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-sm text-stone-700">{label}<input className={`${inputClass} text-right tabular-nums`} type="number" min="0" max="100" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} required /></label>
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt className="text-stone-600">{label}</dt><dd className="shrink-0 tabular-nums">{euro.format(value)}</dd></div>
}
