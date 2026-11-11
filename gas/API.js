function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Dashboard Contabilità')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(event) {
  let action = '';
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    action = payload.action;
    let data;

    if (payload.action === 'login') {
      data = login(payload.username, payload.password);
    } else if (payload.action === 'getWorkspaceSetupStatus') {
      data = getWorkspaceSetupStatus_(payload.token);
    } else if (payload.action === 'initializeWorkspace') {
      data = initializeWorkspace_(payload.token, payload.workspaceFolder);
    } else if (payload.action === 'logout') {
      logout(payload.token);
      data = { loggedOut: true };
    } else if (payload.action === 'getTransactions') {
      data = getTransactions_(payload.token, payload.anno, payload.entity);
    } else if (payload.action === 'getTransactionHistory') {
      data = getTransactionHistory_(payload.token, payload.anno, payload.entity);
    } else if (payload.action === 'appendTransaction') {
      data = appendTransaction_(payload.token, payload.transaction, payload.entity);
    } else if (payload.action === 'getInvoices') {
      data = getInvoices_(payload.token, payload.anno);
    } else if (payload.action === 'getCustomers') {
      data = getCustomers_(payload.token);
    } else if (payload.action === 'saveCustomer') {
      data = saveCustomer_(payload.token, payload.customer);
    } else if (payload.action === 'getCreditNotes') {
      data = getCreditNotes_(payload.token, payload.anno);
    } else if (payload.action === 'issueCreditNote') {
      data = issueCreditNote_(payload.token, payload.creditNote);
    } else if (payload.action === 'getSuppliers') {
      data = getSuppliers_(payload.token);
    } else if (payload.action === 'saveSupplier') {
      data = saveSupplier_(payload.token, payload.supplier);
    } else if (payload.action === 'getExpenses') {
      data = getExpenses_(payload.token, payload.anno);
    } else if (payload.action === 'issueExpense') {
      data = issueExpense_(payload.token, payload.expense);
    } else if (payload.action === 'issueInvoice') {
      data = issueInvoice_(payload.token, payload.invoice);
    } else {
      return jsonResponse_({ status: 400, error: 'Azione non supportata.' });
    }

    return jsonResponse_({ status: 200, data: data });
  } catch (error) {
    const message = error && error.message ? error.message : 'Richiesta non valida.';
    const status = message === 'SESSION_EXPIRED' || action === 'login' ? 401 : 400;
    return jsonResponse_({ status: status, error: message });
  }
}

function getTransactions_(token, anno, entity) {
  requireSession_(token);
  const year = String(anno || '');
  if (!/^\d{4}$/.test(year)) {
    throw new Error('Anno non valido.');
  }
  const sheetName = ledgerSheetName_(year, entity);
  const spreadsheet = getSpreadsheetForSession_(token);
  const sheet = spreadsheet && spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    if (entity === 'business') return [];
    throw new Error('Non esiste un foglio contabile per l\'anno ' + year + '.');
  }
  const lastRow = sheet.getLastRow();
  const rows = lastRow ? sheet.getRange(1, 1, lastRow, 7).getValues() : [];
  return parseTransactions_(rows);
}

function getTransactionHistory_(token, anno, entity) {
  requireSession_(token);
  const throughYear = String(anno || '');
  if (!/^\d{4}$/.test(throughYear)) {
    throw new Error('Anno non valido.');
  }
  const normalizedEntity = entity || 'private';
  ledgerSheetName_(throughYear, normalizedEntity);
  const spreadsheet = getSpreadsheetForSession_(token);
  if (!spreadsheet) {
    throw new Error('Il progetto Apps Script deve essere collegato al foglio contabile.');
  }

  const yearPattern = normalizedEntity === 'business' ? /^AZIENDA_(\d{4})$/ : /^(\d{4})$/;
  const sheets = spreadsheet.getSheets()
    .map(sheet => ({ sheet: sheet, match: sheet.getName().match(yearPattern) }))
    .filter(item => item.match && Number(item.match[1]) <= Number(throughYear))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  const transactions = sheets.flatMap(item => {
    const lastRow = item.sheet.getLastRow();
    return lastRow ? parseTransactions_(item.sheet.getRange(1, 1, lastRow, 7).getValues()) : [];
  });

  return {
    years: sheets.map(item => Number(item.match[1])),
    transactions: transactions
  };
}

