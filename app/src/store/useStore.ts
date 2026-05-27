import { useState, useCallback, useEffect } from 'react'
import { AppData, Member, ShiftMonth, ShiftSlot, StaffResponse } from '@/types'
import { initGoogleAuth, requestAccessToken, getValidToken, fetchUserInfo, clearToken } from '@/services/googleAuth'
import {
  createSpreadsheet, loadAllData, appendRow,
  updateRowById, deleteRowById, checkSpreadsheetExists,
  loadSettings, saveSetting,
} from '@/services/sheetsService'
import { saveGasUrl } from '@/services/gasService'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const DEFAULT_SHEET_ID = (import.meta.env.VITE_SPREADSHEET_ID as string) || ''
const DEFAULT_GAS_URL = (import.meta.env.VITE_GAS_URL as string) || ''
const GAS_URL_STORAGE_KEY = 'shift_gas_url'
const SHEET_ID_KEY = 'shift_spreadsheet_id'
const LOCAL_CACHE_KEY = 'shift_manager_cache'
const ADMIN_SESSION_KEY = 'shift_current_admin_id'

function generateId(): string {
  return crypto.randomUUID()
}

function emptyData(): AppData {
  return { members: [], shiftMonths: [], shiftSlots: [], staffResponses: [], currentAdminId: null }
}

function loadCache(): AppData {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    const currentAdminId = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? null
    if (raw) return { ...JSON.parse(raw), currentAdminId }
  } catch {}
  return emptyData()
}

function saveCache(data: AppData) {
  localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ ...data, currentAdminId: null }))
}

export type SyncStatus = 'idle' | 'syncing' | 'error'

