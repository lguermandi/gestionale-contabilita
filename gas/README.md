# Web app GAS

Google Apps Script è l'unico backend dell'app. Il client React viene pubblicato
su GitHub Pages o eseguito tramite Capacitor e legge i fogli annuali associati
all'account GAS autenticato. Gli account esistenti mantengono il foglio collegato
al progetto.

## Configurazione iniziale

1. Apri il progetto Apps Script associato al file `.clasp.json` locale. Un account già configurato prima di questa versione mantiene il foglio contabile collegato; ogni account provisionato da ora in poi sceglie la propria destinazione e riceve un foglio separato.
2. Per ogni account autorizzato, in **Impostazioni progetto → Proprietà script**, aggiungi temporaneamente:
   - `APP_SETUP_USERNAME`: il nome utente scelto.
   - `APP_SETUP_PASSWORD`: una password nuova di almeno 12 caratteri.
3. Nell'editor Apps Script esegui `configureCredentials_`. La funzione crea o aggiorna solo l'account indicato, salva la password come hash PBKDF2 con salt e rimuove le due proprietà temporanee. Ripeti i passaggi 2-3 per ogni nuovo account provisionato dall'amministratore. Non inviare né salvare le password nel repository.
4. In **Impostazioni progetto → Proprietà script**, imposta `APP_GAS_OWNER_EMAIL` con l'indirizzo Google dell'account che esegue il deployment come proprietario; poi esegui `authorizeSpreadsheet_` e autorizza l'accesso a Drive e ai fogli Google. Questa proprietà evita di richiedere lo scope OAuth `userinfo.email`.
5. Pubblica da **Deploy → New deployment → Web app** con esecuzione come te. L'accesso del deployment può restare anonimo perché i metodi che leggono dati richiedono il login dell'app.
6. Imposta `VITE_API_BASE_URL` all'URL `/exec` pubblico del deployment.

Quando si seleziona il profilo **Azienda**, l'utente sceglie con Google OAuth
l'account e una cartella padre tramite Google Drive Picker. L'app crea in
quell'account `Gestionale contabile - username` e condivide **solo la nuova
cartella** con l'account di esecuzione GAS, necessario per le successive
operazioni. L'autorizzazione Google usa lo scope `drive.file`; l'access token
resta in memoria e non viene salvato. I dati iniziali sono vuoti.

### Struttura delle entità contabili

`Entities.js` crea una cartella radice `Gestionale Contabilita` sul Drive
dell'account di esecuzione GAS e un unico spreadsheet `Index_Entita` al suo
interno. Esegui `initSystem()` dall'editor Apps Script per inizializzare o
recuperare questi riferimenti. Il foglio `Entita` contiene
`ID`, `Nome_Entita`, `Tipologia`, `Folder_ID`,
`Struttura_Spreadsheet_ID` e `Movimenti_Spreadsheet_ID`. Per aggiungere un'entità esegui
`createNewEntity({nome, tipo, codiceFiscale, partitaIva, regime})`, dove `tipo`
è `Privato` o `Azienda`. Ogni entità riceve una sottocartella con uno
spreadsheet strutturale `Contabilità - [Nome Entità]` e un database movimenti
separato. Per la prima entità privata viene riutilizzato il Google Sheet
esistente chiamato `Master contabile`, se presente e non già associato a
un'entità; altrimenti viene creato un nuovo spreadsheet dei movimenti. I suoi
tab contabili sono nominati per anno.

Se l'indice usa lo schema precedente, `initSystem()` e le API che lo leggono
eseguono la migrazione: il vecchio spreadsheet diventa il database movimenti,
i tab strutturali sono copiati nel nuovo file dedicato e i dati in
`Movimenti_PD` sono distribuiti nei tab annuali. Le copie strutturali legacy
vengono rimosse dal database movimenti solo dopo essere state copiate.

Lo spazio contiene le cartelle `Contabilità`, `Fatture emesse`, `Ricevute`,
`Estratti conto`, `Spese` e `Documenti/Allegati spese`. In `Contabilità` viene
creato un foglio Google con registri annuali, fatture, note di credito, clienti,
fornitori e spese. Le operazioni dell'account sono instradate al suo foglio; gli
account provisionati successivamente hanno spazi separati. Un account già
collegato al foglio contabile prima di questa versione mantiene i dati esistenti.

### Configurazione Google Drive Picker

1. In Google Cloud crea/seleziona un progetto, abilita **Google Drive API** e
   **Google Picker API**, e collega allo stesso progetto Cloud il progetto Apps
   Script (Impostazioni progetto → Progetto Google Cloud).
2. Configura la schermata di consenso OAuth e crea un **ID client OAuth Web**.
   Aggiungi come origini JavaScript autorizzate `https://lguermandi.github.io`
   e `http://localhost:5173` per i test locali. Se usi un dominio diverso,
   aggiungi la sua origine esatta.
3. Crea una API key, limita le API abilitate a Drive API e Picker API e limita
   i referrer HTTP a `https://lguermandi.github.io/*` e
   `http://localhost:5173/*`. L'ID client, la API key e il numero progetto sono
   identificatori pubblici, non password.
