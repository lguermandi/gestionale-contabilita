# Gestionale Contabile

## Avvio locale

Dalla radice del repository:

```sh
npm ci
npm run dev --workspace apps/web
```

Il client comunica direttamente con la Web App Google Apps Script configurata
in `VITE_API_BASE_URL`. In locale, se la variabile non è impostata, viene usato
l'URL pubblico `/exec` configurato nel client.

## Pubblicazione

Il workflow `Deploy frontend to GitHub Pages` pubblica la build web su
<https://lguermandi.github.io/gestionale-contabilita/> a ogni push su `main`
che modifica `apps/web`, oltre che su richiesta manuale. La build imposta
`VITE_API_BASE_URL` all'URL `/exec` della Web App GAS.

Il workflow `Build Android APK` genera un APK debug a ogni push su `main` che
modifica l'app. Il nome dell'APK e dell'artifact include la data e l'ora di
avvio della build nel fuso `Europe/Rome` (per esempio
`gestionale-contabile-2026-11-10_19-10-40.apk`). Per scaricarlo, aprire
la relativa esecuzione in **Actions** e scaricare l'artifact con il timestamp
corrispondente. L'artifact è conservato per 90 giorni; è un APK debug, non un
pacchetto firmato per il Play Store.

Le chiamate React inviano JSON in POST con `Content-Type: text/plain;charset=utf-8`
alla Web App GAS. Questo evita la richiesta preflight; la risposta JSON di GAS
viene letta normalmente con `mode: 'cors'`.
