const GAS_URL_KEY = 'shift_gas_url'
const DEFAULT_GAS_URL = (import.meta.env.VITE_GAS_URL as string) || ''

export function getGasUrl(): string | null {
  return localStorage.getItem(GAS_URL_KEY) || DEFAULT_GAS_URL || null
}

export function saveGasUrl(url: string): void {
  localStorage.setItem(GAS_URL_KEY, url)
}

export async function gasGet<T>(gasUrl: string, params: Record<string, string>): Promise<T> {
  const url = new URL(gasUrl)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}: GASへのアクセスに失敗しました`)

  const text = await res.text()

  // HTMLが返ってきた場合 → 認証が必要な状態でデプロイされている
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      'GASが認証ページを返しています。\n' +
      'Apps Scriptの「デプロイ設定」→「アクセスできるユーザー」を\n' +
      '「全員」に変更して再デプロイしてください。'
    )
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`GASからの応答が不正です（JSON形式ではありません）\n\n${text.slice(0, 200)}`)
  }

  // GASがerrorフィールドを返した場合
  if (data && typeof data === 'object' && 'error' in data) {
    const errMsg = (data as Record<string, string>).error
    if (errMsg?.includes('SPREADSHEET_ID')) {
      throw new Error('GASスクリプト内の SPREADSHEET_ID が未設定です。\nCode.gs の先頭にスプレッドシートIDを入力してください。')
    }
    throw new Error(`GASエラー: ${errMsg}`)
  }

  return data as T
}

// GASへのPOSTはContent-Type: text/plain でないとCORSエラーになる
export async function gasPost<T>(gasUrl: string, body: unknown): Promise<T> {
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GASエラー: ${res.status}`)

  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error('GASが認証ページを返しています。デプロイ設定を確認してください。')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('GASからの応答が不正です')
  }
}
