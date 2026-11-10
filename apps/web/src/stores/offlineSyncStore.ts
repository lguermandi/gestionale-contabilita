import { create } from 'zustand'

interface OfflineSyncState {
    online: boolean
    syncing: boolean
    pending: number
    lastSyncedAt: number | null
    error: string | null
    setSyncState: (state: Partial<Omit<OfflineSyncState, 'setSyncState'>>) => void
}

export const useOfflineSyncStore = create<OfflineSyncState>((set) => ({
    online: typeof navigator === 'undefined' || navigator.onLine,
    syncing: false,
    pending: 0,
    lastSyncedAt: null,
    error: null,
    setSyncState: (state) => set(state),
}))