const ENTITY_SYSTEM_ROOT_NAME_ = 'Gestionale Contabilita';
const ENTITY_INDEX_NAME_ = 'Index_Entita';
const ENTITY_ROOT_PROPERTY_ = 'ENTITY_SYSTEM_ROOT_FOLDER_ID';
const ENTITY_INDEX_PROPERTY_ = 'ENTITY_INDEX_SPREADSHEET_ID';
const ENTITY_INDEX_HEADERS_ = [
  'ID',
  'Nome_Entita',
  'Tipologia',
  'Folder_ID',
  'Struttura_Spreadsheet_ID',
  'Movimenti_Spreadsheet_ID'
];
const ENTITY_STRUCTURE_SHEETS_ = [
  { name: 'Anagrafica', headers: ['Codice_Fiscale', 'Partita_IVA', 'Regime'] },
  { name: 'Impostazioni', headers: ['Campo', 'Valore'] },
  { name: 'Piano_Conti', headers: ['Codice', 'Descrizione', 'Tipo', 'Gestione', 'Attivo'] },
  {
    name: 'Fatture',
    headers: ['ID', 'Anno', 'Numero', 'Data', 'Cliente', 'Totale', 'Stato', 'Dettaglio JSON']
  },
  { name: 'Clienti', headers: ['ID', 'Dettaglio JSON'] },
  { name: 'Fornitori', headers: ['ID', 'Dettaglio JSON'] },
  {
    name: 'Collaboratori',
    headers: ['ID', 'Tipo', 'Nome', 'Codice Fiscale', 'IBAN', 'Email', 'Dettaglio JSON']
  },
  {
    name: 'Presenze',
    headers: ['ID', 'Anno', 'Mese', 'Collaboratore', 'Dettaglio JSON']
  },
  {
    name: 'Cedolini',
    headers: [
      'ID', 'Collaboratore', 'Anno', 'Mese', 'Tipologia', 'Lordo', 'Contributi',
      'Ritenute', 'TFR', 'Fondo pensione', 'Netto', 'Costo azienda', 'Stato',
      'Drive File ID', 'Drive File URL', 'Linked Issue Tx ID', 'Linked Payment Tx ID',
      'Dettaglio JSON'
    ]
  },
];
const ENTITY_MIGRATED_AUXILIARY_SHEETS_ = [
  {
    name: 'NoteCredito',
    headers: ['ID', 'Anno', 'Numero', 'Fattura origine', 'Data', 'Importo', 'Stato', 'Dettaglio JSON']
  },
  {
    name: 'Spese',
    headers: ['ID', 'Anno', 'Data', 'Fornitore', 'Totale', 'Documento', 'Stato', 'Dettaglio JSON']
  }
];
const ENTITY_MOVEMENT_HEADERS_ = [
  'Data', 'ID', 'Conto', 'Descrizione', 'Gestione', 'Dare', 'Avere',
  'Documento_Tipo', 'Documento_ID'
];
const ENTITY_LEGACY_INDEX_HEADERS_ = [
  'ID', 'Nome_Entita', 'Tipologia', 'Folder_ID', 'Spreadsheet_ID'
];
const BUSINESS_CHART_OF_ACCOUNTS_ = [
  ['1.01.01', 'Costi di impianto e ampliamento', 'Attività', 'Patrimoniale'],
  ['1.01.02', 'Costi di sviluppo', 'Attività', 'Patrimoniale'],
  ['1.01.03', 'Brevetti e diritti di utilizzazione', 'Attività', 'Patrimoniale'],
  ['1.01.04', 'Concessioni, licenze e marchi', 'Attività', 'Patrimoniale'],
  ['1.01.05', 'Avviamento', 'Attività', 'Patrimoniale'],
  ['1.01.06', 'Immobilizzazioni immateriali in corso', 'Attività', 'Patrimoniale'],
  ['1.02.01', 'Terreni e fabbricati', 'Attività', 'Patrimoniale'],
  ['1.02.02', 'Impianti e macchinari', 'Attività', 'Patrimoniale'],
  ['1.02.03', 'Attrezzature industriali e commerciali', 'Attività', 'Patrimoniale'],
  ['1.02.04', 'Altri beni materiali', 'Attività', 'Patrimoniale'],
  ['1.02.05', 'Immobilizzazioni materiali in corso', 'Attività', 'Patrimoniale'],
  ['1.03.01', 'Partecipazioni in imprese controllate', 'Attività', 'Patrimoniale'],
  ['1.03.02', 'Partecipazioni in imprese collegate', 'Attività', 'Patrimoniale'],
  ['1.03.03', 'Altre partecipazioni', 'Attività', 'Patrimoniale'],
  ['1.03.04', 'Crediti finanziari immobilizzati', 'Attività', 'Patrimoniale'],
  ['1.04.01', 'Rimanenze di materie prime', 'Attività', 'Patrimoniale'],
  ['1.04.02', 'Rimanenze di semilavorati', 'Attività', 'Patrimoniale'],
  ['1.04.03', 'Rimanenze di prodotti finiti', 'Attività', 'Patrimoniale'],
  ['1.04.04', 'Lavori in corso su ordinazione', 'Attività', 'Patrimoniale'],
  ['1.05.01', 'Crediti v/clienti', 'Attività', 'Patrimoniale'],
  ['1.05.02', 'Effetti attivi e ricevute bancarie', 'Attività', 'Patrimoniale'],
  ['1.05.03', 'Fatture da emettere', 'Attività', 'Patrimoniale'],
  ['1.05.04', 'Fondo svalutazione crediti', 'Attività', 'Patrimoniale'],
  ['1.05.05', 'Crediti v/controllate e collegate', 'Attività', 'Patrimoniale'],
  ['1.05.06', 'Crediti tributari', 'Attività', 'Patrimoniale'],
  ['1.05.07', 'IVA a credito', 'Attività', 'Patrimoniale'],
  ['1.05.08', 'Erario c/ritenute subite', 'Attività', 'Patrimoniale'],
  ['1.05.09', 'Imposte anticipate', 'Attività', 'Patrimoniale'],
  ['1.05.10', 'Crediti v/altri', 'Attività', 'Patrimoniale'],
  ['1.06.01', 'Banca c/c', 'Attività', 'Patrimoniale'],
  ['1.06.02', 'Depositi bancari e postali', 'Attività', 'Patrimoniale'],
  ['1.06.03', 'Assegni', 'Attività', 'Patrimoniale'],
  ['1.06.04', 'Cassa', 'Attività', 'Patrimoniale'],
  ['1.06.05', 'Valori bollati', 'Attività', 'Patrimoniale'],
  ['1.07.01', 'Ratei e risconti attivi', 'Attività', 'Patrimoniale'],
  ['2.01.01', 'Capitale sociale', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.02', 'Riserva legale', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.03', 'Riserve statutarie', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.04', 'Altre riserve', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.05', 'Utili portati a nuovo', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.06', 'Perdite portate a nuovo', 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.07', "Utile d'esercizio", 'Patrimonio netto', 'Patrimoniale'],
  ['2.01.08', "Perdita d'esercizio", 'Patrimonio netto', 'Patrimoniale'],
  ['2.02.01', 'Fondi per rischi e oneri', 'Passività', 'Patrimoniale'],
  ['2.02.02', 'Fondo imposte differite', 'Passività', 'Patrimoniale'],
  ['2.02.03', 'Fondo trattamento di fine rapporto', 'Passività', 'Patrimoniale'],
  ['2.03.01', 'Prestiti obbligazionari', 'Passività', 'Patrimoniale'],
  ['2.03.02', 'Mutui passivi', 'Passività', 'Patrimoniale'],
  ['2.03.03', 'Debiti v/banche', 'Passività', 'Patrimoniale'],
  ['2.03.04', 'Debiti v/altri finanziatori', 'Passività', 'Patrimoniale'],
  ['2.04.01', 'Debiti v/fornitori', 'Passività', 'Patrimoniale'],
  ['2.04.02', 'Fatture da ricevere', 'Passività', 'Patrimoniale'],
  ['2.04.03', 'Effetti passivi', 'Passività', 'Patrimoniale'],
  ['2.04.04', 'Debiti v/controllate e collegate', 'Passività', 'Patrimoniale'],
  ['2.05.01', 'IVA a debito', 'Passività', 'Patrimoniale'],
  ['2.05.02', 'Erario c/ritenute da versare', 'Passività', 'Patrimoniale'],
  ['2.05.03', 'Debiti per imposte correnti', 'Passività', 'Patrimoniale'],
  ['2.05.04', 'Debiti per imposta di bollo', 'Passività', 'Patrimoniale'],
  ['2.05.05', 'Debiti v/INPS e istituti previdenziali', 'Passività', 'Patrimoniale'],
  ['2.05.06', 'Contributi previdenziali', 'Passività', 'Patrimoniale'],
  ['2.05.07', 'Debiti v/dipendenti', 'Passività', 'Patrimoniale'],
  ['2.05.08', 'Acconti da clienti', 'Passività', 'Patrimoniale'],
  ['2.05.09', 'Debiti diversi', 'Passività', 'Patrimoniale'],
  ['2.06.01', 'Ratei e risconti passivi', 'Passività', 'Patrimoniale'],
  ['3.01.01', 'Costi per acquisti', 'Costo', 'Tipica'],
  ['3.01.02', 'Acquisti di materie prime', 'Costo', 'Tipica'],
  ['3.01.03', 'Acquisti di merci', 'Costo', 'Tipica'],
  ['3.01.04', 'Materiali di consumo', 'Costo', 'Tipica'],
  ['3.01.05', 'Resi, sconti e abbuoni su acquisti', 'Costo', 'Tipica'],
  ['3.02.01', 'Costi per servizi', 'Costo', 'Tipica'],
  ['3.02.02', 'Consulenze professionali', 'Costo', 'Tipica'],
  ['3.02.03', 'Lavorazioni di terzi', 'Costo', 'Tipica'],
  ['3.02.04', 'Utenze', 'Costo', 'Tipica'],
  ['3.02.05', 'Spese telefoniche e internet', 'Costo', 'Tipica'],
  ['3.02.06', 'Manutenzioni e riparazioni', 'Costo', 'Tipica'],
  ['3.02.07', 'Pubblicità e marketing', 'Costo', 'Tipica'],
  ['3.02.08', 'Trasporti e spedizioni', 'Costo', 'Tipica'],
  ['3.02.09', 'Assicurazioni', 'Costo', 'Tipica'],
  ['3.02.10', 'Spese bancarie', 'Costo', 'Finanziaria'],
  ['3.02.11', 'Spese amministrative e generali', 'Costo', 'Tipica'],
  ['3.03.01', 'Canoni di locazione', 'Costo', 'Tipica'],
  ['3.03.02', 'Leasing e noleggi', 'Costo', 'Tipica'],
  ['3.03.03', 'Licenze software e servizi digitali', 'Costo', 'Tipica'],
  ['3.04.01', 'Salari e stipendi', 'Costo', 'Tipica'],
  ['3.04.02', 'Oneri sociali', 'Costo', 'Tipica'],
  ['3.04.03', 'Accantonamento TFR', 'Costo', 'Tipica'],
  ['3.04.04', 'Altri costi del personale', 'Costo', 'Tipica'],
  ['3.05.01', 'Ammortamento immobilizzazioni immateriali', 'Costo', 'Tipica'],
  ['3.05.02', 'Ammortamento immobilizzazioni materiali', 'Costo', 'Tipica'],
  ['3.05.03', 'Svalutazione crediti e disponibilità', 'Costo', 'Tipica'],
  ['3.06.01', 'Imposte e tasse indirette', 'Costo', 'Fiscale'],
  ['3.06.02', 'Imposte sul reddito', 'Costo', 'Fiscale'],
  ['3.06.03', 'Sanzioni e interessi tributari', 'Costo', 'Fiscale'],
  ['3.07.01', 'Interessi passivi su mutui', 'Costo', 'Finanziaria'],
  ['3.07.02', 'Interessi passivi bancari', 'Costo', 'Finanziaria'],
  ['3.07.03', 'Perdite su cambi', 'Costo', 'Finanziaria'],
  ['3.08.01', 'Minusvalenze e sopravvenienze passive', 'Costo', 'Straordinaria'],
  ['3.08.02', 'Oneri diversi di gestione', 'Costo', 'Tipica'],
  ['4.01.01', 'Ricavi da servizi', 'Ricavo', 'Tipica'],
  ['4.01.02', 'Ricavi delle vendite', 'Ricavo', 'Tipica'],
  ['4.01.03', 'Ricavi per prestazioni professionali', 'Ricavo', 'Tipica'],
  ['4.01.04', 'Ricavi per lavori su ordinazione', 'Ricavo', 'Tipica'],
  ['4.01.05', 'Resi, sconti e abbuoni su vendite', 'Ricavo', 'Tipica'],
  ['4.02.01', 'Variazione rimanenze prodotti', 'Ricavo', 'Tipica'],
  ['4.02.02', 'Incrementi di immobilizzazioni per lavori interni', 'Ricavo', 'Tipica'],
  ['4.03.01', 'Contributi in conto esercizio', 'Ricavo', 'Tipica'],
  ['4.03.02', 'Altri ricavi e proventi', 'Ricavo', 'Tipica'],
  ['4.03.03', 'Rimborsi e riaddebiti', 'Ricavo', 'Tipica'],
  ['4.03.04', 'Plusvalenze e sopravvenienze attive', 'Ricavo', 'Straordinaria'],
  ['4.04.01', 'Interessi attivi bancari', 'Ricavo', 'Finanziaria'],
  ['4.04.02', 'Altri proventi finanziari', 'Ricavo', 'Finanziaria'],
  ['4.04.03', 'Utili su cambi', 'Ricavo', 'Finanziaria'],
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
    const structureSpreadsheet = SpreadsheetApp.create('Contabilità - ' + entity.nome);
    initializeEntityStructureSpreadsheet_(structureSpreadsheet, entity);
    DriveApp.getFileById(structureSpreadsheet.getId()).moveTo(folder);

    const movementsSpreadsheet = getOrCreateEntityMovementsSpreadsheet_(
      entity, folder, system.indexSheet
    );
    initializeEntityMovementsSpreadsheet_(movementsSpreadsheet);

    const id = Utilities.getUuid();
    const row = system.indexSheet.getLastRow() + 1;
    system.indexSheet.getRange(row, 1, 1, ENTITY_INDEX_HEADERS_.length).setValues([[
      id,
      entity.nome,
      entity.tipologia,
      folder.getId(),
      structureSpreadsheet.getId(),
      movementsSpreadsheet.getId()
    ]]);
    SpreadsheetApp.flush();

    return entityRecord_(id, entity.nome, entity.tipologia, folder.getId(),
      structureSpreadsheet.getId(), movementsSpreadsheet.getId());
  } finally {
    lock.releaseLock();
  }
}

