import { create } from 'zustand'
import { fetchTransactions } from '../api/ledgerApi'
import type { LedgerTransaction } from '../domain/accounting'
import { useGasSessionStore } from './gasSessionStore'

interface LedgerState {
  selectedYear: number
  transactions: LedgerTransaction[]
  loading: boolean
  error: string | null
  setSelectedYear: (year: number) => void
  refresh: (year?: number, token?: string | null, entity?: 'private' | 'business') => Promise<void>
}

let latestRequest = 0

export const useLedgerStore = create<LedgerState>((set, get) => ({
  selectedYear: new Date().getFullYear(),
  transactions: [],
  loading: false,
  error: null,
  setSelectedYear: (selectedYear) => set({ selectedYear }),
  refresh: async (requestedYear, token, entity = 'private') => {
    const requestId = ++latestRequest
    const year = requestedYear ?? get().selectedYear
    if (!token) {
      set({ transactions: [], loading: false, error: null })
      return
    }
    set({ loading: true, error: null })
    try {
      const transactions = await fetchTransactions(year, token, entity)
      if (requestId === latestRequest) set({ transactions })
    } catch (error) {
      if (requestId === latestRequest) {
        const message = error instanceof Error ? error.message : 'Impossibile caricare i dati contabili.'
        if (message.includes('SESSION_EXPIRED')) useGasSessionStore.getState().clearToken()
        set({ transactions: [], error: message })
      }
    } finally {
      if (requestId === latestRequest) set({ loading: false })
    }
  },
}))