import Dexie, { type Table } from 'dexie'
import { Network } from '@capacitor/network'
import { saveTransaction } from '../api/ledgerApi'
import type { LedgerTransaction } from '../domain/accounting'

export type LedgerEntity = 'private' | 'business'
export type LocalSyncStatus = 'pending' | 'synced'

export interface LocalLedgerRecord {
    id: string
    entity: LedgerEntity
    year: number
    transaction: LedgerTransaction
    status: LocalSyncStatus
    createdAt: number
    syncedAt?: number
}

export class OfflineLedgerDatabase extends Dexie {
    records!: Table<LocalLedgerRecord, string>

    constructor(name = 'gestionale-contabilita-offline') {
        super(name)
        this.version(1).stores({
            records: 'id, [entity+year], status, createdAt',
        })
    }
}

export const offlineLedger = new OfflineLedgerDatabase()

export async function queueTransaction(transaction: LedgerTransaction, entity: LedgerEntity): Promise<void> {
    await offlineLedger.records.put({
        id: transaction.id,
        entity,
        year: Number(transaction.data.slice(0, 4)),
        transaction,
        status: 'pending',
        createdAt: Date.now(),
    })
}

export async function getLocalTransactions(year: number, entity: LedgerEntity): Promise<LocalLedgerRecord[]> {
    return offlineLedger.records.where('[entity+year]').equals([entity, year]).sortBy('createdAt')
}

export async function getLocalTransactionHistory(throughYear: number, entity: LedgerEntity): Promise<LocalLedgerRecord[]> {
    return offlineLedger.records.toCollection()
        .filter((record) => record.entity === entity && record.year <= throughYear)
        .sortBy('createdAt')
}

export async function getPendingTransactions(): Promise<LocalLedgerRecord[]> {
    return offlineLedger.records.where('status').equals('pending').sortBy('createdAt')
}

export async function getPendingCount(): Promise<number> {
    return offlineLedger.records.where('status').equals('pending').count()
}

export interface SyncSummary {
    synced: number
    pending: number
    online: boolean
}

interface SyncOptions {
    isOnline?: () => Promise<boolean>
    send?: typeof saveTransaction
}

let activeSync: Promise<SyncSummary> | null = null

export function syncPendingTransactions(token: string, options: SyncOptions = {}): Promise<SyncSummary> {
    if (activeSync) return activeSync
    activeSync = doSync(token, options).finally(() => { activeSync = null })
    return activeSync
}

async function doSync(token: string, options: SyncOptions): Promise<SyncSummary> {
    const isOnline = options.isOnline ?? (async () => (await Network.getStatus()).connected)
    const send = options.send ?? saveTransaction
    if (!await isOnline()) {
        return { synced: 0, pending: await getPendingCount(), online: false }
    }

    const pending = await getPendingTransactions()
    let synced = 0
    for (const localRecord of pending) {
        await send(token, localRecord.transaction, localRecord.entity)
        await offlineLedger.records.update(localRecord.id, { status: 'synced', syncedAt: Date.now() })
        synced += 1
    }
    return { synced, pending: await getPendingCount(), online: true }
}
