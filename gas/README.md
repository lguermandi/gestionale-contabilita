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

## Protezioni

- Le richieste dati passano solo tramite `google.script.run` e richiedono un token di sessione non condiviso nell'URL.
- Le sessioni scadono dopo sei ore e vengono invalidate con **Esci**.
- La password non è inclusa nel codice; viene derivata con PBKDF2-HMAC-SHA256 e 60.000 iterazioni.
- Le risposte contabili non sono memorizzate nella cache.
- Il deployment esegue come proprietario: proteggi l'accesso editor al progetto Apps Script e al foglio Google.

Per dismettere la vecchia pagina, disattiva GitHub Pages in **Settings → Pages** del repository. La rimozione del workflow ferma le nuove pubblicazioni, ma GitHub può continuare a servire l'ultima copia finché Pages non viene disattivato.
