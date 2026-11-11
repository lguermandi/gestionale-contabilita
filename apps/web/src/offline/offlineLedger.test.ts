import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalTransactionHistory, getLocalTransactions, getPendingCount, offlineLedger, queueTransaction, syncPendingTransactions } from './offlineLedger'
import type { LedgerTransaction } from '../domain/accounting'

const record: LedgerTransaction = {
    id: '00000000-0000-4000-8000-000000000001',
    data: '2026-03-01',
    totale: 25,
    movimenti: [
        { conto: 'Spese', descrizione: 'Spesa offline', gestione: 'Tipica', dare: 25, avere: 0 },
        { conto: 'Banca', descrizione: 'Spesa offline', gestione: '', dare: 0, avere: 25 },
    ],
}

beforeEach(async () => {
    await offlineLedger.open()
})

afterEach(async () => {
    await offlineLedger.close()
    await offlineLedger.delete()
})

describe('coda offline della partita doppia', () => {
    it('isola le registrazioni per profilo ed esercizio', async () => {
        await queueTransaction(record, 'business')

        expect((await getLocalTransactions(2026, 'business')).map((item) => item.status)).toEqual(['pending'])
        expect(await getLocalTransactions(2026, 'private')).toEqual([])
        expect(await getLocalTransactions(2025, 'business')).toEqual([])
    })

    it('carica lo storico locale fino all’esercizio precedente solo per il profilo richiesto', async () => {
        await queueTransaction({ ...record, id: '2025-transaction', data: '2025-03-01' }, 'private')
        await queueTransaction(record, 'private')
        await queueTransaction({ ...record, id: 'business-transaction', data: '2025-02-01' }, 'business')

        expect((await getLocalTransactionHistory(2025, 'private')).map((item) => item.transaction.id)).toEqual(['2025-transaction'])
    })

    it('mantiene la coda offline e marca sincronizzate le scritture inviate', async () => {
        await queueTransaction(record, 'private')
        const send = vi.fn(async () => ({ id: record.id, duplicate: false }))

        const offlineResult = await syncPendingTransactions('session', { isOnline: async () => false, send })
        expect(offlineResult).toEqual({ synced: 0, pending: 1, online: false })
        expect(send).not.toHaveBeenCalled()

        const onlineResult = await syncPendingTransactions('session', { isOnline: async () => true, send })
        expect(onlineResult).toEqual({ synced: 1, pending: 0, online: true })
        expect(send).toHaveBeenCalledWith('session', record, 'private')
        expect((await getLocalTransactions(2026, 'private'))[0].status).toBe('synced')
        expect(await getPendingCount()).toBe(0)
    })
})
