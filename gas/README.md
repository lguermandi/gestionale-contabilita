# Web app GAS

Google Apps Script è l'unico backend dell'app. Il client React viene pubblicato
su GitHub Pages o eseguito tramite Capacitor e legge i fogli annuali collegati
al progetto GAS.

## Configurazione iniziale

1. Apri il progetto Apps Script associato al file `.clasp.json` locale. Un account già configurato prima di questa versione mantiene il foglio contabile collegato; ogni account provisionato da ora in poi sceglie la propria destinazione e riceve un foglio separato.
2. Per ogni account autorizzato, in **Impostazioni progetto → Proprietà script**, aggiungi temporaneamente:
   - `APP_SETUP_USERNAME`: il nome utente scelto.
   - `APP_SETUP_PASSWORD`: una password nuova di almeno 12 caratteri.
3. Nell'editor Apps Script esegui `configureCredentials_`. La funzione crea o aggiorna solo l'account indicato, salva la password come hash PBKDF2 con salt e rimuove le due proprietà temporanee. Ripeti i passaggi 2-3 per ogni nuovo account provisionato dall'amministratore. Non inviare né salvare le password nel repository.
4. Esegui `authorizeSpreadsheet_` e autorizza l'accesso a Drive e ai fogli Google con l'account proprietario del progetto.
5. Pubblica da **Deploy → New deployment → Web app** con esecuzione come te. L'accesso del deployment può restare anonimo perché i metodi che leggono dati richiedono il login dell'app.
6. Imposta `VITE_API_BASE_URL` all'URL `/exec` pubblico del deployment.

Al primo accesso di un account senza spazio dati, l'utente inserisce il link o l'ID
di una cartella Drive padre. La cartella deve essere accessibile all'account
proprietario del deployment GAS: la creazione avviene nel Drive di tale account,
non nel Drive personale dell'utente che ha effettuato il login. GAS crea sotto
la destinazione una cartella `username - Gestionale contabile`, con le
sottocartelle `Contabilità`, `Fatture`, `Spese` e `Documenti/Allegati spese`.
Nella cartella `Contabilità` crea il foglio Google `Gestionale contabile -
username`, con registri annuali, fatture, note di credito, clienti, fornitori e
spese. Le successive operazioni dell'account sono instradate al proprio foglio.
Gli account provisionati successivamente non condividono i dati degli altri
utenti. L'account già collegato al foglio contabile mantiene i dati esistenti.

Per aggiornare il codice, esegui `clasp push` dalla cartella del progetto e crea una nuova versione del deployment Web App. I file `.clasp.json` e `Config.js` contengono riferimenti al progetto e ai dati personali: non aggiungerli al repository.

## API diretta per React

Il client React invia direttamente POST JSON all'URL `/exec` del deployment GAS,
con `Content-Type: text/plain;charset=utf-8` e `mode: 'cors'`. Il tipo di
contenuto semplice evita il preflight OPTIONS; `doPost` legge il JSON da
`event.postData.contents` e restituisce JSON con `ContentService.MimeType.JSON`.
La risposta del deployment è leggibile dal browser dopo il redirect GAS.

Il deployment deve includere le azioni JSON `login`, `getWorkspaceSetupStatus`,
`initializeWorkspace`, `getTransactions`, `appendTransaction`, `getInvoices` e
`issueInvoice` implementate in `API.js`.
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