function appendTransaction_(token, transaction, entity) {
  requireSession_(token);
  const date = String(transaction && transaction.data || '');
  const id = String(transaction && transaction.id || '');
  const movements = transaction && transaction.movimenti;

  const parsedDate = new Date(date + 'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Data della registrazione non valida.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Identificativo della registrazione non valido.');
  }
  if (!Array.isArray(movements) || movements.length < 2 || movements.length > 100) {
    throw new Error('La registrazione deve contenere da 2 a 100 righe.');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const rows = movements.map(movement => {
    const account = sanitizeString_(movement.conto);
    const description = sanitizeString_(movement.descrizione);
    const management = sanitizeString_(movement.gestione);
    const debit = Number(movement.dare);
    const credit = Number(movement.avere);
    if (!account || !isFinite(debit) || !isFinite(credit) || debit < 0 || credit < 0) {
      throw new Error('Conto o importo non valido.');
    }
    const debitCents = Math.round(debit * 100);
    const creditCents = Math.round(credit * 100);
    if ((debitCents > 0) === (creditCents > 0)) {
      throw new Error('Ogni riga deve avere un importo solo in Dare oppure in Avere.');
    }
    totalDebit += debitCents;
    totalCredit += creditCents;
    return [date, id, account, description, management, debitCents / 100, creditCents / 100];
  });

  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error('La registrazione non è bilanciata.');
  }

  const year = date.slice(0, 4);
  const sheetName = ledgerSheetName_(year, entity);
  const spreadsheet = getSpreadsheetForSession_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sheet = spreadsheet && spreadsheet.getSheetByName(sheetName);
    if (!sheet && entity === 'business' && spreadsheet) sheet = spreadsheet.insertSheet(sheetName);
    if (!sheet) throw new Error('Non esiste un foglio contabile per l\'anno ' + year + '.');
    const lastRow = sheet.getLastRow();
    if (lastRow > 0) {
      const existingIds = sheet.getRange(1, 2, lastRow, 1).getValues().flat();
      if (existingIds.includes(id)) {
        return { id: id, duplicate: true };
      }
    }
    sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return { id: id, duplicate: false };
}

function ledgerSheetName_(year, entity) {
  const normalizedEntity = entity || 'private';
  if (normalizedEntity !== 'private' && normalizedEntity !== 'business') {
    throw new Error('Entità contabile non valida.');
  }
  return normalizedEntity === 'business' ? 'AZIENDA_' + year : year;
}

function getInvoices_(token, anno) {
  requireSession_(token);
  const year = String(anno || '');
  if (!/^\d{4}$/.test(year)) throw new Error('Anno non valido.');
  const spreadsheet = getSpreadsheetForSession_(token);
  const sheet = spreadsheet && spreadsheet.getSheetByName('Fatture');
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(row => String(row[1]) === year && row[6] === 'emessa')
    .map(row => JSON.parse(row[7]))
    .sort((left, right) => right.numero.localeCompare(left.numero));
}

