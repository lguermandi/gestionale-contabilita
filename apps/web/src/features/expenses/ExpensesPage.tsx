import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fetchExpenses, fetchSuppliers, issueExpense, saveSupplier } from '../../api/ledgerApi'
import type { ExpenseDraft, ExpenseAttachmentDraft, IssuedExpense } from '../../domain/expenses'
import { calculateExpenseTotals, validateExpense } from '../../domain/expenses'
import type { InvoiceCustomer } from '../../domain/invoicing'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useProfileStore } from '../../stores/profileStore'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const maxAttachmentSize = 8 * 1024 * 1024

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function newSupplier(): InvoiceCustomer {
  return {
    id: createId(), ragioneSociale: '', indirizzo: '', partitaIva: '', codiceFiscale: '',
    email: '', nazione: 'Italia', tipologia: 'Società', cap: '', comune: '', telefono: '',
  }
}

function newExpense(accounts: ReturnType<typeof useProfileStore.getState>['companyProfile']['conti']): ExpenseDraft {
  return {
    id: createId(),
    tipo: 'fattura',
    data: today(),
    numeroDocumento: '',
    fornitore: newSupplier(),
    descrizione: '',
    conto: accounts.costi || 'Costi per acquisti',
    imponibile: 0,
    aliquotaIva: 22,
    conti: {
      ivaCredito: accounts.ivaCredito || 'IVA a credito',
      fornitori: accounts.fornitori || 'Debiti v/fornitori',
      gestione: accounts.gestione || 'Tipica',
    },
    note: '',
  }
}

function fileAsBase64(file: File): Promise<ExpenseAttachmentDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Impossibile leggere il file selezionato.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Formato file non valido.'))
        return
      }
      const base64 = reader.result.split(',')[1]
      if (!base64) {
        reject(new Error('Il file selezionato è vuoto o non leggibile.'))
        return
      }
      resolve({ nome: file.name, mimeType: file.type, base64 })
    }
    reader.readAsDataURL(file)
  })
}