function getEntities() {
  const system = getOrCreateEntitySystem_();
  const lastRow = system.indexSheet.getLastRow();
  if (lastRow < 2) return [];

  const entities = system.indexSheet.getRange(2, 1, lastRow - 1, ENTITY_INDEX_HEADERS_.length)
    .getValues()
    .map(row => entityRecord_(
      row[0], row[1], row[2], row[3], row[4], row[5]
    ));

  entities.filter(entity => entity.tipologia === 'Azienda').forEach(entity => {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(entity.structureSpreadsheetId);
      if (seedBusinessChartOfAccounts_(spreadsheet)) SpreadsheetApp.flush();
      ensurePayrollSheets_(spreadsheet);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  });
  return entities;
}

function linkPrivateEntityToMasterMovements() {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const system = getOrCreateEntitySystem_();
      const masterFile = findUniqueDriveFileByName_('Master contabile');
      if (!masterFile) {
        throw new Error('Non è stato trovato un Google Sheet chiamato "Master contabile".');
      }

      const lastRow = system.indexSheet.getLastRow();
      if (lastRow < 2) throw new Error('L’indice non contiene entità.');
      const rows = system.indexSheet.getRange(2, 1, lastRow - 1, ENTITY_INDEX_HEADERS_.length)
        .getValues();
      const privateRows = rows
        .map((row, index) => ({ row: row, sheetRow: index + 2 }))
        .filter(item => String(item.row[2]).trim().toLowerCase() === 'privato');
      if (privateRows.length !== 1) {
        throw new Error('Per collegare automaticamente il Master deve esserci una sola entità di tipo Privato.');
      }
      if (rows.some(row => String(row[5]) === masterFile.getId())
        && String(privateRows[0].row[5]) !== masterFile.getId()) {
        throw new Error('Il Master è già associato a un’altra entità.');
      }

      const entityRow = privateRows[0];
      const folder = DriveApp.getFolderById(String(entityRow.row[3]));
      const movementsSpreadsheet = SpreadsheetApp.openById(masterFile.getId());
      masterFile.moveTo(folder);
      system.indexSheet.getRange(entityRow.sheetRow, 6).setValue(movementsSpreadsheet.getId());
      SpreadsheetApp.flush();

      return {
        nomeEntita: String(entityRow.row[1]),
        movementsSpreadsheetId: movementsSpreadsheet.getId(),
        movementsSpreadsheetUrl: movementsSpreadsheet.getUrl()
      };
    } finally {
      lock.releaseLock();
    }
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
  const row = rows.find(item => String(item[4]) === id || String(item[5]) === id);
  if (!row) throw new Error('L’entità selezionata non esiste nell’indice.');
  return entityRecord_(row[0], row[1], row[2], row[3], row[4], row[5]);
}

