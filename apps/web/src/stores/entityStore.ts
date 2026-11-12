import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createAccountingEntity,
  fetchEntities,
  type AccountingEntity,
  type NewAccountingEntity,
} from '../api/ledgerApi'

interface EntityState {
  entities: AccountingEntity[]
  activeEntityId: string | null
  activeSpreadsheetId: string | null
  loading: boolean
  error: string | null
  loadEntities: (token: string) => Promise<void>
  clearEntities: () => void
  createEntity: (token: string, data: NewAccountingEntity) => Promise<AccountingEntity>
  selectEntity: (id: string) => void
}

export const useEntityStore = create<EntityState>()(
  persist(
    (set, get) => ({
      entities: [],
      activeEntityId: null,
      activeSpreadsheetId: null,
      loading: false,
      error: null,
      clearEntities: () => set({ entities: [], activeSpreadsheetId: null, loading: false, error: null }),
      loadEntities: async (token) => {
        set({ loading: true, error: null })
        try {
          const entities = await fetchEntities(token)
          const preferredId = get().activeEntityId
          const activeEntity = entities.find((entity) => entity.id === preferredId) ?? entities[0] ?? null
          set({
            entities,
            activeEntityId: activeEntity?.id ?? null,
            activeSpreadsheetId: activeEntity?.spreadsheetId ?? null,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Impossibile caricare le entità.'
          set({ error: message })
        } finally {
          set({ loading: false })
        }
      },
      createEntity: async (token, data) => {
        set({ error: null })
        try {
          const created = await createAccountingEntity(token, data)
          const entity: AccountingEntity = {
            id: created.id,
            nomeEntita: created.nomeEntita,
            tipologia: created.tipologia,
            folderId: created.folderId,
            spreadsheetId: created.spreadsheetId,
          }
          set((state) => ({
            entities: [...state.entities.filter((item) => item.id !== entity.id), entity],
            activeEntityId: entity.id,
            activeSpreadsheetId: entity.spreadsheetId,
          }))
          return entity
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Creazione dell’entità non riuscita.'
          set({ error: message })
          throw error
        }
      },
      selectEntity: (id) => {
        const selected = get().entities.find((entity) => entity.id === id)
        if (!selected) return
        set({
          activeEntityId: selected.id,
          activeSpreadsheetId: selected.spreadsheetId,
          error: null,
        })
      },
    }),
    {
      name: 'gestionale-accounting-entity',
      partialize: (state) => ({ activeEntityId: state.activeEntityId }),
    },
  ),
)
