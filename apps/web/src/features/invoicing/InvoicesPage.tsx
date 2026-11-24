import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { archiveInvoice, fetchChartOfAccounts, fetchCreditNotes, fetchCustomers, fetchInvoices, issueCreditNote, issueInvoice, saveCompanyProfile, saveCustomer, type ChartOfAccount } from '../../api/ledgerApi'
import {
  calculateInvoiceTotals,
  getInvoicePaidAmount,
  getInvoicePaymentStatus,
  getInvoiceRemainingAmount,
  validateInvoice,
  type CreditNoteDraft,
  type InvoiceCustomer,
  type InvoiceDraft,
  type InvoicePayment,
  type IssuedCreditNote,
  type IssuedInvoice,
} from '../../domain/invoicing'
import type { LedgerTransaction } from '../../domain/accounting'
import { queueTransaction } from '../../offline/offlineLedger'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useEntityStore } from '../../stores/entityStore'
import { useLedgerStore } from '../../stores/ledgerStore'
import { useProfileStore } from '../../stores/profileStore'
import { createInvoicePdf, downloadInvoicePdf } from './invoicePdf'
import { buildFatturaPaXml, validateFatturaPaXml } from './fatturaPaXml'
import { InvoiceForm } from './components/InvoiceForm'
import { InvoiceList } from './components/InvoiceList'
import { InvoicePaymentsModal, type DocumentPaymentInput } from './components/InvoicePaymentsModal'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function currentDate(year: number) {
  const now = new Date()
  return year === now.getFullYear()
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : `${year}-01-01`
}

function newLine(aliquotaIva = 22) {
  return { id: createId(), descrizione: '', quantita: 1, prezzoUnitario: 0, aliquotaIva }
}

