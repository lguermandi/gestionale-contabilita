import type { LedgerTransaction } from '../domain/accounting'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Richiesta non riuscita (${response.status}).`)
  }
  return body as T
}

export async function fetchTransactions(year: number, token: string, entity: 'private' | 'business') {
  const response = await requestJson<{ dati: LedgerTransaction[] }>(`/ledger/transactions/${year}?entity=${entity}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.dati
}

export function loginToGas(username: string, password: string) {
  return requestJson<{ token: string; expiresIn: number }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function saveTransaction(token: string, transaction: LedgerTransaction, entity: 'private' | 'business') {
  return requestJson<{ id: string; duplicate: boolean }>('/transactions', {
    method: 'POST',
    body: JSON.stringify({ token, transaction, entity }),
  })
}

export async function fetchInvoices(year: number, token: string) {
  const response = await requestJson<{ fatture: import('../domain/invoicing').IssuedInvoice[] }>(`/invoices/${year}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.fatture
}

export function issueInvoice(token: string, invoice: import('../domain/invoicing').InvoiceDraft) {
  return requestJson<import('../domain/invoicing').IssuedInvoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify({ token, invoice }),
  })
}