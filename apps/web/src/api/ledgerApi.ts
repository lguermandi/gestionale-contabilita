import type { LedgerTransaction } from '../domain/accounting'
import {
  normalizeIssuedInvoice,
  type CreditNoteDraft,
  type InvoiceCustomer,
  type InvoiceDraft,
  type InvoicePayment,
  type IssuedCreditNote,
  type IssuedInvoice,
  type StoredIssuedInvoice,
} from '../domain/invoicing'
import type { ExpenseDraft, IssuedExpense } from '../domain/expenses'
import type { CompanyProfile } from '../stores/profileStore'
import type { AttendanceInput, PayslipResult, WorkerProfile } from '../domain/payroll'

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
  structureSpreadsheetId: string
  spreadsheetId: string
}

export interface ChartOfAccount {
  codice: string
  descrizione: string
  tipo: string
  gestione: string
  attivo: boolean
}

export interface NewAccountingEntity {
  nome: string
  tipo: 'Privato' | 'Azienda'
  codiceFiscale: string
  partitaIva: string
  regime: string
}

export interface TaxNotificationSettings {
  email: string
  daysBefore: number
  enabled: boolean
}

export interface TaxNotificationDeadline {
  id: string
  calendarYear: number
  date: string
  title: string
  description: string
  amount: number
  kind?: 'iva' | 'redditi' | 'declaration' | 'inps' | 'bollo' | 'personal'
  paid?: boolean
  f24: Array<{ section: 'Erario' | 'INPS'; code: string; year: number; amount: number }>
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

export function fetchChartOfAccounts(token: string, spreadsheetId: string) {
  return requestGas<ChartOfAccount[]>({
    action: 'getChartOfAccounts',
    token,
    spreadsheetId,
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

export function getCompanyProfile(token: string, spreadsheetId: string) {
  return requestGas<{ profile: CompanyProfile | null }>({
    action: 'getCompanyProfile',
    token,
    spreadsheetId,
  })
}

export function saveCompanyProfile(token: string, profile: CompanyProfile, spreadsheetId: string) {
  return requestGas<CompanyProfile>({
    action: 'saveCompanyProfile',
    token,
    profile,
    spreadsheetId,
  })
}

export function getTaxNotificationSettings(token: string, spreadsheetId: string) {
  return requestGas<{ settings: TaxNotificationSettings; deadlines: TaxNotificationDeadline[] }>({
    action: 'getTaxNotificationSettings',
    token,
    spreadsheetId,
  })
}

export function saveTaxNotificationSettings(
  token: string,
  spreadsheetId: string,
  entityId: string,
  entityName: string,
  calendarYear: number,
  settings: TaxNotificationSettings,
  deadlines: TaxNotificationDeadline[],
) {
  return requestGas<{ settings: TaxNotificationSettings; saved: boolean }>({
    action: 'saveTaxNotificationSettings',
    token,
    spreadsheetId,
    entityId,
    entityName,
    calendarYear,
    settings,
    deadlines,
  })
}

export function sendTaxNotificationTest(
  token: string,
  spreadsheetId: string,
  entityName: string,
  settings: TaxNotificationSettings,
) {
  return requestGas<{ sent: boolean }>({
    action: 'sendTaxNotificationTest',
    token,
    spreadsheetId,
    entityName,
    settings,
    dashboardUrl: 'https://lguermandi.github.io/gestionale-contabilita/',
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

export function fetchPayrollWorkers(token: string, spreadsheetId: string) {
  return requestGas<WorkerProfile[]>({ action: 'getPayrollWorkers', token, spreadsheetId })
}

export function savePayrollWorker(token: string, worker: WorkerProfile, spreadsheetId: string) {
  return requestGas<WorkerProfile>({ action: 'savePayrollWorker', token, worker, spreadsheetId })
}

export function fetchPayrollAttendance(token: string, year: number, month: number, spreadsheetId: string) {
  return requestGas<Array<AttendanceInput & { id: string; workerId: string; year: number; month: number }>>({
    action: 'getPayrollAttendance',
    token,
    anno: year,
    mese: month,
    spreadsheetId,
  })
}

export function savePayrollAttendance(
  token: string,
  attendance: AttendanceInput & { id: string; workerId: string; year: number; month: number },
  spreadsheetId: string,
) {
  return requestGas<AttendanceInput & { id: string; workerId: string; year: number; month: number }>({
    action: 'savePayrollAttendance',
    token,
    attendance,
    spreadsheetId,
  })
}

export function fetchPayslips(token: string, year: number, month: number, spreadsheetId: string) {
  return requestGas<PayslipResult[]>({ action: 'getPayslips', token, anno: year, mese: month, spreadsheetId })
    .then((payslips) => payslips.map((payslip) => ({ ...payslip, arrotondamento: payslip.arrotondamento ?? 0 })))
}

export function savePayslip(token: string, payslip: PayslipResult & Record<string, unknown>, spreadsheetId: string) {
  return requestGas<PayslipResult & Record<string, unknown>>({ action: 'savePayslip', token, payslip, spreadsheetId })
}

export function savePayslipPdf(
  token: string,
  payslip: PayslipResult & Record<string, unknown>,
  pdfBase64: string,
  spreadsheetId: string,
) {
  return requestGas<{ fileId: string; fileUrl: string; fileName: string }>({
    action: 'savePayslipPdf',
    token,
    payslip,
    pdfBase64,
    spreadsheetId,
  })
}

export function savePayrollAccountingPdf(
  token: string,
  year: number,
  month: number,
  pdfBase64: string,
  spreadsheetId: string,
) {
  return requestGas<{ fileId: string; fileUrl: string; fileName: string }>({
    action: 'savePayrollAccountingPdf',
    token,
    anno: year,
    mese: month,
    pdfBase64,
    spreadsheetId,
  })
}

export function sendPayslipEmail(
  token: string,
  payslip: PayslipResult & Record<string, unknown>,
  pdfBase64: string,
  spreadsheetId: string,
) {
  return requestGas<{ sent: boolean; email: string }>({
    action: 'sendPayslipEmail',
    token,
    payslip,
    pdfBase64,
    spreadsheetId,
  })
}

export function fetchInvoices(year: number, token: string, spreadsheetId?: string) {
  return requestGas<StoredIssuedInvoice[]>({
    action: 'getInvoices',
    token,
    anno: year,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  }).then((invoices) => invoices.map(normalizeIssuedInvoice))
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

export function registerDocumentPayment(
  token: string,
  documentType: 'invoice' | 'expense',
  documentId: string,
  payment: InvoicePayment,
  spreadsheetId: string,
) {
  return requestGas<{ payment: InvoicePayment; duplicate: boolean; remaining: number }>({
    action: 'registerDocumentPayment',
    token,
    documentType,
    documentId,
    payment,
    spreadsheetId,
  })
}

export function issueInvoice(token: string, invoice: InvoiceDraft, spreadsheetId?: string) {
  return requestGas<StoredIssuedInvoice>({
    action: 'issueInvoice',
    token,
    invoice,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  }).then(normalizeIssuedInvoice)
}

export function archiveInvoice(
  token: string,
  invoice: IssuedInvoice,
  pdfBase64: string,
  xmlText: string,
  spreadsheetId?: string,
) {
  return requestGas<StoredIssuedInvoice>({
    action: 'archiveInvoice',
    token,
    invoice,
    pdfBase64,
    xmlText,
    ...(spreadsheetId ? { spreadsheetId } : {}),
  }).then(normalizeIssuedInvoice)
}