function getCustomers_(token) {
  requireSession_(token);
  const spreadsheet = getSpreadsheetForSession_(token);
  if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
  const sheet = spreadsheet.getSheetByName('Clienti');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .map(row => JSON.parse(row[1]))
    .sort((left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'));
}

function saveCustomer_(token, source) {
  requireSession_(token);
  const customer = normalizeCustomer_(source);
  const spreadsheet = getSpreadsheetForSession_(token);
  if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_(spreadsheet, 'Clienti', ['ID', 'Dettaglio JSON']);
    const lastRow = sheet.getLastRow();
    const ids = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const existingIndex = ids.indexOf(customer.id);
    const rowIndex = existingIndex < 0 ? sheet.getLastRow() + 1 : existingIndex + 2;
    sheet.getRange(rowIndex, 1, 1, 2).setValues([[customer.id, JSON.stringify(customer)]]);
    SpreadsheetApp.flush();
    return customer;
  } finally {
    lock.releaseLock();
  }
}

function normalizeCustomer_(source) {
  const customer = source || {};
  const id = String(customer.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificativo cliente non valido.');
  const normalized = {
    id: id,
    ragioneSociale: sanitizeString_(customer.ragioneSociale),
    indirizzo: sanitizeString_(customer.indirizzo),
    partitaIva: sanitizeString_(customer.partitaIva),
    codiceFiscale: sanitizeString_(customer.codiceFiscale),
    email: sanitizeString_(customer.email),
    nazione: sanitizeString_(customer.nazione) || 'Italia',
    tipologia: sanitizeString_(customer.tipologia),
    cap: sanitizeString_(customer.cap),
    comune: sanitizeString_(customer.comune),
    telefono: sanitizeString_(customer.telefono)
  };
  if (!normalized.ragioneSociale || (!normalized.partitaIva && !normalized.codiceFiscale)) {
    throw new Error('Ragione sociale e partita IVA o codice fiscale sono obbligatori.');
  }
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new Error('Email cliente non valida.');
  }
  return normalized;
}

function getCreditNotes_(token, anno) {
  requireSession_(token);
  const year = String(anno || '');
  if (!/^\d{4}$/.test(year)) throw new Error('Anno non valido.');
  const spreadsheet = getSpreadsheetForSession_(token);
  const sheet = spreadsheet && spreadsheet.getSheetByName('NoteCredito');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(row => String(row[1]) === year && row[6] === 'emessa')
    .map(row => JSON.parse(row[7]))
    .sort((left, right) => right.numero.localeCompare(left.numero));
}

function issueCreditNote_(token, source) {
  requireSession_(token);
  const note = source || {};
  const id = String(note.id || '');
  const data = String(note.data || '');
  const fatturaId = String(note.fatturaId || '');
  const amount = Number(note.importo);
  const parsedDate = new Date(data + 'T00:00:00.000Z');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(fatturaId)) {
    throw new Error('Identificativo della nota di credito o della fattura non valido.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data) {
    throw new Error('Data della nota di credito non valida.');
  }
  if (!isFinite(amount) || amount <= 0) throw new Error('Importo della nota di credito non valido.');
  const amountCents = Math.round(amount * 100);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheetForSession_(token);
    if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
    const invoiceSheet = spreadsheet.getSheetByName('Fatture');
    const invoiceRow = invoiceSheet && findInvoiceRow_(invoiceSheet, fatturaId);
    if (!invoiceRow) throw new Error('La fattura originaria non è stata trovata.');
    const invoice = JSON.parse(invoiceSheet.getRange(invoiceRow, 8).getValue());
    if (invoice.stato !== 'emessa') throw new Error('La fattura originaria non è emessa.');

    const notesSheet = getOrCreateSheet_(spreadsheet, 'NoteCredito', [
      'ID', 'Anno', 'Numero', 'Fattura origine', 'Data', 'Importo', 'Stato', 'Dettaglio JSON'
    ]);
    const rows = notesSheet.getLastRow() < 2
      ? []
      : notesSheet.getRange(2, 1, notesSheet.getLastRow() - 1, 8).getValues();
    const duplicateIndex = rows.findIndex(row => row[0] === id);
    let issued;
    let rowIndex;
    if (duplicateIndex >= 0) {
      issued = JSON.parse(rows[duplicateIndex][7]);
      rowIndex = duplicateIndex + 2;
      const existingLedger = spreadsheet.getSheetByName(ledgerSheetName_(issued.data.slice(0, 4), 'business'));
      if (issued.stato === 'emessa' && existingLedger && ledgerHasTransaction_(existingLedger, id)) return issued;
    }
    const creditedCents = rows.reduce((sum, row) => {
      if (row[6] !== 'emessa') return sum;
      const saved = JSON.parse(row[7]);
      return saved.fatturaId === fatturaId ? sum + Math.round(Number(saved.importo) * 100) : sum;
    }, 0);
    const invoiceCents = Math.round(Number(invoice.totali.totale) * 100);
    if (!issued && amountCents > invoiceCents - creditedCents) throw new Error('L’importo supera il residuo ancora stornabile della fattura.');

    const year = issued ? issued.data.slice(0, 4) : data.slice(0, 4);
    if (!issued) {
      const number = year + '/NC/' + String(nextCreditNoteNumber_(notesSheet, year)).padStart(4, '0');
      issued = {
        id: id,
        data: data,
        fatturaId: fatturaId,
        fatturaNumero: invoice.numero,
        cliente: invoice.cliente,
        importo: amountCents / 100,
        note: sanitizeString_(note.note),
        numero: number,
        stato: 'in elaborazione'
      };
      rowIndex = notesSheet.getLastRow() + 1;
      notesSheet.getRange(rowIndex, 1, 1, 8).setValues([[
        id, year, number, fatturaId, data, amountCents / 100, issued.stato, JSON.stringify(issued)
      ]]);
    }
    const creditRows = creditNoteJournalMovements_(invoice, amountCents).map(movement => [
      data, id, movement.conto, ('Nota di credito ' + number + ' - ' + invoice.cliente.ragioneSociale).slice(0, 200),
      movement.gestione, movement.dare, movement.avere
    ]);
    const ledger = getOrCreateSheet_(spreadsheet, ledgerSheetName_(year, 'business'));
    if (!ledgerHasTransaction_(ledger, id)) {
      ledger.getRange(ledger.getLastRow() + 1, 1, creditRows.length, 7).setValues(creditRows);
    }
    issued.stato = 'emessa';
    notesSheet.getRange(rowIndex, 7, 1, 2).setValues([['emessa', JSON.stringify(issued)]]);
    SpreadsheetApp.flush();
    return issued;
  } finally {
    lock.releaseLock();
  }
}

