import { useEffect } from 'react'
import { Network } from '@capacitor/network'
import { getPendingCount, syncPendingTransactions } from './offlineLedger'
import { useGasSessionStore } from '../stores/gasSessionStore'
import { useLedgerStore } from '../stores/ledgerStore'
import { useOfflineSyncStore } from '../stores/offlineSyncStore'
import { useProfileStore } from '../stores/profileStore'

export function OfflineSyncController() {
    const token = useGasSessionStore((state) => state.token)
    const clearToken = useGasSessionStore((state) => state.clearToken)
    const year = useLedgerStore((state) => state.selectedYear)
    const refresh = useLedgerStore((state) => state.refresh)
    const entity = useProfileStore((state) => state.activeProfile)
    const setSyncState = useOfflineSyncStore((state) => state.setSyncState)

    useEffect(() => {
        let cancelled = false
        let running = false
        let removeNetworkListener: (() => void) | undefined

        async function synchronize(connectedOverride?: boolean) {
            if (running) return
            running = true
            try {
                const connected = connectedOverride ?? (await Network.getStatus()).connected
                const pending = await getPendingCount()
                if (cancelled) return
                setSyncState({ online: connected, pending, error: null })
                if (!connected || !token) return

                setSyncState({ syncing: true })
                const result = await syncPendingTransactions(token, { isOnline: async () => connected })
                if (cancelled) return
                setSyncState({
                    online: result.online,
                    pending: result.pending,
                    ...(result.synced ? { lastSyncedAt: Date.now() } : {}),
                    error: null,
                })
                if (result.synced) await refresh(year, token, entity)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Sincronizzazione non riuscita.'
                if (message.includes('SESSION_EXPIRED')) clearToken()
                if (!cancelled) setSyncState({ pending: await getPendingCount(), error: message })
            } finally {
                running = false
                if (!cancelled) setSyncState({ syncing: false })
            }
        }

        const handleNetworkChange = ({ connected }: { connected: boolean }) => {
            void synchronize(connected)
        }
        const handleBrowserOnline = () => { void synchronize(true) }
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') void synchronize()
        }
        const handleSyncRequest = () => { void synchronize() }

        Network.addListener('networkStatusChange', handleNetworkChange).then((listener) => {
            if (cancelled) void listener.remove()
            else removeNetworkListener = () => { void listener.remove() }
        }).catch(() => undefined)
        window.addEventListener('online', handleBrowserOnline)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('accounting:sync-request', handleSyncRequest)
        void synchronize()

        return () => {
            cancelled = true
            removeNetworkListener?.()
            window.removeEventListener('online', handleBrowserOnline)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('accounting:sync-request', handleSyncRequest)
        }
    }, [clearToken, entity, refresh, setSyncState, token, year])

    return null
}