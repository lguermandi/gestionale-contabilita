const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID
const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}

interface GooglePickerDocument {
  id?: string
  name?: string
  mimeType?: string
}

interface GooglePickerView {
  setMimeTypes: (mimeTypes: string) => GooglePickerView
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerView
  setIncludeFolders: (enabled: boolean) => GooglePickerView
}

interface GooglePickerBuilder {
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setAppId: (appId: string) => GooglePickerBuilder
  setOrigin: (origin: string) => GooglePickerBuilder
  addView: (view: GooglePickerView) => GooglePickerBuilder
  setCallback: (callback: (data: GooglePickerResponse) => void) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface GooglePickerResponse {
  action: string
  docs?: GooglePickerDocument[]
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string
        scope: string
        callback: (response: GoogleTokenResponse) => void
        error_callback: (error: { message?: string }) => void
      }) => GoogleTokenClient
    }
  }
  picker: {
    Action: { PICKED: string; CANCEL: string; ERROR?: string }
    ViewId: { FOLDERS: string }
    DocsView: new (viewId: string) => GooglePickerView
    PickerBuilder: new () => GooglePickerBuilder
  }
}

interface GoogleApi {
  load: (apiName: string, options: { callback: () => void }) => void
}

declare global {
  interface Window {
    google?: GoogleIdentity
    gapi?: GoogleApi
  }
}

export interface SelectedDriveFolder {
  id: string
  name: string
}

export interface GoogleDriveDestination {
  accountEmail: string
  accessToken: string
  parentFolder: SelectedDriveFolder
}

export interface CreatedDriveFolder extends SelectedDriveFolder {
  url: string
}

let googleScriptsPromise: Promise<void> | null = null
let pickerApiPromise: Promise<void> | null = null

function requireGoogleConfiguration() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY || !GOOGLE_APP_ID) {
    throw new Error('Selettore Google Drive non configurato. Completa la configurazione Google Cloud e ripubblica l’app.')
  }
}

function loadScript(id: string, source: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null
  if (existing?.dataset.loaded === 'true') return Promise.resolve()

  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script')
    script.id = id
    script.src = source
    script.async = true
    script.defer = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => {
      script.remove()
      reject(new Error('Impossibile caricare le librerie Google per Drive.'))
    }
    if (!existing) document.head.appendChild(script)
  })
}

async function loadGoogleLibraries() {
  if (!googleScriptsPromise) {
    googleScriptsPromise = Promise.all([
      loadScript('google-identity-services', 'https://accounts.google.com/gsi/client'),
      loadScript('google-api-client', 'https://apis.google.com/js/api.js'),
    ]).then(() => undefined).catch((error: unknown) => {
      googleScriptsPromise = null
      throw error
    })
  }
  await googleScriptsPromise

  if (!pickerApiPromise) {
    pickerApiPromise = new Promise<void>((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error('La libreria Google API non è disponibile.'))
        return
      }
      window.gapi.load('picker', { callback: resolve })
    }).catch((error: unknown) => {
      pickerApiPromise = null
      throw error
    })
  }
  await pickerApiPromise
  if (!window.google?.accounts.oauth2 || !window.google.picker) {
    throw new Error('Le API Google Drive non sono disponibili.')
  }
}

export async function preloadGoogleDrivePicker(): Promise<void> {
  requireGoogleConfiguration()
  await loadGoogleLibraries()
}

function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts.oauth2) {
      reject(new Error('Accesso Google non disponibile.'))
      return
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `openid email ${GOOGLE_DRIVE_FILE_SCOPE}`,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Autorizzazione Google Drive non riuscita.'))
          return
        }
        resolve(response.access_token)
      },
      error_callback: (error) => reject(new Error(error.message || 'Accesso Google annullato o non riuscito.')),
    })
    tokenClient.requestAccessToken({ prompt: 'select_account consent' })
  })
}

async function getGoogleAccountEmail(accessToken: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await readGoogleResponse<{ email?: string }>(response)
  if (!body.email) throw new Error('Google non ha restituito l’indirizzo dell’account selezionato.')
  return body.email
}

function selectDriveFolder(accessToken: string): Promise<SelectedDriveFolder | null> {
  return new Promise((resolve, reject) => {
    const google = window.google
    if (!google?.picker) {
      reject(new Error('Google Drive Picker non è disponibile.'))
      return
    }

    const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .setOrigin(window.location.origin)
      .addView(folderView)
      .setCallback((data) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null)
          return
        }
        if (google.picker.Action.ERROR && data.action === google.picker.Action.ERROR) {
          reject(new Error('Google Drive Picker non è riuscito a caricare la cartella selezionata.'))
          return
        }
        if (data.action !== google.picker.Action.PICKED) return
        const selected = data.docs?.[0]
        if (!selected?.id || !selected.name) {
          reject(new Error('La cartella scelta da Google Drive non è valida.'))
          return
        }
        resolve({ id: selected.id, name: selected.name })
      })
      .build()
    picker.setVisible(true)
  })
}

export async function chooseGoogleDriveDestination(): Promise<GoogleDriveDestination | null> {
  requireGoogleConfiguration()
  await loadGoogleLibraries()
  const accessToken = await requestGoogleAccessToken()
  const accountEmail = await getGoogleAccountEmail(accessToken)
  const parentFolder = await selectDriveFolder(accessToken)
  if (!parentFolder) return null
  return { accountEmail, accessToken, parentFolder }
}

export async function createWorkspaceDriveFolder(
  accessToken: string,
  parentFolderId: string,
  name: string,
): Promise<CreatedDriveFolder> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.replace(/[\\/:*?"<>|]/g, '_'),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  })
  const folder = await readGoogleResponse<{ id?: string; name?: string; webViewLink?: string }>(response)
  if (!folder.id || !folder.name) throw new Error('Google Drive non ha creato la cartella del gestionale.')
  return {
    id: folder.id,
    name: folder.name,
    url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
  }
}

export async function shareWorkspaceFolderWithBackend(
  accessToken: string,
  folderId: string,
  email: string,
): Promise<void> {
  const fields = encodeURIComponent('permissions(id,emailAddress,role,type)')
  const permissionsResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?fields=${fields}&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const permissions = await readGoogleResponse<{
    permissions?: Array<{ emailAddress?: string; role?: string }>
  }>(permissionsResponse)
  const existingPermission = permissions.permissions?.find(
    (permission) => permission.emailAddress?.toLowerCase() === email.toLowerCase(),
  )
  if (existingPermission?.role === 'writer' || existingPermission?.role === 'owner') return

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
    },
  )
  await readGoogleResponse(response)
}

async function readGoogleResponse<T = Record<string, never>>(response: Response): Promise<T> {
  let body: { error?: { message?: string } } & T
  try {
    body = await response.json() as { error?: { message?: string } } & T
  } catch {
    throw new Error('Risposta non valida dalle API Google Drive.')
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `Richiesta Google Drive non riuscita (${response.status}).`)
  }
  return body
}
