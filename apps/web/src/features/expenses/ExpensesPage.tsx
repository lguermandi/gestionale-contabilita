import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchChartOfAccounts, fetchExpenses, fetchSuppliers, issueExpense, issueInvoice, saveSupplier, type ChartOfAccount } from '../../api/ledgerApi'
import type { ExpenseDraft, ExpenseAttachmentDraft, ExpenseLine, IssuedExpense } from '../../domain/expenses'
import { calculateExpenseTotals, getExpenseLines, getExpensePaidAmount, getExpensePaymentStatus, validateExpense } from '../../domain/expenses'
import type { InvoiceCustomer, InvoiceDraft } from '../../domain/invoicing'
import type { LedgerTransaction } from '../../domain/accounting'
import { queueTransaction } from '../../offline/offlineLedger'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useEntityStore } from '../../stores/entityStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'
import { parseFatturaPaXml } from './fatturaPaImport'
import { InvoicePaymentsModal, type DocumentPaymentInput } from '../invoicing/components/InvoicePaymentsModal'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const maxAttachmentSize = 8 * 1024 * 1024
const maxXmlSize = 10 * 1024 * 1024

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
    righe: [{ id: createId(), conto: accounts.costi || 'Costi per acquisti', imponibile: 0, aliquotaIva: 22 }],
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
  const spreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const refreshLedger = useLedgerStore((state) => state.refresh)
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const [searchParams, setSearchParams] = useSearchParams()
  const profile = useProfileStore((state) => state.companyProfile)
  const [view, setView] = useState<'new' | 'archive' | 'suppliers'>(() => (
    searchParams.get('documentId') ? 'archive' : 'new'
  ))
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
  const [paymentExpenseId, setPaymentExpenseId] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([])
  const [chartOfAccountsScope, setChartOfAccountsScope] = useState('')
  const [chartOfAccountsError, setChartOfAccountsError] = useState('')
  const totals = useMemo(() => calculateExpenseTotals(draft), [draft])
  const currentChartScope = `${token}:${spreadsheetId}`
  const costAccounts = chartOfAccountsScope === currentChartScope
    ? chartOfAccounts.filter((account) => account.attivo && account.tipo.toLocaleLowerCase('it').includes('cost'))
    : []
  const costAccountOptions = costAccounts.length
    ? costAccounts
    : [{ codice: 'locale-costi', descrizione: profile.conti.costi || 'Costi per acquisti', tipo: 'Costo', gestione: profile.conti.gestione, attivo: true }]
  const paymentCashAccounts = [...new Set([
    profile.conti.incassi || 'Banca c/c',
    ...(chartOfAccountsScope === currentChartScope ? chartOfAccounts : [])
      .filter((account) => account.attivo && /banca|cassa|conto corrente|liquidit|postepay|paypal/i.test(account.descrizione))
      .map((account) => account.descrizione),
  ])]
  const visibleExpenses = useMemo(
    () => expenseScope === `${year}:${token}:${spreadsheetId}`
      ? expenses.filter((expense) => expense.data.slice(0, 4) === String(year))
      : [],
    [expenseScope, expenses, spreadsheetId, token, year],
  )
  const visibleSuppliers = useMemo(
    () => supplierScope === `${token}:${spreadsheetId}` ? suppliers : [],
    [supplierScope, spreadsheetId, suppliers, token],
  )
  const linkedExpenseId = searchParams.get('documentId')
  const paymentExpense = expenseScope === `${year}:${token}:${spreadsheetId}`
    ? expenses.find((expense) => expense.id === (paymentExpenseId || linkedExpenseId))
    : undefined
  const allLedgerTransactions = useMemo(() => {
    const unique = new Map([...historyTransactions, ...transactions].map((transaction) => [transaction.id, transaction]))
    return [...unique.values()]
  }, [historyTransactions, transactions])
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

  function updateExpenseLine(id: string, key: keyof Omit<ExpenseLine, 'id'>, value: string) {
    setDraft((current) => ({
      ...current,
      righe: (current.righe || []).map((line) => line.id === id
        ? { ...line, [key]: key === 'conto' || key === 'descrizione' ? value : Number(value) }
        : line),
    }))
  }

  async function handleXmlImport(file?: File) {
    if (!file) return
    if (file.size > maxXmlSize) {
      setError('Il file XML supera il limite di 10 MB.')
      return
    }
    try {
      const parsed = parseFatturaPaXml(await file.text())
      const existingAccount = draft.righe?.[0]?.conto || profile.conti.costi || ''
      setDraft((current) => ({
        ...current,
        tipo: 'fattura',
        tipoDocumento: parsed.documentType,
        data: parsed.data,
        dataScadenza: parsed.dataScadenza,
        imponibileDocumentoDichiarato: parsed.imponibile,
        ivaDocumentoDichiarata: parsed.iva,
        totaleDocumentoDichiarato: parsed.totale,
        numeroDocumento: parsed.numeroDocumento,
        fornitore: {
          ...newSupplier(),
          ...parsed.fornitore,
          id: createId(),
          email: '',
          telefono: '',
          tipologia: 'Società',
        },
        descrizione: parsed.descrizione,
        righe: parsed.righe.map((line) => ({
          ...line,
          conto: existingAccount,
        })),
        linkedAutofatturaId: undefined,
        linkedAutofatturaType: undefined,
        aliquotaIvaAutofattura: 22,
        note: current.note,
        allegato: current.allegato,
      }))
      setError('')
      setSavedMessage(`XML importato: ${parsed.numeroDocumento} · totale documento ${euro.format(parsed.totale)}.`)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Impossibile importare il file FatturaPA.')
    }
  }

  function linkedAutofattura(expense: IssuedExpense): InvoiceDraft {
    if (!expense.linkedAutofatturaType || !expense.linkedAutofatturaId) {
      throw new Error('Dati per l’autofattura collegata incompleti.')
    }
    const rate = expense.aliquotaIvaAutofattura || 22
    return {
      id: expense.linkedAutofatturaId,
      data: expense.data,
      documentType: expense.linkedAutofatturaType,
      regimeFiscale: profile.regimeFiscale || 'RF01',
      cliente: { ...expense.fornitore },
      linee: getExpenseLines(expense).map((line) => ({
        id: line.id,
        descrizione: line.descrizione || expense.descrizione,
        quantita: 1,
        prezzoUnitario: line.imponibile,
        aliquotaIva: rate,
        costAccount: line.conto,
      })),
      aliquotaIva: rate,
      aliquotaCassa: 0,
      aliquotaRitenuta: 0,
      bolloRiaddebitatoAlCliente: false,
      payments: [],
      linkedIssueTransactionId: expense.id,
      linkedInvoiceNumber: expense.numeroDocumento,
      linkedInvoiceDate: expense.data,
      note: `Autofattura collegata alla fattura passiva ${expense.numeroDocumento}.`,
      conti: { ...profile.conti },
    }
  }

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    Promise.all([
      fetchExpenses(year, token, spreadsheetId),
      fetchSuppliers(token, spreadsheetId),
    ]).then(([loadedExpenses, loadedSuppliers]) => {
      if (cancelled) return
      setExpenses(loadedExpenses)
      setExpenseScope(`${year}:${token}:${spreadsheetId}`)
      setSuppliers(loadedSuppliers)
      setSupplierScope(`${token}:${spreadsheetId}`)
      setError('')
    }).catch((loadError: unknown) => {
      if (cancelled) return
      const text = loadError instanceof Error ? loadError.message : 'Impossibile caricare spese e fornitori.'
      setError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, spreadsheetId, token, year])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    fetchChartOfAccounts(token, spreadsheetId).then((accounts) => {
      if (!cancelled) {
        setChartOfAccounts(accounts)
        setChartOfAccountsScope(`${token}:${spreadsheetId}`)
        setChartOfAccountsError('')
      }
    }).catch((loadError: unknown) => {
      if (cancelled) return
      const message = loadError instanceof Error ? loadError.message : 'Impossibile caricare il Piano dei Conti.'
      setChartOfAccountsError(message)
      if (message.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, spreadsheetId, token])

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
    if (!spreadsheetId) {
      setError('Seleziona un’entità aziendale prima di registrare una spesa.')
      return
    }
    setSaving(true)
    try {
      const issued = await issueExpense(token, draft, spreadsheetId || undefined)
      setExpenses((current) => [issued, ...current.filter((item) => item.id !== issued.id)])
      setExpenseScope(`${year}:${token}:${spreadsheetId}`)
      setSuppliers((current) => [issued.fornitore, ...current.filter((item) => item.id !== issued.fornitore.id)].sort(
        (left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'),
      ))
      setSupplierScope(`${token}:${spreadsheetId}`)
      let linkedInvoiceNumber = ''
      if (issued.linkedAutofatturaType) {
        try {
          const autofattura = await issueInvoice(token, linkedAutofattura(issued), spreadsheetId || undefined)
          linkedInvoiceNumber = autofattura.numero
        } catch (autofatturaError) {
          const detail = autofatturaError instanceof Error ? autofatturaError.message : 'errore non specificato'
          throw new Error(`Spesa registrata, ma autofattura non generata. Premi di nuovo “Salva spesa” per riprovare senza duplicare la registrazione. ${detail}`, { cause: autofatturaError })
        }
      }
      setSavedMessage(`Spesa registrata per ${euro.format(issued.totale)}.`)
      if (linkedInvoiceNumber) {
        setSavedMessage(`Spesa registrata e autofattura ${linkedInvoiceNumber} generata.`)
      }
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
    if (!token || !spreadsheetId || !supplierDraft) return
    if (!supplierDraft.partitaIva?.trim() && !supplierDraft.codiceFiscale?.trim()) {
      setSupplierError('Inserisci la partita IVA o il codice fiscale.')
      return
    }
    setSavingSupplier(true)
    setSupplierError('')
    try {
      const saved = await saveSupplier(token, supplierDraft, spreadsheetId || undefined)
      setSuppliers((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort(
        (left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'),
      ))
      setSupplierScope(`${token}:${spreadsheetId}`)
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

  async function handleExpensePayment(paymentInput: DocumentPaymentInput) {
    if (!paymentExpense || !spreadsheetId) return
    setPaymentError('')
    const paidCents = Math.round(getExpensePaidAmount(paymentExpense) * 100)
    const totalCents = Math.round(paymentExpense.totale * 100)
    if (Math.round(paymentInput.importo * 100) > totalCents - paidCents) {
      setPaymentError('Il residuo è cambiato: aggiorna la spesa e riprova.')
      return
    }
    const transactionId = createId()
    const payment = { ...paymentInput, linkedTransactionId: transactionId }
    const description = `Pagamento fornitore ${paymentExpense.numeroDocumento} - ${paymentExpense.fornitore.ragioneSociale}`
    const transaction: LedgerTransaction = {
      id: transactionId,
      data: payment.data,
      totale: payment.importo,
      relatedDocumentType: 'expense',
      relatedDocumentId: paymentExpense.id,
      movimenti: [
        { conto: paymentExpense.conti.fornitori || 'Debiti v/fornitori', descrizione: description, gestione: '', dare: payment.importo, avere: 0 },
        { conto: payment.conto, descrizione: description, gestione: '', dare: 0, avere: payment.importo },
      ],
    }
    setPaymentSaving(true)
    try {
      await queueTransaction(transaction, 'business', spreadsheetId, {
        documentType: 'expense',
        documentId: paymentExpense.id,
        payment,
      })
      setExpenses((current) => current.map((expense) => expense.id === paymentExpense.id
        ? { ...expense, payments: [...(expense.payments || []), payment] }
        : expense))
      void refreshLedger(year, token, 'business', spreadsheetId)
      window.dispatchEvent(new Event('accounting:sync-request'))
      setSavedMessage('Pagamento aggiunto alla Prima Nota e messo in coda per la sincronizzazione GAS.')
      setError('')
    } catch (paymentError) {
      setPaymentError(paymentError instanceof Error ? paymentError.message : 'Impossibile accodare il pagamento.')
    } finally {
      setPaymentSaving(false)
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
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-5 py-3">Fornitore</th><th className="px-5 py-3">Documento / oggetto</th><th className="px-5 py-3">Data</th><th className="px-5 py-3 text-right">Importo</th><th className="px-5 py-3">Stato</th><th className="px-5 py-3">Allegato</th><th className="px-5 py-3"><span className="sr-only">Azioni</span></th></tr></thead><tbody className="divide-y divide-stone-100">
            {filteredExpenses.map((expense) => {
              const status = getExpensePaymentStatus(expense)
              return <tr key={expense.id}><td className="px-5 py-4 font-medium">{expense.fornitore.ragioneSociale}</td><td className="px-5 py-4"><span className="block text-xs capitalize text-stone-500">{expense.tipo} · {expense.tipoDocumento || 'TD01'}</span>{[expense.numeroDocumento, expense.descrizione].filter(Boolean).join(' · ')}</td><td className="px-5 py-4">{new Date(`${expense.data}T00:00:00`).toLocaleDateString('it-IT')}</td><td className="px-5 py-4 text-right tabular-nums">{euro.format(expense.totale)}</td><td className="px-5 py-4"><span className={`px-2 py-1 text-xs ${status === 'Saldata' ? 'bg-emerald-100 text-emerald-900' : status === 'Scaduta' ? 'bg-rose-100 text-rose-900' : status === 'Parziale' ? 'bg-indigo-100 text-indigo-900' : status === 'Nota di credito' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>{status}</span></td><td className="px-5 py-4">{expense.allegatoSalvato ? <a className="text-emerald-900 underline" href={expense.allegatoSalvato.url} target="_blank" rel="noreferrer">{expense.allegatoSalvato.nome}</a> : '—'}</td><td className="px-5 py-4 text-right"><button type="button" className="font-medium text-indigo-700 underline" onClick={() => { setPaymentError(''); setPaymentExpenseId(expense.id) }}>Pagamenti</button></td></tr>
            })}
            {!filteredExpenses.length && <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={7}>Nessuna spesa registrata per questo esercizio.</td></tr>}
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
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm text-stone-700">Data documento<input className={`${inputClass} mt-1`} type="date" value={draft.data} onChange={(event) => setDraft((current) => ({ ...current, data: event.target.value }))} required /></label><label className="block text-sm text-stone-700">Numero documento<input className={`${inputClass} mt-1`} value={draft.numeroDocumento} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, numeroDocumento: event.target.value }))} /></label><label className="block text-sm text-stone-700">Tipo documento FatturaPA<input className={`${inputClass} mt-1`} value={draft.tipoDocumento || 'TD01'} maxLength={4} onChange={(event) => setDraft((current) => ({ ...current, tipoDocumento: event.target.value.toUpperCase() }))} /></label><label className="block text-sm text-stone-700">Scadenza pagamento<input className={`${inputClass} mt-1`} type="date" value={draft.dataScadenza || ''} onChange={(event) => setDraft((current) => ({ ...current, dataScadenza: event.target.value }))} /></label></div>
            <section className="border-t border-stone-200 pt-4">
              <h3 className="mb-3 font-medium text-stone-900">Voci di costo</h3>
              <div className="space-y-3">
                {(draft.righe || []).map((line, index) => (
                  <div key={line.id} className="grid gap-2 rounded border border-stone-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(100px,0.6fr)_minmax(90px,0.5fr)_auto]">
                    <label className="block text-sm text-stone-700 sm:col-span-2">Descrizione voce<input className={`${inputClass} mt-1`} aria-label={`Descrizione voce ${index + 1}`} value={line.descrizione || ''} maxLength={200} onChange={(event) => updateExpenseLine(line.id, 'descrizione', event.target.value)} /></label>
                    <label className="block text-sm text-stone-700 sm:col-span-2">Conto di costo<select className={`${inputClass} mt-1`} aria-label={`Conto di costo ${index + 1}`} value={line.conto} onChange={(event) => updateExpenseLine(line.id, 'conto', event.target.value)} required><option value="">Seleziona conto di costo</option>{line.conto && !costAccountOptions.some((account) => account.descrizione === line.conto) && <option value={line.conto}>{line.conto} (non nel Piano dei Conti corrente)</option>}{costAccountOptions.map((account) => <option key={account.codice} value={account.descrizione}>{account.codice} · {account.descrizione}</option>)}</select></label>
                    <label className="block text-sm text-stone-700">Imponibile<input className={`${inputClass} mt-1`} aria-label={`Imponibile ${index + 1}`} type="number" min="0.01" step="0.01" value={line.imponibile || ''} onChange={(event) => updateExpenseLine(line.id, 'imponibile', event.target.value)} required /></label>
                    <label className="block text-sm text-stone-700">IVA %<input className={`${inputClass} mt-1`} aria-label={`Aliquota IVA ${index + 1}`} type="number" min="0" max="100" step="0.1" value={line.aliquotaIva} onChange={(event) => updateExpenseLine(line.id, 'aliquotaIva', event.target.value)} required /></label>
                    <button className="min-h-10 px-2 text-lg text-stone-500 disabled:opacity-30" type="button" title="Rimuovi voce di costo" aria-label="Rimuovi voce di costo" disabled={(draft.righe || []).length <= 1} onClick={() => setDraft((current) => ({ ...current, righe: (current.righe || []).filter((item) => item.id !== line.id) }))}>×</button>
                  </div>
                ))}
              </div>
              <button className="mt-3 w-full border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50" type="button" onClick={() => setDraft((current) => ({ ...current, righe: [...(current.righe || []), { id: createId(), conto: '', imponibile: 0, aliquotaIva: 22 }] }))}>Aggiungi voce di costo</button>
              {chartOfAccountsError && <p className="mt-2 text-xs text-amber-800">Piano dei Conti non disponibile: puoi usare il conto locale configurato. {chartOfAccountsError}</p>}
            </section>
            {draft.fornitore.nazione && draft.fornitore.nazione !== 'Italia' && (draft.righe || []).every((line) => line.aliquotaIva === 0) && (
              <section className="space-y-3 border border-indigo-200 bg-indigo-50/50 p-4">
                <h3 className="font-medium text-indigo-950">Autofattura per fornitore estero senza IVA</h3>
                <p className="text-sm text-indigo-900">Seleziona TD17 per servizi esteri oppure TD18 per acquisti di beni intracomunitari. L’autofattura viene registrata in GAS dopo la fattura passiva ed è collegata alla sua Prima Nota.</p>
                <label className="block text-sm text-stone-700">Documento da generare<select className={`${inputClass} mt-1`} value={draft.linkedAutofatturaType || ''} onChange={(event) => setDraft((current) => ({
                  ...current,
                  linkedAutofatturaType: event.target.value ? event.target.value as 'TD17' | 'TD18' : undefined,
                  linkedAutofatturaId: event.target.value ? current.linkedAutofatturaId || createId() : undefined,
                }))}><option value="">Non generare autofattura</option><option value="TD17">TD17 · Servizi esteri</option><option value="TD18">TD18 · Beni intracomunitari</option></select></label>
                {draft.linkedAutofatturaType && <label className="block text-sm text-stone-700">Aliquota IVA per l’integrazione<select className={`${inputClass} mt-1`} value={draft.aliquotaIvaAutofattura || 22} onChange={(event) => setDraft((current) => ({ ...current, aliquotaIvaAutofattura: Number(event.target.value) }))}><option value={4}>4%</option><option value={5}>5%</option><option value={10}>10%</option><option value={22}>22%</option></select></label>}
              </section>
            )}
            <dl className="space-y-2 border-t border-stone-200 pt-3 text-sm">
              <div className="flex justify-between"><dt>Imponibile</dt><dd>{euro.format(totals.imponibile)}</dd></div>
              {totals.ivaPerAliquota.map((item) => <div key={item.aliquota} className="flex justify-between text-stone-600"><dt>IVA {item.aliquota}%</dt><dd>{euro.format(item.iva)}</dd></div>)}
              <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold"><dt>Totale</dt><dd className="text-stone-900">{euro.format(totals.totale)}</dd></div>
              {draft.totaleDocumentoDichiarato !== undefined && <>
                <div className="flex justify-between border-t border-dashed border-stone-300 pt-2 text-stone-600"><dt>Imponibile dichiarato XML</dt><dd>{euro.format(draft.imponibileDocumentoDichiarato || 0)}</dd></div>
                <div className="flex justify-between text-stone-600"><dt>IVA dichiarata XML</dt><dd>{euro.format(draft.ivaDocumentoDichiarata || 0)}</dd></div>
                <div className="flex justify-between font-medium text-indigo-900"><dt>Totale dichiarato XML</dt><dd>{euro.format(draft.totaleDocumentoDichiarato)}</dd></div>
                {Math.round(totals.totale * 100) !== Math.round(draft.totaleDocumentoDichiarato * 100) && <p className="text-xs text-amber-800">Il totale calcolato dalle righe differisce dal totale FatturaPA: verifica imponibili, IVA, arrotondamenti e addebiti accessori prima della registrazione.</p>}
              </>}
            </dl>
            <label className="block text-sm text-stone-700">Note<textarea className="mt-1 min-h-20 w-full border border-stone-300 bg-white p-3 text-sm" maxLength={500} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
            <button type="submit" className="min-h-11 w-full bg-stone-950 px-5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={saving || !token}>{saving ? 'Salvataggio…' : 'Salva spesa'}</button>
          </section>
          <section className="border border-stone-200 bg-white p-5">
            <h2 className="mb-2 text-lg font-semibold text-stone-950">Importa XML FatturaPA</h2>
            <p className="mb-3 text-sm text-stone-500">L’XML viene letto esclusivamente nel browser, anche offline. Verifica le righe e seleziona il conto di costo prima di salvare.</p>
            <label className="mb-5 inline-flex min-h-10 cursor-pointer items-center border border-indigo-300 px-4 text-sm font-medium text-indigo-900 hover:bg-indigo-50">Seleziona file XML<input className="sr-only" type="file" accept=".xml,application/xml,text/xml" onChange={(event) => { void handleXmlImport(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
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

      {paymentExpense && <InvoicePaymentsModal
        key={`${paymentExpense.id}:${Math.max(0, Math.round((paymentExpense.totale - getExpensePaidAmount(paymentExpense)) * 100))}`}
        documentLabel={paymentExpense.tipoDocumento || 'Fattura'}
        documentNumber={paymentExpense.numeroDocumento}
        counterparty={paymentExpense.fornitore.ragioneSociale}
        status={getExpensePaymentStatus(paymentExpense)}
        total={paymentExpense.totale}
        paid={getExpensePaidAmount(paymentExpense)}
        remaining={Math.max(0, Math.round((paymentExpense.totale - getExpensePaidAmount(paymentExpense)) * 100) / 100)}
        dueDate={paymentExpense.dataScadenza}
        payments={paymentExpense.payments || []}
        transactions={allLedgerTransactions.filter((transaction) => (
          transaction.id === paymentExpense.id
          || transaction.id === paymentExpense.linkedAutofatturaId
          || transaction.relatedDocumentType === 'expense' && transaction.relatedDocumentId === paymentExpense.id
        ))}
        cashAccounts={paymentCashAccounts}
        canPay={paymentExpense.tipoDocumento !== 'TD04'}
        busy={paymentSaving}
        errorMessage={paymentError}
        onClose={() => {
          setPaymentExpenseId('')
          setPaymentError('')
          if (linkedExpenseId) {
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete('documentId')
            setSearchParams(nextParams, { replace: true })
          }
        }}
        onRegister={(payment) => { void handleExpensePayment(payment) }}
      />}

      {supplierDraft && <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupplierDraft(null) }}><form onSubmit={(event) => void handleSaveSupplier(event)} className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title"><div className="mb-5 flex items-center justify-between"><h2 id="supplier-dialog-title" className="text-xl font-semibold text-stone-950">{visibleSuppliers.some((supplier) => supplier.id === supplierDraft.id) ? 'Modifica fornitore' : 'Nuovo fornitore'}</h2><button type="button" className="size-9 text-xl text-stone-500" aria-label="Chiudi" onClick={() => setSupplierDraft(null)}>×</button></div><div className="grid gap-3 sm:grid-cols-2">
        {([
          ['ragioneSociale', 'Ragione sociale'], ['partitaIva', 'Partita IVA'], ['codiceFiscale', 'Codice fiscale'], ['cap', 'CAP'], ['comune', 'Comune'], ['indirizzo', 'Indirizzo'], ['email', 'Email'], ['telefono', 'Telefono'],
        ] as const).map(([field, label]) => <label key={field} className={`block text-sm text-stone-600 ${['ragioneSociale', 'indirizzo'].includes(field) ? 'sm:col-span-2' : ''}`}>{label}<input className={`${inputClass} mt-1`} type={field === 'email' ? 'email' : field === 'telefono' ? 'tel' : 'text'} value={supplierDraft[field] || ''} required={field === 'ragioneSociale'} onChange={(event) => setSupplierDraft((current) => current && ({ ...current, [field]: event.target.value }))} /></label>)}
      </div>{supplierError && <p className="mt-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{supplierError}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" className="min-h-10 px-4 text-sm" onClick={() => setSupplierDraft(null)}>Annulla</button><button type="submit" className="min-h-10 bg-stone-950 px-5 text-sm text-white disabled:opacity-50" disabled={savingSupplier || !token}>{savingSupplier ? 'Salvataggio…' : 'Salva fornitore'}</button></div></form></div>}
    </section>
  )
}
