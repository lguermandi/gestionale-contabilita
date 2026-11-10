import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchInvoices, fetchTransactions, issueInvoice, loginToGas, saveTransaction } from './ledgerApi'
import type { LedgerTransaction } from '../domain/accounting'
import type { InvoiceDraft } from '../domain/invoicing'

const transaction: LedgerTransaction = {
  id: '00000000-0000-4000-8000-000000000001',
  data: '2026-11-10',
  totale: 10,
  movimenti: [
    { conto: 'Cassa', descrizione: 'Test', gestione: '', dare: 10, avere: 0 },
    { conto: 'Ricavi', descrizione: 'Test', gestione: '', dare: 0, avere: 10 },
  ],
}

const invoice: InvoiceDraft = {
  id: '00000000-0000-4000-8000-000000000002',
  data: '2026-11-10',
  cliente: { ragioneSociale: 'Cliente', indirizzo: '', partitaIva: '12345678901', email: '' },
  linee: [{ id: 'line-1', descrizione: 'Servizio', quantita: 1, prezzoUnitario: 10 }],
  aliquotaIva: 22,
  aliquotaCassa: 0,
  aliquotaRitenuta: 0,
  note: '',
  conti: { clienti: 'Crediti', ricavi: 'Ricavi', iva: 'IVA', ritenute: 'Ritenute', cassa: 'Cassa', gestione: 'Tipica' },
}

describe('client API GAS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invia ogni operazione come JSON text/plain direttamente a GAS', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ status: 200, data: { token: 'sessione', expiresIn: 21600 } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await loginToGas('utente', 'password')
    await fetchTransactions(2026, 'sessione', 'private')
    await saveTransaction('sessione', transaction, 'business')
    await fetchInvoices(2026, 'sessione')
    await issueInvoice('sessione', invoice)

    expect(fetchMock).toHaveBeenCalledTimes(5)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('https://script.google.com/macros/s/AKfycbzmqAJU81mMCeIFO0GJboYijh_mHQf_zY73MsBj-YrJwiAoYo97nMb0qkHYkT9ZPi0dIQ/exec')
      expect(init?.method).toBe('POST')
      expect(init?.mode).toBe('cors')
      expect(init?.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' })
    }

    const payloads = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
    expect(payloads.map((payload) => payload.action)).toEqual([
      'login',
      'getTransactions',
      'appendTransaction',
      'getInvoices',
      'issueInvoice',
    ])
    expect(payloads[1]).toMatchObject({ anno: 2026, token: 'sessione', entity: 'private' })
    expect(payloads[2]).toMatchObject({ token: 'sessione', transaction, entity: 'business' })
    expect(payloads[3]).toMatchObject({ anno: 2026, token: 'sessione' })
    expect(payloads[4]).toMatchObject({ token: 'sessione', invoice })
  })

  it('propaga gli errori applicativi restituiti da GAS', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 401, error: 'SESSION_EXPIRED' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    await expect(loginToGas('utente', 'password')).rejects.toThrow('SESSION_EXPIRED')
  })
})