function newDraft(year: number, accounts: InvoiceDraft['conti'], regimeFiscale = 'RF01', atecoCode = ''): InvoiceDraft {
  return {
    id: createId(),
    data: currentDate(year),
    documentType: 'TD01',
    revenueAccount: accounts.ricavi,
    atecoCode,
    regimeFiscale,
    ritenutaAttiva: false,
    bolloRiaddebitatoAlCliente: false,
    payments: [],
    cliente: { ragioneSociale: '', indirizzo: '', partitaIva: '', email: '', nazione: 'Italia' },
    linee: [newLine()],
    aliquotaIva: regimeFiscale === 'RF19' ? 0 : 22,
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
  const transactions = useLedgerStore((state) => state.transactions)
  const historyTransactions = useLedgerStore((state) => state.historyTransactions)
  const [searchParams, setSearchParams] = useSearchParams()
  const company = useProfileStore((state) => state.companyProfile)
  const setCompanyProfileForSpreadsheet = useProfileStore((state) => state.setCompanyProfileForSpreadsheet)
  const [draft, setDraft] = useState(() => newDraft(
    year,
    company.conti,
    company.regimeFiscale,
    company.attivitaAteco?.[0]?.codice || company.ateco || '',
  ))
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([])
  const [chartOfAccountsError, setChartOfAccountsError] = useState('')
  const [chartOfAccountsScope, setChartOfAccountsScope] = useState('')
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([])
  const [customers, setCustomers] = useState<InvoiceCustomer[]>([])
  const [customerScope, setCustomerScope] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [page, setPage] = useState<'invoice' | 'archive' | 'customers' | 'credit-note'>('archive')
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
  const [archivingInvoiceId, setArchivingInvoiceId] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const effectiveDraft = useMemo(() => {
    const regimeFiscale = company.regimeFiscale || draft.regimeFiscale
    return {
      ...draft,
      regimeFiscale,
      ritenutaAttiva: regimeFiscale === 'RF19' ? false : draft.ritenutaAttiva,
      aliquotaRitenuta: regimeFiscale === 'RF19' ? 0 : draft.aliquotaRitenuta,
      atecoCode: draft.atecoCode || company.attivitaAteco?.[0]?.codice || company.ateco || '',
    }
  }, [company.ateco, company.attivitaAteco, company.regimeFiscale, draft])
  const totals = useMemo(() => calculateInvoiceTotals(effectiveDraft), [effectiveDraft])
  const fallbackChartAccounts = useMemo<ChartOfAccount[]>(() => [
    { codice: 'locale-ricavi', descrizione: company.conti.ricavi, tipo: 'Ricavo', gestione: company.conti.gestione, attivo: true },
    { codice: 'locale-costi', descrizione: company.conti.costi || 'Costi per acquisti', tipo: 'Costo', gestione: company.conti.gestione, attivo: true },
  ], [company.conti.costi, company.conti.gestione, company.conti.ricavi])
  const currentChartScope = `${token}:${spreadsheetId}`
  const accountOptions = chartOfAccountsScope === currentChartScope
    ? chartOfAccounts
    : fallbackChartAccounts
  const accountsError = chartOfAccountsError
    || (!token || !spreadsheetId ? 'Il Piano dei Conti GAS non è disponibile offline.' : '')
  const visibleInvoices = useMemo(
    () => invoiceScope === `${year}:${token}:${spreadsheetId}`
      ? invoices.filter((invoice) => invoice.data.slice(0, 4) === String(year))
      : [],
    [invoiceScope, invoices, spreadsheetId, token, year],
  )
  const scopedCreditNotes = creditNoteScope === `${year}:${token}:${spreadsheetId}` ? creditNotes : []
  const availableToCredit = (invoice: IssuedInvoice) => {
    const alreadyCreditedCents = scopedCreditNotes
      .filter((note) => note.fatturaId === invoice.id)
      .reduce((sum, note) => sum + Math.round(note.importo * 100), 0)
    return Math.max(0, Math.round(invoice.totali.totale * 100) - alreadyCreditedCents) / 100
  }
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
  const cashAccounts = useMemo(() => {
    const accounts = accountOptions
      .filter((account) => /banca|cassa|conto corrente|liquidit|postepay|paypal/i.test(account.descrizione))
      .map((account) => account.descrizione)
    if (company.conti.incassi) accounts.unshift(company.conti.incassi)
    return [...new Set(accounts)]
  }, [accountOptions, company.conti.incassi])
  const linkedInvoiceId = searchParams.get('documentId')
  const paymentInvoice = invoiceScope === `${year}:${token}:${spreadsheetId}`
    ? invoices.find((invoice) => invoice.id === (paymentInvoiceId || linkedInvoiceId))
    : undefined
  const allLedgerTransactions = useMemo(() => {
    const unique = new Map([...historyTransactions, ...transactions].map((transaction) => [transaction.id, transaction]))
    return [...unique.values()]
  }, [historyTransactions, transactions])

  useEffect(() => {
    if (!token || !spreadsheetId) return
    let cancelled = false
    fetchChartOfAccounts(token, spreadsheetId).then((accounts) => {
      if (!cancelled) {
        const merged = [...accounts]
        fallbackChartAccounts.forEach((fallback) => {
          if (!merged.some((account) => account.descrizione === fallback.descrizione)) merged.push(fallback)
        })
        setChartOfAccounts(merged)
        setChartOfAccountsScope(`${token}:${spreadsheetId}`)
        setChartOfAccountsError('')
      }
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : 'Impossibile caricare il Piano dei Conti.'
      setChartOfAccountsError(text)
      if (text.includes('SESSION_EXPIRED')) clearToken()
    })
    return () => { cancelled = true }
  }, [clearToken, fallbackChartAccounts, spreadsheetId, token])

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
    const submissionDraft = effectiveDraft.pagamento?.incassata && !effectiveDraft.payments.length
      ? {
          ...effectiveDraft,
          payments: [{
            data: effectiveDraft.data,
            importo: calculateInvoiceTotals(effectiveDraft).totale,
            conto: effectiveDraft.conti.incassi || 'Banca c/c',
            linkedTransactionId: effectiveDraft.id,
          }],
        }
      : effectiveDraft
    const submissionTotals = calculateInvoiceTotals(submissionDraft)
    const validationErrors = validateInvoice(submissionDraft)
    if (draft.data.slice(0, 4) !== String(year)) validationErrors.push(`La data deve appartenere all’esercizio ${year}.`)
    if (!company.ragioneSociale.trim() || !company.indirizzo.trim() || !company.partitaIva.trim()) {
      validationErrors.push('Completa ragione sociale, sede legale e partita IVA nelle Impostazioni.')
    }
    const issuerVatDigits = company.partitaIva.replace(/[^0-9]/g, '')
    if (issuerVatDigits && issuerVatDigits.length !== 11) {
      validationErrors.push(`La partita IVA dell’emittente deve contenere 11 cifre; valore attuale: ${issuerVatDigits.length} cifre.`)
    }
    if (!company.regimeFiscale) validationErrors.push('Seleziona il regime fiscale nelle Impostazioni.')
    if (!company.cap?.trim() || !company.comune?.trim()) {
      validationErrors.push('Completa CAP e comune della sede legale nelle Impostazioni.')
    }
    const xmlErrors = validateFatturaPaXml({
      ...submissionDraft,
      numero: '',
      stato: 'emessa',
      totali: submissionTotals,
    }, company)
    validationErrors.push(...xmlErrors)
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
    let archiveErrorMessage = ''
    try {
      const invoice = await issueInvoice(token, submissionDraft, spreadsheetId || undefined)
      let archivedInvoice = invoice
      try {
        const pdf = createInvoicePdf(invoice, company).output('arraybuffer') as ArrayBuffer
        const xml = buildFatturaPaXml(invoice, company)
        archivedInvoice = await archiveInvoice(
          token,
          invoice,
          arrayBufferToBase64(pdf),
          xml,
          spreadsheetId || undefined,
        )
      } catch (archiveError) {
        archiveErrorMessage = archiveError instanceof Error
          ? archiveError.message
          : 'Archiviazione Drive non riuscita.'
      }
      setInvoices((current) => [archivedInvoice, ...current.filter((item) => item.id !== archivedInvoice.id)])
      setInvoiceScope(`${year}:${token}:${spreadsheetId}`)
      void refreshLedger(year, token, 'business', spreadsheetId)
      let profileSaveError = ''
      try {
        const savedProfile = await saveCompanyProfile(token, { ...company, conti: draft.conti }, spreadsheetId)
        setCompanyProfileForSpreadsheet(savedProfile, spreadsheetId)
      } catch (profileError) {
        profileSaveError = profileError instanceof Error ? profileError.message : 'Impossibile salvare la mappatura contabile su Google Drive.'
      }
      try {
        const statusMessages = [
          `Fattura ${invoice.numero} emessa.`,
          archiveErrorMessage ? `Archiviazione Drive non riuscita: ${archiveErrorMessage}` : `PDF e XML archiviati su Google Drive.`,
          profileSaveError ? `Impostazioni non aggiornate su Drive: ${profileSaveError}` : '',
        ].filter(Boolean)
        setMessage(statusMessages.join(' '))
      } catch {
        setMessage(profileSaveError
          ? `Fattura ${invoice.numero} emessa. Aggiornamento impostazioni non riuscito: ${profileSaveError}`
          : `Fattura ${invoice.numero} emessa.`)
      }
      setDraft(newDraft(year, draft.conti, company.regimeFiscale, company.attivitaAteco?.[0]?.codice || company.ateco || ''))
      setErrors([])
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Emissione della fattura non riuscita.'
      if (text.includes('SESSION_EXPIRED')) clearToken()
      setMessage(text)
    } finally {
      setSaving(false)
    }
  }

  async function handleInvoicePayment(paymentInput: DocumentPaymentInput) {
    if (!paymentInvoice || !spreadsheetId) return
    setPaymentError('')
    if (paymentInput.importo > getInvoiceRemainingAmount(paymentInvoice)) {
      setPaymentError('Il residuo è cambiato: aggiorna la fattura e riprova.')
      return
    }
    const transactionId = createId()
    const payment: InvoicePayment = { ...paymentInput, linkedTransactionId: transactionId }
    const description = `Incasso fattura ${paymentInvoice.numero}`
    const transaction: LedgerTransaction = {
      id: transactionId,
      data: payment.data,
      totale: payment.importo,
      relatedDocumentType: 'invoice',
      relatedDocumentId: paymentInvoice.id,
      movimenti: [
        { conto: payment.conto, descrizione: description, gestione: '', dare: payment.importo, avere: 0 },
        { conto: paymentInvoice.conti.clienti, descrizione: description, gestione: '', dare: 0, avere: payment.importo },
      ],
    }
    setPaymentSaving(true)
    try {
      await queueTransaction(transaction, 'business', spreadsheetId, {
        documentType: 'invoice',
        documentId: paymentInvoice.id,
        payment,
      })
      setInvoices((current) => current.map((invoice) => invoice.id === paymentInvoice.id
        ? {
            ...invoice,
            payments: [...invoice.payments, payment],
            pagamento: {
              ...(invoice.pagamento || { metodo: '', scadenza: '', incassata: false }),
              incassata: getInvoiceRemainingAmount(invoice) - payment.importo <= 0.005,
            },
          }
        : invoice))
      void refreshLedger(year, token, 'business', spreadsheetId)
      window.dispatchEvent(new Event('accounting:sync-request'))
      setMessage('Incasso aggiunto alla Prima Nota e messo in coda per la sincronizzazione GAS.')
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Impossibile accodare l’incasso.')
    } finally {
      setPaymentSaving(false)
    }
  }

  function handlePdf(invoice: IssuedInvoice) {
    try {
      downloadInvoicePdf(invoice, company)
    } catch {
      setMessage('Impossibile generare il PDF in questo momento.')
    }
  }

  function handleXml(invoice: IssuedInvoice) {
    void handleArchive(invoice)
  }

  async function handleArchive(invoice: IssuedInvoice) {
    if (!token || !spreadsheetId) {
      setMessage('Accedi a GAS e seleziona un’entità prima di archiviare.')
      return
    }
    setArchivingInvoiceId(invoice.id)
    setMessage(`Archiviazione della fattura ${invoice.numero} su Google Drive…`)
    try {
      const pdf = createInvoicePdf(invoice, company).output('arraybuffer') as ArrayBuffer
      const xml = buildFatturaPaXml(invoice, company)
      const archived = await archiveInvoice(token, invoice, arrayBufferToBase64(pdf), xml, spreadsheetId)
      setInvoices((current) => [archived, ...current.filter((item) => item.id !== archived.id)])
      setMessage(`Fattura ${invoice.numero} archiviata su Google Drive.`)
    } catch (error) {
      setMessage(error instanceof Error
        ? `Archiviazione Drive non riuscita: ${error.message}`
        : 'Archiviazione Drive non riuscita.')
    } finally {
      setArchivingInvoiceId('')
    }
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
      {message && (
        <p className="mb-5 border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800" role="status">
          {message}
        </p>
      )}
      {page === 'invoice' && (!company.ragioneSociale || !company.indirizzo || !company.partitaIva) && (
        <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          I dati dell’emittente sono incompleti. <Link className="font-semibold underline" to="/impostazioni">Completa le Impostazioni</Link> prima di emettere.
        </p>
      )}
      {page === 'invoice' && company.partitaIva && company.partitaIva.replace(/[^0-9]/g, '').length !== 11 && (
        <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Partita IVA emittente non valida: inserire 11 cifre nelle <Link className="font-semibold underline" to="/impostazioni">Impostazioni</Link> prima dell’emissione.
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
      ) : page === 'invoice' ? (
        <InvoiceForm
          draft={effectiveDraft}
          setDraft={setDraft}
          customers={scopedCustomers}
          company={company}
          accounts={accountOptions}
          accountsError={accountsError}
          totals={totals}
          errors={errors}
          message={message}
          saving={saving}
          canIssue={Boolean(token && company.ragioneSociale && company.partitaIva)}
          onSubmit={(event) => { void handleSubmit(event) }}
          onAddCustomer={() => { setCustomerDraft(emptyCustomer()); setCustomerError('') }}
        />
      ) : null}

      <div hidden={page !== 'archive'}>
        <InvoiceList
          invoices={visibleInvoices}
          year={year}
          archivingInvoiceId={archivingInvoiceId}
          onNewInvoice={() => setPage('invoice')}
          onPdf={handlePdf}
          onXml={handleXml}
          onArchive={(invoice) => void handleArchive(invoice)}
          onPayments={(invoice) => { setPaymentError(''); setPaymentInvoiceId(invoice.id) }}
        />
      </div>

      {paymentInvoice && <InvoicePaymentsModal
        key={`${paymentInvoice.id}:${getInvoiceRemainingAmount(paymentInvoice)}`}
        documentLabel={paymentInvoice.documentType}
        documentNumber={paymentInvoice.numero}
        counterparty={paymentInvoice.cliente.ragioneSociale}
        status={getInvoicePaymentStatus(paymentInvoice)}
        total={paymentInvoice.totali.totale}
        paid={getInvoicePaidAmount(paymentInvoice)}
        remaining={getInvoiceRemainingAmount(paymentInvoice)}
        dueDate={paymentInvoice.pagamento?.scadenza}
        payments={paymentInvoice.payments}
        transactions={allLedgerTransactions.filter((transaction) => (
          transaction.id === paymentInvoice.id
          || transaction.id === paymentInvoice.linkedIssueTransactionId
          || transaction.relatedDocumentType === 'invoice' && transaction.relatedDocumentId === paymentInvoice.id
        ))}
        cashAccounts={cashAccounts}
        canPay={!['TD04', 'TD16', 'TD17', 'TD18', 'TD19'].includes(paymentInvoice.documentType)}
        busy={paymentSaving}
        errorMessage={paymentError}
        onClose={() => {
          setPaymentInvoiceId('')
          setPaymentError('')
          if (linkedInvoiceId) {
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete('documentId')
            setSearchParams(nextParams, { replace: true })
          }
        }}
        onRegister={(payment) => { void handleInvoicePayment(payment) }}
      />}

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
