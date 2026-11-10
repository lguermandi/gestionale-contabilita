# Gestionale Contabile

## Avvio locale

Dalla radice del repository:

```sh
npm ci
npm run dev --workspace apps/web
```

La build web si verifica con `npm run build --workspace apps/web`.

## Pubblicazione

Il workflow `Deploy frontend to GitHub Pages` pubblica la build web su
<https://lguermandi.github.io/gestionale-contabilita/> a ogni push su `main`
che modifica `apps/web`, oltre che su richiesta manuale.

Il workflow `Build Android APK` genera un APK debug a ogni push su `main` che
modifica l'app. Per scaricarlo, aprire la relativa esecuzione in **Actions** e
scaricare l'artifact `gestionale-contabile-debug`. L'artifact è conservato per
90 giorni; è un APK debug, non un pacchetto firmato per il Play Store.

GitHub Pages ospita il client statico. Per usare sincronizzazione e accesso a
GAS anche dal sito pubblicato serve un backend raggiungibile pubblicamente e la
variabile GitHub Actions `VITE_API_BASE_URL` impostata al suo URL. In sua
assenza, le funzioni che richiedono il backend non sono disponibili sul sito.