function nextCreditNoteNumber_(sheet, year) {
  const lastRow = sheet.getLastRow();
  const numbers = lastRow < 2 ? [] : sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
  return numbers.reduce((highest, value) => {
    const match = String(value).match(new RegExp('^' + year + '/NC/(\\d+)$'));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
}

function creditNoteJournalMovements_(invoice, amountCents) {
  const original = invoiceJournalMovements_(invoice);
  const originalTotalCents = Math.round(Number(invoice.totali.totale) * 100);
  const factor = amountCents / originalTotalCents;
  const reversed = original.map(movement => ({
    conto: movement.conto,
    gestione: movement.gestione,
    dare: movement.avere > 0 ? Math.round(movement.avere * 100 * factor) / 100 : 0,
    avere: movement.dare > 0
      ? movement.conto === invoice.conti.clienti
        ? amountCents / 100
        : Math.round(movement.dare * 100 * factor) / 100
      : 0
  }));
  const debitCents = reversed.reduce((sum, movement) => sum + Math.round(movement.dare * 100), 0);
  const creditCents = reversed.reduce((sum, movement) => sum + Math.round(movement.avere * 100), 0);
  const revenue = reversed.find(movement => movement.conto === invoice.conti.ricavi && movement.dare > 0);
  if (!revenue) throw new Error('La fattura non contiene un conto ricavi stornabile.');
  revenue.dare = Math.round((revenue.dare * 100 + creditCents - debitCents)) / 100;
  if (revenue.dare <= 0) throw new Error('L’importo è troppo piccolo per generare una nota di credito bilanciata.');
  return reversed.filter(movement => movement.dare > 0 || movement.avere > 0);
}

function getSuppliers_(token) {
  requireSession_(token);
  const spreadsheet = getSpreadsheetForSession_(token);
  const sheet = spreadsheet && spreadsheet.getSheetByName('Fornitori');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .map(row => JSON.parse(row[1]))
    .sort((left, right) => left.ragioneSociale.localeCompare(right.ragioneSociale, 'it'));
}

function saveSupplier_(token, source) {
  requireSession_(token);
  return saveBusinessCounterparty_(token, source, 'Fornitori');
}

function saveBusinessCounterparty_(token, source, sheetName) {
  const customer = normalizeCustomer_(source);
  const spreadsheet = getSpreadsheetForSession_(token);
  if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    saveBusinessCounterpartyRow_(spreadsheet, sheetName, customer);
    SpreadsheetApp.flush();
    return customer;
  } finally {
    lock.releaseLock();
  }
}

function saveBusinessCounterpartyRow_(spreadsheet, sheetName, customer) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName, ['ID', 'Dettaglio JSON']);
  const lastRow = sheet.getLastRow();
  const ids = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const existingIndex = ids.indexOf(customer.id);
  const rowIndex = existingIndex < 0 ? sheet.getLastRow() + 1 : existingIndex + 2;
  sheet.getRange(rowIndex, 1, 1, 2).setValues([[customer.id, JSON.stringify(customer)]]);
}

function getExpenses_(token, anno) {
  requireSession_(token);
  const year = String(anno || '');
  if (!/^\d{4}$/.test(year)) throw new Error('Anno non valido.');
  const spreadsheet = getSpreadsheetForSession_(token);
  const sheet = spreadsheet && spreadsheet.getSheetByName('Spese');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(row => String(row[1]) === year && row[6] === 'registrata')
    .map(row => JSON.parse(row[7]))
    .sort((left, right) => right.data.localeCompare(left.data));
}

