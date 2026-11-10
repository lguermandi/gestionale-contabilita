# Web app GAS

La dashboard viene eseguita come web app di Google Apps Script, legge i fogli annuali dal foglio Google collegato al progetto e non richiede il backend Node né GitHub Pages.

## Configurazione iniziale

1. Apri il progetto Apps Script associato al file `.clasp.json` locale e conferma che sia collegato al foglio contabile.
2. In **Impostazioni progetto → Proprietà script**, aggiungi temporaneamente:
   - `APP_SETUP_USERNAME`: il nome utente scelto.
   - `APP_SETUP_PASSWORD`: una password nuova di almeno 12 caratteri.
3. Nell'editor Apps Script esegui `configureCredentials_`. Lo script salva la password come hash PBKDF2 con salt e rimuove le due proprietà temporanee. Non inviare né salvare la password nel repository.
4. Esegui `authorizeSpreadsheet_` e autorizza l'accesso al foglio con l'account proprietario del progetto.
5. Pubblica da **Deploy → New deployment → Web app** con esecuzione come te. L'accesso del deployment può restare anonimo perché i metodi che leggono dati richiedono il login dell'app.
6. Apri l'URL che termina in `/exec` da computer o telefono e accedi con le credenziali impostate.

Per aggiornare il codice, esegui `clasp push` dalla cartella del progetto locale e crea una nuova versione del deployment esistente. I file `.clasp.json` e `Config.js` contengono riferimenti al progetto e ai dati personali: non aggiungerli al repository.

## Bridge API per React e Node

La nuova app React non chiama direttamente il deployment GAS dal browser. Il backend Node inoltra le richieste al suo URL `/exec`, configurato in `GAS_WEBHOOK_URL` nel file `.env` del backend. In locale, Vite inoltra `/api` al backend su `http://localhost:3000`.

Il deployment deve includere le azioni JSON `login`, `getTransactions`, `appendTransaction`, `getInvoices` e `issueInvoice` implementate in `API.js`. Dopo `clasp push`, crea una nuova versione del deployment Web App. L’accesso usa le stesse credenziali GAS documentate sopra; il token di sessione resta in memoria nel client e scade dopo sei ore.

I fogli annuali esistenti restano l’entità privata; le registrazioni aziendali sono salvate in fogli separati `AZIENDA_<anno>`, creati al primo inserimento. Le fatture emesse sono registrate nel foglio `Fatture` con numero progressivo per anno, payload JSON e stato. Ogni registrazione usa la colonna B, ignorata dal parser contabile, per l’ID idempotente. Il backend ricalcola importi e scrittura contabile, poi crea l’eventuale foglio aziendale.

Il PDF generato è un documento di cortesia e non è una fattura elettronica XML trasmessa al Sistema di Interscambio (SDI). Prima di usarlo per adempimenti fiscali, verifica aliquote, ritenute, contributi e trattamento applicabile con il commercialista; il piano dei conti aziendale va configurato nelle Impostazioni.

Per Android e per un deployment web remoto, imposta `VITE_API_BASE_URL` durante la build a un URL backend raggiungibile dal dispositivo, ad esempio `https://api.example.it/api`. Configura inoltre `ALLOWED_ORIGINS` sul backend per l’origine web effettiva. Non inserire password GAS o chiavi server in variabili `VITE_*`.

## Registrazioni offline Android

La web app salva ogni nuova scrittura in IndexedDB tramite Dexie prima di tentare la sincronizzazione, con stato `pending`, entità e anno. Quando il plugin Capacitor Network segnala il ritorno online, il browser torna online, l’app rientra in primo piano o viene effettuato il login GAS, le scritture pending vengono inviate in ordine al backend. Dopo la conferma diventano `synced`; in caso di errore restano in coda per un tentativo successivo. Lo stesso ID usato come chiave locale è conservato nella colonna B del foglio, rendendo il retry idempotente.

Il login è richiesto solo per sincronizzare, non per inserire offline. La coda resta sul dispositivo finché non viene sincronizzata; cancellare i dati dell’app o del browser prima del sync può eliminarla. Dopo aver aggiunto o aggiornato plugin nativi, esegui `npx cap sync android` da `apps/web`.

## Protezioni

- La pagina GAS legacy usa `google.script.run`; React/Node usa le azioni JSON POST. Le operazioni contabili richiedono entrambe un token di sessione non condiviso nell'URL.
- Le sessioni scadono dopo sei ore e vengono invalidate con **Esci**.
- Le credenziali GAS non sono persistite; il token di sessione resta in memoria. Le scritture offline sono invece conservate localmente in IndexedDB fino alla sincronizzazione.
- La password non è inclusa nel codice; viene derivata con PBKDF2-HMAC-SHA256 e 60.000 iterazioni.
- Le risposte contabili non sono memorizzate nella cache.
- Il deployment esegue come proprietario: proteggi l'accesso editor al progetto Apps Script e al foglio Google.

Per dismettere la vecchia pagina, disattiva GitHub Pages in **Settings → Pages** del repository. La rimozione del workflow ferma le nuove pubblicazioni, ma GitHub può continuare a servire l'ultima copia finché Pages non viene disattivato.
