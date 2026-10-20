function aggiornaDatiDaExcel() {
  const ssMaster = SpreadsheetApp.getActiveSpreadsheet();
  let foglioDestinazione = ssMaster.getSheetByName(CONFIG.NOME_FOGLIO_DESTINAZIONE);
  
  if (!foglioDestinazione) {
    foglioDestinazione = ssMaster.insertSheet(CONFIG.NOME_FOGLIO_DESTINAZIONE);
  }

  const fileExcel = DriveApp.getFileById(CONFIG.ID_FILE_EXCEL_OPERATIVO);
  const tempFileId = Drive.Files.copy(
    { title: "Temp_Bilancio_Convertito", mimeType: MimeType.GOOGLE_SHEETS }, 
    fileExcel.getId()
  ).id;

  try {
    const ssTemp = SpreadsheetApp.openById(tempFileId);
    
    // MODIFICA QUI: Cerca esattamente il foglio chiamato "pd"
    const foglioOrigine = ssTemp.getSheetByName(CONFIG.NOME_FOGLIO_ORIGINE); 
    
    // Controllo di sicurezza: se il foglio "pd" non esiste, ferma lo script
    if (!foglioOrigine) {
      throw new Error("Il foglio '" + CONFIG.NOME_FOGLIO_ORIGINE + "' non è stato trovato nel file Excel.");
    }
    
    const ultimaRiga = foglioOrigine.getLastRow();
    if (ultimaRiga > 1) {
      const datiGrezzi = foglioOrigine.getRange(`A2:G${ultimaRiga}`).getValues();
      
      foglioDestinazione.clearContents();
      foglioDestinazione.getRange(1, 1, datiGrezzi.length, datiGrezzi[0].length).setValues(datiGrezzi);
    }
  } catch (error) {
    console.error("Errore durante l'ETL: " + error);
  } finally {
    DriveApp.getFileById(tempFileId).setTrashed(true);
  }
}