function entityRecord_(id, name, type, folderId, structureSpreadsheetId, movementsSpreadsheetId) {
  const movementsId = String(movementsSpreadsheetId || '');
  return {
    id: String(id || ''),
    nomeEntita: String(name || ''),
    tipologia: String(type || ''),
    folderId: String(folderId || ''),
    structureSpreadsheetId: String(structureSpreadsheetId || ''),
    movementsSpreadsheetId: movementsId,
    spreadsheetId: movementsId
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
  ensureEntityIndexHeaders_(indexSheet, rootFolder);

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

function ensureEntityIndexHeaders_(sheet, rootFolder) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    setEntityIndexHeaders_(sheet);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ENTITY_INDEX_HEADERS_.length))
    .getValues()[0];
  if (ENTITY_INDEX_HEADERS_.every((header, index) => headers[index] === header)) return;
  if (!ENTITY_LEGACY_INDEX_HEADERS_.every((header, index) => headers[index] === header)) {
    throw new Error('Le intestazioni del file Index_Entita non corrispondono allo schema previsto.');
  }

  const legacyRows = lastRow < 2
    ? []
    : sheet.getRange(2, 1, lastRow - 1, ENTITY_LEGACY_INDEX_HEADERS_.length).getValues();
  const migratedRows = legacyRows.map(row => {
    const entityName = String(row[1] || '').trim();
    const folderId = String(row[3] || '').trim();
    const oldSpreadsheetId = String(row[4] || '').trim();
    if (!entityName || !folderId || !oldSpreadsheetId) {
      throw new Error('La riga indice legacy contiene dati incompleti e non può essere migrata.');
    }

    const folder = DriveApp.getFolderById(folderId);
    const legacySpreadsheet = SpreadsheetApp.openById(oldSpreadsheetId);
    const structure = getOrCreateMigratedStructureSpreadsheet_(
      legacySpreadsheet, folder, entityName
    );
    migrateLegacyMovementRows_(legacySpreadsheet);
    return [
      row[0], row[1], row[2], row[3], structure.getId(), oldSpreadsheetId
    ];
  });

  setEntityIndexHeaders_(sheet);
  if (migratedRows.length) {
    sheet.getRange(2, 1, migratedRows.length, ENTITY_INDEX_HEADERS_.length)
      .setValues(migratedRows);
  }
  SpreadsheetApp.flush();
}

