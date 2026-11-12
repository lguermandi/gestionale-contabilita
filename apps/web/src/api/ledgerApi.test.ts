import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccountingEntity, fetchCreditNotes, fetchCustomers, fetchEntities, fetchExpenses, fetchInvoices, fetchSuppliers, fetchTransactionHistory, fetchTransactions, getWorkspaceSetupStatus, initializeWorkspace, issueCreditNote, issueExpense, issueInvoice, loginToGas, logoutFromGas, saveCustomer, saveSupplier, saveTransaction } from './ledgerApi'
import type { LedgerTransaction } from '../domain/accounting'
import type { CreditNoteDraft, InvoiceCustomer, InvoiceDraft } from '../domain/invoicing'
import type { ExpenseDraft } from '../domain/expenses'

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
const customer: InvoiceCustomer = {
  id: '00000000-0000-4000-8000-000000000003',
  ragioneSociale: 'Cliente',
  indirizzo: 'Via Roma 1',
  partitaIva: '12345678901',
  codiceFiscale: '',
  email: 'cliente@example.it',
  nazione: 'Italia',
  tipologia: 'Società',
  cap: '00100',
  comune: 'Roma',
  telefono: '061234567',
}
const creditNote: CreditNoteDraft = {
  id: '00000000-0000-4000-8000-000000000004',
  data: '2026-11-10',
  fatturaId: '00000000-0000-4000-8000-000000000002',
  importo: 5,
  note: 'Storno parziale',
}
const expense: ExpenseDraft = {
  id: '00000000-0000-4000-8000-000000000005',
  tipo: 'fattura',
  data: '2026-11-10',
  numeroDocumento: 'FT-1',
  fornitore: customer,
  descrizione: 'Materiale',
  conto: 'Costi',
  imponibile: 10,
  aliquotaIva: 22,
  conti: { ivaCredito: 'IVA a credito', fornitori: 'Debiti v/fornitori', gestione: 'Tipica' },
  note: '',
}

describe('client API GAS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invia ogni operazione come JSON text/plain direttamente a GAS', async () => {
    const spreadsheetId = 'entity-spreadsheet-123'
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ status: 200, data: { token: 'sessione', expiresIn: 2592000, setupRequired: false } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await loginToGas('utente', 'password')
    await getWorkspaceSetupStatus('sessione')
    await initializeWorkspace('sessione', 'workspace-root-id')
    await fetchEntities('sessione')
    await createAccountingEntity('sessione', {
      nome: 'Azienda 1',
      tipo: 'Azienda',
      codiceFiscale: '',
      partitaIva: '12345678901',
      regime: '',
    })
    await fetchTransactions(2026, 'sessione', 'private', spreadsheetId)
    await fetchTransactionHistory(2025, 'sessione', 'private', spreadsheetId)
    await saveTransaction('sessione', transaction, 'business', spreadsheetId)
    await fetchInvoices(2026, 'sessione', spreadsheetId)
    await fetchCustomers('sessione', spreadsheetId)
    await saveCustomer('sessione', customer, spreadsheetId)
    await fetchCreditNotes(2026, 'sessione', spreadsheetId)
    await issueCreditNote('sessione', creditNote, spreadsheetId)
    await fetchSuppliers('sessione', spreadsheetId)
    await saveSupplier('sessione', customer, spreadsheetId)
    await fetchExpenses(2026, 'sessione', spreadsheetId)
    await issueExpense('sessione', expense, spreadsheetId)
    await issueInvoice('sessione', invoice, spreadsheetId)
    await logoutFromGas('sessione')

    expect(fetchMock).toHaveBeenCalledTimes(19)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('https://script.google.com/macros/s/AKfycbzmqAJU81mMCeIFO0GJboYijh_mHQf_zY73MsBj-YrJwiAoYo97nMb0qkHYkT9ZPi0dIQ/exec')
      expect(init?.method).toBe('POST')
      expect(init?.mode).toBe('cors')
      expect(init?.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' })
    }

    const payloads = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
    expect(payloads.map((payload) => payload.action)).toEqual([
      'login',
      'getWorkspaceSetupStatus',
      'initializeWorkspace',
      'getEntities',
      'createNewEntity',
      'getTransactions',
      'getTransactionHistory',
      'appendTransaction',
      'getInvoices',
      'getCustomers',
      'saveCustomer',
      'getCreditNotes',
      'issueCreditNote',
      'getSuppliers',
      'saveSupplier',
      'getExpenses',
      'issueExpense',
      'issueInvoice',
      'logout',
    ])
    expect(payloads[1]).toMatchObject({ token: 'sessione' })
    expect(payloads[2]).toMatchObject({ token: 'sessione', workspaceFolder: 'workspace-root-id' })
    expect(payloads[4]).toMatchObject({ token: 'sessione', datiEntita: { nome: 'Azienda 1', tipo: 'Azienda' } })
    expect(payloads[5]).toMatchObject({ anno: 2026, token: 'sessione', entity: 'private', spreadsheetId })
    expect(payloads[6]).toMatchObject({ anno: 2025, token: 'sessione', entity: 'private', spreadsheetId })
    expect(payloads[7]).toMatchObject({ token: 'sessione', transaction, entity: 'business', spreadsheetId })
    expect(payloads[8]).toMatchObject({ anno: 2026, token: 'sessione', spreadsheetId })
    expect(payloads[9]).toMatchObject({ token: 'sessione', spreadsheetId })
    expect(payloads[10]).toMatchObject({ token: 'sessione', customer, spreadsheetId })
    expect(payloads[11]).toMatchObject({ token: 'sessione', anno: 2026, spreadsheetId })
    expect(payloads[12]).toMatchObject({ token: 'sessione', creditNote, spreadsheetId })
    expect(payloads[13]).toMatchObject({ token: 'sessione', spreadsheetId })
    expect(payloads[14]).toMatchObject({ token: 'sessione', supplier: customer, spreadsheetId })
    expect(payloads[15]).toMatchObject({ token: 'sessione', anno: 2026, spreadsheetId })
    expect(payloads[16]).toMatchObject({ token: 'sessione', expense, spreadsheetId })
    expect(payloads[17]).toMatchObject({ token: 'sessione', invoice, spreadsheetId })
    expect(payloads[18]).toMatchObject({ token: 'sessione' })
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
