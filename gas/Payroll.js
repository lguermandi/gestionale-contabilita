const PAYROLL_WORKER_HEADERS_ = [
  'ID', 'Tipo', 'Nome', 'Codice Fiscale', 'IBAN', 'Email', 'Dettaglio JSON'
];
const PAYROLL_ATTENDANCE_HEADERS_ = [
  'ID', 'Anno', 'Mese', 'Collaboratore', 'Dettaglio JSON'
];
const PAYROLL_SLIP_HEADERS_ = [
  'ID', 'Collaboratore', 'Anno', 'Mese', 'Tipologia', 'Lordo', 'Contributi',
  'Ritenute', 'TFR', 'Fondo pensione', 'Netto', 'Costo azienda', 'Stato',
  'Drive File ID', 'Drive File URL', 'Linked Issue Tx ID', 'Linked Payment Tx ID',
  'Dettaglio JSON'
];

function ensurePayrollSheets_(spreadsheet) {
  return {
    workers: getOrCreateSheet_(spreadsheet, 'Collaboratori', PAYROLL_WORKER_HEADERS_),
    attendance: getOrCreateSheet_(spreadsheet, 'Presenze', PAYROLL_ATTENDANCE_HEADERS_),
    payslips: getOrCreateSheet_(spreadsheet, 'Cedolini', PAYROLL_SLIP_HEADERS_)
  };
}

function normalizePayrollId_(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Identificativo paghe non valido.');
  return id;
}

function sanitizePayrollText_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
}

function getPayrollWorkers_(token, spreadsheetId) {
  requireSession_(token);
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  if (!spreadsheet) throw new Error('Entità contabile non disponibile.');
  const sheets = ensurePayrollSheets_(spreadsheet);
  SpreadsheetApp.flush();
  const sheet = sheets.workers;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues().map(row => {
    try {
      return JSON.parse(String(row[6] || '{}'));
    } catch (error) {
      return null;
    }
  }).filter(worker => worker);
}

function savePayrollWorker_(token, source, spreadsheetId) {
  requireSession_(token);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Anagrafica collaboratore non valida.');
  }
  const id = normalizePayrollId_(source.id || Utilities.getUuid());
  const workerType = String(source.workerType || '');
  if (!['subordinate', 'occasional', 'sports'].includes(workerType)) {
    throw new Error('Tipologia collaboratore non valida.');
  }
  const nome = sanitizePayrollText_(source.nome, 100);
  const cognome = sanitizePayrollText_(source.cognome, 100);
  if (!nome || !cognome) throw new Error('Nome e cognome del collaboratore sono obbligatori.');
  const codiceFiscale = sanitizePayrollText_(source.codiceFiscale, 32).toUpperCase();
  const iban = sanitizePayrollText_(source.iban, 34).replace(/\s/g, '').toUpperCase();
  const email = sanitizePayrollText_(source.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email del collaboratore non valida.');
  }
  const worker = Object.assign({}, source, {
    id: id,
    nome: nome,
    cognome: cognome,
    codiceFiscale: codiceFiscale,
    iban: iban,
    email: email
  });
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  if (!spreadsheet) throw new Error('Entità contabile non disponibile.');
  const sheet = ensurePayrollSheets_(spreadsheet).workers;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    let rowIndex = -1;
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let index = 0; index < ids.length; index += 1) {
        if (String(ids[index][0]) === id) {
          rowIndex = index + 2;
          break;
        }
      }
    }
    const row = [
      id, workerType, nome + ' ' + cognome, codiceFiscale, iban, email, JSON.stringify(worker)
    ];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return worker;
}

function validatePayrollYearMonth_(year, month) {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2100
    || !Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    throw new Error('Anno o mese paghe non valido.');
  }
  return { year: normalizedYear, month: normalizedMonth };
}