4. In GitHub → **Settings → Secrets and variables → Actions → Variables**
   crea queste variabili di repository:
   - `GOOGLE_OAUTH_CLIENT_ID`: ID client OAuth Web.
   - `GOOGLE_DRIVE_API_KEY`: API key.
   - `GOOGLE_CLOUD_PROJECT_NUMBER`: numero del progetto Cloud, usato da Picker.
5. Pubblica il workflow Pages per ricompilare il client con queste variabili.
   Dopo aver caricato il codice GAS, crea una nuova versione del deployment
   Web App: le API precedentemente non pubblicate restituiscono
   `Azione non supportata`.

La selezione Google Drive è disponibile dal browser web. Se stai usando Android
e devi ancora creare lo spazio, apri il gestionale nel browser, completa lì
l'autorizzazione e poi torna nell'app.

Per aggiornare il codice, esegui `clasp push` dalla cartella del progetto e crea una nuova versione del deployment Web App. I file `.clasp.json` e `Config.js` contengono riferimenti al progetto e ai dati personali: non aggiungerli al repository.

## API diretta per React

Il client React invia direttamente POST JSON all'URL `/exec` del deployment GAS,
con `Content-Type: text/plain;charset=utf-8` e `mode: 'cors'`. Il tipo di
contenuto semplice evita il preflight OPTIONS; `doPost` legge il JSON da
`event.postData.contents` e restituisce JSON con `ContentService.MimeType.JSON`.
La risposta del deployment è leggibile dal browser dopo il redirect GAS.

Il deployment deve includere le azioni JSON `login`, `getEntities`,
`createNewEntity`, `getWorkspaceSetupStatus`, `initializeWorkspace`,
`getTransactions`, `getTransactionHistory`, `appendTransaction`, `getInvoices`
e `issueInvoice` implementate in `API.js`.

Le API contabili ricevono `spreadsheetId` (ID del file movimenti) per instradare
le registrazioni al tab dell'anno richiesto. Le letture e scritture di anagrafiche,
fatture, clienti, fornitori, note di credito e spese usano invece il file
strutturale associato. GAS risolve gli ID tramite `Index_Entita` prima di aprire
i file. Le chiamate legacy senza questo campo mantengono il comportamento
preesistente.

`getTransactionHistory` restituisce i movimenti dei fogli annuali esistenti fino
all'anno richiesto; il prospetto patrimoniale li usa per riportare i saldi di
chiusura come saldi iniziali dell'esercizio successivo.

Dopo `clasp push`, crea una nuova versione del deployment Web App. L'accesso
usa le credenziali GAS configurate sopra; il token di sessione resta in memoria
nel client e scade dopo sei ore.

I fogli annuali esistenti restano l'entità privata; le registrazioni aziendali
sono salvate in fogli separati `AZIENDA_<anno>`, creati al primo inserimento.
Le fatture emesse sono registrate nel foglio `Fatture` con numero progressivo
per anno, payload JSON e stato. Ogni registrazione usa la colonna B, ignorata
dal parser contabile, per l'ID idempotente. GAS valida e ricalcola importi e
scritture contabili.

Il PDF generato è un documento di cortesia e non è una fattura elettronica XML
trasmessa al Sistema di Interscambio (SDI). Prima di usarlo per adempimenti
fiscali, verifica aliquote, ritenute, contributi e trattamento applicabile con
il commercialista; il piano dei conti aziendale va configurato nelle
Impostazioni.

## Registrazioni offline Android

La web app salva ogni nuova scrittura in IndexedDB tramite Dexie prima di
tentare la sincronizzazione, con stato `pending`, entità e anno. Quando il
plugin Capacitor Network segnala il ritorno online, il browser torna online,
l'app rientra in primo piano o viene effettuato il login GAS, le scritture
pending vengono inviate in ordine direttamente a GAS. Dopo la conferma
diventano `synced`; in caso di errore restano in coda per un tentativo
successivo. Lo stesso ID usato come chiave locale è conservato nella colonna B
del foglio, rendendo il retry idempotente.

Il login è richiesto solo per sincronizzare, non per inserire offline. La coda
resta sul dispositivo finché non viene sincronizzata; cancellare i dati
dell'app o del browser prima del sync può eliminarla. Dopo aver aggiunto o
aggiornato plugin nativi, esegui `npx cap sync android` da `apps/web`.

## Protezioni

- La pagina GAS legacy usa `google.script.run`; React usa le stesse azioni JSON
  POST via `/exec`. Le operazioni contabili richiedono entrambe un token di
  sessione non condiviso nell'URL.
- Le sessioni scadono dopo sei ore e vengono invalidate con **Esci**.
- Le credenziali GAS non sono persistite nel client; il token di sessione resta in memoria.
  Le scritture offline sono invece conservate localmente in IndexedDB fino alla
  sincronizzazione.
- La password non è inclusa nel codice; viene derivata con PBKDF2-HMAC-SHA256 e
  60.000 iterazioni.
- Le risposte contabili non sono memorizzate nella cache.
- Il deployment esegue come proprietario: proteggi l'accesso editor al progetto
  Apps Script e al foglio Google.
