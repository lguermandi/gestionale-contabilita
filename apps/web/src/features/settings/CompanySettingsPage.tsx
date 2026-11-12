import { useState, type FormEvent } from 'react'
import type { InvoiceAccounts } from '../../domain/invoicing'
import { useGasSessionStore } from '../../stores/gasSessionStore'
import { useEntityStore } from '../../stores/entityStore'
import { useProfileStore, type CompanyProfile } from '../../stores/profileStore'

const inputClass = 'mt-1 min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none'
const identityFields: Array<{ key: keyof Omit<CompanyProfile, 'conti'>; label: string; required?: boolean }> = [
  { key: 'ragioneSociale', label: 'Ragione sociale', required: true },
  { key: 'indirizzo', label: 'Indirizzo sede legale', required: true },
  { key: 'partitaIva', label: 'Partita IVA', required: true },
  { key: 'codiceFiscale', label: 'Codice fiscale' },
  { key: 'email', label: 'Email' },
  { key: 'pec', label: 'PEC' },
  { key: 'codiceDestinatario', label: 'Codice destinatario' },
  { key: 'telefono', label: 'Telefono' },
]
const accountFields: Array<{ key: keyof InvoiceAccounts; label: string }> = [
  { key: 'clienti', label: 'Crediti verso clienti' },
  { key: 'ricavi', label: 'Ricavi' },
  { key: 'iva', label: 'IVA a debito' },
  { key: 'ritenute', label: 'Ritenute da recuperare' },
  { key: 'cassa', label: 'Contributi previdenziali' },
  { key: 'gestione', label: 'Gestione economica' },
  { key: 'bollo', label: 'Debiti per imposta di bollo' },
  { key: 'incassi', label: 'Incassi già ricevuti (cassa/banca)' },
  { key: 'costi', label: 'Costi per acquisti (predefinito)' },
  { key: 'ivaCredito', label: 'IVA a credito' },
  { key: 'fornitori', label: 'Debiti verso fornitori' },
]