export function ExpensesPage({ year }: { year: number }) {
  const token = useGasSessionStore((state) => state.token)
  const clearToken = useGasSessionStore((state) => state.clearToken)
  const profile = useProfileStore((state) => state.companyProfile)
  const [view, setView] = useState<'new' | 'archive' | 'suppliers'>('new')
  const [draft, setDraft] = useState(() => newExpense(profile.conti))
  const [expenses, setExpenses] = useState<IssuedExpense[]>([])
  const [expenseScope, setExpenseScope] = useState('')
  const [suppliers, setSuppliers] = useState<InvoiceCustomer[]>([])
  const [supplierScope, setSupplierScope] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierDraft, setSupplierDraft] = useState<InvoiceCustomer | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [supplierError, setSupplierError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const totals = useMemo(() => calculateExpenseTotals(draft), [draft])
  const visibleExpenses = useMemo(
    () => expenseScope === `${year}:${token}` ? expenses : [],
    [expenseScope, expenses, token, year],
  )
  const visibleSuppliers = useMemo(
    () => supplierScope === token ? suppliers : [],
    [supplierScope, suppliers, token],
  )
  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('it')
    return visibleExpenses.filter((expense) => !query || [
      expense.fornitore.ragioneSociale, expense.numeroDocumento, expense.descrizione,
    ].some((value) => value.toLocaleLowerCase('it').includes(query)))
  }, [search, visibleExpenses])
  const filteredSuppliers = useMemo(() => {
    const query = supplierQuery.trim().toLocaleLowerCase('it')
    return visibleSuppliers.filter((supplier) => !query || [
      supplier.ragioneSociale, supplier.partitaIva, supplier.codiceFiscale,
      supplier.email, supplier.telefono,
    ].some((value) => value?.toLocaleLowerCase('it').includes(query)))
  }, [supplierQuery, visibleSuppliers])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([fetchExpenses(year, token), fetchSuppliers(token)]).then(([loadedExpenses, loadedSuppliers]) => {
      if (cancelled) return
      setExpenses(loadedExpenses)
      setExpenseScope(`${year}:${token}`)
      setSuppliers(loadedSuppliers)
      setSupplierScope(token)
      setError('')
    }).catch((loadError: unknown) => {
      if (cancelled) return
      const text = loadError instanceof Error ? loadError.message : 'Impossibile caricare spese e fornitori.'
      setError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, token, year])

  async function handleFile(file?: File) {
    if (!file) return
    if (file.size > maxAttachmentSize) {
      setError('L’allegato supera il limite di 8 MB.')
      return
    }
    try {
      const allegato = await fileAsBase64(file)
      setDraft((current) => ({ ...current, allegato }))
      setError('')
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Impossibile leggere il file.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSavedMessage('')
    const validationErrors = validateExpense(draft)
    if (draft.data.slice(0, 4) !== String(year)) validationErrors.push(`La data deve appartenere all’esercizio ${year}.`)
    if (validationErrors.length) {
      setError(validationErrors.join(' '))
      return
    }
    if (!token) {
      setError('Accedi a GAS prima di registrare una spesa.')
      return
    }
    setSaving(true)
    try {
      const issued = await issueExpense(token, draft)
      setExpenses((current) => [issued, ...current.filter((item) => item.id !== issued.id)])
      setExpenseScope(`${year}:${token}`)
      setSuppliers((current) => [issued.fornitore, ...current.filter((item) => item.id !== issued.fornitore.id)].sort(
        (left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'),
      ))
      setSupplierScope(token)
      setSavedMessage(`Spesa registrata per ${euro.format(issued.totale)}.`)
      setDraft(newExpense(profile.conti))
      if (issued.allegatoSalvato) setView('archive')
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : 'Registrazione della spesa non riuscita.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setError(text)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !supplierDraft) return
    if (!supplierDraft.partitaIva?.trim() && !supplierDraft.codiceFiscale?.trim()) {
      setSupplierError('Inserisci la partita IVA o il codice fiscale.')
      return
    }
    setSavingSupplier(true)
    setSupplierError('')
    try {
      const saved = await saveSupplier(token, supplierDraft)
      setSuppliers((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort(
        (left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'),
      ))
      setSupplierScope(token)
      setDraft((current) => ({ ...current, fornitore: { ...saved } }))
      setSupplierDraft(null)
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : 'Salvataggio fornitore non riuscito.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setSupplierError(text)
    } finally {
      setSavingSupplier(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Profilo Azienda / Partita IVA</p><h1 className="text-3xl font-semibold tracking-tight text-stone-950">{view === 'new' ? 'Carica fattura ricevuta' : view === 'archive' ? 'Archivio spese' : 'Lista fornitori'}</h1><p className="mt-2 text-sm text-stone-600">Registra documenti ricevuti e allegati nell’esercizio {year}.</p></div>
        <div className="flex flex-wrap gap-2">
          {([['new', 'Carica fattura ricevuta'], ['archive', 'Archivio spese'], ['suppliers', `Fornitori (${visibleSuppliers.length})`]] as const).map(([key, label]) => <button key={key} type="button" className={`min-h-10 px-4 text-sm font-medium ${view === key ? 'bg-indigo-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`} onClick={() => setView(key)}>{label}</button>)}
        </div>
      </div>
      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Accedi a GAS dalla barra superiore per gestire spese e fornitori.</p>}
      {error && <p className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {savedMessage && <p className="mb-5 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{savedMessage}</p>}

      {view === 'archive' ? (
        <section className="border border-stone-200 bg-white">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 p-5"><label className="min-w-60 flex-1 text-sm text-stone-600">Ricerca spese<input className={`${inputClass} mt-1`} type="search" placeholder="Fornitore, numero o oggetto…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="text-xs text-stone-500">{filteredExpenses.length} documenti · {year}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Fornitore</th><th className="px-5 py-3">Documento / oggetto</th><th className="px-5 py-3">Data</th><th className="px-5 py-3 text-right">Importo</th><th className="px-5 py-3">Stato</th><th className="px-5 py-3">Allegato</th></tr></thead><tbody className="divide-y divide-stone-100">
            {filteredExpenses.map((expense) => <tr key={expense.id}><td className="px-5 py-4 font-medium">{expense.fornitore.ragioneSociale}</td><td className="px-5 py-4"><span className="block text-xs capitalize text-stone-500">{expense.tipo}</span>{[expense.numeroDocumento, expense.descrizione].filter(Boolean).join(' · ')}</td><td className="px-5 py-4">{new Date(`${expense.data}T00:00:00`).toLocaleDateString('it-IT')}</td><td className="px-5 py-4 text-right tabular-nums">{euro.format(expense.totale)}</td><td className="px-5 py-4"><span className="bg-amber-100 px-2 py-1 text-xs text-amber-900">Da pagare</span></td><td className="px-5 py-4">{expense.allegatoSalvato ? <a className="text-emerald-900 underline" href={expense.allegatoSalvato.url} target="_blank" rel="noreferrer">{expense.allegatoSalvato.nome}</a> : '—'}</td></tr>)}
            {!filteredExpenses.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={6}>Nessuna spesa registrata per questo esercizio.</td></tr>}
          </tbody></table></div>
        </section>
      ) : view === 'suppliers' ? (
        <section className="border border-stone-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 p-5"><label className="min-w-60 flex-1 text-sm text-stone-600">Ricerca fornitori<input className={`${inputClass} mt-1`} type="search" placeholder="Nome, partita IVA, email…" value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} /></label><button type="button" className="min-h-10 bg-stone-950 px-4 text-sm font-medium text-white" onClick={() => { setSupplierDraft(newSupplier()); setSupplierError('') }}>Nuovo fornitore</button><p className="w-full text-xs text-stone-500">Mostrati {filteredSuppliers.length} fornitori su {visibleSuppliers.length}</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Fornitore</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Tipologia</th><th className="px-5 py-3">Telefono</th><th className="px-5 py-3">Partita IVA / CF</th><th className="px-5 py-3"><span className="sr-only">Azioni</span></th></tr></thead><tbody className="divide-y divide-stone-100">
            {filteredSuppliers.map((supplier) => <tr key={supplier.id}><td className="px-5 py-4 font-semibold">{supplier.ragioneSociale}</td><td className="px-5 py-4">{supplier.email || '—'}</td><td className="px-5 py-4">{supplier.tipologia || '—'}</td><td className="px-5 py-4">{supplier.telefono || '—'}</td><td className="px-5 py-4">{supplier.partitaIva || supplier.codiceFiscale || '—'}</td><td className="px-5 py-4 text-right"><button type="button" className="font-medium text-emerald-900 underline" onClick={() => setSupplierDraft({ ...supplier })}>Modifica</button></td></tr>)}
            {!filteredSuppliers.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={6}>Nessun fornitore trovato. Aggiungi il primo.</td></tr>}
          </tbody></table></div>
        </section>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="grid items-start gap-6 xl:grid-cols-[minmax(350px,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-4 border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-950">Inserisci i dati</h2>
            <label className="block text-sm text-stone-700">Tipologia di spesa<select className={`${inputClass} mt-1`} value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value as ExpenseDraft['tipo'] }))}><option value="fattura">Fattura</option><option value="ricevuta">Ricevuta</option><option value="spesa personale">Spesa personale</option></select></label>
            <label className="block text-sm text-stone-700">Oggetto della spesa<input className={`${inputClass} mt-1`} value={draft.descrizione} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, descrizione: event.target.value }))} required /></label>
            <div className="flex items-end gap-3"><label className="block flex-1 text-sm text-stone-700">Fornitore<select className={`${inputClass} mt-1`} value={draft.fornitore.id || ''} onChange={(event) => { const selected = visibleSuppliers.find((supplier) => supplier.id === event.target.value); setDraft((current) => ({ ...current, fornitore: selected ? { ...selected } : newSupplier() })) }}><option value="">Seleziona fornitore</option>{visibleSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.ragioneSociale}</option>)}</select></label><button type="button" className="min-h-10 px-2 text-xs font-medium text-emerald-900 underline" onClick={() => setSupplierDraft(newSupplier())}>Aggiungi</button></div>
            {!visibleSuppliers.some((supplier) => supplier.id === draft.fornitore.id) && <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-stone-700 sm:col-span-2">Ragione sociale<input className={`${inputClass} mt-1`} value={draft.fornitore.ragioneSociale} onChange={(event) => setDraft((current) => ({ ...current, fornitore: { ...current.fornitore, ragioneSociale: event.target.value } }))} required /></label>
              <label className="block text-sm text-stone-700">Partita IVA<input className={`${inputClass} mt-1`} value={draft.fornitore.partitaIva} onChange={(event) => setDraft((current) => ({ ...current, fornitore: { ...current.fornitore, partitaIva: event.target.value } }))} /></label>
              <label className="block text-sm text-stone-700">Codice fiscale<input className={`${inputClass} mt-1`} value={draft.fornitore.codiceFiscale || ''} onChange={(event) => setDraft((current) => ({ ...current, fornitore: { ...current.fornitore, codiceFiscale: event.target.value } }))} /></label>
              <label className="block text-sm text-stone-700">Email<input className={`${inputClass} mt-1`} type="email" value={draft.fornitore.email} onChange={(event) => setDraft((current) => ({ ...current, fornitore: { ...current.fornitore, email: event.target.value } }))} /></label>
            </div>}
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm text-stone-700">Data documento<input className={`${inputClass} mt-1`} type="date" value={draft.data} onChange={(event) => setDraft((current) => ({ ...current, data: event.target.value }))} required /></label><label className="block text-sm text-stone-700">Numero documento<input className={`${inputClass} mt-1`} value={draft.numeroDocumento} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, numeroDocumento: event.target.value }))} /></label></div>
            <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm text-stone-700 sm:col-span-2">Conto di costo<input className={`${inputClass} mt-1`} value={draft.conto} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, conto: event.target.value }))} required /></label><label className="block text-sm text-stone-700">Aliquota IVA %<input className={`${inputClass} mt-1`} type="number" min="0" max="100" step="0.1" value={draft.aliquotaIva} onChange={(event) => setDraft((current) => ({ ...current, aliquotaIva: Number(event.target.value) }))} /></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm text-stone-700">Imponibile<input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" value={draft.imponibile || ''} onChange={(event) => setDraft((current) => ({ ...current, imponibile: Number(event.target.value) }))} required /></label><div className="self-end pb-3 text-right text-sm text-stone-500">Totale <strong className="text-stone-900">{euro.format(totals.totale)}</strong></div></div>
            <label className="block text-sm text-stone-700">Note<textarea className="mt-1 min-h-20 w-full border border-stone-300 bg-white p-3 text-sm" maxLength={500} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
            <button type="submit" className="min-h-11 w-full bg-stone-950 px-5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={saving || !token}>{saving ? 'Salvataggio…' : 'Salva spesa'}</button>
          </section>
          <section className="border border-stone-200 bg-white p-5">
            <h2 className="mb-2 text-lg font-semibold text-stone-950">Carica il documento o le pagine</h2>
            <p className="mb-4 text-sm text-stone-500">PDF, JPG o PNG · massimo 8 MB per file. Il documento viene conservato nel Drive privato collegato al foglio.</p>
            <label className="grid min-h-56 cursor-pointer place-items-center border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-6 text-center hover:bg-indigo-50" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]) }}>
              <span><span className="block text-sm font-medium text-indigo-900">{draft.allegato?.nome || 'Trascina un file qui o seleziona un documento'}</span><span className="mt-2 block text-xs text-stone-500">PDF, JPEG o PNG</span></span>
              <input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void handleFile(event.target.files?.[0])} />
            </label>
            {draft.allegato && <button className="mt-3 text-sm text-rose-700 underline" type="button" onClick={() => setDraft((current) => ({ ...current, allegato: undefined }))}>Rimuovi allegato</button>}
          </section>
        </form>
      )}

      {supplierDraft && <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupplierDraft(null) }}><form onSubmit={(event) => void handleSaveSupplier(event)} className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title"><div className="mb-5 flex items-center justify-between"><h2 id="supplier-dialog-title" className="text-xl font-semibold text-stone-950">{visibleSuppliers.some((supplier) => supplier.id === supplierDraft.id) ? 'Modifica fornitore' : 'Nuovo fornitore'}</h2><button type="button" className="size-9 text-xl text-stone-500" aria-label="Chiudi" onClick={() => setSupplierDraft(null)}>×</button></div><div className="grid gap-3 sm:grid-cols-2">
        {([
          ['ragioneSociale', 'Ragione sociale'], ['partitaIva', 'Partita IVA'], ['codiceFiscale', 'Codice fiscale'], ['cap', 'CAP'], ['comune', 'Comune'], ['indirizzo', 'Indirizzo'], ['email', 'Email'], ['telefono', 'Telefono'],
        ] as const).map(([field, label]) => <label key={field} className={`block text-sm text-stone-600 ${['ragioneSociale', 'indirizzo'].includes(field) ? 'sm:col-span-2' : ''}`}>{label}<input className={`${inputClass} mt-1`} type={field === 'email' ? 'email' : field === 'telefono' ? 'tel' : 'text'} value={supplierDraft[field] || ''} required={field === 'ragioneSociale'} onChange={(event) => setSupplierDraft((current) => current && ({ ...current, [field]: event.target.value }))} /></label>)}
      </div>{supplierError && <p className="mt-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{supplierError}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" className="min-h-10 px-4 text-sm" onClick={() => setSupplierDraft(null)}>Annulla</button><button type="submit" className="min-h-10 bg-stone-950 px-5 text-sm text-white disabled:opacity-50" disabled={savingSupplier || !token}>{savingSupplier ? 'Salvataggio…' : 'Salva fornitore'}</button></div></form></div>}
    </section>
  )
}
