import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  fetchPayrollAttendance,
  fetchPayrollWorkers,
  fetchPayslips,
  savePayrollAttendance,
  savePayrollWorker,
  savePayslip,
  savePayslipPdf,
  savePayrollAccountingPdf,
  saveTransaction,
  sendPayslipEmail,
} from '../../api/ledgerApi'
import { buildPayrollIssuePosting, buildPayrollPaymentPosting, validateTransaction, type LedgerTransaction } from '../../domain/accounting'
import { calculatePayslip, type AttendanceInput, type PayslipResult, type WorkerProfile } from '../../domain/payroll'
import { calculatePayrollAnnualThreshold } from '../../domain/tax'
import { buildPayrollTaxDeadlines } from '../tax/taxCalendar'
import { useEntityStore } from '../../stores/entityStore'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useProfileStore } from '../../stores/profileStore'
import { downloadPayslipPdf, payslipPdfToBase64 } from './payslipPdf'
import { downloadPayrollAccountingPdf, payrollAccountingPdfToBase64 } from './payrollAccountingPdf'

type PayslipRecord = PayslipResult & Partial<WorkerProfile> & { status?: 'Bozza' | 'Emesso' | 'Contabilizzato' | 'Pagato'; linkedIssueTxId?: string; linkedPaymentTxId?: string }
type AttendanceRecord = AttendanceInput & { id: string; workerId: string; year: number; month: number }