function issueExpense_(token, source) {
  requireSession_(token);
  const expense = source || {};
  const id = String(expense.id || '');
  const data = String(expense.data || '');
  const date = new Date(data + 'T00:00:00.000Z');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificativo spesa non valido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data) throw new Error('Data spesa non valida.');
  const imponibileCents = Math.round(Number(expense.imponibile) * 100);
  const rate = Number(expense.aliquotaIva);
  if (!isFinite(imponibileCents) || imponibileCents <= 0 || !isFinite(rate) || rate < 0 || rate > 100) throw new Error('Importo o aliquota IVA non validi.');
  const supplier = normalizeCustomer_(expense.fornitore);
  const allowedExpenseTypes = ['fattura', 'ricevuta', 'spesa personale'];
  const tipo = String(expense.tipo || 'fattura');
  if (allowedExpenseTypes.indexOf(tipo) < 0) throw new Error('Tipologia di spesa non valida.');
  const descrizione = sanitizeString_(expense.descrizione);
  const conto = sanitizeString_(expense.conto);
  if (!descrizione || !conto) throw new Error('Oggetto della spesa e conto di costo sono obbligatori.');
  const ivaCents = Math.round(imponibileCents * rate / 100);
  const totaleCents = imponibileCents + ivaCents;
  const attachment = expense.allegato || null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheetForSession_(token);
    if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
    const sheet = getOrCreateSheet_(spreadsheet, 'Spese', [
      'ID', 'Anno', 'Data', 'Fornitore', 'Totale', 'Documento', 'Stato', 'Dettaglio JSON'
    ]);
    const lastRow = sheet.getLastRow();
    const existingRows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    const existing = existingRows.find(row => row[0] === id);
    if (existing && existing[6] === 'registrata') return JSON.parse(existing[7]);
    saveBusinessCounterpartyRow_(spreadsheet, 'Fornitori', supplier);

    let issued = existing ? JSON.parse(existing[7]) : null;
    let rowIndex = existing ? existingRows.indexOf(existing) + 2 : 0;
    let savedAttachment = issued && issued.allegatoSalvato || null;
    if (!existing && attachment) {
      const mimeType = String(attachment.mimeType || '');
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      const base64 = String(attachment.base64 || '');
      if (allowedTypes.indexOf(mimeType) < 0 || base64.length > 11200000) throw new Error('Allegato non valido o superiore a 8 MB.');
      const bytes = Utilities.base64Decode(base64);
      if (bytes.length > 8 * 1024 * 1024) throw new Error('L’allegato supera il limite di 8 MB.');
      const name = sanitizeString_(attachment.nome).replace(/[\\/:*?"<>|]/g, '_') || 'documento';
      const blob = Utilities.newBlob(bytes, mimeType, name);
      const folder = getExpenseUploadFolder_(token);
      const file = folder.createFile(blob);
      savedAttachment = { nome: name, mimeType: mimeType, url: file.getUrl() };
    }

    const year = data.slice(0, 4);
    if (!issued) {
      issued = {
        id: id, tipo: tipo, data: data, numeroDocumento: sanitizeString_(expense.numeroDocumento),
        fornitore: supplier, descrizione: descrizione, conto: conto,
        imponibile: imponibileCents / 100, aliquotaIva: rate,
        iva: ivaCents / 100, totale: totaleCents / 100,
        note: sanitizeString_(expense.note), stato: 'da pagare',
        allegatoSalvato: savedAttachment,
        conti: {
          ivaCredito: sanitizeString_((expense.conti || {}).ivaCredito) || 'IVA a credito',
          fornitori: sanitizeString_((expense.conti || {}).fornitori) || 'Debiti v/fornitori',
          gestione: sanitizeString_((expense.conti || {}).gestione) || 'Tipica'
        }
      };
      rowIndex = sheet.getLastRow() + 1;
      sheet.getRange(rowIndex, 1, 1, 8).setValues([[
        id, year, data, supplier.ragioneSociale, totaleCents / 100,
        issued.numeroDocumento, 'in elaborazione', JSON.stringify(issued)
      ]]);
    }
    const ledger = getOrCreateSheet_(spreadsheet, ledgerSheetName_(year, 'business'));
    const accounts = issued.conti || expense.conti || {};
    const vatAccount = sanitizeString_(accounts.ivaCredito) || 'IVA a credito';
    const supplierAccount = sanitizeString_(accounts.fornitori) || 'Debiti v/fornitori';
    const management = sanitizeString_(accounts.gestione) || 'Tipica';
    const movements = [
      { conto: conto, gestione: management, dare: imponibileCents / 100, avere: 0 },
      ...(ivaCents > 0 ? [{ conto: vatAccount, gestione: '', dare: ivaCents / 100, avere: 0 }] : []),
      { conto: supplierAccount, gestione: '', dare: 0, avere: totaleCents / 100 }
    ];
    const journalRows = movements.map(movement => [
      data, id, movement.conto,
      ('Fattura fornitore ' + (issued.numeroDocumento || '') + ' - ' + supplier.ragioneSociale).slice(0, 200),
      movement.gestione, movement.dare, movement.avere
    ]);
    if (!ledgerHasTransaction_(ledger, id)) {
      ledger.getRange(ledger.getLastRow() + 1, 1, journalRows.length, 7).setValues(journalRows);
    }
    sheet.getRange(rowIndex, 5, 1, 4).setValues([[
      issued.totale, issued.numeroDocumento, 'registrata', JSON.stringify(issued)
    ]]);
    SpreadsheetApp.flush();
    return issued;
  } finally {
    lock.releaseLock();
  }
}

function getExpenseUploadFolder_(token) {
  const session = requireSession_(token);
  if (!session.user.expenseFolderId) {
    const folder = DriveApp.createFolder('Allegati Spese - ' + session.user.username);
    session.user.expenseFolderId = folder.getId();
    saveSessionUser_(session);
  }
  return DriveApp.getFolderById(session.user.expenseFolderId);
}

function getWorkspaceSetupStatus_(token) {
  const session = requireSession_(token);
  return {
    setupRequired: !session.user.workspaceReady,
    username: session.user.username,
    gasOwnerEmail: String(
      PropertiesService.getScriptProperties().getProperty('APP_GAS_OWNER_EMAIL') || ''
    ).trim()
  };
}

function getWorkspaceSetupStatus(token) {
  return getWorkspaceSetupStatus_(token);
}

function initializeWorkspace(token, workspaceFolder) {
  return initializeWorkspace_(token, workspaceFolder);
}

