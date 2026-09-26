interface GoogleUserInfo {
  name: string
  email: string
  picture: string
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string }) => void
      }) => TokenClient
    }
  }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
  callback: (response: TokenResponse) => void
}

const SCOPES = 'email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'

let tokenClient: TokenClient | null = null
let cachedToken: { value: string; expiresAt: number } | null = null
let pendingReject: ((err: Error) => void) | null = null
const TOKEN_CACHE_KEY = 'shift_gis_token'

function waitForGoogle(): Promise<void> {
  return new Promise(resolve => {
    if (typeof google !== 'undefined') { resolve(); return }
    const id = setInterval(() => {
      if (typeof google !== 'undefined') { clearInterval(id); resolve() }
    }, 100)
    setTimeout(() => { clearInterval(id); resolve() }, 8000)
  })
}

export async function initGoogleAuth(clientId: string): Promise<void> {
  await waitForGoogle()
  if (typeof google === 'undefined') return
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
    error_callback: (err: { type: string }) => {
      if (pendingReject) {
        const fn = pendingReject
        pendingReject = null
        fn(new Error(err.type === 'popup_closed' ? 'ログインをキャンセルしました' : (err.type || '認証エラー')))
      }
    },
  })
}

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google認証が準備できていません。ページを再読み込みしてください。'))
      return
    }

    const timer = setTimeout(() => {
      pendingReject = null
      reject(new Error('タイムアウトしました。再度お試しください。'))
    }, 120_000)

    pendingReject = (err) => { clearTimeout(timer); reject(err) }

    tokenClient.callback = (resp) => {
      clearTimeout(timer)
      pendingReject = null
      if (resp.error) { reject(new Error(resp.error)); return }
      cachedToken = { value: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 }
      try { sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cachedToken)) } catch {}
      resolve(resp.access_token)
    }

    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export async function getValidToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value
  try {
    const stored = sessionStorage.getItem(TOKEN_CACHE_KEY)
    if (stored) {
      const parsed: { value: string; expiresAt: number } = JSON.parse(stored)
      if (parsed?.expiresAt && Date.now() < parsed.expiresAt - 60_000) {
        cachedToken = parsed
        return cachedToken.value
      }
    }
  } catch {}
  return requestAccessToken()
}

export function clearToken() {
  cachedToken = null
  try { sessionStorage.removeItem(TOKEN_CACHE_KEY) } catch {}
}

/** キャッシュ済みの有効なトークンがあるか（OAuth ポップアップを出さずに確認） */
export function hasCachedToken(): boolean {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return true
  try {
    const stored = sessionStorage.getItem(TOKEN_CACHE_KEY)
    if (stored) {
      const parsed: { value: string; expiresAt: number } = JSON.parse(stored)
      if (parsed?.expiresAt && Date.now() < parsed.expiresAt - 60_000) return true
    }
  } catch {}
  return false
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch user info')
  return res.json()
}