const inputClass = 'mt-1 min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const formatNumber = (value: number) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const createId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function PayrollPage({ year }: { year: number }) {
  const token = useGasSessionStore((state) => state.token)
  const activeSpreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const company = useProfileStore((state) => state.companyProfile)
  const [tab, setTab] = useState<'workers' | 'attendance' | 'payslips'>('workers')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [payslips, setPayslips] = useState<PayslipRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingAccountingPdf, setSavingAccountingPdf] = useState(false)
  const [worker, setWorker] = useState<WorkerProfile>({
    id: '',
    workerType: 'subordinate',
    nome: '',
    cognome: '',
    codiceFiscale: '',
    mensilita: 13,
  })

  const refresh = async () => {
    if (!token || !activeSpreadsheetId) return
    setLoading(true)
    setError('')
    try {
      const [workerData, attendanceData, payslipData] = await Promise.all([
        fetchPayrollWorkers(token, activeSpreadsheetId),
        fetchPayrollAttendance(token, year, month, activeSpreadsheetId),
        fetchPayslips(token, year, month, activeSpreadsheetId),
      ])
      setWorkers(workerData)
      setAttendance(attendanceData)
      setPayslips(payslipData as PayslipRecord[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossibile caricare i dati paghe.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void refresh() }, [token, activeSpreadsheetId, year, month])

  async function saveWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !activeSpreadsheetId) return
    setError('')
    setMessage('')
    try {
      const saved = await savePayrollWorker(token, { ...worker, id: worker.id || createId() }, activeSpreadsheetId)
      setWorkers((current) => [...current.filter((item) => item.id !== saved.id), saved])
      setWorker({ id: '', workerType: 'subordinate', nome: '', cognome: '', codiceFiscale: '', mensilita: 13 })
      setMessage('Collaboratore salvato.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio collaboratore non riuscito.')
    }
  }

  function updateAttendance(workerId: string, patch: AttendanceInput) {
    setAttendance((current) => {
      const existing = current.find((item) => item.workerId === workerId)
      return existing
        ? current.map((item) => item.workerId === workerId ? { ...item, ...patch } : item)
        : [...current, { id: `${workerId}_${year}-${String(month).padStart(2, '0')}`, workerId, year, month, ...patch }]
    })
  }

  async function saveAttendanceRecord(record: AttendanceRecord) {
    if (!token || !activeSpreadsheetId) return
    try {
      await savePayrollAttendance(token, record, activeSpreadsheetId)
      setMessage('Presenze salvate.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio presenze non riuscito.')
    }
  }

  async function generatePayslips() {
    if (!token || !activeSpreadsheetId) return
    setError('')
    setMessage('')
    try {
      const generated: PayslipRecord[] = []
      for (const item of workers) {
        const record = attendance.find((entry) => entry.workerId === item.id)
        const cumulative = payslips
          .filter((entry) => entry.workerId === item.id)
          .reduce((sum, entry) => sum + entry.competenze, 0)
        const result = calculatePayslip(item, year, month, record ?? {}, {
          annualCumulativeBefore: cumulative,
          netRounding: company.payrollRounding ?? 'cent',
        })
        const enriched: PayslipRecord = {
          ...result,
          id: `${item.id}_${year}-${String(month).padStart(2, '0')}`,
          workerId: item.id,
          nome: item.nome,
          cognome: item.cognome,
          email: item.email,
          status: 'Bozza',
        }
        await savePayslip(token, enriched as PayslipResult & Record<string, unknown>, activeSpreadsheetId)
        generated.push(enriched)
      }
      setPayslips(generated)
      setMessage(`Generati ${generated.length} cedolini.`)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Generazione cedolini non riuscita.')
    }
  }

  async function downloadPayslip(payslip: PayslipRecord) {
    const item = workers.find((entry) => entry.id === payslip.workerId)
    if (!item) return
    const record = attendance.find((entry) => entry.workerId === payslip.workerId)
    downloadPayslipPdf(payslip, item, company, record ?? {})
  }

  async function savePdf(payslip: PayslipRecord) {
    if (!token || !activeSpreadsheetId) return
    const item = workers.find((entry) => entry.id === payslip.workerId)
    if (!item) return
    try {
      const record = attendance.find((entry) => entry.workerId === payslip.workerId)
      const base64 = payslipPdfToBase64(payslip, item, company, record ?? {})
      const result = await savePayslipPdf(token, { ...payslip, nome: item.nome, cognome: item.cognome }, base64, activeSpreadsheetId)
      setPayslips((current) => current.map((entry) => entry.id === payslip.id
        ? { ...entry, status: 'Emesso', driveFileId: result.fileId, driveFileUrl: result.fileUrl }
        : entry))
      setMessage('Cedolino salvato su Drive.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio PDF non riuscito.')
    }
  }

  function downloadAccountingPdf() {
    try {
      downloadPayrollAccountingPdf(payslips, workers, company, year, month)
      setError('')
      setMessage('Prospetto contabile scaricato.')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Creazione del prospetto contabile non riuscita.')
    }
  }

  async function saveAccountingPdf() {
    if (!token || !activeSpreadsheetId || !payslips.length) return
    setSavingAccountingPdf(true)
    setError('')
    setMessage('')
    try {
      const base64 = payrollAccountingPdfToBase64(payslips, workers, company, year, month)
      const result = await savePayrollAccountingPdf(token, year, month, base64, activeSpreadsheetId)
      setMessage(`Prospetto contabile salvato su Drive: ${result.fileName}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio del prospetto contabile su Drive non riuscito.')
    } finally {
      setSavingAccountingPdf(false)
    }
  }

  async function emailPayslip(payslip: PayslipRecord) {
    if (!token || !activeSpreadsheetId) return
    const item = workers.find((entry) => entry.id === payslip.workerId)
    if (!item?.email) {
      setError('Il collaboratore non ha un indirizzo email.')
      return
    }
    try {
      const record = attendance.find((entry) => entry.workerId === payslip.workerId)
      const base64 = payslipPdfToBase64(payslip, item, company, record ?? {})
      await sendPayslipEmail(token, { ...payslip, nome: item.nome, cognome: item.cognome, email: item.email }, base64, activeSpreadsheetId)
      setMessage('Cedolino inviato via email.')
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : 'Invio email non riuscito.')
    }
  }

  async function registerPayment(payslip: PayslipRecord) {
    if (!token || !activeSpreadsheetId) return
    const item = workers.find((entry) => entry.id === payslip.workerId)
    if (!item || payslip.linkedPaymentTxId) return
    const transaction: LedgerTransaction = {
      id: `PAY-${payslip.id}`,
      data: `${payslip.year}-${String(payslip.month).padStart(2, '0')}-25`,
      totale: payslip.netto,
      movimenti: buildPayrollPaymentPosting(payslip, item),
    }
    if (validateTransaction(transaction).length) return
    try {
      await saveTransaction(token, transaction, 'business', activeSpreadsheetId)
      const updated = { ...payslip, status: 'Pagato' as const, linkedPaymentTxId: transaction.id }
      await savePayslip(token, updated as PayslipResult & Record<string, unknown>, activeSpreadsheetId)
      setPayslips((current) => current.map((entry) => entry.id === payslip.id ? updated : entry))
      setMessage('Bonifico registrato.')
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Registrazione bonifico non riuscita.')
    }
  }

  async function closeMonth() {
    if (!token || !activeSpreadsheetId || !payslips.length) return
    setError('')
    setMessage('')
    try {
      const updated = [...payslips]
      const amounts = { irpef: 0, addizionali: 0, ritenuta1040: 0, inpsDipendenti: 0, inpsGestioneSeparata: 0, pensionFund: 0 }
      for (let index = 0; index < updated.length; index += 1) {
        const payslip = updated[index]
        if (payslip.linkedIssueTxId) continue
        const item = workers.find((workerItem) => workerItem.id === payslip.workerId)
        if (!item) continue
        const transaction: LedgerTransaction = {
          id: `ISSUE-${payslip.id}`,
          data: `${payslip.year}-${String(payslip.month).padStart(2, '0')}-${String(new Date(payslip.year, payslip.month, 0).getDate()).padStart(2, '0')}`,
          totale: payslip.costoAzienda,
          movimenti: buildPayrollIssuePosting(payslip, item),
        }
        if (validateTransaction(transaction).length) throw new Error(`Scrittura paghe non valida per ${item.cognome} ${item.nome}.`)
        await saveTransaction(token, transaction, 'business', activeSpreadsheetId)
        updated[index] = { ...payslip, status: 'Contabilizzato', linkedIssueTxId: transaction.id }
        await savePayslip(token, updated[index] as PayslipResult & Record<string, unknown>, activeSpreadsheetId)
      }
      updated.forEach((payslip) => {
        amounts.irpef += payslip.irpefNetta + payslip.irpefSports
        amounts.addizionali += payslip.addizionaleRegionale + payslip.addizionaleComunale
        amounts.ritenuta1040 += payslip.workerType === 'occasional' ? payslip.ritenutaAcconto : 0
        amounts.inpsDipendenti += payslip.inpsDipendente + payslip.inpsAzienda + payslip.inailAzienda
        amounts.inpsGestioneSeparata += payslip.inpsGestioneSeparata
        amounts.pensionFund += payslip.pensionFundTfrContribution + payslip.pensionFundWorkerContribution + payslip.pensionFundEmployerContribution
      })
      const dueMonth = month === 12 ? 1 : month + 1
      const dueYear = month === 12 ? year + 1 : year
      const payrollDeadlines = buildPayrollTaxDeadlines(dueYear, dueMonth, amounts)
      const localKey = `tax-deadlines:${activeSpreadsheetId}:${dueYear}`
      try {
        const existing = JSON.parse(window.localStorage.getItem(localKey) || '{"manualDeadlines":[],"paidIds":[],"ricaviPerAteco":{}}')
        const manual = payrollDeadlines.map((deadline) => ({
          id: deadline.id,
          date: deadline.date,
          title: deadline.title,
          description: deadline.description,
          amount: deadline.amount,
          kind: 'personal' as const,
          paid: false,
          breakdown: deadline.breakdown,
          paymentInstructions: deadline.paymentInstructions,
          f24: deadline.f24,
        }))
        window.localStorage.setItem(localKey, JSON.stringify({
          ...existing,
          manualDeadlines: [...(existing.manualDeadlines || []).filter((item: { id?: string }) => !manual.some((entry) => entry.id === item.id)), ...manual],
        }))
      } catch {
        // The accounting close remains valid even if local calendar persistence is unavailable.
      }
      setPayslips(updated)
      setMessage('Mese contabilizzato e scadenze F24 generate al 16 del mese successivo.')
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Contabilizzazione mese non riuscita.')
    }
  }

  const threshold = useMemo(() => calculatePayrollAnnualThreshold(payslips, year), [payslips, year])

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Personale</p>
          <h1 className="mt-1 text-2xl font-semibold">Paghe e Collaboratori</h1>
        </div>
        <div className="flex gap-2">
          <label className="text-xs text-stone-600">Mese
            <select className={inputClass} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{String(index + 1).padStart(2, '0')}</option>)}
            </select>
          </label>
          <label className="text-xs text-stone-600">Anno
            <input className={inputClass} value={year} readOnly />
          </label>
        </div>
      </div>

      <div className="mb-6 border border-stone-200 bg-white p-4">
        <div className="flex justify-between text-sm"><strong>Soglia forfettario 20.000</strong><span>{formatNumber(threshold.total)} / {formatNumber(threshold.threshold)}</span></div>
        <div className="mt-2 h-3 overflow-hidden bg-stone-100"><div className={`h-full ${threshold.exceeded ? 'bg-rose-600' : threshold.attention ? 'bg-amber-500' : 'bg-emerald-700'}`} style={{ width: `${Math.min(100, threshold.percentage)}%` }} /></div>
        {threshold.attention && <p className={`mt-2 text-sm ${threshold.exceeded ? 'text-rose-700' : 'text-amber-700'}`}>{threshold.exceeded ? 'Limite forfettario 20.000 superato.' : 'Attenzione: soglia forfettario oltre l’80%.'}</p>}
      </div>

      <div className="mb-4 flex gap-2 border-b border-stone-200">
        {([
          ['workers', 'Anagrafica collaboratori'],
          ['attendance', 'Presenze mensili'],
          ['payslips', 'Cedolini & elaborazione'],
        ] as const).map(([value, label]) => (
          <button type="button" key={value} className={`px-4 py-3 text-sm ${tab === value ? 'border-b-2 border-emerald-800 font-semibold text-emerald-900' : 'text-stone-600'}`} onClick={() => setTab(value)}>{label}</button>
        ))}
      </div>
      {(error || message) && <p className={`mb-4 text-sm ${error ? 'text-rose-700' : 'text-emerald-800'}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
      {loading && <p className="mb-4 text-sm text-stone-500">Caricamento…</p>}

      {tab === 'workers' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="border border-stone-200 bg-white">
            {workers.map((item) => (
              <button type="button" key={item.id} className="block w-full border-b border-stone-100 px-4 py-3 text-left text-sm hover:bg-stone-50" onClick={() => setWorker(item)}>
                <strong>{item.cognome} {item.nome}</strong><span className="ml-2 text-stone-500">{item.workerType === 'subordinate' ? 'Subordinato' : item.workerType === 'occasional' ? 'Occasionale' : 'Sportivo'}</span>
              </button>
            ))}
          </div>
          <form onSubmit={saveWorker} className="grid gap-3 border border-stone-200 bg-white p-4">
            <h2 className="font-semibold">Anagrafica</h2>
            <label className="text-sm">Tipo<select className={inputClass} value={worker.workerType} onChange={(event) => setWorker({ ...worker, workerType: event.target.value as WorkerProfile['workerType'] })}><option value="subordinate">Subordinato</option><option value="occasional">Occasionale</option><option value="sports">Sportivo</option></select></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Nome<input className={inputClass} value={worker.nome} onChange={(event) => setWorker({ ...worker, nome: event.target.value })} required /></label><label className="text-sm">Cognome<input className={inputClass} value={worker.cognome} onChange={(event) => setWorker({ ...worker, cognome: event.target.value })} required /></label></div>
            <label className="text-sm">Codice Fiscale<input className={inputClass} value={worker.codiceFiscale} onChange={(event) => setWorker({ ...worker, codiceFiscale: event.target.value })} required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Codice dipendente<input className={inputClass} value={worker.codiceDipendente || ''} onChange={(event) => setWorker({ ...worker, codiceDipendente: event.target.value })} /></label>
              <label className="text-sm">Matricola<input className={inputClass} value={worker.matricola || ''} onChange={(event) => setWorker({ ...worker, matricola: event.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Data di nascita<input type="date" className={inputClass} value={worker.dataNascita || ''} onChange={(event) => setWorker({ ...worker, dataNascita: event.target.value })} /></label>
              <label className="text-sm">Data assunzione<input type="date" className={inputClass} value={worker.dataAssunzione || ''} onChange={(event) => setWorker({ ...worker, dataAssunzione: event.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Data cessazione<input type="date" className={inputClass} value={worker.dataFineRapporto || ''} onChange={(event) => setWorker({ ...worker, dataFineRapporto: event.target.value })} /></label>
              <label className="text-sm">Prossimo scatto<input type="date" className={inputClass} value={worker.prossimoScatto || ''} onChange={(event) => setWorker({ ...worker, prossimoScatto: event.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Qualifica<input className={inputClass} value={worker.qualifica || ''} onChange={(event) => setWorker({ ...worker, qualifica: event.target.value })} /></label>
              <label className="text-sm">Livello<input className={inputClass} value={worker.livello || ''} onChange={(event) => setWorker({ ...worker, livello: event.target.value })} /></label>
            </div>
            {worker.workerType === 'subordinate' && <label className="text-sm">Tipo contratto
              <select className={inputClass} value={worker.contractType || 'Indeterminato'} onChange={(event) => setWorker({ ...worker, contractType: event.target.value as WorkerProfile['contractType'] })}>
                <option value="Indeterminato">Tempo indeterminato</option>
                <option value="Determinato">Tempo determinato</option>
                <option value="Apprendistato">Apprendistato</option>
              </select>
            </label>}
            <label className="text-sm">Indirizzo<input className={inputClass} value={worker.indirizzo || ''} onChange={(event) => setWorker({ ...worker, indirizzo: event.target.value })} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">CAP<input className={inputClass} value={worker.cap || ''} onChange={(event) => setWorker({ ...worker, cap: event.target.value })} /></label>
              <label className="text-sm">Comune<input className={inputClass} value={worker.comune || ''} onChange={(event) => setWorker({ ...worker, comune: event.target.value })} /></label>
              <label className="text-sm">Provincia<input className={inputClass} value={worker.provincia || ''} onChange={(event) => setWorker({ ...worker, provincia: event.target.value })} maxLength={2} /></label>
            </div>
            <label className="text-sm">Email<input type="email" className={inputClass} value={worker.email || ''} onChange={(event) => setWorker({ ...worker, email: event.target.value })} /></label>
            <label className="text-sm">IBAN<input className={inputClass} value={worker.iban || ''} onChange={(event) => setWorker({ ...worker, iban: event.target.value })} /></label>
            <label className="text-sm">Nome banca<input className={inputClass} value={worker.nomeBanca || ''} onChange={(event) => setWorker({ ...worker, nomeBanca: event.target.value })} /></label>
            {!worker.iban && <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">ABI<input className={inputClass} value={worker.abi || ''} onChange={(event) => setWorker({ ...worker, abi: event.target.value })} maxLength={5} /></label>
              <label className="text-sm">CAB<input className={inputClass} value={worker.cab || ''} onChange={(event) => setWorker({ ...worker, cab: event.target.value })} maxLength={5} /></label>
              <label className="text-sm">C/C<input className={inputClass} value={worker.contoCorrente || ''} onChange={(event) => setWorker({ ...worker, contoCorrente: event.target.value })} /></label>
            </div>}
            {worker.workerType === 'subordinate' && <>
              <label className="text-sm">Paga base mensile<input type="number" min="0" step="0.01" className={inputClass} value={worker.pagaBaseMensile ?? ''} onChange={(event) => setWorker({ ...worker, pagaBaseMensile: Number(event.target.value) })} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-sm">Mensilità<select className={inputClass} value={worker.mensilita} onChange={(event) => setWorker({ ...worker, mensilita: Number(event.target.value) as 13 | 14 })}><option value={13}>13</option><option value={14}>14</option></select></label><label className="text-sm">INPS dipendente %<input type="number" min="0" step="0.01" className={inputClass} value={worker.aliquotaInpsDipendente ?? 9.19} onChange={(event) => setWorker({ ...worker, aliquotaInpsDipendente: Number(event.target.value) })} /></label></div>
            </>}
            <label className="text-sm">Destinazione TFR<select className={inputClass} value={worker.tfrDestination || 'company'} onChange={(event) => setWorker({ ...worker, tfrDestination: event.target.value as WorkerProfile['tfrDestination'] })}><option value="company">In azienda</option><option value="pension_fund">Fondo pensione</option></select></label>
            {worker.tfrDestination === 'pension_fund' && <><input className={inputClass} placeholder="Nome fondo" value={worker.fondoPensioneNome || ''} onChange={(event) => setWorker({ ...worker, fondoPensioneNome: event.target.value })} /><div className="grid grid-cols-2 gap-3"><input type="number" className={inputClass} placeholder="Quota dipendente %" value={worker.contributoPensioneDipendentePercent ?? ''} onChange={(event) => setWorker({ ...worker, contributoPensioneDipendentePercent: Number(event.target.value) })} /><input type="number" className={inputClass} placeholder="Quota azienda %" value={worker.contributoPensioneAziendaPercent ?? ''} onChange={(event) => setWorker({ ...worker, contributoPensioneAziendaPercent: Number(event.target.value) })} /></div></>}
            <button type="submit" className="min-h-11 bg-emerald-800 px-4 text-sm font-semibold text-white">Salva collaboratore</button>
          </form>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="overflow-x-auto border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-stone-200 bg-stone-50">{['Collaboratore','Ordinarie','Straordinari','Ferie','ROL','Malattia','Compenso lordo',''].map((title) => <th key={title} className="px-3 py-3 text-left">{title}</th>)}</tr></thead>
            <tbody>{workers.map((item) => {
              const record = attendance.find((entry) => entry.workerId === item.id) ?? { id: `${item.id}_${year}-${month}`, workerId: item.id, year, month }
              return <tr key={item.id} className="border-b border-stone-100">
                <td className="px-3 py-2 font-medium">{item.cognome} {item.nome}</td>
                {(['oreOrdinarie','oreStraordinario','oreFerie','oreRol','oreMalattia','compensoLordo'] as const).map((field) => <td key={field} className="px-2 py-2"><input type="number" min="0" step="0.01" className="min-h-9 w-24 border border-stone-300 px-2" value={record[field] ?? ''} onChange={(event) => updateAttendance(item.id, { [field]: Number(event.target.value) })} /></td>)}
                <td className="px-3 py-2"><button type="button" className="text-emerald-800 underline" onClick={() => void saveAttendanceRecord(attendance.find((entry) => entry.workerId === item.id) ?? record)}>Salva</button></td>
              </tr>
            })}</tbody>
          </table>
        </div>
      )}

      {tab === 'payslips' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <button type="button" className="min-h-11 bg-emerald-800 px-4 text-sm font-semibold text-white" onClick={() => void generatePayslips()} disabled={!workers.length}>Genera / ricalcola cedolini</button>
            <button type="button" className="min-h-11 border border-emerald-800 px-4 text-sm font-semibold text-emerald-900" onClick={() => void closeMonth()} disabled={!payslips.length}>Contabilizza mese in Prima Nota e genera F24</button>
            <button type="button" className="min-h-11 border border-stone-500 px-4 text-sm font-semibold text-stone-800" onClick={downloadAccountingPdf} disabled={!payslips.length}>Prospetto Contabile PDF (Uso Interno) · Scarica</button>
            <button type="button" className="min-h-11 border border-stone-500 px-4 text-sm font-semibold text-stone-800" onClick={() => void saveAccountingPdf()} disabled={!payslips.length || !token || !activeSpreadsheetId || savingAccountingPdf}>{savingAccountingPdf ? 'Salvataggio…' : 'Prospetto Contabile PDF (Uso Interno) · Salva su Drive'}</button>
          </div>
          <div className="grid gap-4">
            {payslips.map((payslip) => (
              <article key={payslip.id} className="border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h2 className="font-semibold">{payslip.cognome} {payslip.nome}</h2><p className="mt-1 text-sm text-stone-600">{payslip.workerType === 'subordinate' ? 'Subordinato' : payslip.workerType === 'occasional' ? 'Occasionale' : 'Sportivo'} · {payslip.status || 'Bozza'}</p></div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"><span>Lordo</span><strong className="text-right">{formatNumber(payslip.competenze)}</strong><span>Netto</span><strong className="text-right">{formatNumber(payslip.netto)}</strong></div>
                </div>
                <p className="mt-3 text-sm text-stone-600">INPS {formatNumber(payslip.inpsDipendente + payslip.inpsAzienda + payslip.inailAzienda + payslip.inpsGestioneSeparata)} · IRPEF/ritenute {formatNumber(payslip.irpefNetta + payslip.ritenutaAcconto + payslip.irpefSports)} · TFR {formatNumber(payslip.tfrQuotaMese)} · Fondo pensione {formatNumber(payslip.progressivi.fondoPensioneAccantonato)}</p>
                <div className="mt-4 border-t border-stone-100 pt-3 text-sm"><strong>Costo totale azienda:</strong> {formatNumber(payslip.costoAzienda)}</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="text-emerald-800 underline" onClick={() => void downloadPayslip(payslip)}>Cedolino PDF (Dipendente) · Scarica</button>
                  <button type="button" className="text-emerald-800 underline" onClick={() => void savePdf(payslip)}>Cedolino PDF (Dipendente) · Salva su Drive</button>
                  {payslip.email && <button type="button" className="text-emerald-800 underline" onClick={() => void emailPayslip(payslip)}>Invia email</button>}
                  <button type="button" className="text-emerald-800 underline" disabled={Boolean(payslip.linkedPaymentTxId)} onClick={() => void registerPayment(payslip)}>{payslip.linkedPaymentTxId ? 'Bonifico registrato' : 'Registra bonifico'}</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