function setEntityIndexHeaders_(sheet) {
  sheet.getRange(1, 1, 1, ENTITY_INDEX_HEADERS_.length)
    .setValues([ENTITY_INDEX_HEADERS_])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getOrCreateMigratedStructureSpreadsheet_(legacySpreadsheet, folder, entityName) {
  const structureName = 'Contabilità - ' + entityName;
  let existingFile = findUniqueEntityFile_(folder, structureName);
  if (existingFile && existingFile.getId() === legacySpreadsheet.getId()) {
    existingFile.setName('Movimenti PD - ' + entityName);
    existingFile = null;
  }
  const structure = existingFile
    ? SpreadsheetApp.openById(existingFile.getId())
    : SpreadsheetApp.create(structureName);
  if (!existingFile) DriveApp.getFileById(structure.getId()).moveTo(folder);

  ENTITY_STRUCTURE_SHEETS_.concat(ENTITY_MIGRATED_AUXILIARY_SHEETS_).forEach(schema => {
    const oldSheet = legacySpreadsheet.getSheetByName(schema.name);
    const targetSheet = structure.getSheetByName(schema.name);
    if (oldSheet && !targetSheet) {
      const copiedSheet = oldSheet.copyTo(structure);
      copiedSheet.setName(schema.name);
    } else if (!targetSheet) {
      const newSheet = structure.insertSheet(schema.name);
      newSheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
      newSheet.setFrozenRows(1);
    }
  });

  const sheets = structure.getSheets();
  sheets.forEach(sheet => {
    if (!ENTITY_STRUCTURE_SHEETS_.concat(ENTITY_MIGRATED_AUXILIARY_SHEETS_)
      .some(schema => schema.name === sheet.getName())
      && sheets.length > 1) {
      structure.deleteSheet(sheet);
    }
  });
  ENTITY_STRUCTURE_SHEETS_.concat(ENTITY_MIGRATED_AUXILIARY_SHEETS_).forEach(schema => {
    const oldSheet = legacySpreadsheet.getSheetByName(schema.name);
    if (oldSheet && legacySpreadsheet.getSheets().length > 1) {
      legacySpreadsheet.deleteSheet(oldSheet);
    }
  });
  return structure;
}

function migrateLegacyMovementRows_(spreadsheet) {
  const legacySheet = spreadsheet.getSheetByName('Movimenti_PD');
  if (legacySheet) {
    const lastRow = legacySheet.getLastRow();
    if (lastRow > 0) {
      const rows = legacySheet.getRange(1, 1, lastRow, 7).getValues();
      const byYear = {};
      rows.forEach(row => {
        const date = normalizeLedgerDate_(row[0]);
        const year = date.slice(0, 4);
        if (!/^\d{4}$/.test(year)) return;
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(row);
      });

      Object.keys(byYear).forEach(year => {
        let yearSheet = spreadsheet.getSheetByName(year);
        if (!yearSheet) yearSheet = spreadsheet.insertSheet(year);
        if (yearSheet.getLastRow() === 0) {
          yearSheet.getRange(1, 1, 1, ENTITY_MOVEMENT_HEADERS_.length)
            .setValues([ENTITY_MOVEMENT_HEADERS_])
            .setFontWeight('bold');
          yearSheet.setFrozenRows(1);
        }
        ensureMovementHeaders_(yearSheet);
        const existingIds = yearSheet.getLastRow() > 0
          ? yearSheet.getRange(1, 2, yearSheet.getLastRow(), 1).getValues().flat()
          : [];
        const missingRows = byYear[year].filter(row => row[5] || row[6])
          .filter(row => !row[1] || !existingIds.includes(row[1]));
        if (missingRows.length) {
          yearSheet.getRange(yearSheet.getLastRow() + 1, 1, missingRows.length, 7)
            .setValues(missingRows);
        }
      });
    }
    if (spreadsheet.getSheets().length > 1) {
      legacySheet.setName('Archivio_Movimenti_PD_legacy');
    }
  }

  const currentYear = String(new Date().getFullYear());
  if (!spreadsheet.getSheetByName(currentYear)) {
    spreadsheet.insertSheet(currentYear);
  }
  const movementArchiveSheet = spreadsheet.getSheetByName('Movimenti_PD');
  if (movementArchiveSheet && spreadsheet.getSheets().length > 1) {
    movementArchiveSheet.setName('Archivio_Movimenti_PD_legacy');
  }
  ENTITY_STRUCTURE_SHEETS_.concat(ENTITY_MIGRATED_AUXILIARY_SHEETS_).forEach(schema => {
    const oldSheet = spreadsheet.getSheetByName(schema.name);
    if (oldSheet && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(oldSheet);
    }
  });

  spreadsheet.getSheets().forEach(sheet => {
    if (/^\d{4}$/.test(sheet.getName()) && sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, ENTITY_MOVEMENT_HEADERS_.length)
        .setValues([ENTITY_MOVEMENT_HEADERS_])
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getName() === 'Foglio1' && sheet.getLastRow() === 0
      && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
    if (/^\d{4}$/.test(sheet.getName())) ensureMovementHeaders_(sheet);
  });
}

function normalizeLedgerDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const italianDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (italianDate) {
    return italianDate[3] + '-' + italianDate[2].padStart(2, '0')
      + '-' + italianDate[1].padStart(2, '0');
  }
  return '';
}