function initializeWorkspace_(token, workspaceFolderInput) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const session = requireSession_(token);
    if (session.user.workspaceReady) {
      return {
        setupRequired: false,
        folderUrl: session.user.rootFolderId
          ? DriveApp.getFolderById(session.user.rootFolderId).getUrl()
          : '',
        spreadsheetUrl: SpreadsheetApp.openById(session.user.spreadsheetId).getUrl()
      };
    }

    const workspaceFolderId = folderIdFromInput_(workspaceFolderInput);
    if (session.user.setupRootFolderId
      && session.user.setupRootFolderId !== workspaceFolderId) {
      throw new Error('Configurazione già avviata in un’altra cartella. Riprendi usando la stessa destinazione.');
    }
    session.user.setupRootFolderId = workspaceFolderId;
    session.user.rootFolderId = workspaceFolderId;
    saveSessionUser_(session);

    const rootFolder = DriveApp.getFolderById(session.user.rootFolderId);
    const accountingFolder = getOrCreateWorkspaceFolder_(session, rootFolder, 'Contabilità', 'accountingFolderId');
    getOrCreateWorkspaceFolder_(session, rootFolder, 'Fatture emesse', 'invoicesFolderId');
    getOrCreateWorkspaceFolder_(session, rootFolder, 'Ricevute', 'receiptsFolderId');
    getOrCreateWorkspaceFolder_(session, rootFolder, 'Estratti conto', 'bankStatementsFolderId');
    getOrCreateWorkspaceFolder_(session, rootFolder, 'Spese', 'expensesFolderId');
    const documentsFolder = getOrCreateWorkspaceFolder_(session, rootFolder, 'Documenti', 'documentsFolderId');
    const expenseFolder = getOrCreateWorkspaceFolder_(session, documentsFolder, 'Allegati spese', 'expenseFolderId');

    if (!session.user.spreadsheetId) {
      session.user.spreadsheetId = SpreadsheetApp.create(
        'Gestionale contabile - ' + session.user.username
      ).getId();
      saveSessionUser_(session);
    }
    const spreadsheet = SpreadsheetApp.openById(session.user.spreadsheetId);
    initializeWorkspaceSpreadsheet_(spreadsheet);
    DriveApp.getFileById(session.user.spreadsheetId).moveTo(accountingFolder);
    session.user.expenseFolderId = expenseFolder.getId();
    session.user.workspaceReady = true;
    saveSessionUser_(session);

    return {
      setupRequired: false,
      folderUrl: rootFolder.getUrl(),
      spreadsheetUrl: spreadsheet.getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

function folderIdFromInput_(input) {
  const value = String(input || '').trim();
  const urlMatch = value.match(/\/folders\/([A-Za-z0-9_-]+)/)
    || value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  const id = urlMatch ? urlMatch[1] : value;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    throw new Error('Inserisci il link o l’ID di una cartella Google Drive valida.');
  }
  return id;
}

function getOrCreateWorkspaceFolder_(session, parent, name, propertyName) {
  if (session.user[propertyName]) {
    return DriveApp.getFolderById(session.user[propertyName]);
  }
  const folder = parent.createFolder(name);
  session.user[propertyName] = folder.getId();
  saveSessionUser_(session);
  return folder;
}

function initializeWorkspaceSpreadsheet_(spreadsheet) {
  const currentYear = new Date().getFullYear();
  const sheets = spreadsheet.getSheets();
  if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
    sheets[0].setName(String(currentYear));
  }
  for (let year = currentYear - 9; year <= currentYear + 1; year += 1) {
    const privateSheetName = String(year);
    if (!spreadsheet.getSheetByName(privateSheetName)) {
      spreadsheet.insertSheet(privateSheetName);
    }
    const businessSheetName = ledgerSheetName_(privateSheetName, 'business');
    if (!spreadsheet.getSheetByName(businessSheetName)) {
      spreadsheet.insertSheet(businessSheetName);
    }
  }
  getOrCreateSheet_(spreadsheet, 'Fatture', [
    'ID', 'Anno', 'Numero', 'Data', 'Cliente', 'Totale', 'Stato', 'Dettaglio JSON'
  ]);
  getOrCreateSheet_(spreadsheet, 'NoteCredito', [
    'ID', 'Anno', 'Numero', 'Fattura origine', 'Data', 'Importo', 'Stato', 'Dettaglio JSON'
  ]);
  getOrCreateSheet_(spreadsheet, 'Clienti', ['ID', 'Dettaglio JSON']);
  getOrCreateSheet_(spreadsheet, 'Fornitori', ['ID', 'Dettaglio JSON']);
  getOrCreateSheet_(spreadsheet, 'Spese', [
    'ID', 'Anno', 'Data', 'Fornitore', 'Totale', 'Documento', 'Stato', 'Dettaglio JSON'
  ]);
}

function getSpreadsheetForSession_(token) {
  const session = requireSession_(token);
  if (!session.user.workspaceReady || !session.user.spreadsheetId) {
    throw new Error('BUSINESS_SETUP_REQUIRED');
  }
  return SpreadsheetApp.openById(session.user.spreadsheetId);
}

function issueInvoice_(token, source) {
  requireSession_(token);
  const invoice = normalizeInvoice_(source);
  const year = invoice.data.slice(0, 4);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheetForSession_(token);
    if (!spreadsheet) throw new Error('Il progetto Apps Script non è collegato al foglio contabile.');
    const invoiceSheet = getOrCreateSheet_(spreadsheet, 'Fatture', [
      'ID', 'Anno', 'Numero', 'Data', 'Cliente', 'Totale', 'Stato', 'Dettaglio JSON'
    ]);
    const ledgerSheet = getOrCreateSheet_(spreadsheet, ledgerSheetName_(year, 'business'));
    const existingRow = findInvoiceRow_(invoiceSheet, invoice.id);
    let issued;
    let rowIndex = existingRow;

    if (existingRow) {
      issued = JSON.parse(invoiceSheet.getRange(existingRow, 8).getValue());
      if (issued.stato === 'emessa' && ledgerHasTransaction_(ledgerSheet, invoice.id)) {
        issued.duplicate = true;
        return issued;
      }
    } else {
      const number = nextInvoiceNumber_(invoiceSheet, year);
      issued = Object.assign({}, invoice, {
        numero: number,
        stato: 'in elaborazione',
        totali: calculateInvoiceTotals_(invoice)
      });
      rowIndex = invoiceSheet.getLastRow() + 1;
      invoiceSheet.getRange(rowIndex, 1, 1, 8).setValues([[
        issued.id, year, issued.numero, issued.data, issued.cliente.ragioneSociale,
        issued.totali.totale, issued.stato, JSON.stringify(issued)
      ]]);
    }

    if (!ledgerHasTransaction_(ledgerSheet, invoice.id)) {
      const movements = invoiceJournalMovements_(issued);
      const rows = movements.map(movement => [
        issued.data, issued.id, movement.conto, movement.descrizione,
        movement.gestione, movement.dare, movement.avere
      ]);
      ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
    }

    issued.stato = 'emessa';
    invoiceSheet.getRange(rowIndex, 6, 1, 3).setValues([[
      issued.totali.totale, issued.stato, JSON.stringify(issued)
    ]]);
    issued.duplicate = false;
    SpreadsheetApp.flush();
    return issued;
  } finally {
    lock.releaseLock();
  }
}

