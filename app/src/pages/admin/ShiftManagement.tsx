import { useState, useMemo, useEffect } from 'react'
import { format, getDaysInMonth, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Plus, Trash2, Copy, Share2, Lock, ChevronDown, ChevronUp, UserCheck, CheckCircle2, Pencil, X, RefreshCw, MessageSquare, RotateCcw, CalendarDays, Store } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useStoreContext } from '@/store/StoreContext'
import { getGasUrl } from '@/services/gasService'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { ShiftSlot } from '@/types'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
type Tab = 'slots' | 'responses' | 'confirmed' | 'calendar' | 'staff_schedule'

export function ShiftManagement() {
  const { data, createShiftMonth, addShiftSlot, updateShiftSlot, deleteShiftSlot,
          publishShiftMonth, closeShiftMonth, reopenShiftMonth, copyShiftSlots, confirmShiftSlot, unconfirmShiftSlot,
          addStaffScheduleEntry, deleteStaffScheduleEntry, assignStaffToSlot,
          getSlotResponses, deleteStaffResponse, submitResponse, refreshData, isLoadingSheets } = useStoreContext()
  const location = useLocation()

  const now = new Date()

  // ダッシュボードから monthId が渡された場合、その月に初期フォーカス
  const initialMonth = useMemo(() => {
    const state = location.state as { monthId?: string } | null
    if (state?.monthId) {
      const m = data.shiftMonths.find(m => m.id === state.monthId)
      if (m) return { year: m.year, month: m.month }
    }
    // デフォルトは来月
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { year: next.getFullYear(), month: next.getMonth() + 1 }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [selYear, setSelYear] = useState(initialMonth.year)
  const [selMonth, setSelMonth] = useState(initialMonth.month)
  const [activeTab, setActiveTab] = useState<Tab>('slots')
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [showCopy, setShowCopy] = useState(false)
  const [showConfirm, setShowConfirm] = useState<ShiftSlot | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [error, setError] = useState('')

  // 追加モーダル
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('キッチンカー')
  const [newCount, setNewCount] = useState(1)
  const [newNote, setNewNote] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [copyMode, setCopyMode] = useState<'date' | 'weekday'>('date')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const gasUrl = getGasUrl() ?? ''

  // 店舗一括追加モーダル（カレンダー日付選択）
  const [showStore, setShowStore] = useState(false)
  const [storeDates, setStoreDates] = useState<Set<string>>(new Set())
  const [storeCount, setStoreCount] = useState(1)

  const toggleStoreDate = (dateStr: string) => {
    setStoreDates(prev => {
      const next = new Set(prev)
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr)
      return next
    })
  }

  const handleAddStore = () => {
    if (storeDates.size === 0) return
    const month = currentMonth ?? createShiftMonth(selYear, selMonth)
    const sorted = Array.from(storeDates).sort()
    sorted.forEach(dateStr => {
      addShiftSlot({ shiftMonthId: month.id, locationName: '店舗', date: dateStr, requiredCount: storeCount, note: '11:00-18:00' })
    })
    alert(`店舗シフトを${sorted.length}枠追加しました`)
    setShowStore(false)
    setStoreDates(new Set())
  }

  // カレンダー詳細ポップアップ（④）
  const [calendarPopupSlot, setCalendarPopupSlot] = useState<ShiftSlot | null>(null)

  // シフト希望タブ：手動追加
  const [manualAddSlotId, setManualAddSlotId] = useState<string | null>(null)
  const [manualAddMemberId, setManualAddMemberId] = useState('')


  // 社員シフト一括入力
  const [staffScheduleMemberId, setStaffScheduleMemberId] = useState('')
  const [staffScheduleModal, setStaffScheduleModal] = useState<{ date: string } | null>(null)
  const [staffScheduleType, setStaffScheduleType] = useState<'work' | 'off'>('work')
  const [staffScheduleLocation, setStaffScheduleLocation] = useState('')
  // 休み一括入力モード
  const [staffOffBulkMode, setStaffOffBulkMode] = useState(false)
  const [staffOffBulkDates, setStaffOffBulkDates] = useState<Set<string>>(new Set())

  // LINE共有テキスト
  const [lineCopied, setLineCopied] = useState(false)
  const [calendarCopied, setCalendarCopied] = useState(false)

  // カレンダーメンバーフィルター
  const [calendarFilterMemberId, setCalendarFilterMemberId] = useState('')

  const generateLineText = () => {
    const lines: string[] = [`📅 ${selYear}年${selMonth}月 確定シフト\n`]
    Array.from(slotsByDate.entries()).forEach(([date, daySlots]) => {
      const confirmed = daySlots.filter(s => s.status === 'confirmed')
      if (confirmed.length === 0) return
      const d = parseISO(date)
      const dateLabel = format(d, 'M/d', { locale: ja })
      const dow = DOW[d.getDay()]
      confirmed.forEach(slot => {
        const assigned = data.staffResponses
          .filter(r => r.shiftSlotId === slot.id && r.isAssigned)
          .map(r => data.members.find(m => m.id === r.memberId)?.name)
          .filter(Boolean)
        lines.push(`${dateLabel}(${dow}) ${slot.locationName}`)
        lines.push(assigned.length > 0 ? `　${assigned.join('、')}` : '　（未割当）')
      })
    })
    return lines.join('\n')
  }

  const handleCopyLineText = () => {
    navigator.clipboard.writeText(generateLineText())
    setLineCopied(true)
    setTimeout(() => setLineCopied(false), 2000)
  }

  // 編集モーダル（①）
  const [editingSlot, setEditingSlot] = useState<ShiftSlot | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editCount, setEditCount] = useState(1)
  const [editNote, setEditNote] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editEndTime, setEditEndTime] = useState('')

  // シフト希望タブを開いたとき、未知のメンバーがいれば自動更新
  useEffect(() => {
    if (activeTab !== 'responses') return
    const allResponses = data.staffResponses
    const hasUnknown = allResponses.some(r => !data.members.find(m => m.id === r.memberId))
    if (hasUnknown) refreshData()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentMonth = data.shiftMonths.find(m => m.year === selYear && m.month === selMonth)

  const publicCalendarUrl = currentMonth && gasUrl
    ? `${window.location.origin}${window.location.pathname}#/cal/${currentMonth.id}?gas=${encodeURIComponent(gasUrl)}`
    : null

  const handleCopyCalendarUrl = () => {
    if (!publicCalendarUrl) return
    navigator.clipboard.writeText(publicCalendarUrl)
    setCalendarCopied(true)
    setTimeout(() => setCalendarCopied(false), 2000)
  }

  const slots = useMemo(
    () => data.shiftSlots
      .filter(s => s.shiftMonthId === currentMonth?.id && !s.isStaffSchedule)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data.shiftSlots, currentMonth?.id]
  )

  const staffScheduleSlots = useMemo(
    () => data.shiftSlots
      .filter(s => s.shiftMonthId === currentMonth?.id && s.isStaffSchedule)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data.shiftSlots, currentMonth?.id]
  )

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ShiftSlot[]>()
    slots.forEach(s => {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    })
    return map
  }, [slots])

  // カレンダーグリッド用（②）
  const calendarCells = useMemo(() => {
    const firstDow = new Date(selYear, selMonth - 1, 1).getDay()
    const days = getDaysInMonth(new Date(selYear, selMonth - 1))
    const total = Math.ceil((firstDow + days) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = i - firstDow + 1
      return d >= 1 && d <= days ? d : null
    })
  }, [selYear, selMonth])

  const shareUrl = currentMonth ? (() => {
    const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined
    const route = `#/s/${currentMonth.id}${gasUrl ? `?gas=${encodeURIComponent(gasUrl)}` : ''}`
    return LIFF_ID
      ? `https://liff.line.me/${LIFF_ID}?liff.state=${encodeURIComponent(route)}`
      : `${window.location.origin}${window.location.pathname}${route}`
  })() : null

  // シフト希望タブ: 未確定 OR 確定済みでも人数不足のスロット
  const pendingSlots = slots.filter(s => {
    if (s.status !== 'confirmed') return true
    const assignedCount = data.staffResponses.filter(r => r.shiftSlotId === s.id && r.isAssigned).length
    return assignedCount < s.requiredCount
  })
  const confirmedSlots = slots.filter(s => s.status === 'confirmed')
  const undecidedCount = slots.filter(s => s.status === 'undecided').length

  const handleAddSlot = () => {
    if (!newDate || !newLocation) { setError('日付と場所を入力してください'); return }
    const month = currentMonth ?? createShiftMonth(selYear, selMonth)
    addShiftSlot({
      shiftMonthId: month.id, locationName: newLocation, date: newDate,
      requiredCount: newCount, note: newNote,
      startTime: newStartTime || undefined, endTime: newEndTime || undefined,
    })
    setNewDate(''); setNewCount(1); setNewNote(''); setNewStartTime(''); setNewEndTime(''); setError(''); setShowAddSlot(false)
  }

  const handlePublish = () => {
    const month = currentMonth ?? createShiftMonth(selYear, selMonth)
    publishShiftMonth(month.id, deadlineDate ? new Date(deadlineDate).toISOString() : null)
    setShowPublish(false)
  }

  const handleClose = () => {
    if (!currentMonth) return
    if (!confirm('募集を締め切りますか？')) return
    closeShiftMonth(currentMonth.id)
  }

  const handleCopy = () => {
    if (!copyFrom) { setError('コピー元を選択してください'); return }
    const toMonth = currentMonth ?? createShiftMonth(selYear, selMonth)
    const count = copyShiftSlots(copyFrom, toMonth.id, copyMode)
    alert(`${count}枠をコピーしました`)
    setShowCopy(false); setError('')
  }

  const handleManualAdd = (slotId: string) => {
    if (!manualAddMemberId) return
    submitResponse(slotId, manualAddMemberId, true)
    setManualAddSlotId(null)
    setManualAddMemberId('')
  }

  const openConfirm = (slot: ShiftSlot) => {
    if (slot.status === 'confirmed') {
      // 確定済み：現在のアサインメンバーを初期選択
      const assigned = data.staffResponses
        .filter(r => r.shiftSlotId === slot.id && r.isAssigned)
        .map(r => r.memberId)
      setSelectedMembers(assigned)
    } else {
      const responses = getSlotResponses(slot.id)
      setSelectedMembers(responses.slice(0, slot.requiredCount).map(r => r.memberId))
    }
    setShowConfirm(slot)
  }

  const handleConfirm = () => {
    if (!showConfirm) return
    try {
      // 回答なしで選ばれたメンバーの回答を先に作成（functional updateで直列キュー処理される）
      for (const id of selectedMembers) {
        const hasResp = data.staffResponses.some(r => r.shiftSlotId === showConfirm.id && r.memberId === id)
        if (!hasResp) submitResponse(showConfirm.id, id, true)
      }
      confirmShiftSlot(showConfirm.id, selectedMembers)
      setShowConfirm(null); setError('')
    } catch (e) {
      setError(String(e))
    }
  }

  // 枠編集（①）
  const handleOpenEdit = (slot: ShiftSlot) => {
    setEditDate(slot.date)
    setEditLocation(slot.locationName)
    setEditCount(slot.requiredCount)
    setEditNote(slot.note ?? '')
    setEditStartTime(slot.startTime ?? '')
    setEditEndTime(slot.endTime ?? '')
    setEditingSlot(slot)
  }

  const handleSaveEdit = () => {
    if (!editingSlot || !editDate || !editLocation) return
    updateShiftSlot(editingSlot.id, {
      date: editDate,
      locationName: editLocation,
      requiredCount: editCount,
      note: editNote,
      startTime: editStartTime || undefined,
      endTime: editEndTime || undefined,
    })
    setEditingSlot(null)
  }

  const otherMonths = data.shiftMonths.filter(m => !(m.year === selYear && m.month === selMonth))

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 sm:pb-6">
      {/* ヘッダー：月選択 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gray-800 flex-1">シフト管理</h1>
        <button
          onClick={refreshData}
          disabled={isLoadingSheets}
          title="スプレッドシートから最新データを読み込む"
          className="flex items-center gap-1.5 border text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-600">
          <RefreshCw size={14} className={isLoadingSheets ? 'animate-spin' : ''} />
          更新
        </button>
        <select className="border rounded-lg px-2 py-1.5 text-sm" value={selYear}
          onChange={e => setSelYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select className="border rounded-lg px-2 py-1.5 text-sm" value={selMonth}
          onChange={e => setSelMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
      </div>

      {/* ステータスバー */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1">
          <p className="text-sm text-gray-500">ステータス</p>
          <div className="mt-1 flex items-center gap-2">
            {!currentMonth && <Badge label="未作成" variant="gray" />}
            {currentMonth?.status === 'draft' && <Badge label="下書き" variant="gray" />}
            {currentMonth?.status === 'published' && <Badge label="募集中" variant="blue" />}
            {currentMonth?.status === 'closed' && <Badge label="締め切り済み" variant="green" />}
            {undecidedCount > 0 && <Badge label={`未確定 ${undecidedCount}枠`} variant="red" />}
          </div>
          {currentMonth?.deadlineAt && (
            <p className="text-xs text-gray-400 mt-1">
              締切: {format(new Date(currentMonth.deadlineAt), 'M/d(E) HH:mm', { locale: ja })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(!currentMonth || currentMonth.status === 'draft') && (
            <>
              <button onClick={() => { setNewLocation('キッチンカー'); setNewStartTime(''); setNewEndTime(''); setShowAddSlot(true) }}
                className="flex items-center gap-1 bg-dandy-500 hover:bg-dandy-600 text-white text-sm px-3 py-1.5 rounded-lg">
                <Plus size={14} /> キッチンカー
              </button>
              <button onClick={() => setShowStore(true)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded-lg">
                <Store size={14} /> 店舗
              </button>
              <button onClick={() => setShowCopy(true)}
                className="flex items-center gap-1 border text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50">
                <Copy size={14} /> コピー
              </button>
              {slots.length > 0 && (
                <button onClick={() => setShowPublish(true)}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg">
                  <Share2 size={14} /> 公開・URL発行
                </button>
              )}
            </>
          )}
          {currentMonth?.status === 'published' && (
            <>
              <button onClick={() => { setNewLocation('キッチンカー'); setNewStartTime(''); setNewEndTime(''); setShowAddSlot(true) }}
                className="flex items-center gap-1 bg-dandy-500 hover:bg-dandy-600 text-white text-sm px-3 py-1.5 rounded-lg">
                <Plus size={14} /> キッチンカー
              </button>
              <button onClick={() => setShowStore(true)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded-lg">
                <Store size={14} /> 店舗
              </button>
              <button onClick={handleClose}
                className="flex items-center gap-1 border border-red-300 text-red-600 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
                <Lock size={14} /> 締め切る
              </button>
            </>
          )}
          {currentMonth?.status === 'closed' && (
            <button
              onClick={() => { if (confirm('締め切りを取り消して「募集中」に戻しますか？\nバイトが再度回答できるようになります。')) reopenShiftMonth(currentMonth.id) }}
              className="flex items-center gap-1 border border-dandy-300 text-dandy-600 text-sm px-3 py-1.5 rounded-lg hover:bg-dandy-50">
              <RotateCcw size={14} /> 締め切りを取り消す
            </button>
          )}
        </div>
      </div>

      {/* 共有URL */}
      {shareUrl && currentMonth && (
        <div className="rounded-xl border overflow-hidden">
          {/* 希望入力URL */}
          {currentMonth.status === 'closed' ? (
            <div className="bg-gray-100 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-400">希望入力URL（募集終了）</span>
              </div>
              <p className="text-xs text-gray-400">締め切り済みのためバイトはこのURLで回答できません。「締め切りを取り消す」で再公開できます。</p>
            </div>
          ) : (
            <div className="bg-dandy-500 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">📝 希望入力URL</span>
                <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">バイトがシフト希望を送るURL</span>
              </div>
              <div className="flex gap-2">
                <input readOnly value={shareUrl}
                  className="flex-1 text-xs border-0 rounded-lg px-3 py-2 bg-white text-gray-700 font-mono" />
                <button onClick={() => navigator.clipboard.writeText(shareUrl)}
                  className="text-sm font-bold bg-white text-dandy-600 px-4 py-2 rounded-lg hover:bg-dandy-50 transition-colors shrink-0">
                  コピー
                </button>
              </div>
              <p className="text-xs text-white/80">↑ 公開・URL発行した直後にLINEで共有してください</p>
            </div>
          )}
          {/* 確定シフト閲覧URL */}
          <div className={`p-4 space-y-2 ${publicCalendarUrl ? 'bg-blue-600' : 'bg-gray-100'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${publicCalendarUrl ? 'text-white' : 'text-gray-400'}`}>📅 確定シフト閲覧URL</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${publicCalendarUrl ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-400'}`}>シフト確定後にバイトに共有</span>
            </div>
            {publicCalendarUrl ? (
              <>
                <div className="flex gap-2">
                  <input readOnly value={publicCalendarUrl}
                    className="flex-1 text-xs border-0 rounded-lg px-3 py-2 bg-white text-gray-700 font-mono" />
                  <button onClick={handleCopyCalendarUrl}
                    className="text-sm font-bold bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors shrink-0">
                    {calendarCopied ? '✓ コピー済み' : 'コピー'}
                  </button>
                </div>
                <p className="text-xs text-white/80">↑ 確定後にバイトが自分のシフトを確認できます</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">GAS URLを設定すると利用できます（ヘッダーの⚙から設定）</p>
            )}
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="flex border-b overflow-x-auto">
        {([
          { key: 'slots',          label: `シフト枠 (${slots.length})` },
          { key: 'responses',      label: `シフト希望 (${pendingSlots.length})` },
          { key: 'confirmed',      label: `確定シフト (${confirmedSlots.length})` },
          { key: 'calendar',       label: 'カレンダー' },
          { key: 'staff_schedule', label: '社員シフト' },
        ] as { key: Tab; label: string }[]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? 'border-dandy-500 text-dandy-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── タブ1: シフト枠 ── */}
      {activeTab === 'slots' && (
        slotsByDate.size === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            シフト枠がありません。「キッチンカー」または「店舗」から登録してください。
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(slotsByDate.entries()).map(([date, daySlots]) => {
              const d = parseISO(date)
              const isExpanded = expandedDate === date
              return (
                <div key={date} className="bg-white rounded-xl border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-800">
                        {format(d, 'M/d', { locale: ja })}
                        <span className={`ml-1 text-sm ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>
                          ({DOW[d.getDay()]})
                        </span>
                      </span>
                      <span className="text-sm text-gray-500">{daySlots.length}枠</span>
                    </div>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {isExpanded && (
                    <div className="border-t divide-y">
                      {daySlots.map(slot => (
                        <div key={slot.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <span className="font-medium text-sm">{slot.locationName}</span>
                            <span className="text-xs text-gray-500 ml-2">必要: {slot.requiredCount}名</span>
                            {(slot.startTime || slot.endTime) && (
                              <p className="text-xs text-dandy-500 mt-0.5 font-medium">
                                {slot.startTime ?? '?'}〜{slot.endTime ?? '?'}
                              </p>
                            )}
                            {slot.note && <p className="text-xs text-gray-400 mt-0.5">{slot.note}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleOpenEdit(slot)}
                              className="text-gray-400 hover:text-dandy-400 p-1" title="編集">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => deleteShiftSlot(slot.id)}
                              className="text-gray-400 hover:text-red-500 p-1" title="削除">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── タブ2: シフト希望（回答状況・確定操作） ── */}
      {activeTab === 'responses' && (
        pendingSlots.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            確定待ちのシフト枠がありません
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(slotsByDate.entries()).map(([date, daySlots]) => {
              // 未確定 OR 確定済みでも人数不足のスロットを表示
              const relevantSlots = daySlots.filter(s => {
                if (s.status !== 'confirmed') return true
                const assignedCount = data.staffResponses.filter(r => r.shiftSlotId === s.id && r.isAssigned).length
                return assignedCount < s.requiredCount
              })
              if (relevantSlots.length === 0) return null
              const d = parseISO(date)
              return (
                <div key={date} className="bg-white rounded-xl border overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <span className="font-medium text-sm text-gray-700">
                      {format(d, 'M/d', { locale: ja })}
                      <span className={`ml-1 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>
                        ({DOW[d.getDay()]})
                      </span>
                    </span>
                  </div>
                  <div className="divide-y">
                    {relevantSlots.map(slot => {
                      const responses = getSlotResponses(slot.id)
                      const isConfirmed = slot.status === 'confirmed'
                      const assignedCount = data.staffResponses.filter(r => r.shiftSlotId === slot.id && r.isAssigned).length
                      const isFull = responses.length >= slot.requiredCount
                      return (
                        <div key={slot.id} className={`px-4 py-3 ${isConfirmed ? 'bg-orange-50' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{slot.locationName}</span>
                                {(slot.startTime || slot.endTime) && (
                                  <span className="text-xs text-dandy-500 font-medium">{slot.startTime ?? '?'}〜{slot.endTime ?? '?'}</span>
                                )}
                                <span className="text-xs text-gray-500">必要: {slot.requiredCount}名</span>
                                {isConfirmed ? (
                                  <Badge label={`確定済み 人数不足 ${assignedCount}/${slot.requiredCount}名`} variant="red" />
                                ) : isFull ? (
                                  <Badge label="充足" variant="blue" />
                                ) : (
                                  <Badge label={`${responses.length}/${slot.requiredCount}名`} variant="gray" />
                                )}
                              </div>
                              {isConfirmed ? (
                                /* 確定済み人数不足: 担当済みメンバーを表示 */
                                <p className="text-xs text-orange-600 mt-1">
                                  担当確定: {assignedCount}名（あと{slot.requiredCount - assignedCount}名必要）
                                </p>
                              ) : responses.length > 0 ? (
                                <div className="mt-1.5 space-y-0.5">
                                  {responses.map((r, i) => {
                                    const m = data.members.find(mb => mb.id === r.memberId)
                                    return (
                                      <div key={r.id} className="flex items-center gap-1 group">
                                        <p className="text-sm text-gray-600 flex-1">
                                          <span className="text-xs text-gray-400 mr-1">{i + 1}.</span>
                                          シフト希望: <span className="font-medium">{m?.name ?? '読込中...'}</span>
                                          {!m && <span className="ml-1 text-xs text-amber-500">（更新ボタンを押してください）</span>}
                                          {m?.role === 'admin' && <span className="ml-1 text-xs text-dandy-500">（管理者）</span>}
                                          {m?.city && <span className="ml-1 text-xs text-gray-400">{m.city}</span>}
                                        </p>
                                        <button
                                          onClick={() => {
                                            if (confirm(`${m?.name ?? '?'}さんの希望を削除しますか？`)) {
                                              deleteStaffResponse(r.id)
                                            }
                                          }}
                                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-0.5 transition-opacity"
                                          title="この希望を削除">
                                          <X size={13} />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 mt-1">まだ回答がありません</p>
                              )}

                              {/* 手動追加（未確定スロットのみ） */}
                              {!isConfirmed && (manualAddSlotId === slot.id ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <select
                                    value={manualAddMemberId}
                                    onChange={e => setManualAddMemberId(e.target.value)}
                                    className="flex-1 text-xs border rounded px-2 py-1.5">
                                    <option value="">メンバーを選択</option>
                                    {data.members
                                      .filter(m => !responses.some(r => r.memberId === m.id))
                                      .map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                  </select>
                                  <button onClick={() => handleManualAdd(slot.id)}
                                    disabled={!manualAddMemberId}
                                    className="text-xs bg-dandy-500 text-white px-3 py-1.5 rounded-lg hover:bg-dandy-600 disabled:opacity-40 shrink-0">
                                    追加
                                  </button>
                                  <button onClick={() => { setManualAddSlotId(null); setManualAddMemberId('') }}
                                    className="text-xs text-gray-400 hover:text-gray-600 shrink-0">
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setManualAddSlotId(slot.id); setManualAddMemberId('') }}
                                  className="mt-2 text-xs text-dandy-500 hover:text-dandy-600 flex items-center gap-1">
                                  <Plus size={12} /> メンバーを追加
                                </button>
                              ))}
                            </div>
                            {!isConfirmed && responses.length > 0 && (
                              <button onClick={() => openConfirm(slot)}
                                className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 shrink-0">
                                <UserCheck size={13} /> 確定する
                              </button>
                            )}
                            {isConfirmed && (
                              <button onClick={() => openConfirm(slot)}
                                className="flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 shrink-0">
                                <UserCheck size={13} /> 担当追加
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── タブ3: 確定シフト ── */}
      {activeTab === 'confirmed' && (
        confirmedSlots.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            確定済みのシフトがありません
          </div>
        ) : (
          <div className="space-y-2">
            {/* LINE共有ボタン */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
              <MessageSquare size={16} className="text-green-600 shrink-0" />
              <p className="text-xs text-green-800 flex-1">確定シフトをLINEで共有できるテキストを生成します</p>
              <button
                onClick={handleCopyLineText}
                className="text-xs font-bold bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shrink-0 transition-colors">
                {lineCopied ? '✓ コピー済み' : 'テキストをコピー'}
              </button>
            </div>
            {Array.from(slotsByDate.entries()).map(([date, daySlots]) => {
              const confirmed = daySlots.filter(s => s.status === 'confirmed')
              if (confirmed.length === 0) return null
              const d = parseISO(date)
              return (
                <div key={date} className="bg-white rounded-xl border overflow-hidden">
                  <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                    <span className="font-medium text-sm text-green-800">
                      {format(d, 'M/d', { locale: ja })}
                      <span className={`ml-1 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-dandy-500' : 'text-green-700'}`}>
                        ({DOW[d.getDay()]})
                      </span>
                    </span>
                  </div>
                  <div className="divide-y">
                    {confirmed.map(slot => {
                      const assigned = data.staffResponses
                        .filter(r => r.shiftSlotId === slot.id && r.isAssigned)
                        .map(r => data.members.find(m => m.id === r.memberId))
                        .filter(Boolean)
                      return (
                        <div key={slot.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                              <span className="font-medium text-sm">{slot.locationName}</span>
                              <Badge label="確定" variant="green" />
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => openConfirm(slot)}
                                className="flex items-center gap-1 text-xs border border-dandy-300 text-dandy-600 px-2.5 py-1.5 rounded-lg hover:bg-dandy-50">
                                <Pencil size={11} /> 担当変更
                              </button>
                              <button
                                onClick={() => { if (confirm('確定を取り消してシフト希望タブに戻しますか？')) unconfirmShiftSlot(slot.id) }}
                                className="flex items-center gap-1 text-xs border border-red-300 text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50">
                                <RotateCcw size={11} /> 確定取り消し
                              </button>
                            </div>
                          </div>
                          <div className="space-y-0.5 pl-5">
                            {assigned.map(m => m && (
                              <p key={m.id} className="text-sm text-gray-700">
                                シフト: <span className="font-medium">{m.name}</span>
                                {m.role === 'admin' && <span className="ml-1 text-xs text-dandy-500">（管理者）</span>}
                                {m.city && <span className="ml-1 text-xs text-gray-400">{m.city}</span>}
                              </p>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── タブ4: カレンダー（②） ── */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-700">{selYear}年{selMonth}月 シフトカレンダー</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* メンバーフィルター */}
              <select
                value={calendarFilterMemberId}
                onChange={e => setCalendarFilterMemberId(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5 bg-white text-gray-700 min-w-[100px]">
                <option value="">全員</option>
                {data.members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {publicCalendarUrl ? (
                <button
                  onClick={handleCopyCalendarUrl}
                  className="flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  <CalendarDays size={13} />
                  {calendarCopied ? '✓ コピー済み' : '閲覧URLをコピー'}
                </button>
              ) : null}
              <button
                onClick={() => {
                  if (window.innerWidth < 640) {
                    alert('スクリーンショットで保存してください\n\niOS: サイドボタン＋音量ボタン\nAndroid: 電源ボタン＋音量ダウン')
                  } else {
                    window.print()
                  }
                }}
                className="text-xs border px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-600">
                印刷
              </button>
            </div>
          </div>
          <div className="p-2">
            {/* 凡例 */}
            <div className="flex gap-3 mb-3 px-1 text-xs text-gray-500 flex-wrap">
              {calendarFilterMemberId ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
                    自分のシフト（確定）
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-dandy-300 inline-block" />
                    希望済み（未確定）
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-dandy-100 border border-dandy-200 inline-block" />
                    募集中
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" />
                    確定済み
                  </span>
                </>
              )}
            </div>
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d, i) => (
                <div key={d} className={`text-center text-xs font-medium py-1
                  ${i === 0 ? 'text-red-500' : i === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>
                  {d}
                </div>
              ))}
            </div>
            {/* カレンダーグリッド */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
              {calendarCells.map((dayNum, i) => {
                if (!dayNum) {
                  return <div key={i} className="bg-gray-50 min-h-16" />
                }
                const dateStr = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
                const daySlots = slotsByDate.get(dateStr) ?? []
                const dow = i % 7
                const isToday = selYear === now.getFullYear() && selMonth === now.getMonth() + 1 && dayNum === now.getDate()

                // メンバーフィルター適用
                const filteredSlots = calendarFilterMemberId
                  ? daySlots.filter(slot => {
                      const responses = data.staffResponses.filter(r => r.shiftSlotId === slot.id && r.memberId === calendarFilterMemberId)
                      return responses.some(r => r.isAvailable || r.isAssigned)
                    })
                  : daySlots

                // フィルター中で自分に関係ない日はうっすら表示
                const isDimmed = calendarFilterMemberId && filteredSlots.length === 0 && daySlots.length > 0

                return (
                  <div key={i} className={`p-1 min-h-16 ${isDimmed ? 'bg-gray-50' : 'bg-white'}`}>
                    <p className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full
                      ${isToday ? 'bg-dandy-500 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-dandy-400' : isDimmed ? 'text-gray-300' : 'text-gray-700'}`}>
                      {dayNum}
                    </p>
                    <div className="space-y-0.5">
                      {filteredSlots.map(slot => {
                        const isAssigned = calendarFilterMemberId
                          ? data.staffResponses.some(r => r.shiftSlotId === slot.id && r.memberId === calendarFilterMemberId && r.isAssigned)
                          : slot.status === 'confirmed'
                        return (
                          <div key={slot.id}
                            onClick={() => setCalendarPopupSlot(slot)}
                            className={`text-xs rounded px-1 py-0.5 truncate leading-tight cursor-pointer
                              ${calendarFilterMemberId
                                ? isAssigned
                                  ? 'bg-green-400 text-white border border-green-500 hover:bg-green-500'
                                  : 'bg-dandy-300 text-white border border-dandy-400 hover:bg-dandy-400'
                                : slot.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200'
                                  : 'bg-dandy-50 text-dandy-600 border border-dandy-100 hover:bg-dandy-100'}`}
                            title={`${slot.locationName}（必要${slot.requiredCount}名）`}>
                            {slot.locationName}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── タブ5: 社員シフト一括入力 ── */}
      {activeTab === 'staff_schedule' && (() => {
        const staffMembers = data.members.filter(m => m.role === 'staff')
        const selectedMember = staffMembers.find(m => m.id === staffScheduleMemberId)

        // 社員の isStaffSchedule エントリ（date → slot）
        const staffOffEntries = new Map<string, typeof staffScheduleSlots[0]>()
        staffScheduleSlots.forEach(s => {
          const hasAssigned = data.staffResponses.some(
            r => r.shiftSlotId === s.id && r.memberId === staffScheduleMemberId && r.isAssigned
          )
          if (hasAssigned) staffOffEntries.set(s.date, s)
        })

        // 既存シフト枠への担当割当（date → assigned slot ids）
        const assignedRegularSlotIds = new Set(
          data.staffResponses
            .filter(r => r.memberId === staffScheduleMemberId && r.isAssigned)
            .map(r => r.shiftSlotId)
        )

        const firstDow = currentMonth ? new Date(selYear, selMonth - 1, 1).getDay() : 0
        const days = currentMonth ? getDaysInMonth(new Date(selYear, selMonth - 1)) : 0
        const total = Math.ceil((firstDow + days) / 7) * 7
        const cells = Array.from({ length: total }, (_, i) => {
          const d = i - firstDow + 1
          return d >= 1 && d <= days ? d : null
        })

        const handleDayClick = (dateStr: string) => {
          if (staffOffBulkMode) {
            setStaffOffBulkDates(prev => {
              const next = new Set(prev)
              next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr)
              return next
            })
            return
          }
          const existing = staffOffEntries.get(dateStr)
          setStaffScheduleType(existing ? (existing.locationName === '休み' ? 'off' : 'work') : 'work')
          setStaffScheduleLocation(existing && existing.locationName !== '休み' ? existing.locationName : '')
          setStaffScheduleModal({ date: dateStr })
        }

        const saveEntry = () => {
          if (!staffScheduleModal || !currentMonth || !staffScheduleMemberId) return
          if (staffScheduleType === 'work' && !staffScheduleLocation.trim()) return
          addStaffScheduleEntry(currentMonth.id, staffScheduleMemberId, staffScheduleModal.date, staffScheduleType, staffScheduleLocation.trim())
          setStaffScheduleModal(null)
        }

        const handleBulkOff = () => {
          if (!currentMonth || !staffScheduleMemberId || staffOffBulkDates.size === 0) return
          Array.from(staffOffBulkDates).forEach(date => {
            addStaffScheduleEntry(currentMonth.id, staffScheduleMemberId, date, 'off', '')
          })
          setStaffOffBulkMode(false)
          setStaffOffBulkDates(new Set())
        }

        return (
          <div className="space-y-4">
            {staffMembers.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                社員が登録されていません。スタッフ管理から「社員」ロールのメンバーを追加してください。
              </div>
            ) : (
              <>
                {/* メンバー選択 + 操作ボタン */}
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">社員を選択</label>
                    <div className="flex gap-2 flex-wrap">
                      {staffMembers.map(m => (
                        <button key={m.id}
                          onClick={() => { setStaffScheduleMemberId(m.id); setStaffOffBulkMode(false); setStaffOffBulkDates(new Set()) }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
                            ${staffScheduleMemberId === m.id
                              ? 'bg-dandy-500 text-white border-dandy-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedMember && (
                    <div className="flex gap-2 pt-1 border-t">
                      <button
                        onClick={() => { setStaffOffBulkMode(v => !v); setStaffOffBulkDates(new Set()) }}
                        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors
                          ${staffOffBulkMode ? 'bg-orange-400 text-white border-orange-400' : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'}`}>
                        {staffOffBulkMode ? '✕ キャンセル' : '休みを一括入力'}
                      </button>
                      {staffOffBulkMode && staffOffBulkDates.size > 0 && (
                        <button onClick={handleBulkOff}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600">
                          {staffOffBulkDates.size}日を休みに登録
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {selectedMember && currentMonth && (
                  <>
                    {staffOffBulkMode && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-sm text-orange-700">
                        休みにしたい日付をタップで選択してください（複数選択可）。バイト側には表示されません。
                      </div>
                    )}
                    <div className="bg-white rounded-xl border overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">
                          {selectedMember.name} の {selYear}年{selMonth}月
                        </span>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-dandy-300 inline-block" />出勤</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300 inline-block" />休み</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" />枠あり</span>
                        </div>
                      </div>
                      <div className="p-2">
                        <div className="grid grid-cols-7 mb-1">
                          {DOW.map((d, i) => (
                            <div key={d} className={`text-center text-xs font-medium py-1
                              ${i === 0 ? 'text-red-500' : i === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>{d}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
                          {cells.map((dayNum, i) => {
                            if (!dayNum) return <div key={i} className="bg-gray-50 min-h-14" />
                            const dateStr = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
                            const staffOff = staffOffEntries.get(dateStr)
                            const dayShiftSlots = slotsByDate.get(dateStr) ?? []
                            const assignedSlots = dayShiftSlots.filter(s => assignedRegularSlotIds.has(s.id))
                            const isBulkSelected = staffOffBulkDates.has(dateStr)
                            const dow = i % 7

                            let bgClass = 'bg-white'
                            if (staffOff?.locationName === '休み') bgClass = 'bg-orange-50'
                            else if (assignedSlots.length > 0 || (staffOff && staffOff.locationName !== '休み')) bgClass = 'bg-dandy-50'
                            if (isBulkSelected) bgClass = 'bg-orange-200'

                            return (
                              <button key={i} onClick={() => handleDayClick(dateStr)}
                                className={`p-1 min-h-14 text-left transition-colors hover:opacity-80 ${bgClass}`}>
                                <p className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full
                                  ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-dandy-400' : 'text-gray-700'}`}>
                                  {dayNum}
                                </p>
                                {/* 既存シフト枠（参考表示・グレー） */}
                                {dayShiftSlots.filter(s => !assignedRegularSlotIds.has(s.id)).map(s => (
                                  <span key={s.id} className="text-xs rounded px-0.5 truncate block leading-tight bg-gray-100 text-gray-500 mb-0.5">
                                    {s.locationName}
                                  </span>
                                ))}
                                {/* 担当確定済みシフト枠（青） */}
                                {assignedSlots.map(s => (
                                  <span key={s.id} className="text-xs rounded px-0.5 truncate block leading-tight bg-dandy-200 text-dandy-800 mb-0.5">
                                    ✓{s.locationName}
                                  </span>
                                ))}
                                {/* 社員専用エントリ */}
                                {staffOff && (
                                  <span className={`text-xs rounded px-0.5 truncate block leading-tight
                                    ${staffOff.locationName === '休み' ? 'bg-orange-200 text-orange-700' : 'bg-dandy-200 text-dandy-800'}`}>
                                    {staffOff.locationName}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 登録済み一覧 */}
                    {(staffOffEntries.size > 0 || assignedRegularSlotIds.size > 0) && (
                      <div className="bg-white rounded-xl border divide-y overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">登録済みスケジュール</div>
                        {/* 既存枠への担当 */}
                        {slots
                          .filter(s => assignedRegularSlotIds.has(s.id))
                          .map(s => {
                            const d = parseISO(s.date)
                            return (
                              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-sm text-gray-700 w-14 shrink-0">
                                  {format(d, 'M/d', { locale: ja })}
                                  <span className={`ml-1 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-dandy-400' : 'text-gray-400'}`}>({DOW[d.getDay()]})</span>
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-dandy-100 text-dandy-700">{s.locationName}</span>
                                <button onClick={() => assignStaffToSlot(s.id, staffScheduleMemberId, false)}
                                  className="ml-auto text-gray-300 hover:text-red-500 p-0.5"><X size={14} /></button>
                              </div>
                            )
                          })}
                        {/* 社員専用エントリ */}
                        {Array.from(staffOffEntries.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([date, slot]) => {
                            const d = parseISO(date)
                            return (
                              <div key={date} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-sm text-gray-700 w-14 shrink-0">
                                  {format(d, 'M/d', { locale: ja })}
                                  <span className={`ml-1 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-dandy-400' : 'text-gray-400'}`}>({DOW[d.getDay()]})</span>
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                  ${slot.locationName === '休み' ? 'bg-orange-100 text-orange-700' : 'bg-dandy-100 text-dandy-700'}`}>
                                  {slot.locationName}
                                </span>
                                {slot.isPrivate && <span className="text-xs text-gray-400">非表示</span>}
                                <button onClick={() => deleteStaffScheduleEntry(slot.id)}
                                  className="ml-auto text-gray-300 hover:text-red-500 p-0.5"><X size={14} /></button>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* 日付クリックモーダル（通常モード） */}
            {staffScheduleModal && selectedMember && !staffOffBulkMode && (
              <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4"
                onClick={() => setStaffScheduleModal(null)}>
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800">
                      {format(parseISO(staffScheduleModal.date), 'M月d日(E)', { locale: ja })} — {selectedMember.name}
                    </p>
                    <button onClick={() => setStaffScheduleModal(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={18} />
                    </button>
                  </div>

                  {/* 既存シフト枠への担当割当 */}
                  {(() => {
                    const daySlotsMod = slotsByDate.get(staffScheduleModal.date) ?? []
                    if (daySlotsMod.length === 0) return null
                    return (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">この日のシフト枠</p>
                        <div className="space-y-1.5">
                          {daySlotsMod.map(s => {
                            const isAssigned = assignedRegularSlotIds.has(s.id)
                            return (
                              <button key={s.id}
                                onClick={() => { assignStaffToSlot(s.id, staffScheduleMemberId, !isAssigned); setStaffScheduleModal(null) }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors
                                  ${isAssigned ? 'bg-dandy-50 border-dandy-300 text-dandy-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                <span>{s.locationName}{(s.startTime || s.endTime) ? ` ${s.startTime ?? '?'}〜${s.endTime ?? '?'}` : ''}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${isAssigned ? 'bg-dandy-200 text-dandy-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {isAssigned ? '✓ 出勤' : '+ 出勤する'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">カスタム登録</p>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="flex gap-2">
                    <button onClick={() => setStaffScheduleType('work')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                        ${staffScheduleType === 'work' ? 'bg-dandy-500 text-white border-dandy-500' : 'bg-white text-gray-600 border-gray-300'}`}>
                      出勤（カスタム）
                    </button>
                    <button onClick={() => setStaffScheduleType('off')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                        ${staffScheduleType === 'off' ? 'bg-orange-400 text-white border-orange-400' : 'bg-white text-gray-600 border-gray-300'}`}>
                      休み
                    </button>
                  </div>

                  {staffScheduleType === 'work' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">勤務場所</label>
                      <input type="text" value={staffScheduleLocation}
                        onChange={e => setStaffScheduleLocation(e.target.value)}
                        placeholder="横浜スタジアム 等"
                        className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    {staffScheduleType === 'off' ? '※ 休みはバイト側には表示されません' : '※ バイト側カレンダーに出勤場所が表示されます'}
                  </p>

                  <div className="flex gap-2">
                    {staffOffEntries.get(staffScheduleModal.date) && (
                      <button onClick={() => { deleteStaffScheduleEntry(staffOffEntries.get(staffScheduleModal!.date)!.id); setStaffScheduleModal(null) }}
                        className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                        削除
                      </button>
                    )}
                    <button onClick={saveEntry}
                      disabled={staffScheduleType === 'work' && !staffScheduleLocation.trim()}
                      className="flex-1 bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600 disabled:opacity-40">
                      登録する
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── モーダル群 ── */}

      {showAddSlot && (
        <Modal title={`${newLocation}枠を追加`} onClose={() => setShowAddSlot(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">日付</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                min={`${selYear}-${String(selMonth).padStart(2,'0')}-01`}
                max={`${selYear}-${String(selMonth).padStart(2,'0')}-${getDaysInMonth(new Date(selYear, selMonth-1))}`}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">場所</label>
              <div className="flex gap-2">
                {['キッチンカー', '店舗'].map(loc => (
                  <button key={loc} type="button"
                    onClick={() => setNewLocation(loc)}
                    className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors
                      ${newLocation === loc ? 'bg-dandy-500 text-white border-dandy-500' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {loc}
                  </button>
                ))}
              </div>
              <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)}
                placeholder="その他の場所"
                className="mt-2 w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">時間（任意）</label>
              <div className="flex items-center gap-2">
                <input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <span className="text-gray-500 text-sm">〜</span>
                <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">必要人数</label>
              <input type="number" min={1} max={20} value={newCount}
                onChange={e => setNewCount(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">備考（任意）</label>
              <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button onClick={handleAddSlot}
              className="w-full bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600">
              追加する
            </button>
          </div>
        </Modal>
      )}

      {/* 枠編集モーダル（①） */}
      {editingSlot && (
        <Modal title="シフト枠を編集" onClose={() => setEditingSlot(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">日付</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">場所</label>
              <div className="flex gap-2 mb-2">
                {['キッチンカー', '店舗'].map(loc => (
                  <button key={loc} type="button"
                    onClick={() => setEditLocation(loc)}
                    className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors
                      ${editLocation === loc ? 'bg-dandy-500 text-white border-dandy-500' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {loc}
                  </button>
                ))}
              </div>
              <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">時間（任意）</label>
              <div className="flex items-center gap-2">
                <input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <span className="text-gray-500 text-sm">〜</span>
                <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">必要人数</label>
              <input type="number" min={1} max={20} value={editCount}
                onChange={e => setEditCount(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">備考（任意）</label>
              <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingSlot(null)}
                className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleSaveEdit}
                className="flex-1 bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600">
                保存する
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showPublish && (
        <Modal title="シフト表を公開" onClose={() => setShowPublish(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">URLを発行してバイトに共有します。</p>
            <div>
              <label className="block text-sm font-medium mb-1">締め切り日時（任意）</label>
              <input type="datetime-local" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">未設定の場合は手動で締め切るまで受付</p>
            </div>
            <button onClick={handlePublish}
              className="w-full bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700">
              公開してURLを発行
            </button>
          </div>
        </Modal>
      )}

      {showStore && (() => {
        const daysInMonth = getDaysInMonth(new Date(selYear, selMonth - 1))
        const firstDow = new Date(selYear, selMonth - 1, 1).getDay()
        const cells = Array.from({ length: Math.ceil((firstDow + daysInMonth) / 7) * 7 }, (_, i) => {
          const d = i - firstDow + 1
          return (d >= 1 && d <= daysInMonth) ? d : null
        })
        return (
          <Modal title="🏪 店舗シフトを一括追加" onClose={() => { setShowStore(false); setStoreDates(new Set()) }}>
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-800 font-medium">店舗 ・ 11:00-18:00（固定）</p>
                <p className="text-xs text-amber-600 mt-0.5">日付をタップして選択 → 一括追加</p>
              </div>

              {/* カレンダー */}
              <div>
                <div className="grid grid-cols-7 mb-1">
                  {DOW.map((d, i) => (
                    <div key={d} className={`text-center text-xs font-medium py-1
                      ${i === 0 ? 'text-red-500' : i === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((dayNum, i) => {
                    if (!dayNum) return <div key={i} />
                    const dateStr = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
                    const selected = storeDates.has(dateStr)
                    const dow = i % 7
                    // すでに店舗枠がある日はグレー
                    const hasStore = data.shiftSlots.some(s =>
                      s.date === dateStr && s.locationName === '店舗' && s.shiftMonthId === currentMonth?.id
                    )
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={hasStore}
                        onClick={() => toggleStoreDate(dateStr)}
                        className={`aspect-square rounded-lg text-sm font-medium transition-colors
                          ${hasStore
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : selected
                              ? 'bg-amber-500 text-white'
                              : dow === 0
                                ? 'text-red-500 hover:bg-red-50'
                                : dow === 6
                                  ? 'text-dandy-500 hover:bg-dandy-50'
                                  : 'text-gray-700 hover:bg-gray-100'}`}>
                        {dayNum}
                        {hasStore && <span className="block text-[8px] leading-none">済</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {storeDates.size > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                  {storeDates.size}日選択中
                </p>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">必要人数</label>
                <input type="number" min={1} max={10} value={storeCount}
                  onChange={e => setStoreCount(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              <button
                onClick={handleAddStore}
                disabled={storeDates.size === 0}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {storeDates.size === 0 ? '日付を選択してください' : `${storeDates.size}日分の店舗シフトを追加`}
              </button>
            </div>
          </Modal>
        )
      })()}

      {showCopy && (
        <Modal title="シフト枠をコピー" onClose={() => setShowCopy(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">コピー元の月</label>
              <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">選択してください</option>
                {otherMonths.map(m => (
                  <option key={m.id} value={m.id}>{m.year}年{m.month}月</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">コピー方式</label>
              <div className="space-y-2">
                {(['date', 'weekday'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" value={mode} checked={copyMode === mode} onChange={() => setCopyMode(mode)} />
                    {mode === 'date' ? '日付を維持（1日→1日）' : '曜日を維持（第1金曜→第1金曜）'}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button onClick={handleCopy}
              className="w-full bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600">
              コピーする
            </button>
          </div>
        </Modal>
      )}

      {/* カレンダー詳細ポップアップ（④） */}
      {calendarPopupSlot && (() => {
        const slot = calendarPopupSlot
        const responses = getSlotResponses(slot.id)
        const assignedResponses = responses.filter(r => r.isAssigned)
        const availableResponses = responses.filter(r => !r.isAssigned)
        return (
          <Modal
            title={format(parseISO(slot.date), 'M月d日(E)', { locale: ja })}
            onClose={() => setCalendarPopupSlot(null)}>
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-800">{slot.locationName}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {slot.status === 'confirmed'
                    ? <Badge label="確定済み" variant="green" />
                    : <Badge label="募集中" variant="blue" />}
                  <span className="text-xs text-gray-500">必要 {slot.requiredCount}名</span>
                </div>
                {slot.note && <p className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">{slot.note}</p>}
              </div>

              {assignedResponses.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-green-700">確定メンバー ({assignedResponses.length}名)</p>
                  <div className="space-y-1">
                    {assignedResponses.map(r => {
                      const m = data.members.find(mb => mb.id === r.memberId)
                      return m ? (
                        <div key={r.id} className="flex items-center gap-2 text-sm bg-green-50 rounded px-3 py-1.5">
                          <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                          <span className="font-medium text-green-800">{m.name}</span>
                          {m.city && <span className="text-xs text-gray-400">{m.city}</span>}
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              {availableResponses.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700">参加可能 ({availableResponses.length}名)</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableResponses.map(r => {
                      const m = data.members.find(mb => mb.id === r.memberId)
                      return m ? (
                        <div key={r.id} className="flex items-center gap-2 text-sm bg-dandy-50 rounded px-3 py-1.5">
                          <UserCheck size={13} className="text-dandy-500 shrink-0" />
                          <span className="text-gray-700">{m.name}</span>
                          {m.city && <span className="text-xs text-gray-400">{m.city}</span>}
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              {responses.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">まだ回答がありません</p>
              )}

              <button
                onClick={() => { setCalendarPopupSlot(null); openConfirm(slot) }}
                className={`w-full py-2 rounded-lg text-sm font-medium
                  ${slot.status === 'confirmed'
                    ? 'border border-dandy-300 text-dandy-600 hover:bg-dandy-50'
                    : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {slot.status === 'confirmed' ? '✏️ 担当を変更する' : 'シフトを確定する'}
              </button>
            </div>
          </Modal>
        )
      })()}

      {showConfirm && (() => {
        const respondedIds = new Set(getSlotResponses(showConfirm.id).map(r => r.memberId))
        return (
          <Modal
            title={showConfirm.status === 'confirmed' ? '担当メンバーを変更' : 'シフトを確定'}
            onClose={() => { setShowConfirm(null); setError('') }}>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {format(parseISO(showConfirm.date), 'M/d(E)', { locale: ja })} ・ {showConfirm.locationName} ・ 必要 {showConfirm.requiredCount}名
              </p>

              <div>
                <p className="text-sm font-medium mb-2">担当するスタッフを選択</p>
                <div className="space-y-1 max-h-56 overflow-y-auto border rounded-lg p-1">
                  {data.members.map(member => {
                    const checked = selectedMembers.includes(member.id)
                    const hasResponse = respondedIds.has(member.id)
                    return (
                      <label key={member.id}
                        className={`flex items-center gap-3 text-sm cursor-pointer px-3 py-2 rounded-lg transition-colors
                          ${checked ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setSelectedMembers(prev =>
                            e.target.checked ? [...prev, member.id] : prev.filter(id => id !== member.id)
                          )} />
                        <span className={`flex-1 font-medium ${checked ? 'text-green-800' : 'text-gray-700'}`}>
                          {member.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasResponse && <Badge label="回答済" variant="green" />}
                          {member.role === 'admin' && <Badge label="管理者" variant="blue" />}
                          {member.city && <span className="text-xs text-gray-400">{member.city}</span>}
                        </div>
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  選択中: {selectedMembers.length}名
                  {selectedMembers.length > 0 && selectedMembers.length !== showConfirm.requiredCount && (
                    <span className="ml-1 text-amber-500">（必要人数: {showConfirm.requiredCount}名）</span>
                  )}
                </p>
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button onClick={handleConfirm}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
                {showConfirm.status === 'confirmed' ? '変更を保存する' : '確定する'}
              </button>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