export function useStore() {
  const [data, setData] = useState<AppData>(loadCache)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(
    () => localStorage.getItem(SHEET_ID_KEY)
  )
  const [isLoadingSheets, setIsLoadingSheets] = useState(false)

  // GISをアプリ起動時に初期化（ユーザーがボタンを押す前に準備完了させる）
  useEffect(() => {
    if (CLIENT_ID) initGoogleAuth(CLIENT_ID).catch(() => {})
  }, [])

  // ─── 楽観的更新 + バックグラウンドSync ─────────────────
  const update = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => {
      const next = updater(prev)
      saveCache(next)
      return next
    })
  }, [])

  const syncToSheets = useCallback(async (fn: (token: string, sheetId: string) => Promise<void>) => {
    const sheetId = localStorage.getItem(SHEET_ID_KEY)
    if (!sheetId || !CLIENT_ID) return
    try {
      setSyncStatus('syncing')
      const token = await getValidToken()
      await fn(token, sheetId)
      setSyncStatus('idle')
    } catch (e) {
      console.error('Sheets sync error:', e)
      setSyncStatus('error')
    }
  }, [])

  // ─── Google ログイン ─────────────────────────────────
  const loginWithGoogle = useCallback(async (): Promise<'needs_setup' | 'ready'> => {
    const token = await requestAccessToken()
    const userInfo = await fetchUserInfo(token)
    const sheetId = localStorage.getItem(SHEET_ID_KEY) || DEFAULT_SHEET_ID || null

    // ── シート未設定：初回セットアップへ ──────────────────
    if (!sheetId) {
      let newId = ''
      update(prev => {
        const isFirstAdmin = prev.members.filter(m => m.role === 'admin').length === 0
        let member = prev.members.find(m => m.email === userInfo.email)
        if (!member) {
          member = {
            id: generateId(), name: userInfo.name, email: userInfo.email, city: '',
            role: isFirstAdmin ? 'admin' : 'user',
            createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(),
          }
          newId = member.id
          return { ...prev, members: [...prev.members, member], currentAdminId: member.id }
        }
        newId = member.id
        const updated = prev.members.map(m =>
          m.id === member!.id ? { ...m, lastAccessedAt: new Date().toISOString() } : m
        )
        return { ...prev, members: updated, currentAdminId: member.id }
      })
      if (newId) sessionStorage.setItem(ADMIN_SESSION_KEY, newId)
      return 'needs_setup'
    }

    // ── シート設定済み：リモートデータを先に読んで権限チェック ──
    setIsLoadingSheets(true)
    try {
      // 環境変数由来のIDはオーナー以外アクセス権がない場合があるため存在チェックをスキップ
      const isEnvSheetId = !localStorage.getItem(SHEET_ID_KEY) && sheetId === DEFAULT_SHEET_ID
      if (!isEnvSheetId) {
        const exists = await checkSpreadsheetExists(token, sheetId)
        if (!exists) return 'needs_setup'
      }

      let remoteData
      try {
        remoteData = await loadAllData(token, sheetId)
      } catch {
        if (isEnvSheetId) {
          throw new Error(
            'スプレッドシートへのアクセス権がありません。\n' +
            '管理者（オーナー）に以下のスプレッドシートを「編集者」として共有してもらってください。\n' +
            `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
          )
        }
        return 'needs_setup'
      }

      // 管理者権限チェック
      let member = remoteData.members.find(m => m.email === userInfo.email)

      // メンバーが0人 or 自分が未登録の場合 → 最初のログインは自動で管理者登録
      if (!member && remoteData.members.filter(m => m.role === 'admin').length === 0) {
        const newMember: Member = {
          id: generateId(),
          name: userInfo.name,
          email: userInfo.email,
          city: '',
          role: 'admin',
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        }
        await appendRow(token, sheetId, 'members', newMember as unknown as Record<string, unknown>)
        remoteData.members = [...remoteData.members, newMember]
        member = newMember
      }

      if (!member || member.role !== 'admin') {
        throw new Error(
          '管理者権限がありません。\n' +
          'スタッフ管理画面にて管理者に権限付与を依頼してください。'
        )
      }

      // 環境変数経由で接続した場合はlocalStorageにも保存（次回起動を高速化）
      if (!localStorage.getItem(SHEET_ID_KEY) && sheetId) {
        localStorage.setItem(SHEET_ID_KEY, sheetId)
        setSpreadsheetId(sheetId)
      }

      // VITE_GAS_URLがあればlocalStorageに保存（新規管理者でも即利用可能）
      if (DEFAULT_GAS_URL && !localStorage.getItem(GAS_URL_STORAGE_KEY)) {
        saveGasUrl(DEFAULT_GAS_URL)
      }
      // スプレッドシートのsettingsからGAS URLを同期（上書き優先）
      const settings = await loadSettings(token, sheetId)
      if (settings.gas_url) {
        saveGasUrl(settings.gas_url)
      }
      setData(() => {
        const merged = { ...remoteData, currentAdminId: member.id }
        saveCache(merged)
        return merged
      })
      sessionStorage.setItem(ADMIN_SESSION_KEY, member.id)
    } finally {
      setIsLoadingSheets(false)
    }

    return 'ready'
  }, [update])

  // ─── シート新規作成 ──────────────────────────────────
  const createNewSheet = useCallback(async () => {
    setIsLoadingSheets(true)
    try {
      const token = await getValidToken()
      const id = await createSpreadsheet(token, 'シフト管理データ')
      localStorage.setItem(SHEET_ID_KEY, id)
      setSpreadsheetId(id)

      const currentData = loadCache()
      for (const m of currentData.members) {
        await appendRow(token, id, 'members', m as unknown as Record<string, unknown>)
      }
    } finally {
      setIsLoadingSheets(false)
    }
  }, [])

  // ─── 既存シートに接続 ────────────────────────────────
  const connectExistingSheet = useCallback(async (id: string) => {
    setIsLoadingSheets(true)
    try {
      const token = await getValidToken()
      const exists = await checkSpreadsheetExists(token, id)
      if (!exists) throw new Error('シートが見つかりません')

      const remoteData = await loadAllData(token, id)
      localStorage.setItem(SHEET_ID_KEY, id)
      setSpreadsheetId(id)

      setData(prev => {
        const merged = { ...remoteData, currentAdminId: prev.currentAdminId }
        saveCache(merged)
        return merged
      })
    } finally {
      setIsLoadingSheets(false)
    }
  }, [])

  // ─── データ更新（スプレッドシートから再読込）────────────
  const refreshData = useCallback(async () => {
    const sheetId = localStorage.getItem(SHEET_ID_KEY)
    if (!sheetId) return
    setIsLoadingSheets(true)
    try {
      const token = await getValidToken()
      const remoteData = await loadAllData(token, sheetId)
      setData(prev => {
        const merged = { ...remoteData, currentAdminId: prev.currentAdminId }
        saveCache(merged)
        return merged
      })
    } finally {
      setIsLoadingSheets(false)
    }
  }, [])

  // ─── スプレッドシート変更 ────────────────────────────────
  const changeSheet = useCallback(async (newSheetId: string) => {
    const trimmed = newSheetId.trim()
    if (!trimmed) throw new Error('シートIDを入力してください')
    setIsLoadingSheets(true)
    try {
      const token = await getValidToken()
      const exists = await checkSpreadsheetExists(token, trimmed)
      if (!exists) throw new Error('シートが見つかりません。IDを確認してください。')
      const remoteData = await loadAllData(token, trimmed)
      localStorage.setItem(SHEET_ID_KEY, trimmed)
      setSpreadsheetId(trimmed)
      setData(prev => {
        const merged = { ...remoteData, currentAdminId: prev.currentAdminId }
        saveCache(merged)
        return merged
      })
    } finally {
      setIsLoadingSheets(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    update(prev => ({ ...prev, currentAdminId: null }))
  }, [update])

  const disconnectSheet = useCallback(() => {
    localStorage.removeItem(SHEET_ID_KEY)
    setSpreadsheetId(null)
  }, [])

  // GAS URLをスプレッドシートに保存（他の管理者と共有するため）
  const saveGasUrlToSheet = useCallback(async (url: string) => {
    const sheetId = localStorage.getItem(SHEET_ID_KEY)
    if (!sheetId || !CLIENT_ID) return
    try {
      const token = await getValidToken()
      await saveSetting(token, sheetId, 'gas_url', url)
    } catch (e) {
      console.error('GAS URL保存エラー:', e)
    }
  }, [])

  const currentAdmin = data.members.find(m => m.id === data.currentAdminId) ?? null

  // ─── メンバー ────────────────────────────────────────
  const addMember = useCallback((member: Omit<Member, 'id' | 'createdAt' | 'lastAccessedAt' | 'role'>) => {
    const newMember: Member = {
      ...member, id: generateId(), role: 'user',
      createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(),
    }
    update(prev => ({ ...prev, members: [...prev.members, newMember] }))
    syncToSheets((token, id) => appendRow(token, id, 'members', newMember as unknown as Record<string, unknown>))
    return newMember
  }, [update, syncToSheets])

  const updateMemberRole = useCallback(async (memberId: string, role: 'user' | 'admin', operatorId: string) => {
    if (memberId === operatorId) throw new Error('自身の権限は変更できません')
    const admins = data.members.filter(m => m.role === 'admin')
    const target = data.members.find(m => m.id === memberId)
    if (target?.role === 'admin' && admins.length === 1) throw new Error('管理者が1名のため降格できません')
    const updated = { ...target!, role }
    const sheetId = localStorage.getItem(SHEET_ID_KEY)
    if (sheetId && CLIENT_ID) {
      const token = await getValidToken()
      await updateRowById(token, sheetId, 'members', updated as unknown as Record<string, unknown>)
    }
    update(prev => ({
      ...prev,
      members: prev.members.map(m => m.id === memberId ? { ...m, role } : m),
    }))
  }, [data.members, update])

  const updateMember = useCallback((memberId: string, patch: { name?: string; city?: string; email?: string }) => {
    let updated: Member | undefined
    update(prev => {
      const members = prev.members.map(m => {
        if (m.id !== memberId) return m
        updated = { ...m, ...patch }
        return updated
      })
      return { ...prev, members }
    })
    if (updated) syncToSheets((token, id) => updateRowById(token, id, 'members', updated! as unknown as Record<string, unknown>))
  }, [update, syncToSheets])

  const deleteMember = useCallback((memberId: string) => {
    update(prev => ({ ...prev, members: prev.members.filter(m => m.id !== memberId) }))
    syncToSheets((token, id) => deleteRowById(token, id, 'members', memberId))
  }, [update, syncToSheets])

  // ─── シフト月 ─────────────────────────────────────
  const createShiftMonth = useCallback((year: number, month: number) => {
    const existing = data.shiftMonths.find(m => m.year === year && m.month === month)
    if (existing) return existing
    const newMonth: ShiftMonth = {
      id: generateId(), year, month, status: 'draft',
      deadlineAt: null, publishedAt: null, closedAt: null,
    }
    update(prev => ({ ...prev, shiftMonths: [...prev.shiftMonths, newMonth] }))
    syncToSheets((token, id) => appendRow(token, id, 'shift_months', newMonth as unknown as Record<string, unknown>))
    return newMonth
  }, [data.shiftMonths, update, syncToSheets])

  const publishShiftMonth = useCallback((monthId: string, deadlineAt: string | null) => {
    let updated: ShiftMonth | undefined
    update(prev => {
      const months = prev.shiftMonths.map(m => {
        if (m.id !== monthId) return m
        updated = { ...m, status: 'published', publishedAt: new Date().toISOString(), deadlineAt }
        return updated
      })
      return { ...prev, shiftMonths: months }
    })
    if (updated) syncToSheets((token, id) => updateRowById(token, id, 'shift_months', updated! as unknown as Record<string, unknown>))
  }, [update, syncToSheets])

  const closeShiftMonth = useCallback((monthId: string) => {
    let updated: ShiftMonth | undefined
    update(prev => {
      const months = prev.shiftMonths.map(m => {
        if (m.id !== monthId) return m
        updated = { ...m, status: 'closed', closedAt: new Date().toISOString() }
        return updated
      })
      return { ...prev, shiftMonths: months }
    })
    if (updated) syncToSheets((token, id) => updateRowById(token, id, 'shift_months', updated! as unknown as Record<string, unknown>))
  }, [update, syncToSheets])

  // ─── シフト枠 ─────────────────────────────────────
  const addShiftSlot = useCallback((slot: Omit<ShiftSlot, 'id' | 'status'>) => {
    const newSlot: ShiftSlot = { ...slot, id: generateId(), status: 'draft' }
    update(prev => ({ ...prev, shiftSlots: [...prev.shiftSlots, newSlot] }))
    syncToSheets((token, id) => appendRow(token, id, 'shift_slots', newSlot as unknown as Record<string, unknown>))
    return newSlot
  }, [update, syncToSheets])

  const updateShiftSlot = useCallback((slotId: string, patch: Partial<ShiftSlot>) => {
    let updated: ShiftSlot | undefined
    update(prev => {
      const slots = prev.shiftSlots.map(s => {
        if (s.id !== slotId) return s
        updated = { ...s, ...patch }
        return updated
      })
      return { ...prev, shiftSlots: slots }
    })
    if (updated) syncToSheets((token, id) => updateRowById(token, id, 'shift_slots', updated! as unknown as Record<string, unknown>))
  }, [update, syncToSheets])

  const deleteShiftSlot = useCallback((slotId: string) => {
    update(prev => ({
      ...prev,
      shiftSlots: prev.shiftSlots.filter(s => s.id !== slotId),
      staffResponses: prev.staffResponses.filter(r => r.shiftSlotId !== slotId),
    }))
    syncToSheets((token, id) => deleteRowById(token, id, 'shift_slots', slotId))
  }, [update, syncToSheets])

  const copyShiftSlots = useCallback((fromMonthId: string, toMonthId: string, mode: 'date' | 'weekday') => {
    const toMonth = data.shiftMonths.find(m => m.id === toMonthId)!
    const sourceSlots = data.shiftSlots.filter(s => s.shiftMonthId === fromMonthId)
    const newSlots: ShiftSlot[] = sourceSlots.map(slot => {
      let newDate = slot.date
      if (mode === 'date') {
        newDate = `${toMonth.year}-${String(toMonth.month).padStart(2, '0')}-${slot.date.slice(8)}`
      } else {
        const src = new Date(slot.date)
        const dow = src.getDay()
        const firstOfTo = new Date(toMonth.year, toMonth.month - 1, 1)
        const diff = (dow - firstOfTo.getDay() + 7) % 7
        const weekNum = Math.floor((src.getDate() - 1) / 7)
        const d = new Date(toMonth.year, toMonth.month - 1, 1 + diff + weekNum * 7)
        newDate = d.toISOString().slice(0, 10)
      }
      return { ...slot, id: generateId(), shiftMonthId: toMonthId, date: newDate, status: 'draft' as const }
    })
    update(prev => ({ ...prev, shiftSlots: [...prev.shiftSlots, ...newSlots] }))
    syncToSheets(async (token, id) => {
      for (const slot of newSlots) {
        await appendRow(token, id, 'shift_slots', slot as unknown as Record<string, unknown>)
      }
    })
    return newSlots.length
  }, [data.shiftMonths, data.shiftSlots, update, syncToSheets])

  const unconfirmShiftSlot = useCallback((slotId: string) => {
    let updatedSlot: ShiftSlot | undefined
    const updatedResponses: StaffResponse[] = []
    update(prev => {
      const slots: ShiftSlot[] = prev.shiftSlots.map(s => {
        if (s.id !== slotId) return s
        updatedSlot = { ...s, status: 'draft' as const }
        return updatedSlot
      })
      const responses = prev.staffResponses.map(r => {
        if (r.shiftSlotId !== slotId) return r
        const updated = { ...r, isAssigned: false }
        updatedResponses.push(updated)
        return updated
      })
      return { ...prev, shiftSlots: slots, staffResponses: responses }
    })
    syncToSheets(async (token, id) => {
      if (updatedSlot) await updateRowById(token, id, 'shift_slots', updatedSlot as unknown as Record<string, unknown>)
      for (const r of updatedResponses) {
        await updateRowById(token, id, 'staff_responses', r as unknown as Record<string, unknown>)
      }
    })
  }, [update, syncToSheets])

  const confirmShiftSlot = useCallback((slotId: string, assignedMemberIds: string[]) => {
    const assignedAdmins = data.members.filter(m => assignedMemberIds.includes(m.id) && m.role === 'admin')
    if (assignedAdmins.length === 0) throw new Error('各キッチンカーに管理者が最低1名必要です')

    let updatedSlot: ShiftSlot | undefined
    const updatedResponses: StaffResponse[] = []

    update(prev => {
      const slots = prev.shiftSlots.map(s => {
        if (s.id !== slotId) return s
        updatedSlot = { ...s, status: 'confirmed' as const }
        return updatedSlot
      })
      const responses = prev.staffResponses.map(r => {
        if (r.shiftSlotId !== slotId) return r
        const updated = { ...r, isAssigned: assignedMemberIds.includes(r.memberId) }
        updatedResponses.push(updated)
        return updated
      })
      return { ...prev, shiftSlots: slots, staffResponses: responses }
    })

    syncToSheets(async (token, id) => {
      if (updatedSlot) await updateRowById(token, id, 'shift_slots', updatedSlot as unknown as Record<string, unknown>)
      for (const r of updatedResponses) {
        await updateRowById(token, id, 'staff_responses', r as unknown as Record<string, unknown>)
      }
    })
  }, [data.members, update, syncToSheets])

  // ─── スタッフ回答 ─────────────────────────────────
  const submitResponse = useCallback((shiftSlotId: string, memberId: string, isAvailable: boolean) => {
    const existing = data.staffResponses.find(r => r.shiftSlotId === shiftSlotId && r.memberId === memberId)
    if (existing) {
      const updated = { ...existing, isAvailable, submittedAt: new Date().toISOString() }
      update(prev => ({
        ...prev,
        staffResponses: prev.staffResponses.map(r => r.id === existing.id ? updated : r),
      }))
      syncToSheets((token, id) => updateRowById(token, id, 'staff_responses', updated as unknown as Record<string, unknown>))
    } else {
      const slot = data.shiftSlots.find(s => s.id === shiftSlotId)!
      const responses = data.staffResponses.filter(r => r.shiftSlotId === shiftSlotId && r.isAvailable)
      const newResp: StaffResponse = {
        id: generateId(), shiftSlotId, memberId, isAvailable,
        submittedAt: new Date().toISOString(),
        isAssigned: isAvailable && responses.length < slot.requiredCount,
      }
      update(prev => ({ ...prev, staffResponses: [...prev.staffResponses, newResp] }))
      syncToSheets((token, id) => appendRow(token, id, 'staff_responses', newResp as unknown as Record<string, unknown>))
    }
  }, [data.staffResponses, data.shiftSlots, update, syncToSheets])

  const getSlotResponses = useCallback((slotId: string) => {
    return data.staffResponses
      .filter(r => r.shiftSlotId === slotId && r.isAvailable)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  }, [data.staffResponses])

  const deleteStaffResponse = useCallback((responseId: string) => {
    update(prev => ({
      ...prev,
      staffResponses: prev.staffResponses.filter(r => r.id !== responseId),
    }))
    syncToSheets((token, id) => deleteRowById(token, id, 'staff_responses', responseId))
  }, [update, syncToSheets])

  return {
    data, currentAdmin, syncStatus, spreadsheetId, isLoadingSheets,
    loginWithGoogle, createNewSheet, connectExistingSheet, disconnectSheet, logout, refreshData, changeSheet, saveGasUrlToSheet,
    addMember, updateMember, updateMemberRole, deleteMember,
    createShiftMonth, publishShiftMonth, closeShiftMonth,
    addShiftSlot, updateShiftSlot, deleteShiftSlot, copyShiftSlots, confirmShiftSlot, unconfirmShiftSlot,
    submitResponse, getSlotResponses, deleteStaffResponse,
  }
}
