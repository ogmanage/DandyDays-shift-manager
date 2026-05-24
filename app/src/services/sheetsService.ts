import { AppData, Member, ShiftMonth, ShiftSlot, StaffResponse } from '@/types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// ── シート構成 ──────────────────────────────────
const TABS = {
  members:         { name: 'members',         headers: ['id','name','email','city','role','createdAt','lastAccessedAt'] },
  shift_months:    { name: 'shift_months',    headers: ['id','year','month','status','deadlineAt','publishedAt','closedAt'] },
  shift_slots:     { name: 'shift_slots',     headers: ['id','shiftMonthId','locationName','date','requiredCount','status','note'] },
  staff_responses: { name: 'staff_responses', headers: ['id','shiftSlotId','memberId','isAvailable','submittedAt','isAssigned'] },
} as const

type TabName = keyof typeof TABS

// ── ヘルパー ────────────────────────────────────
async function sheetsRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ── スプレッドシート作成 ─────────────────────────
export async function createSpreadsheet(token: string, title: string): Promise<string> {
  const body = {
    properties: { title },
    sheets: Object.values(TABS).map(tab => ({
      properties: { title: tab.name },
    })),
  }
  const res = await sheetsRequest('POST', BASE, token, body) as { spreadsheetId: string }
  const spreadsheetId = res.spreadsheetId

  // ヘッダー行を一括書き込み
  const data = Object.values(TABS).map(tab => ({
    range: `${tab.name}!A1`,
    values: [tab.headers],
  }))
  await sheetsRequest('POST', `${BASE}/${spreadsheetId}/values:batchUpdate`, token, {
    valueInputOption: 'RAW',
    data,
  })

  return spreadsheetId
}

// ── 全データ読み込み ────────────────────────────
export async function loadAllData(token: string, spreadsheetId: string): Promise<AppData> {
  const ranges = Object.values(TABS).map(t => `${t.name}!A1:Z`)
  const res = await sheetsRequest(
    'GET',
    `${BASE}/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join('&ranges=')}`,
    token
  ) as { valueRanges: Array<{ values?: string[][] }> }

  const [membersRaw, monthsRaw, slotsRaw, responsesRaw] = res.valueRanges

  return {
    members:        parseRows<Member>(membersRaw?.values),
    shiftMonths:    parseRows<ShiftMonth>(monthsRaw?.values),
    shiftSlots:     parseRows<ShiftSlot>(slotsRaw?.values),
    staffResponses: parseRows<StaffResponse>(responsesRaw?.values),
    currentAdminId: null,
  }
}

function parseRows<T>(values?: string[][]): T[] {
  if (!values || values.length < 2) return []
  const [headers, ...rows] = values
  return rows
    .filter(row => row.length > 0 && row[0])
    .map(row => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        const v = row[i] ?? ''
        // boolean 変換
        if (v === 'true') obj[h] = true
        else if (v === 'false') obj[h] = false
        // number 変換（year, month, requiredCount）
        else if (['year','month','requiredCount'].includes(h) && v !== '') obj[h] = Number(v)
        // null 変換
        else if (v === '') obj[h] = null
        else obj[h] = v
      })
      return obj as T
    })
}

function rowToValues(headers: readonly string[], obj: Record<string, unknown>): string[] {
  return headers.map(h => {
    const v = obj[h]
    if (v === null || v === undefined) return ''
    return String(v)
  })
}

// ── 行を追加 ──────────────────────────────────
export async function appendRow(
  token: string,
  spreadsheetId: string,
  tab: TabName,
  obj: Record<string, unknown>
): Promise<void> {
  const { name, headers } = TABS[tab]
  const values = [rowToValues(headers, obj)]
  await sheetsRequest(
    'POST',
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(name)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { values }
  )
}

// ── 行を更新（IDで検索して上書き） ──────────────
export async function updateRowById(
  token: string,
  spreadsheetId: string,
  tab: TabName,
  obj: Record<string, unknown>
): Promise<void> {
  const { name, headers } = TABS[tab]
  // 全行を読んで id が一致する行インデックスを探す
  const res = await sheetsRequest(
    'GET',
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(name)}!A:A`,
    token
  ) as { values?: string[][] }

  const rows = res.values ?? []
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === obj.id)
  if (rowIndex === -1) {
    // 存在しなければ追加
    await appendRow(token, spreadsheetId, tab, obj)
    return
  }

  const sheetRow = rowIndex + 1 // 1-indexed
  const values = [rowToValues(headers, obj)]
  await sheetsRequest(
    'PUT',
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(name)}!A${sheetRow}?valueInputOption=RAW`,
    token,
    { values }
  )
}

// ── 行を削除（IDで検索してクリア） ──────────────
export async function deleteRowById(
  token: string,
  spreadsheetId: string,
  tab: TabName,
  id: string
): Promise<void> {
  const { name, headers } = TABS[tab]
  const res = await sheetsRequest(
    'GET',
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(name)}!A:A`,
    token
  ) as { values?: string[][] }

  const rows = res.values ?? []
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === id)
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 1
  const emptyRow = [Array(headers.length).fill('')]
  await sheetsRequest(
    'PUT',
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(name)}!A${sheetRow}?valueInputOption=RAW`,
    token,
    { values: emptyRow }
  )
}

// ── スプレッドシートの存在確認 ───────────────────
export async function checkSpreadsheetExists(token: string, spreadsheetId: string): Promise<boolean> {
  try {
    await sheetsRequest('GET', `${BASE}/${spreadsheetId}?fields=spreadsheetId`, token)
    return true
  } catch {
    return false
  }
}

// ── 設定値の読み込み（settingsシート: key | value）──
export async function loadSettings(token: string, spreadsheetId: string): Promise<Record<string, string>> {
  try {
    const res = await sheetsRequest('GET', `${BASE}/${spreadsheetId}/values/settings!A1:B`, token) as { values?: string[][] }
    const values = res.values ?? []
    if (values.length < 2) return {}
    const result: Record<string, string> = {}
    values.slice(1).forEach(row => {
      if (row[0]) result[String(row[0])] = String(row[1] ?? '')
    })
    return result
  } catch {
    return {} // settingsシートが存在しない場合は空を返す
  }
}

// ── 設定値の保存（upsert）──────────────────────
export async function saveSetting(token: string, spreadsheetId: string, key: string, value: string): Promise<void> {
  try {
    // 既存キーを検索
    const res = await sheetsRequest('GET', `${BASE}/${spreadsheetId}/values/settings!A:A`, token) as { values?: string[][] }
    const rows = res.values ?? []
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === key)

    if (rowIndex !== -1) {
      const sheetRow = rowIndex + 1
      await sheetsRequest('PUT', `${BASE}/${spreadsheetId}/values/settings!A${sheetRow}:B${sheetRow}?valueInputOption=RAW`, token, { values: [[key, value]] })
    } else {
      await sheetsRequest('POST', `${BASE}/${spreadsheetId}/values/settings!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, { values: [[key, value]] })
    }
  } catch {
    // settingsシートが存在しない場合は作成してから保存
    try {
      await sheetsRequest('POST', `${BASE}/${spreadsheetId}:batchUpdate`, token, {
        requests: [{ addSheet: { properties: { title: 'settings' } } }]
      })
      await sheetsRequest('PUT', `${BASE}/${spreadsheetId}/values/settings!A1:B1?valueInputOption=RAW`, token, { values: [['key', 'value']] })
      await sheetsRequest('POST', `${BASE}/${spreadsheetId}/values/settings!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, { values: [[key, value]] })
    } catch {
      // 失敗しても続行（致命的でないため）
    }
  }
}
