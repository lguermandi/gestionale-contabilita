import { useState, type FormEvent } from 'react'
import type { InvoiceAccounts } from '../../domain/invoicing'
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
  const savedProfile = useProfileStore((state) => state.companyProfile)
  const setCompanyProfile = useProfileStore((state) => state.setCompanyProfile)
  const [profile, setProfile] = useState(savedProfile)
  const [saved, setSaved] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCompanyProfile(profile)
    setSaved(true)
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
      <div className="mb-7 border-b border-stone-200 pb-5">
        <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">Profilo aziendale</p>
        <h1 className="text-2xl font-semibold text-stone-900">Impostazioni</h1>
        <p className="mt-2 text-sm text-stone-600">Dati emittente e conti usati per fatture e scritture automatiche.</p>
      </div>
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
