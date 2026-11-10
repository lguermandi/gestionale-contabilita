function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Dashboard Contabilità')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(event) {
  let action = '';
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    action = request.action;
    let data;

    if (request.action === 'login') {
      data = login(request.username, request.password);
    } else if (request.action === 'getTransactions') {
      data = getTransactions_(request.token, request.anno, request.entity);
    } else if (request.action === 'appendTransaction') {
      data = appendTransaction_(request.token, request.transaction, request.entity);
    } else if (request.action === 'getInvoices') {
      data = getInvoices_(request.token, request.anno);
    } else if (request.action === 'issueInvoice') {
      data = issueInvoice_(request.token, request.invoice);
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
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet && spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    if (entity === 'business') return [];
    throw new Error('Non esiste un foglio contabile per l\'anno ' + year + '.');
  }
  const lastRow = sheet.getLastRow();
  const rows = lastRow ? sheet.getRange(1, 1, lastRow, 7).getValues() : [];
  return parseTransactions_(rows);
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
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet && spreadsheet.getSheetByName('Fatture');
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(row => String(row[1]) === year && row[6] === 'emessa')
    .map(row => JSON.parse(row[7]))
    .sort((left, right) => right.numero.localeCompare(left.numero));
}

function issueInvoice_(token, source) {
  requireSession_(token);
  const invoice = normalizeInvoice_(source);
  const year = invoice.data.slice(0, 4);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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
    ragioneSociale: sanitizeString_(customer.ragioneSociale),
    indirizzo: sanitizeString_(customer.indirizzo),
    partitaIva: sanitizeString_(customer.partitaIva),
    email: sanitizeString_(customer.email)
  };
  if (!cliente.ragioneSociale || !cliente.partitaIva) throw new Error('Dati cliente obbligatori mancanti.');
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
    gestione: sanitizeString_(sourceAccounts.gestione)
  };
  if (Object.keys(conti).some(key => !conti[key])) throw new Error('Mappatura contabile fattura incompleta.');

  const normalized = {
    id: String(invoice.id), data: date, cliente, linee,
    aliquotaIva: rates.aliquotaIva,
    aliquotaCassa: rates.aliquotaCassa,
    aliquotaRitenuta: rates.aliquotaRitenuta,
    note: sanitizeString_(invoice.note), conti
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
  return {
    imponibile: base / 100,
    cassa: contribution / 100,
    baseIva: vatBase / 100,
    iva: vat / 100,
    ritenuta: withholding / 100,
    totale: (base + contribution + vat - withholding) / 100
  };
}

function invoiceJournalMovements_(invoice) {
  const totals = invoice.totali;
  const description = ('Fattura ' + invoice.numero + ' - ' + invoice.cliente.ragioneSociale).slice(0, 200);
  const accounts = invoice.conti;
  const movements = [
    { conto: accounts.clienti, descrizione: description, gestione: '', dare: totals.totale, avere: 0 }
  ];
  if (totals.ritenuta > 0) movements.push({ conto: accounts.ritenute, descrizione: description, gestione: '', dare: totals.ritenuta, avere: 0 });
  movements.push({ conto: accounts.ricavi, descrizione: description, gestione: accounts.gestione, dare: 0, avere: totals.imponibile });
  if (totals.cassa > 0) movements.push({ conto: accounts.cassa, descrizione: description, gestione: accounts.gestione, dare: 0, avere: totals.cassa });
  if (totals.iva > 0) movements.push({ conto: accounts.iva, descrizione: description, gestione: '', dare: 0, avere: totals.iva });
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

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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
}