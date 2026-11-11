import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GasSessionState {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

export const useGasSessionStore = create<GasSessionState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: null }),
    }),
    {
      name: 'gas-session',
      partialize: (state) => ({ token: state.token }),
    },
  ),
)