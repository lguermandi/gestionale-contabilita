import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveInvoice, createAccountingEntity, fetchChartOfAccounts, fetchCreditNotes, fetchCustomers, fetchEntities, fetchExpenses, fetchInvoices, fetchSuppliers, fetchTransactionHistory, fetchTransactions, getWorkspaceSetupStatus, initializeWorkspace, issueCreditNote, issueExpense, issueInvoice, loginToGas, logoutFromGas, registerDocumentPayment, saveCustomer, saveSupplier, saveTransaction } from './ledgerApi'
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
  documentType: 'TD01',
  bolloRiaddebitatoAlCliente: false,
  payments: [],
  cliente: { ragioneSociale: 'Cliente', indirizzo: '', partitaIva: '12345678901', email: '' },
  linee: [{ id: 'line-1', descrizione: 'Servizio', quantita: 1, prezzoUnitario: 10 }],
  aliquotaIva: 22,
  aliquotaCassa: 0,
  aliquotaRitenuta: 0,
  note: '',
  conti: { clienti: 'Crediti', ricavi: 'Ricavi', iva: 'IVA', ritenute: 'Ritenute', cassa: 'Cassa', gestione: 'Tipica' },
}
const issuedInvoice = {
  ...invoice,
  numero: '2026/0001',
  stato: 'emessa' as const,
  totali: { imponibile: 10, cassa: 0, baseIva: 10, iva: 2.2, ivaPerAliquota: [], ritenuta: 0, bollo: 0, totale: 12.2 },
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
  righe: [{ id: 'expense-line-1', conto: 'Costi', imponibile: 10, aliquotaIva: 22 }],
  conti: { ivaCredito: 'IVA a credito', fornitori: 'Debiti v/fornitori', gestione: 'Tipica' },
  note: '',
}

describe('client API GAS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizza le nuove proprietà mancanti nelle fatture legacy restituite da GAS', async () => {
    const legacyInvoice = {
      ...invoice,
      documentType: undefined,
      payments: undefined,
      bolloRiaddebitatoAlCliente: undefined,
      tipoDocumento: 'TD17' as const,
      marcaDaBollo: { addebitata: true, importo: 2, identificativo: '' },
      numero: '2026/0001',
      stato: 'emessa' as const,
      totali: { imponibile: 10, cassa: 0, baseIva: 10, iva: 2.2, ivaPerAliquota: [], ritenuta: 0, bollo: 0, totale: 12.2 },
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ status: 200, data: [legacyInvoice] }),
      { headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const [result] = await fetchInvoices(2026, 'sessione')

    expect(result).toMatchObject({
      documentType: 'TD17',
      revenueAccount: invoice.conti.ricavi,
      ritenutaAttiva: false,
      payments: [],
      bolloRiaddebitatoAlCliente: true,
    })
  })

  it('invia il pagamento collegato al documento all’endpoint GAS', async () => {
    const payment = {
      data: '2026-11-20',
      importo: 5,
      conto: 'Banca c/c',
      linkedTransactionId: '00000000-0000-4000-8000-000000000006',
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ status: 200, data: { payment, duplicate: false, remaining: 7.2 } }),
      { headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await registerDocumentPayment(
      'sessione',
      'invoice',
      '00000000-0000-4000-8000-000000000002',
      payment,
      'entity-spreadsheet',
    )

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      action: 'registerDocumentPayment',
      token: 'sessione',
      documentType: 'invoice',
      documentId: '00000000-0000-4000-8000-000000000002',
      payment,
      spreadsheetId: 'entity-spreadsheet',
    })
  })

  it('invia ogni operazione come JSON text/plain direttamente a GAS', async () => {
    const spreadsheetId = 'entity-spreadsheet-123'
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { action?: string }
      const data = payload.action === 'getInvoices'
        ? []
        : payload.action === 'getChartOfAccounts'
          ? [{ codice: '4.01.01', descrizione: 'Ricavi da servizi', tipo: 'Ricavo', gestione: 'Tipica', attivo: true }]
        : payload.action === 'issueInvoice' || payload.action === 'archiveInvoice'
          ? issuedInvoice
          : { token: 'sessione', expiresIn: 2592000, setupRequired: false }
      return new Response(JSON.stringify({ status: 200, data }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })
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
    await archiveInvoice('sessione', {
      ...invoice,
      numero: '2026/0001',
      stato: 'emessa',
      totali: { imponibile: 100, cassa: 0, baseIva: 100, iva: 22, ivaPerAliquota: [], ritenuta: 0, bollo: 0, totale: 122 },
    }, 'cGRm', '<?xml version="1.0"?><p:FatturaElettronica/>', spreadsheetId)
    await fetchChartOfAccounts('sessione', spreadsheetId)
    await logoutFromGas('sessione')

    expect(fetchMock).toHaveBeenCalledTimes(21)
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
      'archiveInvoice',
      'getChartOfAccounts',
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
    expect(payloads[19]).toMatchObject({ action: 'getChartOfAccounts', token: 'sessione', spreadsheetId })
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