function getPayrollAttendance_(token, year, month, spreadsheetId) {
  requireSession_(token);
  const period = validatePayrollYearMonth_(year, month);
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  if (!spreadsheet) return [];
  const sheet = ensurePayrollSheets_(spreadsheet).attendance;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .filter(row => Number(row[1]) === period.year && Number(row[2]) === period.month)
    .map(row => {
      try { return JSON.parse(String(row[4] || '{}')); } catch (error) { return null; }
    }).filter(item => item);
}

function savePayrollAttendance_(token, source, spreadsheetId) {
  requireSession_(token);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Presenze non valide.');
  }
  const period = validatePayrollYearMonth_(source.year, source.month);
  const workerId = normalizePayrollId_(source.workerId || source.collaboratoreId);
  const id = normalizePayrollId_(source.id || workerId + '_' + period.year + '-' + String(period.month).padStart(2, '0'));
  const attendance = Object.assign({}, source, {
    id: id,
    year: period.year,
    month: period.month,
    workerId: workerId
  });
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  const sheet = ensurePayrollSheets_(spreadsheet).attendance;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    let rowIndex = -1;
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let index = 0; index < ids.length; index += 1) {
        if (String(ids[index][0]) === id) {
          rowIndex = index + 2;
          break;
        }
      }
    }
    const row = [id, period.year, period.month, workerId, JSON.stringify(attendance)];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return attendance;
}

function getPayslips_(token, year, month, spreadsheetId) {
  requireSession_(token);
  const period = validatePayrollYearMonth_(year, month);
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  if (!spreadsheet) return [];
  const sheet = ensurePayrollSheets_(spreadsheet).payslips;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues()
    .filter(row => Number(row[2]) === period.year && Number(row[3]) === period.month)
    .map(row => {
      try { return JSON.parse(String(row[17] || '{}')); } catch (error) { return null; }
    }).filter(item => item);
}

function normalizePayslip_(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Cedolino non valido.');
  }
  const period = validatePayrollYearMonth_(source.year, source.month);
  const workerId = normalizePayrollId_(source.workerId || source.collaboratoreId);
  const id = normalizePayrollId_(source.id || 'CED-' + period.year + '-' + String(period.month).padStart(2, '0') + '-' + workerId);
  const gross = Number(source.competenze || source.gross || 0);
  const contributions = Number(source.inpsDipendente || 0) + Number(source.inpsAzienda || 0)
    + Number(source.inailAzienda || 0) + Number(source.inpsGestioneSeparata || 0);
  const withholding = Number(source.ritenutaAcconto || 0) + Number(source.irpefNetta || 0)
    + Number(source.addizionaleRegionale || 0) + Number(source.addizionaleComunale || 0);
  const statusValues = ['Bozza', 'Emesso', 'Contabilizzato', 'Pagato'];
  const status = statusValues.includes(source.status) ? source.status : 'Bozza';
  return Object.assign({}, source, {
    id: id,
    workerId: workerId,
    year: period.year,
    month: period.month,
    gross: gross,
    contributions: contributions,
    withholding: withholding,
    status: status
  });
}

function savePayslip_(token, source, spreadsheetId) {
  requireSession_(token);
  const payslip = normalizePayslip_(source);
  const spreadsheet = getSpreadsheetForSession_(token, spreadsheetId);
  if (!spreadsheet) throw new Error('Entità contabile non disponibile.');
  const sheet = ensurePayrollSheets_(spreadsheet).payslips;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    let rowIndex = -1;
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let index = 0; index < ids.length; index += 1) {
        if (String(ids[index][0]) === payslip.id) {
          rowIndex = index + 2;
          break;
        }
      }
    }
    const row = [
      payslip.id,
      payslip.workerId,
      payslip.year,
      payslip.month,
      payslip.workerType || '',
      payslip.gross,
      payslip.contributions,
      payslip.withholding,
      Number(payslip.tfrQuotaMese || 0),
      Number(payslip.progressivi && payslip.progressivi.fondoPensioneAccantonato || 0),
      Number(payslip.netto || 0),
      Number(payslip.costoAzienda || 0),
      payslip.status,
      String(payslip.driveFileId || ''),
      String(payslip.driveFileUrl || ''),
      String(payslip.linkedIssueTxId || ''),
      String(payslip.linkedPaymentTxId || ''),
      JSON.stringify(payslip)
    ];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return payslip;
}

