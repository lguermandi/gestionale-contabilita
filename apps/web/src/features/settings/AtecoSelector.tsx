import { useMemo, useState } from 'react'
import {
  findAtecoByCode,
  getAtecoCodes,
  getAtecoDivisions,
  getAtecoSections,
  getDefaultForfettarioCoefficient,
  searchAteco,
} from '../../domain/ateco'
import type { AtecoActivity } from '../../domain/tax'

interface AtecoSelectorProps {
  activities: AtecoActivity[]
  onChange: (activities: AtecoActivity[]) => void
  disabled?: boolean
}

const fieldClass = 'mt-1 min-h-10 w-full border border-stone-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none disabled:bg-stone-100'

function formatActivity(code: string) {
  const activity = findAtecoByCode(code)
  return activity
    ? `${activity.code} · ${activity.title}`
    : `${code} · Codice non presente nel catalogo ATECO 2025`
}

export function AtecoSelector({ activities, onChange, disabled = false }: AtecoSelectorProps) {
  const [query, setQuery] = useState('')
  const [sectionCode, setSectionCode] = useState('')
  const [divisionCode, setDivisionCode] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const sections = getAtecoSections()
  const divisions = getAtecoDivisions(sectionCode || undefined)
  const availableCodes = getAtecoCodes(divisionCode || undefined)
  const searchResults = useMemo(() => searchAteco(query).slice(0, 30), [query])
  const mainIndex = Math.max(0, activities.findIndex((activity) => activity.principale))

  function withPrincipal(items: AtecoActivity[], preferredIndex = items.findIndex((activity) => activity.principale)) {
    const selectedIndex = preferredIndex < 0 ? 0 : preferredIndex
    return items.map((activity, index) => ({ ...activity, principale: index === selectedIndex }))
  }

  function addActivity(code: string) {
    const catalogActivity = findAtecoByCode(code)
    if (!catalogActivity || activities.some((activity) => activity.codice === catalogActivity.code)) return

    onChange([
      ...withPrincipal(activities, mainIndex),
      {
        codice: catalogActivity.code,
        coefficienteRedditivita: getDefaultForfettarioCoefficient(catalogActivity.code) ?? 67,
        principale: activities.length === 0,
      },
    ])
  }

  function setMainActivity(index: number) {
    onChange(activities.map((activity, activityIndex) => ({
      ...activity,
      principale: activityIndex === index,
    })))
  }

  function updateActivity(index: number, patch: Partial<AtecoActivity>) {
    onChange(withPrincipal(activities.map((activity, activityIndex) => activityIndex === index
      ? { ...activity, ...patch }
      : activity), mainIndex))
  }

  function removeActivity(index: number) {
    const remaining = activities.filter((_, activityIndex) => activityIndex !== index)
    const nextMainIndex = index === mainIndex ? 0 : remaining.findIndex((activity) => activity.principale)
    onChange(withPrincipal(remaining, nextMainIndex))
  }

  return (
    <section className="mt-5 space-y-5 border-t border-stone-200 pt-5" aria-labelledby="ateco-selector-title">
      <div>
        <h3 id="ateco-selector-title" className="text-sm font-semibold text-stone-800">Attività e codici ATECO</h3>
        <p className="mt-1 text-xs text-stone-500">Aggiungi uno o più codici e imposta quello principale. I coefficienti sono precompilati e modificabili.</p>
      </div>
      <label className="block text-sm text-stone-700">
        Cerca per codice o attività
        <input
          className={fieldClass}
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Es. consulenza, ristorazione, 62.01"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {query.trim() && (
        <div className="max-h-72 overflow-y-auto border border-stone-200" aria-label="Risultati ricerca ATECO">
          {searchResults.length ? searchResults.map((activity) => (
            <div key={activity.code} className="flex items-start justify-between gap-3 border-b border-stone-100 px-3 py-2 last:border-b-0">
              <p className="text-sm text-stone-800">
                <span className="font-medium">{activity.code}</span> · {activity.title}
                <span className="block text-xs text-stone-500">
                  Sezione {activity.section} · {sections.find((section) => section.code === activity.section)?.title}
                </span>
              </p>
              <button
                type="button"
                className="min-h-8 shrink-0 border border-stone-300 px-2 text-xs hover:bg-stone-50 disabled:opacity-50"
                disabled={disabled || activities.some((item) => item.codice === activity.code)}
                onClick={() => addActivity(activity.code)}
              >
                {activities.some((item) => item.codice === activity.code) ? 'Aggiunto' : 'Aggiungi'}
              </button>
            </div>
          )) : <p className="px-3 py-2 text-sm text-stone-500">Nessun codice trovato.</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <label className="block text-sm text-stone-700">
          Sezione
          <select className={fieldClass} value={sectionCode} disabled={disabled} onChange={(event) => {
            setSectionCode(event.target.value)
            setDivisionCode('')
            setSelectedCode('')
          }}>
            <option value="">Tutte</option>
            {sections.map((section) => <option key={section.code} value={section.code}>{section.code} · {section.title}</option>)}
          </select>
        </label>
        <label className="block text-sm text-stone-700">
          Divisione
          <select className={fieldClass} value={divisionCode} disabled={disabled} onChange={(event) => {
            setDivisionCode(event.target.value)
            setSelectedCode('')
          }}>
            <option value="">Seleziona</option>
            {divisions.map((division) => <option key={division.code} value={division.code}>{division.code} · {division.title}</option>)}
          </select>
        </label>
        <label className="block text-sm text-stone-700">
          Codice (6 cifre)
          <select className={fieldClass} value={selectedCode} disabled={disabled || !divisionCode} onChange={(event) => setSelectedCode(event.target.value)}>
            <option value="">Seleziona un codice</option>
            {availableCodes.map((activity) => <option key={activity.code} value={activity.code}>{activity.code} · {activity.title}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="min-h-10 border border-stone-300 px-3 text-sm hover:bg-stone-50 disabled:opacity-50"
          disabled={disabled || !selectedCode || activities.some((activity) => activity.codice === selectedCode)}
          onClick={() => addActivity(selectedCode)}
        >
          Aggiungi
        </button>
      </div>
      <div className="space-y-3">
        {activities.map((activity, index) => (
          <div key={`${index}-${activity.codice}`} className="grid gap-3 border border-stone-200 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_auto_auto] sm:items-end">
            <div className="min-w-0 text-sm text-stone-800">
              <p className="font-medium">{formatActivity(activity.codice)}</p>
              {activity.principale || index === mainIndex
                ? <span className="mt-1 inline-block text-xs font-semibold text-emerald-800">Principale</span>
                : null}
            </div>
            <label className="block text-sm text-stone-700">Coefficiente di redditività (%)
              <input
                className={fieldClass}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={activity.coefficienteRedditivita}
                disabled={disabled}
                onChange={(event) => updateActivity(index, { coefficienteRedditivita: Number(event.target.value) })}
              />
            </label>
            <button
              type="button"
              className="min-h-10 border border-stone-300 px-3 text-sm hover:bg-stone-50 disabled:opacity-50"
              aria-pressed={index === mainIndex}
              disabled={disabled || index === mainIndex}
              onClick={() => setMainActivity(index)}
            >
              {index === mainIndex ? 'Principale' : 'Imposta principale'}
            </button>
            <button type="button" className="min-h-10 px-2 text-sm text-rose-700 hover:underline" disabled={disabled} onClick={() => removeActivity(index)}>
              Rimuovi
            </button>
          </div>
        ))}
        {!activities.length && <p className="text-sm text-stone-500">Nessun codice ATECO selezionato.</p>}
      </div>
    </section>
  )
}