export function CompanySettingsPage() {
  const token = useGasSessionStore((state) => state.token)
  const entities = useEntityStore((state) => state.entities)
  const activeSpreadsheetId = useEntityStore((state) => state.activeSpreadsheetId)
  const entitiesLoading = useEntityStore((state) => state.loading)
  const entitiesError = useEntityStore((state) => state.error)
  const createEntity = useEntityStore((state) => state.createEntity)
  const activeEntity = entities.find((entity) => entity.spreadsheetId === activeSpreadsheetId)
  const savedProfile = useProfileStore((state) => state.companyProfile)
  const setCompanyProfile = useProfileStore((state) => state.setCompanyProfile)
  const [profile, setProfile] = useState(savedProfile)
  const [saved, setSaved] = useState(false)
  const [entityName, setEntityName] = useState('')
  const [entityType, setEntityType] = useState<'Privato' | 'Azienda'>('Privato')
  const [entityTaxCode, setEntityTaxCode] = useState('')
  const [entityVatNumber, setEntityVatNumber] = useState('')
  const [entityError, setEntityError] = useState('')
  const [entityMessage, setEntityMessage] = useState('')
  const [creatingEntity, setCreatingEntity] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCompanyProfile(profile)
    setSaved(true)
  }

  async function handleCreateEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEntityError('')
    setEntityMessage('')
    if (!token) {
      setEntityError('Accedi a GAS dalla barra superiore per creare un’entità.')
      return
    }

    setCreatingEntity(true)
    try {
      const created = await createEntity(token, {
        nome: entityName,
        tipo: entityType,
        codiceFiscale: entityTaxCode,
        partitaIva: entityVatNumber,
        regime: '',
      })
      setEntityMessage(`Entità "${created.nomeEntita}" creata e selezionata.`)
      setEntityName('')
      setEntityTaxCode('')
      setEntityVatNumber('')
    } catch (error) {
      setEntityError(error instanceof Error ? error.message : 'Creazione dell’entità non riuscita.')
    } finally {
      setCreatingEntity(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
      <div className="mb-7 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Profilo aziendale</p>
        <h1 className="text-2xl font-semibold text-stone-900">Impostazioni</h1>
        <p className="mt-2 text-sm text-stone-600">Dati emittente e conti usati per fatture e scritture automatiche.</p>
      </div>
      <section className="mb-6 border border-stone-200 bg-white p-5">
        <h2 className="mb-2 font-semibold text-stone-900">Entità contabili su Google Drive</h2>
        <p className="mb-4 text-sm text-stone-600">Ogni entità mantiene cartella e spreadsheet separati.</p>
        <form onSubmit={handleCreateEntity} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-stone-700">
            Nome
            <input className={inputClass} value={entityName} onChange={(event) => setEntityName(event.target.value)} maxLength={100} required />
          </label>
          <label className="block text-sm text-stone-700">
            Tipo
            <select className={inputClass} value={entityType} onChange={(event) => setEntityType(event.target.value as 'Privato' | 'Azienda')}>
              <option value="Privato">Privato</option>
              <option value="Azienda">Azienda</option>
            </select>
          </label>
          <label className="block text-sm text-stone-700">
            Codice fiscale
            <input className={inputClass} value={entityTaxCode} onChange={(event) => setEntityTaxCode(event.target.value)} maxLength={32} />
          </label>
          <label className="block text-sm text-stone-700">
            Partita IVA
            <input className={inputClass} value={entityVatNumber} onChange={(event) => setEntityVatNumber(event.target.value)} maxLength={32} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={creatingEntity || !token} className="min-h-11 bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {creatingEntity ? 'Creazione…' : 'Crea entità'}
              </button>
              {activeEntity && (
                <a
                  className="inline-flex min-h-11 items-center border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
                  href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(activeEntity.spreadsheetId)}/export?format=xlsx`}
                >
                  Scarica Backup XLSX
                </a>
              )}
            </div>
            {entitiesLoading && <p className="text-sm text-stone-500" role="status">Caricamento entità…</p>}
          </div>
        </form>
        {(entityError || entitiesError) && <p className="mt-3 text-sm text-rose-700" role="alert">{entityError || entitiesError}</p>}
        {entityMessage && <p className="mt-3 text-sm text-emerald-800" role="status">{entityMessage}</p>}
      </section>
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="border border-stone-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-stone-900">Dati dell’emittente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {identityFields.map((field) => (
              <label key={field.key} className="block text-sm text-stone-700">
                {field.label}
                <input
                  className={inputClass}
                  value={profile[field.key]}
                  required={field.required}
                  type={field.key === 'email' || field.key === 'pec' ? 'email' : 'text'}
                  maxLength={200}
                  onChange={(event) => {
                    setSaved(false)
                    setProfile((current) => ({ ...current, [field.key]: event.target.value }))
                  }}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="border border-stone-200 bg-white p-5">
          <h2 className="mb-2 font-semibold text-stone-900">Mappatura contabile</h2>
          <p className="mb-4 text-sm text-stone-600">I nomi devono corrispondere al piano dei conti aziendale. Il server li userà per generare la scrittura all’emissione.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {accountFields.map((field) => (
              <label key={field.key} className="block text-sm text-stone-700">
                {field.label}
                <input
                  className={inputClass}
                  value={profile.conti[field.key]}
                  maxLength={200}
                  required
                  onChange={(event) => {
                    setSaved(false)
                    setProfile((current) => ({
                      ...current,
                      conti: { ...current.conti, [field.key]: event.target.value },
                    }))
                  }}
                />
              </label>
            ))}
          </div>
        </section>
        <div className="flex items-center justify-end gap-4">
          {saved && <p className="text-sm text-emerald-800" role="status">Impostazioni salvate su questo dispositivo.</p>}
          <button type="submit" className="min-h-11 bg-emerald-800 px-5 text-sm font-semibold text-white hover:bg-emerald-700">Salva impostazioni</button>
        </div>
      </form>
    </section>
  )
}
