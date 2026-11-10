import { useState, type FormEvent } from 'react'
import {
  validateTransaction,
  type LedgerMovement,
  type LedgerTransaction,
} from '../../domain/accounting'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { queueTransaction } from '../../offline/offlineLedger'
import { useOfflineSyncStore } from '../../stores/offlineSyncStore'

interface DraftMovement {
  key: string
  conto: string
  gestione: string
  dare: string
  avere: string
}

const inputClass = 'min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const newMovement = (): DraftMovement => ({
  key: createId(),
  conto: '',
  gestione: '',
  dare: '',
  avere: '',
})

function localDate(year: number) {
  const date = new Date()
  return year === date.getFullYear()
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : `${year}-01-01`
}

export function TransactionForm({
  year,
  entity,
  accounts,
  managements,
  onSaved,
}: {
  year: number
  entity: 'private' | 'business'
  accounts: string[]
  managements: string[]
  onSaved: () => void
}) {
  const token = useGasSessionStore((state) => state.token)
  const online = useOfflineSyncStore((state) => state.online)
  const [date, setDate] = useState(() => localDate(year))
  const [description, setDescription] = useState('')
  const [movements, setMovements] = useState([newMovement(), newMovement()])
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const totalDebit = movements.reduce((sum, movement) => sum + (Number(movement.dare) || 0), 0)
  const totalCredit = movements.reduce((sum, movement) => sum + (Number(movement.avere) || 0), 0)

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const ledgerMovements: LedgerMovement[] = movements.map((movement) => ({
      conto: movement.conto,
      descrizione: description,
      gestione: movement.gestione,
      dare: Number(movement.dare) || 0,
      avere: Number(movement.avere) || 0,
    }))
    const transaction = { data: date, movimenti: ledgerMovements }
    const validationErrors = validateTransaction(transaction)
    if (date.slice(0, 4) !== String(year)) validationErrors.push(`La data deve appartenere all’esercizio ${year}.`)
    setErrors(validationErrors)
    if (validationErrors.length) return
    setSaving(true)
    try {
      const record: LedgerTransaction = {
        ...transaction,
        id: createId(),
        totale: totalDebit,
      }
      await queueTransaction(record, entity)
      setMessage(token && online
        ? 'Registrazione salvata in locale; sincronizzazione avviata.'
        : 'Registrazione salvata sul dispositivo, in attesa di rete e accesso GAS.')
      window.dispatchEvent(new Event('accounting:sync-request'))
      setDescription('')
      setMovements([newMovement(), newMovement()])
      setErrors([])
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Salvataggio locale non riuscito.')
    } finally {
      setSaving(false)
    }
  }

  function updateMovement(key: string, field: keyof Omit<DraftMovement, 'key'>, value: string) {
    setMovements((current) => current.map((movement) =>
      movement.key === key ? { ...movement, [field]: value } : movement,
    ))
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-6 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Registrazioni</p>
        <h1 className="text-2xl font-semibold text-stone-900">Partita doppia</h1>
        <p className="mt-2 text-sm text-stone-600">Ogni registrazione deve quadrare prima di essere inviata al foglio annuale.</p>
      </div>

      {!token && <p className="mb-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Puoi registrare offline: i movimenti resteranno in coda fino all’accesso a GAS e al ripristino della rete.</p>}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid gap-4 border border-stone-200 bg-white p-5 sm:grid-cols-[200px_1fr]">
          <label className="block text-sm text-stone-700">
            Data
            <input className={`${inputClass} mt-1`} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className="block text-sm text-stone-700">
            Descrizione
            <input className={`${inputClass} mt-1`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} required />
          </label>
        </div>

        <div className="overflow-x-auto border border-stone-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-stone-100 text-xs uppercase text-stone-600">
              <tr>
                <th className="px-3 py-3 font-semibold">Conto</th>
                <th className="px-3 py-3 font-semibold">Gestione</th>
                <th className="px-3 py-3 text-right font-semibold">Dare</th>
                <th className="px-3 py-3 text-right font-semibold">Avere</th>
                <th className="w-12 px-3 py-3"><span className="sr-only">Azioni</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {movements.map((movement) => (
                <tr key={movement.key}>
                  <td className="p-2">
                    <input className={inputClass} list="ledger-accounts" aria-label="Conto" value={movement.conto} onChange={(event) => updateMovement(movement.key, 'conto', event.target.value)} required />
                  </td>
                  <td className="p-2">
                    <input className={inputClass} list="ledger-managements" aria-label="Gestione" value={movement.gestione} onChange={(event) => updateMovement(movement.key, 'gestione', event.target.value)} />
                  </td>
                  <td className="p-2">
                    <input className={`${inputClass} text-right tabular-nums`} aria-label="Dare" type="number" min="0" step="0.01" value={movement.dare} onChange={(event) => updateMovement(movement.key, 'dare', event.target.value)} />
                  </td>
                  <td className="p-2">
                    <input className={`${inputClass} text-right tabular-nums`} aria-label="Avere" type="number" min="0" step="0.01" value={movement.avere} onChange={(event) => updateMovement(movement.key, 'avere', event.target.value)} />
                  </td>
                  <td className="p-2 text-center">
                    <button className="size-10 text-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30" type="button" aria-label="Rimuovi riga" title="Rimuovi riga" disabled={movements.length <= 2} onClick={() => setMovements((current) => current.filter((item) => item.key !== movement.key))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="ledger-accounts">{accounts.map((account) => <option key={account} value={account} />)}</datalist>
          <datalist id="ledger-managements">{managements.map((management) => <option key={management} value={management} />)}</datalist>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
            <button className="text-sm font-medium text-emerald-900 underline" type="button" onClick={() => setMovements((current) => [...current, newMovement()])}>Aggiungi riga</button>
            <div className="flex gap-6 text-sm tabular-nums">
              <span>Dare <strong>{totalDebit.toFixed(2)} €</strong></span>
              <span>Avere <strong>{totalCredit.toFixed(2)} €</strong></span>
              <span className={Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0 ? 'font-semibold text-emerald-800' : 'font-semibold text-rose-700'}>
                {Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0 ? 'Quadrata' : 'Da quadrare'}
              </span>
            </div>
          </div>
        </div>

        {errors.length > 0 && <ul className="list-disc border border-rose-200 bg-rose-50 px-8 py-3 text-sm text-rose-800">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        {message && <p className="text-sm text-stone-700" role="status">{message}</p>}
        <div className="flex justify-end">
          <button className="min-h-11 bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Registra movimento'}
          </button>
        </div>
      </form>
    </section>
  )
}