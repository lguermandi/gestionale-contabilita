const ENTITY_SYSTEM_ROOT_NAME_ = 'Gestionale Contabilita';
const ENTITY_INDEX_NAME_ = 'Index_Entita';
const ENTITY_ROOT_PROPERTY_ = 'ENTITY_SYSTEM_ROOT_FOLDER_ID';
const ENTITY_INDEX_PROPERTY_ = 'ENTITY_INDEX_SPREADSHEET_ID';
const ENTITY_INDEX_HEADERS_ = [
  'ID', 'Nome_Entita', 'Tipologia', 'Folder_ID', 'Spreadsheet_ID'
];

function initSystem() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const system = getOrCreateEntitySystem_();
    return {
      rootFolderId: system.rootFolder.getId(),
      indexSpreadsheetId: system.indexSpreadsheet.getId(),
      rootFolderUrl: system.rootFolder.getUrl(),
      indexSpreadsheetUrl: system.indexSpreadsheet.getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

function createNewEntity(datiEntita) {
  const entity = normalizeEntityData_(datiEntita);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const system = getOrCreateEntitySystem_();
    assertEntityNameAvailable_(system.indexSheet, entity.nome);

    const folder = system.rootFolder.createFolder(entity.nome);
    const spreadsheet = SpreadsheetApp.create('Contabilita - ' + entity.nome);
    initializeEntitySpreadsheet_(spreadsheet, entity);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);

    const id = Utilities.getUuid();
    const row = system.indexSheet.getLastRow() + 1;
    system.indexSheet.getRange(row, 1, 1, ENTITY_INDEX_HEADERS_.length).setValues([[
      id,
      entity.nome,
      entity.tipologia,
      folder.getId(),
      spreadsheet.getId()
    ]]);
    SpreadsheetApp.flush();

    return {
      id: id,
      nomeEntita: entity.nome,
      tipologia: entity.tipologia,
      folderId: folder.getId(),
      spreadsheetId: spreadsheet.getId(),
      folderUrl: folder.getUrl(),
      spreadsheetUrl: spreadsheet.getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

function getEntities() {
  const system = getOrCreateEntitySystem_();
  const lastRow = system.indexSheet.getLastRow();
  if (lastRow < 2) return [];

  return system.indexSheet.getRange(2, 1, lastRow - 1, ENTITY_INDEX_HEADERS_.length)
    .getValues()
    .map(row => ({
      id: String(row[0]),
      nomeEntita: String(row[1]),
      tipologia: String(row[2]),
      folderId: String(row[3]),
      spreadsheetId: String(row[4])
    }));
}

function getEntityRecordBySpreadsheetId_(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    throw new Error('Spreadsheet_ID non valido.');
  }

  const system = getOrCreateEntitySystem_();
  const lastRow = system.indexSheet.getLastRow();
  if (lastRow < 2) throw new Error('L’entità selezionata non esiste nell’indice.');

  const rows = system.indexSheet.getRange(2, 1, lastRow - 1, ENTITY_INDEX_HEADERS_.length).getValues();
  const row = rows.find(item => String(item[4]) === id);
  if (!row) throw new Error('L’entità selezionata non esiste nell’indice.');
  return {
    id: String(row[0]),
    nomeEntita: String(row[1]),
    tipologia: String(row[2]),
    folderId: String(row[3]),
    spreadsheetId: String(row[4])
  };
}

function getOrCreateEntitySystem_() {
  const properties = PropertiesService.getScriptProperties();
  let rootFolder;
  const savedRootId = properties.getProperty(ENTITY_ROOT_PROPERTY_);
  if (savedRootId) {
    rootFolder = DriveApp.getFolderById(savedRootId);
  } else {
    rootFolder = findUniqueEntityFolder_(ENTITY_SYSTEM_ROOT_NAME_)
      || DriveApp.createFolder(ENTITY_SYSTEM_ROOT_NAME_);
    properties.setProperty(ENTITY_ROOT_PROPERTY_, rootFolder.getId());
  }

  let indexSpreadsheet;
  const savedIndexId = properties.getProperty(ENTITY_INDEX_PROPERTY_);
  if (savedIndexId) {
    indexSpreadsheet = SpreadsheetApp.openById(savedIndexId);
  } else {
    const existingIndex = findUniqueEntityFile_(rootFolder, ENTITY_INDEX_NAME_);
    if (existingIndex) {
      indexSpreadsheet = SpreadsheetApp.openById(existingIndex.getId());
    } else {
      indexSpreadsheet = SpreadsheetApp.create(ENTITY_INDEX_NAME_);
      DriveApp.getFileById(indexSpreadsheet.getId()).moveTo(rootFolder);
    }
    properties.setProperty(ENTITY_INDEX_PROPERTY_, indexSpreadsheet.getId());
  }

  const sheets = indexSpreadsheet.getSheets();
  if (sheets.length !== 1) {
    throw new Error('Il file Index_Entita deve contenere un solo foglio.');
  }
  const indexSheet = sheets[0];
  if (indexSheet.getName() !== 'Entita') {
    indexSheet.setName('Entita');
  }
  ensureEntityIndexHeaders_(indexSheet);

  return {
    rootFolder: rootFolder,
    indexSpreadsheet: indexSpreadsheet,
    indexSheet: indexSheet
  };
}

function findUniqueEntityFolder_(name) {
  const folders = DriveApp.getRootFolder().getFoldersByName(name);
  if (!folders.hasNext()) return null;
  const folder = folders.next();
  if (folders.hasNext()) {
    throw new Error('Esistono più cartelle radice chiamate "' + name + '".');
  }
  return folder;
}

function findUniqueEntityFile_(parentFolder, name) {
  const files = parentFolder.getFilesByName(name);
  if (!files.hasNext()) return null;
  const file = files.next();
  if (files.hasNext()) {
    throw new Error('Esistono più file "' + name + '" nella cartella radice.');
  }
  return file;
}

function ensureEntityIndexHeaders_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, ENTITY_INDEX_HEADERS_.length)
      .setValues([ENTITY_INDEX_HEADERS_])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, ENTITY_INDEX_HEADERS_.length).getValues()[0];
  if (ENTITY_INDEX_HEADERS_.some((header, index) => headers[index] !== header)) {
    throw new Error('Le intestazioni del file Index_Entita non corrispondono allo schema previsto.');
  }
}

