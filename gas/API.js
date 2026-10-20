function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Dashboard Contabilità')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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