import type { LedgerTransaction } from '../domain/accounting'
import type { CreditNoteDraft, InvoiceCustomer, InvoiceDraft, IssuedCreditNote, IssuedInvoice } from '../domain/invoicing'
import type { ExpenseDraft, IssuedExpense } from '../domain/expenses'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || 'https://script.google.com/macros/s/AKfycbzmqAJU81mMCeIFO0GJboYijh_mHQf_zY73MsBj-YrJwiAoYo97nMb0qkHYkT9ZPi0dIQ/exec'

interface GasResponse<T> {
  status: number
  data?: T
  error?: string
}

export interface AccountingEntity {
  id: string
  nomeEntita: string
  tipologia: 'Privato' | 'Azienda'
  folderId: string
  spreadsheetId: string
}

export interface NewAccountingEntity {
  nome: string
  tipo: 'Privato' | 'Azienda'
  codiceFiscale: string
  partitaIva: string
  regime: string
}

async function requestGas<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Risposta non valida dal servizio Google Apps Script.')
  }

  if (typeof body !== 'object' || body === null || !('status' in body) || typeof body.status !== 'number') {
    throw new Error('Risposta non valida dal servizio Google Apps Script.')
  }
  const result = body as GasResponse<T>
  if (result.status >= 400) {
    throw new Error(result.error || `Richiesta non riuscita (${result.status}).`)
  }
  if (!response.ok) {
    throw new Error(`Richiesta non riuscita (${response.status}).`)
  }
  if (!('data' in result)) {
    throw new Error('La risposta Google Apps Script non contiene dati.')
  }

  return result.data as T
}

export async function fetchTransactions(year: number, token: string, entity: 'private' | 'business', spreadsheetId?: string) {
  return requestGas<LedgerTransaction[]>({
    action: 'getTransactions',
    token,
    anno: year,
    entity,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export async function fetchTransactionHistory(throughYear: number, token: string, entity: 'private' | 'business', spreadsheetId?: string) {
  return requestGas<{ years: number[]; transactions: LedgerTransaction[] }>({
    action: 'getTransactionHistory',
    token,
    anno: throughYear,
    entity,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function loginToGas(username: string, password: string) {
  return requestGas<{ token: string; expiresIn: number; setupRequired: boolean }>({
    action: 'login',
    username,
    password,
  })
}

export function getWorkspaceSetupStatus(token: string) {
  return requestGas<{ setupRequired: boolean; username: string; gasOwnerEmail: string }>({
    action: 'getWorkspaceSetupStatus',
    token,
  })
}

export function initializeWorkspace(token: string, workspaceFolder: string) {
  return requestGas<{ setupRequired: boolean; folderUrl: string; spreadsheetUrl: string }>({
    action: 'initializeWorkspace',
    token,
    workspaceFolder,
  })
}

export function fetchEntities(token: string) {
  return requestGas<AccountingEntity[]>({ action: 'getEntities', token })
}

export function createAccountingEntity(token: string, datiEntita: NewAccountingEntity) {
  return requestGas<AccountingEntity & { folderUrl: string; spreadsheetUrl: string }>({
    action: 'createNewEntity',
    token,
    datiEntita,
  })
}

export function logoutFromGas(token: string) {
  return requestGas<{ loggedOut: boolean }>({
    action: 'logout',
    token,
  })
}

export function saveTransaction(token: string, transaction: LedgerTransaction, entity: 'private' | 'business', spreadsheetId?: string) {
  return requestGas<{ id: string; duplicate: boolean }>({
    action: 'appendTransaction',
    token,
    transaction,
    entity,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function fetchInvoices(year: number, token: string, spreadsheetId?: string) {
  return requestGas<IssuedInvoice[]>({
    action: 'getInvoices',
    token,
    anno: year,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function fetchCustomers(token: string, spreadsheetId?: string) {
  return requestGas<InvoiceCustomer[]>({
    action: 'getCustomers',
    token,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function saveCustomer(token: string, customer: InvoiceCustomer, spreadsheetId?: string) {
  return requestGas<InvoiceCustomer>({
    action: 'saveCustomer',
    token,
    customer,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function fetchCreditNotes(year: number, token: string, spreadsheetId?: string) {
  return requestGas<IssuedCreditNote[]>({
    action: 'getCreditNotes',
    token,
    anno: year,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function issueCreditNote(token: string, creditNote: CreditNoteDraft, spreadsheetId?: string) {
  return requestGas<IssuedCreditNote>({
    action: 'issueCreditNote',
    token,
    creditNote,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function fetchSuppliers(token: string, spreadsheetId?: string) {
  return requestGas<InvoiceCustomer[]>({
    action: 'getSuppliers',
    token,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function saveSupplier(token: string, supplier: InvoiceCustomer, spreadsheetId?: string) {
  return requestGas<InvoiceCustomer>({
    action: 'saveSupplier',
    token,
    supplier,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function fetchExpenses(year: number, token: string, spreadsheetId?: string) {
  return requestGas<IssuedExpense[]>({
    action: 'getExpenses',
    token,
    anno: year,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function issueExpense(token: string, expense: ExpenseDraft, spreadsheetId?: string) {
  return requestGas<IssuedExpense>({
    action: 'issueExpense',
    token,
    expense,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}

export function issueInvoice(token: string, invoice: InvoiceDraft, spreadsheetId?: string) {
  return requestGas<IssuedInvoice>({
    action: 'issueInvoice',
    token,
    invoice,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  })
}