function normalizeEntityData_(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('I dati dell’entità non sono validi.');
  }

  const nome = entityInputValue_(data, ['nome', 'nomeEntita', 'Nome_Entita']);
  if (!nome || nome.length > 100 || /[\/\\\u0000-\u001f]/.test(nome)) {
    throw new Error('Inserisci un nome entità valido (massimo 100 caratteri, senza slash).');
  }

  const rawType = entityInputValue_(data, ['tipo', 'tipologia', 'Tipologia']).toLowerCase();
  const tipologia = rawType === 'privato' ? 'Privato' : rawType === 'azienda' ? 'Azienda' : '';
  if (!tipologia) {
    throw new Error('La tipologia deve essere "Privato" oppure "Azienda".');
  }

  const codiceFiscale = entityInputValue_(data, ['codiceFiscale', 'codice_fiscale']);
  const partitaIva = entityInputValue_(data, ['partitaIva', 'partitaIVA', 'partita_iva']);
  const regime = entityInputValue_(data, ['regime']);
  if (codiceFiscale.length > 32 || partitaIva.length > 32 || regime.length > 100) {
    throw new Error('Codice fiscale, partita IVA o regime superano la lunghezza consentita.');
  }

  return {
    nome: nome,
    tipologia: tipologia,
    codiceFiscale: codiceFiscale,
    partitaIva: partitaIva,
    regime: regime
  };
}

function entityInputValue_(data, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    if (data[keys[index]] !== undefined && data[keys[index]] !== null) {
      return String(data[keys[index]]).trim();
    }
  }
  return '';
}

function assertEntityNameAvailable_(indexSheet, name) {
  const lastRow = indexSheet.getLastRow();
  if (lastRow < 2) return;
  const existingNames = indexSheet.getRange(2, 2, lastRow - 1, 1).getValues();
  const normalizedName = name.toLocaleLowerCase();
  if (existingNames.some(row => String(row[0]).trim().toLocaleLowerCase() === normalizedName)) {
    throw new Error('Esiste già un’entità con questo nome.');
  }
}

function initializeEntitySpreadsheet_(spreadsheet, entity) {
  const schemas = [
    { name: 'Anagrafica', headers: ['Codice_Fiscale', 'Partita_IVA', 'Regime'] },
    {
      name: 'Movimenti_PD',
      headers: ['Data', 'ID', 'Conto', 'Descrizione', 'Gestione', 'Dare', 'Avere']
    },
    { name: 'Piano_Conti', headers: ['Codice', 'Descrizione', 'Tipo', 'Gestione', 'Attivo'] },
    {
      name: 'Fatture',
      headers: ['ID', 'Anno', 'Numero', 'Data', 'Cliente', 'Totale', 'Stato', 'Dettaglio JSON']
    },
    { name: 'Clienti', headers: ['ID', 'Dettaglio JSON'] },
    { name: 'Fornitori', headers: ['ID', 'Dettaglio JSON'] }
  ];

  const firstSheet = spreadsheet.getSheets()[0];
  firstSheet.setName(schemas[0].name);
  schemas.forEach((schema, index) => {
    const sheet = index === 0 ? firstSheet : spreadsheet.insertSheet(schema.name);
    sheet.getRange(1, 1, 1, schema.headers.length)
      .setValues([schema.headers])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  });
  firstSheet.getRange(2, 1, 1, 3).setValues([[
    entity.codiceFiscale,
    entity.partitaIva,
    entity.regime
  ]]);
}