function getOrCreateEntityMovementsSpreadsheet_(entity, folder, indexSheet) {
  if (entity.tipologia === 'Privato') {
    const masterFile = findUniqueDriveFileByName_('Master contabile');
    const lastRow = indexSheet.getLastRow();
    const usedMovementIds = lastRow < 2
      ? []
      : indexSheet.getRange(2, 6, lastRow - 1, 1).getValues().flat().map(String);
    if (masterFile && !usedMovementIds.includes(masterFile.getId())) {
      const masterSpreadsheet = SpreadsheetApp.openById(masterFile.getId());
      masterFile.moveTo(folder);
      return masterSpreadsheet;
    }
  }

  const spreadsheet = SpreadsheetApp.create('Movimenti PD - ' + entity.nome);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
  return spreadsheet;
}

function findUniqueDriveFileByName_(name) {
  const files = DriveApp.getFilesByName(name);
  if (!files.hasNext()) return null;
  const file = files.next();
  if (files.hasNext()) {
    throw new Error('Esistono più file chiamati "' + name + '" su Google Drive.');
  }
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) {
    throw new Error('Il file "' + name + '" non è un Google Sheet.');
  }
  return file;
}

function initializeEntityStructureSpreadsheet_(spreadsheet, entity) {
  ENTITY_STRUCTURE_SHEETS_.forEach((schema, index) => {
    let sheet = spreadsheet.getSheetByName(schema.name);
    if (!sheet) {
      if (index === 0 && spreadsheet.getSheets().length === 1
        && spreadsheet.getSheets()[0].getLastRow() === 0) {
        sheet = spreadsheet.getSheets()[0];
        sheet.setName(schema.name);
      } else {
        sheet = spreadsheet.insertSheet(schema.name);
      }
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, schema.headers.length)
        .setValues([schema.headers])
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  spreadsheet.getSheetByName('Anagrafica').getRange(2, 1, 1, 3).setValues([[
    entity.codiceFiscale,
    entity.partitaIva,
    entity.regime
  ]]);
  if (entity.tipologia === 'Azienda') seedBusinessChartOfAccounts_(spreadsheet);
}

function seedBusinessChartOfAccounts_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Piano_Conti');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Piano_Conti');
  }
  if (sheet.getLastRow() > 1) return false;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ENTITY_STRUCTURE_SHEETS_[1].headers.length)
      .setValues([ENTITY_STRUCTURE_SHEETS_[1].headers])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.getRange(2, 1, BUSINESS_CHART_OF_ACCOUNTS_.length, 5)
    .setValues(BUSINESS_CHART_OF_ACCOUNTS_.map(account => [
      account[0], account[1], account[2], account[3], true
    ]));
  return true;
}

function initializeEntityMovementsSpreadsheet_(spreadsheet) {
  const currentYear = String(new Date().getFullYear());
  let yearSheet = spreadsheet.getSheetByName(currentYear);
  if (!yearSheet) {
    const sheets = spreadsheet.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
      yearSheet = sheets[0];
      yearSheet.setName(currentYear);
    } else {
      yearSheet = spreadsheet.insertSheet(currentYear);
    }
  }
  if (yearSheet.getLastRow() === 0) {
    yearSheet.getRange(1, 1, 1, ENTITY_MOVEMENT_HEADERS_.length)
      .setValues([ENTITY_MOVEMENT_HEADERS_])
      .setFontWeight('bold');
    yearSheet.setFrozenRows(1);
  }
  ensureMovementHeaders_(yearSheet);
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
