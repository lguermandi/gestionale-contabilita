import { create } from 'zustand'

interface GasSessionState {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

export const useGasSessionStore = create<GasSessionState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
  clearToken: () => set({ token: null }),
}))