function getPayrollEntityFolder_(spreadsheetId) {
  const entity = getEntityRecordBySpreadsheetId_(spreadsheetId);
  if (!entity.folderId) throw new Error('La cartella Drive dell’entità non è disponibile.');
  return DriveApp.getFolderById(entity.folderId);
}

function findOrCreatePayrollSubfolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function sanitizePayslipFileName_(value) {
  return String(value || 'Cedolino')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'Cedolino';
}

function savePayslipPdf_(token, payslipSource, pdfBase64, spreadsheetId) {
  requireSession_(token);
  if (!spreadsheetId) throw new Error('Seleziona un’entità prima di salvare il cedolino.');
  if (typeof pdfBase64 !== 'string' || pdfBase64.length < 100 || pdfBase64.length > 15000000) {
    throw new Error('PDF del cedolino non valido.');
  }
  const payslip = normalizePayslip_(payslipSource);
  const monthName = String(payslip.month).padStart(2, '0');
  const surname = sanitizePayslipFileName_(payslip.cognome || payslip.workerNameSurname || 'Collaboratore');
  const name = sanitizePayslipFileName_(payslip.nome || '');
  const suffix = name ? surname + '_' + name : surname;
  const fileName = 'Cedolino_' + payslip.year + '-' + monthName + '_' + suffix + '.pdf';
  const entityFolder = getPayrollEntityFolder_(spreadsheetId);
  const yearFolder = findOrCreatePayrollSubfolder_(entityFolder, 'Cedolini');
  const monthFolder = findOrCreatePayrollSubfolder_(yearFolder, String(payslip.year));
  const finalFolder = findOrCreatePayrollSubfolder_(monthFolder, monthName);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), 'application/pdf', fileName);
    const existing = finalFolder.getFilesByName(fileName);
    let file;
    if (existing.hasNext()) {
      file = existing.next();
      file.setBlob(blob);
    } else {
      file = finalFolder.createFile(blob);
    }
    const result = { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName };
    savePayslip_(token, Object.assign({}, payslip, {
      driveFileId: result.fileId,
      driveFileUrl: result.fileUrl,
      status: payslip.status === 'Bozza' ? 'Emesso' : payslip.status
    }), spreadsheetId);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function sendPayslipEmail_(token, payslipSource, pdfBase64, spreadsheetId) {
  requireSession_(token);
  if (!spreadsheetId) throw new Error('Seleziona un’entità prima di inviare il cedolino.');
  const payslip = normalizePayslip_(payslipSource);
  const email = sanitizePayrollText_(payslip.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email del collaboratore non valida.');
  }
  if (typeof pdfBase64 !== 'string' || pdfBase64.length < 100 || pdfBase64.length > 15000000) {
    throw new Error('PDF del cedolino non valido.');
  }
  const monthName = String(payslip.month).padStart(2, '0');
  const surname = sanitizePayslipFileName_(payslip.cognome || 'Collaboratore');
  const name = sanitizePayslipFileName_(payslip.nome || '');
  const suffix = name ? surname + '_' + name : surname;
  const fileName = 'Cedolino_' + payslip.year + '-' + monthName + '_' + suffix + '.pdf';
  const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), 'application/pdf', fileName);
  MailApp.sendEmail({
    to: email,
    subject: 'Cedolino ' + monthName + '/' + payslip.year,
    body: 'In allegato il cedolino relativo al periodo ' + monthName + '/' + payslip.year + '.',
    attachments: [blob]
  });
  return { sent: true, email: email };
}
