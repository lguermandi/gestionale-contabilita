import type { LedgerTransaction } from '../domain/accounting'
import type { InvoiceDraft, IssuedInvoice } from '../domain/invoicing'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || 'https://script.google.com/macros/s/AKfycbzmqAJU81mMCeIFO0GJboYijh_mHQf_zY73MsBj-YrJwiAoYo97nMb0qkHYkT9ZPi0dIQ/exec'

interface GasResponse<T> {
  status: number
  data?: T
  error?: string
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

export async function fetchTransactions(year: number, token: string, entity: 'private' | 'business') {
  return requestGas<LedgerTransaction[]>({
    action: 'getTransactions',
    token,
    anno: year,
    entity,
  })
}

export function loginToGas(username: string, password: string) {
  return requestGas<{ token: string; expiresIn: number }>({
    action: 'login',
    username,
    password,
  })
}

export function saveTransaction(token: string, transaction: LedgerTransaction, entity: 'private' | 'business') {
  return requestGas<{ id: string; duplicate: boolean }>({
    action: 'appendTransaction',
    token,
    transaction,
    entity,
  })
}

export function fetchInvoices(year: number, token: string) {
  return requestGas<IssuedInvoice[]>({
    action: 'getInvoices',
    token,
    anno: year,
  })
}

export function issueInvoice(token: string, invoice: InvoiceDraft) {
  return requestGas<IssuedInvoice>({
    action: 'issueInvoice',
    token,
    invoice,
  })
}
