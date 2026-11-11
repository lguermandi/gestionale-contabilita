import { create } from 'zustand'
import { fetchTransactionHistory, fetchTransactions } from '../api/ledgerApi'
import type { LedgerTransaction } from '../domain/accounting'
import { getLocalTransactionHistory, getLocalTransactions, type LedgerEntity } from '../offline/offlineLedger'
import { useGasSessionStore } from './gasSessionStore'

interface LedgerState {
  selectedYear: number
  transactions: LedgerTransaction[]
  historyTransactions: LedgerTransaction[]
  loading: boolean
  historyLoading: boolean
  error: string | null
  historyError: string | null
  setSelectedYear: (year: number) => void
  refresh: (year?: number, token?: string | null, entity?: LedgerEntity) => Promise<void>
}

let latestRequest = 0

export const useLedgerStore = create<LedgerState>((set, get) => ({
  selectedYear: new Date().getFullYear(),
  transactions: [],
  historyTransactions: [],
  loading: false,
  historyLoading: false,
  error: null,
  historyError: null,
  setSelectedYear: (selectedYear) => set({ selectedYear }),
  refresh: async (requestedYear, token, entity = 'private') => {
    const requestId = ++latestRequest
    const year = requestedYear ?? get().selectedYear
    set({ loading: true, historyLoading: true, error: null, historyError: null })
    try {
      const [localRecords, localHistoryRecords] = await Promise.all([
        getLocalTransactions(year, entity),
        getLocalTransactionHistory(year - 1, entity),
      ])
      const localTransactions = localRecords.map((record) => record.transaction)
      const localHistory = localHistoryRecords.map((record) => record.transaction)

      if (!token) {
        if (requestId === latestRequest) {
          set({
            transactions: localTransactions,
            historyTransactions: localHistory,
            loading: false,
            historyLoading: false,
            error: null,
            historyError: 'Accedi a GAS per caricare lo storico completo e calcolare i saldi patrimoniali cumulati.',
          })
        }
        return
      }

      const [currentResult, historyResult] = await Promise.allSettled([
        fetchTransactions(year, token, entity),
        fetchTransactionHistory(year - 1, token, entity),
      ])
      if (requestId !== latestRequest) return

      let currentTransactions = localTransactions
      let currentError: string | null = null
      if (currentResult.status === 'fulfilled') {
        const merged = new Map(currentResult.value.map((transaction) => [transaction.id, transaction]))
        localTransactions.forEach((transaction) => merged.set(transaction.id, transaction))
        currentTransactions = [...merged.values()]
      } else {
        currentError = currentResult.reason instanceof Error
          ? currentResult.reason.message
          : 'Impossibile caricare i dati contabili.'
        if (currentError.includes('SESSION_EXPIRED')) useGasSessionStore.getState().clearToken()
      }

      let historyTransactions = localHistory
      let historyError: string | null = null
      if (historyResult.status === 'fulfilled') {
        const merged = new Map(historyResult.value.transactions.map((transaction) => [transaction.id, transaction]))
        localHistory.forEach((transaction) => merged.set(transaction.id, transaction))
        historyTransactions = [...merged.values()]
        if (!historyResult.value.years.length && !localHistory.length) {
          historyError = 'Non sono disponibili fogli degli esercizi precedenti; i saldi sono calcolati solo sui movimenti caricati.'
        }
      } else {
        historyError = historyResult.reason instanceof Error
          ? historyResult.reason.message
          : 'Impossibile caricare lo storico contabile.'
        if (historyError.includes('SESSION_EXPIRED')) useGasSessionStore.getState().clearToken()
        if (localHistory.length) {
          historyError = `Storico remoto non disponibile; sono mostrati solo i dati locali. ${historyError}`
        }
      }

      set({
        transactions: currentTransactions,
        historyTransactions,
        error: currentError,
        historyError,
      })
    } catch (error) {
      if (requestId === latestRequest) {
        const message = error instanceof Error ? error.message : 'Impossibile caricare i dati contabili.'
        if (message.includes('SESSION_EXPIRED')) useGasSessionStore.getState().clearToken()
        set({ transactions: [], historyTransactions: [], error: message, historyError: message })
      }
    } finally {
      if (requestId === latestRequest) set({ loading: false, historyLoading: false })
    }
  },
}))