function normalizeInvoice_(source) {
  const invoice = source || {};
  const date = String(invoice.data || '');
  const parsedDate = new Date(date + 'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Data fattura non valida.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(invoice.id || ''))) throw new Error('ID fattura non valido.');

  const customer = invoice.cliente || {};
  const cliente = {
    id: sanitizeString_(customer.id),
    ragioneSociale: sanitizeString_(customer.ragioneSociale),
    indirizzo: sanitizeString_(customer.indirizzo),
    partitaIva: sanitizeString_(customer.partitaIva),
    email: sanitizeString_(customer.email),
    codiceFiscale: sanitizeString_(customer.codiceFiscale),
    nazione: sanitizeString_(customer.nazione) || 'Italia',
    tipologia: sanitizeString_(customer.tipologia),
    cap: sanitizeString_(customer.cap),
    comune: sanitizeString_(customer.comune),
    telefono: sanitizeString_(customer.telefono)
  };
  if (!cliente.ragioneSociale || (!cliente.partitaIva && !cliente.codiceFiscale)) throw new Error('Dati cliente obbligatori mancanti.');
  if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) throw new Error('Email cliente non valida.');

  const lines = invoice.linee;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) throw new Error('Numero di voci fattura non valido.');
  const linee = lines.map(line => {
    const quantita = Number(line.quantita);
    const prezzoUnitario = Number(line.prezzoUnitario);
    const descrizione = sanitizeString_(line.descrizione);
    if (!descrizione || !isFinite(quantita) || quantita <= 0 || !isFinite(prezzoUnitario) || prezzoUnitario < 0) {
      throw new Error('Voce fattura non valida.');
    }
    return { id: String(line.id || ''), descrizione, quantita, prezzoUnitario };
  });

  const rates = {
    aliquotaIva: Number(invoice.aliquotaIva),
    aliquotaCassa: Number(invoice.aliquotaCassa),
    aliquotaRitenuta: Number(invoice.aliquotaRitenuta)
  };
  Object.keys(rates).forEach(key => {
    if (!isFinite(rates[key]) || rates[key] < 0 || rates[key] > 100) throw new Error('Aliquota fattura non valida.');
  });
  const sourceAccounts = invoice.conti || {};
  const conti = {
    clienti: sanitizeString_(sourceAccounts.clienti),
    ricavi: sanitizeString_(sourceAccounts.ricavi),
    iva: sanitizeString_(sourceAccounts.iva),
    ritenute: sanitizeString_(sourceAccounts.ritenute),
    cassa: sanitizeString_(sourceAccounts.cassa),
    gestione: sanitizeString_(sourceAccounts.gestione),
    bollo: sanitizeString_(sourceAccounts.bollo),
    incassi: sanitizeString_(sourceAccounts.incassi)
  };
  if (['clienti', 'ricavi', 'iva', 'ritenute', 'cassa', 'gestione'].some(key => !conti[key])) throw new Error('Mappatura contabile fattura incompleta.');

  const payment = invoice.pagamento || {};
  const scadenza = String(payment.scadenza || '');
  if (scadenza) {
    const dueDate = new Date(scadenza + 'T00:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scadenza)
      || isNaN(dueDate.getTime())
      || dueDate.toISOString().slice(0, 10) !== scadenza) throw new Error('Data di scadenza non valida.');
  }
  const pagamento = {
    metodo: sanitizeString_(payment.metodo),
    scadenza: scadenza,
    incassata: payment.incassata === true
  };
  const stampSource = invoice.marcaDaBollo || {};
  const marcaDaBollo = {
    addebitata: stampSource.addebitata === true,
    importo: Number(stampSource.importo || 0),
    identificativo: sanitizeString_(stampSource.identificativo)
  };
  if (marcaDaBollo.addebitata
    && (!isFinite(marcaDaBollo.importo) || marcaDaBollo.importo <= 0 || !conti.bollo)) {
    throw new Error('Marca da bollo o conto contabile non valido.');
  }
  if (pagamento.incassata && !conti.incassi) throw new Error('Configura il conto per gli incassi già ricevuti.');

  const normalized = {
    id: String(invoice.id), data: date, cliente, linee,
    aliquotaIva: rates.aliquotaIva,
    aliquotaCassa: rates.aliquotaCassa,
    aliquotaRitenuta: rates.aliquotaRitenuta,
    note: sanitizeString_(invoice.note), conti, pagamento, marcaDaBollo
  };
  const totals = calculateInvoiceTotals_(normalized);
  if (totals.totale <= 0) throw new Error('Totale fattura non valido.');
  return normalized;
}

