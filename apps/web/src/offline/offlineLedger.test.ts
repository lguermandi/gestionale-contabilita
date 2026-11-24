import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalTransactionHistory, getLocalTransactions, getPendingCount, offlineLedger, queueTransaction, syncPendingTransactions } from './offlineLedger'
import type { LedgerTransaction } from '../domain/accounting'
import type { InvoicePayment } from '../domain/invoicing'

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

    it('isola le registrazioni offline per spreadsheet attivo', async () => {
        await queueTransaction(record, 'business', 'spreadsheet-one')
        await queueTransaction({ ...record, id: '00000000-0000-4000-8000-000000000002' }, 'business', 'spreadsheet-two')

        expect((await getLocalTransactions(2026, 'business', 'spreadsheet-one')).map((item) => item.transaction.id))
            .toEqual([record.id])
        expect((await getLocalTransactions(2026, 'business', 'spreadsheet-two')).map((item) => item.transaction.id))
            .toEqual(['00000000-0000-4000-8000-000000000002'])
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

    it('invia allo spreadsheet della registrazione offline', async () => {
        await queueTransaction(record, 'private', 'spreadsheet-one')
        const send = vi.fn(async () => ({ id: record.id, duplicate: false }))

        await syncPendingTransactions('session', { isOnline: async () => true, send })

        expect(send).toHaveBeenCalledWith('session', record, 'private', 'spreadsheet-one')
    })

    it('sincronizza atomicamente il pagamento collegato al documento tramite GAS', async () => {
        const documentId = '00000000-0000-4000-8000-000000000002'
        const payment: InvoicePayment = {
            data: '2026-03-10',
            importo: 25,
            conto: 'Banca c/c',
            linkedTransactionId: record.id,
        }
        const transaction: LedgerTransaction = {
            ...record,
            relatedDocumentType: 'invoice',
            relatedDocumentId: documentId,
        }
        await queueTransaction(transaction, 'business', 'spreadsheet-one', {
            documentType: 'invoice',
            documentId,
            payment,
        })
        const sendDocumentPayment = vi.fn(async () => ({ payment, duplicate: false, remaining: 75 }))
        const send = vi.fn(async () => ({ id: record.id, duplicate: false }))

        const summary = await syncPendingTransactions('session', {
            isOnline: async () => true,
            send,
            sendDocumentPayment,
        })

        expect(summary).toEqual({ synced: 1, pending: 0, online: true })
        expect(sendDocumentPayment).toHaveBeenCalledWith('session', 'invoice', documentId, payment, 'spreadsheet-one')
        expect(send).not.toHaveBeenCalled()
    })
})
