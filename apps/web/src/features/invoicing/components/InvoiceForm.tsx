import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { InvoiceCustomer, InvoiceDraft, InvoiceLine } from '../../../domain/invoicing'
import { calculateInvoiceTotals } from '../../../domain/invoicing'
import type { ChartOfAccount } from '../../../api/ledgerApi'
import type { CompanyProfile } from '../../../stores/profileStore'

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function newLine(aliquotaIva = 22): InvoiceLine {
  return { id: createId(), descrizione: '', quantita: 1, prezzoUnitario: 0, aliquotaIva }
}

interface InvoiceFormProps {
  draft: InvoiceDraft
  setDraft: Dispatch<SetStateAction<InvoiceDraft>>
  customers: InvoiceCustomer[]
  company: CompanyProfile
  accounts: ChartOfAccount[]
  accountsError: string
  totals: ReturnType<typeof calculateInvoiceTotals>
  errors: string[]
  message: string
  saving: boolean
  canIssue: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onAddCustomer: () => void
}

export function InvoiceForm({
  draft,
  setDraft,
  customers,
  company,
  accounts,
  accountsError,
  totals,
  errors,
  message,
  saving,
  canIssue,
  onSubmit,
  onAddCustomer,
}: InvoiceFormProps) {
  function updateCustomer(key: keyof InvoiceDraft['cliente'], value: string) {
    setDraft((current) => ({ ...current, cliente: { ...current.cliente, [key]: value } }))
  }

  function updateLine(id: string, key: keyof Omit<InvoiceLine, 'id'>, value: string) {
    const updatedValue = ['descrizione', 'revenueAccount', 'costAccount', 'atecoCode'].includes(key)
      ? value || undefined
      : Number(value)
    setDraft((current) => ({
      ...current,
      linee: current.linee.map((line) => line.id === id
        ? { ...line, [key]: updatedValue }
        : line),
    }))
  }

  function selectCustomer(id: string) {
    const selected = customers.find((customer) => customer.id === id)
    if (selected) setDraft((current) => ({ ...current, cliente: { ...selected } }))
    else setDraft((current) => ({ ...current, cliente: { ...current.cliente, id: undefined } }))
  }

  const revenueAccounts = accounts.filter((account) => account.tipo.toLowerCase() === 'ricavo')
  const costAccounts = accounts.filter((account) => account.tipo.toLowerCase() === 'costo')
  const atecoCodes = [...new Set([
    ...(company.attivitaAteco || []).map((activity) => activity.codice),
    company.ateco || '',
  ].filter(Boolean))]
  const reverseCharge = ['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType)

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-6 xl:grid-cols-[minmax(350px,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <section className="border border-stone-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-stone-950">Intestazione</h2>
            <button type="button" className="text-sm font-medium text-emerald-900 underline" onClick={onAddCustomer}>Aggiungi cliente</button>
          </div>
          <label className="mb-4 block text-sm text-stone-700">{reverseCharge ? 'Fornitore salvato' : 'Cliente salvato'}
            <select className={`${inputClass} mt-1`} value={draft.cliente.id || ''} onChange={(event) => selectCustomer(event.target.value)}>
              <option value="">Inserisci i dati manualmente</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.ragioneSociale}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-stone-700 sm:col-span-2">Tipo documento
              <select className={`${inputClass} mt-1`} value={draft.documentType} onChange={(event) => setDraft((current) => ({ ...current, documentType: event.target.value as InvoiceDraft['documentType'] }))}>
                <option value="TD01">TD01 · Fattura</option>
                <option value="TD24">TD24 · Fattura differita</option>
                <option value="TD04">TD04 · Nota di credito</option>
                <option value="TD16">TD16 · Integrazione reverse charge interno</option>
                <option value="TD17">TD17 · Servizi esteri (es. Google, GitHub, Meta)</option>
                <option value="TD18">TD18 · Acquisti di beni intracomunitari</option>
                <option value="TD19">TD19 · Beni in Italia da soggetto estero</option>
              </select>
              <span className="mt-1 block text-xs text-stone-500">Usa TD17 per abbonamenti o servizi esteri senza IVA, ad esempio Google, GitHub o Meta.</span>
            </label>
            {draft.documentType === 'TD04' && (
              <>
                <label className="block text-sm text-stone-700">Numero fattura collegata
                  <input className={inputClass} value={draft.linkedInvoiceNumber || ''} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, linkedInvoiceNumber: event.target.value }))} required />
                </label>
                <label className="block text-sm text-stone-700">Data fattura collegata
                  <input className={inputClass} type="date" value={draft.linkedInvoiceDate || ''} onChange={(event) => setDraft((current) => ({ ...current, linkedInvoiceDate: event.target.value }))} required />
                </label>
              </>
            )}
            <label className="block text-sm text-stone-700 sm:col-span-2">{reverseCharge ? 'Fornitore / cedente' : 'Ragione sociale'}
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
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-stone-500"><tr><th className="px-3 py-3">Descrizione</th><th className="w-20 px-3 py-3 text-right">Q.tà</th><th className="w-28 px-3 py-3 text-right">Prezzo</th><th className="w-24 px-3 py-3 text-right">IVA %</th><th className="w-24 px-3 py-3 text-right">Importo</th><th className="min-w-52 px-3 py-3">{reverseCharge ? 'Conto di costo' : 'Conto ricavo / ATECO'}</th><th className="w-10"><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {draft.linee.map((line) => (
                  <tr key={line.id}>
                    <td className="p-2"><input className={inputClass} aria-label="Descrizione prestazione" value={line.descrizione} maxLength={200} onChange={(event) => updateLine(line.id, 'descrizione', event.target.value)} required /></td>
                    <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Quantità" type="number" min="0.01" step="0.01" value={line.quantita} onChange={(event) => updateLine(line.id, 'quantita', event.target.value)} required /></td>
                    <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Prezzo unitario" type="number" min="0" step="0.01" value={line.prezzoUnitario} onChange={(event) => updateLine(line.id, 'prezzoUnitario', event.target.value)} required /></td>
                    <td className="p-2"><input className={`${inputClass} text-right tabular-nums`} aria-label="Aliquota IVA" type="number" min="0" max="100" step="0.1" value={draft.regimeFiscale === 'RF19' && !reverseCharge ? 0 : line.aliquotaIva ?? draft.aliquotaIva} disabled={draft.regimeFiscale === 'RF19' && !reverseCharge} onChange={(event) => updateLine(line.id, 'aliquotaIva', event.target.value)} required /></td>
                    <td className="px-2 text-right tabular-nums">{euro.format(line.quantita * line.prezzoUnitario)}</td>
                    <td className="space-y-1 p-2">
                      <select className={inputClass} aria-label={reverseCharge ? 'Conto di costo specifico della riga' : 'Conto di ricavo specifico della riga'} value={reverseCharge ? line.costAccount || '' : line.revenueAccount || ''} onChange={(event) => updateLine(line.id, reverseCharge ? 'costAccount' : 'revenueAccount', event.target.value)}>
                        <option value="">Usa conto predefinito</option>
                        {(reverseCharge ? costAccounts : revenueAccounts).map((account) => <option key={account.codice} value={account.descrizione}>{account.codice} · {account.descrizione}</option>)}
                      </select>
                      {!reverseCharge && (
                        <select className={inputClass} aria-label="Codice ATECO specifico della riga" value={line.atecoCode || ''} onChange={(event) => updateLine(line.id, 'atecoCode', event.target.value)}>
                          <option value="">Usa ATECO predefinito</option>
                          {atecoCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="p-2"><button className="size-10 text-lg text-stone-500 disabled:opacity-30" type="button" title="Rimuovi prestazione" aria-label="Rimuovi prestazione" disabled={draft.linee.length <= 1} onClick={() => setDraft((current) => ({ ...current, linee: current.linee.filter((item) => item.id !== line.id) }))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-stone-200 px-5 py-3"><button className="w-full border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50" type="button" onClick={() => setDraft((current) => ({ ...current, linee: [...current.linee, newLine(current.aliquotaIva)] }))}>Aggiungi prestazione</button></div>
        </section>

        <section className="border border-stone-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-stone-950">Classificazione contabile e fiscale</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {!reverseCharge && (
              <>
                <label className="block text-sm text-stone-700">Conto di ricavo
                  <select className={`${inputClass} mt-1`} value={draft.revenueAccount || ''} onChange={(event) => setDraft((current) => ({ ...current, revenueAccount: event.target.value }))} required>
                    <option value="">Seleziona un conto di ricavo</option>
                    {revenueAccounts.map((account) => <option key={account.codice} value={account.descrizione}>{account.codice} · {account.descrizione}</option>)}
                    {draft.revenueAccount && !revenueAccounts.some((account) => account.descrizione === draft.revenueAccount) && <option value={draft.revenueAccount}>{draft.revenueAccount} (configurazione salvata)</option>}
                  </select>
                </label>
                <label className="block text-sm text-stone-700">Codice ATECO
                  <select className={`${inputClass} mt-1`} value={draft.atecoCode || ''} onChange={(event) => setDraft((current) => ({ ...current, atecoCode: event.target.value }))} required>
                    <option value="">Seleziona un codice ATECO</option>
                    {atecoCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                  </select>
                </label>
              </>
            )}
            {reverseCharge && (
              <label className="block text-sm text-stone-700 sm:col-span-2">Conto di costo
                <select className={`${inputClass} mt-1`} value={draft.costAccount || ''} onChange={(event) => setDraft((current) => ({ ...current, costAccount: event.target.value }))} required>
                  <option value="">Seleziona un conto di costo</option>
                  {costAccounts.map((account) => <option key={account.codice} value={account.descrizione}>{account.codice} · {account.descrizione}</option>)}
                  {draft.costAccount && !costAccounts.some((account) => account.descrizione === draft.costAccount) && <option value={draft.costAccount}>{draft.costAccount} (configurazione salvata)</option>}
                </select>
              </label>
            )}
          </div>
          {accountsError && <p className="mt-2 text-xs text-amber-800" role="status">{accountsError} È disponibile la mappatura contabile già salvata.</p>}
          <div className="mt-4 border-t border-stone-200 pt-4">
            <h3 className="mb-3 text-sm font-medium text-stone-800">Voci previdenziali e fiscali</h3>
            <label className="mb-3 block text-sm text-stone-700">Tipo di rivalsa
              <select className={`${inputClass} mt-1`} value={draft.contributionType || ''} onChange={(event) => {
                const contributionType = (event.target.value || undefined) as InvoiceDraft['contributionType']
                setDraft((current) => ({
                  ...current,
                  contributionType,
                  contributionCode: contributionType === 'gestione_separata'
                    ? 'TC22'
                    : contributionType === 'cassa_previdenziale' ? current.contributionCode : undefined,
                }))
              }}>
                <option value="">Nessuna</option>
                <option value="gestione_separata">Rivalsa INPS · Gestione Separata</option>
                <option value="cassa_previdenziale">Cassa previdenziale</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <RateInput label="Rivalsa / cassa (%)" value={draft.aliquotaCassa} onChange={(value) => setDraft((current) => ({ ...current, aliquotaCassa: value }))} />
              {draft.regimeFiscale !== 'RF19' && (
                <>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-stone-700">
                    <input type="checkbox" checked={draft.ritenutaAttiva || false} onChange={(event) => setDraft((current) => ({ ...current, ritenutaAttiva: event.target.checked, aliquotaRitenuta: event.target.checked ? current.aliquotaRitenuta || 20 : 0 }))} />
                    Applica ritenuta d’acconto
                  </label>
                  {draft.ritenutaAttiva && <RateInput label="Ritenuta (%)" value={draft.aliquotaRitenuta} onChange={(value) => setDraft((current) => ({ ...current, aliquotaRitenuta: value }))} />}
                </>
              )}
              {draft.contributionType === 'cassa_previdenziale' && draft.aliquotaCassa > 0 && (
                <label className="block text-sm text-stone-700">Codice cassa FatturaPA
                  <select className={`${inputClass} mt-1`} value={draft.contributionCode || ''} onChange={(event) => setDraft((current) => ({ ...current, contributionCode: event.target.value }))} required>
                    <option value="">Seleziona codice cassa</option>
                    {Array.from({ length: 22 }, (_, index) => `TC${String(index + 1).padStart(2, '0')}`).map((code) => <option key={code}>{code}</option>)}
                  </select>
                  <span className="mt-1 block text-xs text-stone-500">Verifica il codice assegnato alla tua cassa previdenziale.</span>
                </label>
              )}
            </div>
          </div>
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
              <input type="checkbox" checked={draft.bolloRiaddebitatoAlCliente || false} disabled={totals.bollo <= 0} onChange={(event) => setDraft((current) => ({ ...current, bolloRiaddebitatoAlCliente: event.target.checked, marcaDaBollo: { ...current.marcaDaBollo!, addebitata: event.target.checked } }))} />
              Ri-addebita al cliente la marca da bollo automatica
            </label>
            {totals.bollo > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-stone-700">Importo marca da bollo
                  <input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" value={draft.marcaDaBollo?.importo ?? 2} onChange={(event) => setDraft((current) => ({ ...current, marcaDaBollo: { ...current.marcaDaBollo!, importo: Number(event.target.value), dovuta: true } }))} />
                </label>
                <label className="block text-sm text-stone-700">ID marca da bollo
                  <input className={`${inputClass} mt-1`} maxLength={100} value={draft.marcaDaBollo?.identificativo || ''} onChange={(event) => setDraft((current) => ({ ...current, marcaDaBollo: { ...current.marcaDaBollo!, identificativo: event.target.value } }))} />
                </label>
                <p className="text-xs text-stone-500 sm:col-span-2">{draft.bolloRiaddebitatoAlCliente ? 'La marca aumenta il totale dovuto dal cliente.' : 'La marca resta a carico dell’emittente e non aumenta il totale dovuto.'}</p>
              </div>
            )}
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
        <button className="min-h-12 w-full bg-stone-950 px-5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={saving || !canIssue}>{saving ? 'Emissione…' : 'Emetti e archivia su Drive'}</button>
      </div>
    </form>
  )
}

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-sm text-stone-700">{label}<input className={`${inputClass} text-right tabular-nums`} type="number" min="0" max="100" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} required /></label>
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt className="text-stone-600">{label}</dt><dd className="shrink-0 tabular-nums">{euro.format(value)}</dd></div>
}

function InvoicePreview({
  draft,
  company,
  totals,
}: {
  draft: InvoiceDraft
  company: CompanyProfile
  totals: ReturnType<typeof calculateInvoiceTotals>
}) {
  const reverseCharge = ['TD16', 'TD17', 'TD18', 'TD19'].includes(draft.documentType)
  const amountSign = draft.documentType === 'TD04' ? -1 : 1
  return (
    <section className="border border-stone-200 bg-slate-100 p-4 md:p-6">
      <article className="min-h-[560px] bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
        <div><h2 className="text-xl font-semibold text-stone-950">{draft.documentType} · {draft.documentType === 'TD04' ? 'Nota di credito' : reverseCharge ? 'Autofattura / integrazione' : 'Fattura'}</h2><p className="mt-1 text-sm text-stone-500">Anteprima · {draft.data ? new Date(`${draft.data}T00:00:00`).toLocaleDateString('it-IT') : 'Data emissione'}</p></div>
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Bozza</span>
        </div>
        <div className="grid gap-6 py-6 sm:grid-cols-2">
        <div><p className="text-sm font-semibold text-indigo-600">{reverseCharge ? draft.cliente.ragioneSociale || 'Fornitore' : company.ragioneSociale || 'La tua attività'}</p><p className="mt-2 whitespace-pre-line text-xs leading-5 text-stone-600">{reverseCharge
          ? [draft.cliente.indirizzo, draft.cliente.partitaIva && `P. IVA ${draft.cliente.partitaIva}`].filter(Boolean).join('\n')
          : [company.indirizzo, company.partitaIva && `P. IVA ${company.partitaIva}`, company.email].filter(Boolean).join('\n') || 'Dati emittente'}</p></div>
        <div className="sm:text-right"><p className="text-xs uppercase text-stone-500">{reverseCharge ? 'Cessionario / committente' : 'Destinatario'}</p><p className="mt-1 font-medium text-stone-950">{reverseCharge ? company.ragioneSociale || 'La tua attività' : draft.cliente.ragioneSociale || 'Nome cliente'}</p><p className="mt-2 whitespace-pre-line text-xs leading-5 text-stone-600">{reverseCharge
          ? [company.indirizzo, company.partitaIva && `P. IVA ${company.partitaIva}`, company.codiceFiscale && `C.F. ${company.codiceFiscale}`].filter(Boolean).join('\n')
          : [draft.cliente.indirizzo, [draft.cliente.cap, draft.cliente.comune].filter(Boolean).join(' '), draft.cliente.partitaIva && `P. IVA ${draft.cliente.partitaIva}`, draft.cliente.codiceFiscale && `C.F. ${draft.cliente.codiceFiscale}`].filter(Boolean).join('\n')}</p></div>
        </div>
        <div className="border-t border-stone-200">
          <div className="flex justify-between py-3 text-xs font-semibold uppercase text-stone-500"><span>Descrizione</span><span>Importo</span></div>
          {draft.linee.map((line) => <div key={line.id} className="flex justify-between gap-3 border-t border-stone-100 py-3 text-sm"><span>{line.descrizione || 'Prestazione'} <span className="text-xs text-stone-500">× {line.quantita} · IVA {draft.regimeFiscale === 'RF19' && !reverseCharge ? 0 : line.aliquotaIva ?? draft.aliquotaIva}%</span></span><span className="shrink-0 tabular-nums">{euro.format(line.quantita * line.prezzoUnitario * amountSign)}</span></div>)}
        </div>
        <dl className="mt-6 space-y-2 border-t border-stone-200 pt-4 text-sm">
          <TotalRow label="Totale prestazioni" value={totals.imponibile * amountSign} />
          {totals.cassa > 0 && <TotalRow label="Cassa previdenziale" value={totals.cassa * amountSign} />}
          {totals.ivaPerAliquota.map((item) => <TotalRow key={item.aliquota} label={`IVA (${item.aliquota}%)`} value={item.iva * amountSign} />)}
          {totals.ritenuta > 0 && <TotalRow label="Ritenuta d’acconto" value={-totals.ritenuta * amountSign} />}
          {totals.bollo > 0 && <TotalRow label={`Marca da bollo${totals.bolloRiaddebitato ? '' : ' (a carico emittente)'}`} value={totals.bollo * amountSign} />}
          <div className="flex justify-between border-t border-stone-300 pt-3 text-base font-semibold"><dt>Totale</dt><dd className="tabular-nums">{euro.format(totals.totale * amountSign)}</dd></div>
        </dl>
        <div className="mt-8 grid gap-5 border-t border-stone-200 pt-5 text-xs sm:grid-cols-2">
          <div><p className="mb-2 font-semibold text-stone-800">Modalità di pagamento</p><p className="text-stone-600">{draft.pagamento?.metodo || 'Da concordare'}</p>{draft.pagamento?.scadenza && <p className="mt-2 text-stone-600">Da saldare entro il {new Date(`${draft.pagamento.scadenza}T00:00:00`).toLocaleDateString('it-IT')}</p>}{draft.pagamento?.incassata && <p className="mt-2 font-medium text-emerald-800">Pagamento già ricevuto</p>}</div>
          <div><p className="mb-2 font-semibold text-stone-800">Note</p><p className="whitespace-pre-line text-stone-600">{draft.note || '—'}</p>{draft.marcaDaBollo?.addebitata && draft.marcaDaBollo.identificativo && <p className="mt-2 text-stone-600">ID marca da bollo: {draft.marcaDaBollo.identificativo}</p>}</div>
        </div>
      </article>
    </section>
  )
}