function calculateInvoiceTotals_(invoice) {
  const base = invoice.linee.reduce((sum, line) => sum + Math.round(line.quantita * line.prezzoUnitario * 100), 0);
  const contribution = Math.round(base * invoice.aliquotaCassa / 100);
  const vatBase = base + contribution;
  const vat = Math.round(vatBase * invoice.aliquotaIva / 100);
  const withholding = Math.round(base * invoice.aliquotaRitenuta / 100);
  const stampDuty = invoice.marcaDaBollo && invoice.marcaDaBollo.addebitata
    ? Math.round(Number(invoice.marcaDaBollo.importo) * 100)
    : 0;
  return {
    imponibile: base / 100,
    cassa: contribution / 100,
    baseIva: vatBase / 100,
    iva: vat / 100,
    ritenuta: withholding / 100,
    bollo: stampDuty / 100,
    totale: (base + contribution + vat - withholding + stampDuty) / 100
  };
}

function invoiceJournalMovements_(invoice) {
  const totals = invoice.totali;
  const description = ('Fattura ' + invoice.numero + ' - ' + invoice.cliente.ragioneSociale).slice(0, 200);
  const accounts = invoice.conti;
  const movements = [
    { conto: invoice.pagamento && invoice.pagamento.incassata ? accounts.incassi : accounts.clienti, descrizione: description, gestione: '', dare: totals.totale, avere: 0 }
  ];
  if (totals.ritenuta > 0) movements.push({ conto: accounts.ritenute, descrizione: description, gestione: '', dare: totals.ritenuta, avere: 0 });
  movements.push({ conto: accounts.ricavi, descrizione: description, gestione: accounts.gestione, dare: 0, avere: totals.imponibile });
  if (totals.cassa > 0) movements.push({ conto: accounts.cassa, descrizione: description, gestione: accounts.gestione, dare: 0, avere: totals.cassa });
  if (totals.iva > 0) movements.push({ conto: accounts.iva, descrizione: description, gestione: '', dare: 0, avere: totals.iva });
  if (totals.bollo > 0) movements.push({ conto: accounts.bollo, descrizione: description, gestione: '', dare: 0, avere: totals.bollo });
  return movements;
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function findInvoiceRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const index = ids.indexOf(id);
  return index < 0 ? 0 : index + 2;
}

function nextInvoiceNumber_(sheet, year) {
  const lastRow = sheet.getLastRow();
  const numbers = lastRow < 2 ? [] : sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
  const prefix = year + '/';
  const sequence = numbers.reduce((highest, value) => {
    const match = String(value).match(new RegExp('^' + year + '/(\\d+)$'));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return prefix + String(sequence).padStart(4, '0');
}

function ledgerHasTransaction_(sheet, id) {
  const lastRow = sheet.getLastRow();
  return lastRow > 0 && sheet.getRange(1, 2, lastRow, 1).getValues().flat().includes(id);
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData(token, anno) {
  requireSession_(token);

  const year = String(anno || '');
  if (!/^\d{4}$/.test(year)) {
    throw new Error('Anno non valido.');
  }

  const spreadsheet = getSpreadsheetForSession_(token);
  if (!spreadsheet) {
    throw new Error('Il progetto Apps Script deve essere collegato al foglio contabile.');
  }

  const sheet = spreadsheet.getSheetByName(year);
  if (!sheet) {
    throw new Error(`Non esiste un foglio per l'anno ${year}.`);
  }

  const lastRow = sheet.getLastRow();
  const rows = lastRow ? sheet.getRange(1, 1, lastRow, 7).getValues() : [];
  const transactions = parseTransactions_(rows);

  const monthlyReport = generateMonthlyReport_(transactions);
  const timeline = generateTimeSeries_(transactions);
  const gestioni = generateGestioniReport_(transactions);
  const positions = generateOpenPositions_(transactions);

  return {
    saldi: calculateBalances_(transactions),
    timeline: timeline,
    report: monthlyReport,
    gestioni: gestioni,
    dettaglio: positions
  };
}

function authorizeSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Il progetto Apps Script deve essere collegato al foglio contabile.');
  }
  spreadsheet.getSheets();
  DriveApp.getRootFolder().getName();
  const ownerEmail = String(
    PropertiesService.getScriptProperties().getProperty('APP_GAS_OWNER_EMAIL') || ''
  ).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('Imposta APP_GAS_OWNER_EMAIL nelle proprietà script con l’account Google che esegue il deployment.');
  }
}