import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { format, getDaysInMonth, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { gasGet } from '@/services/gasService'
import { ShiftMonth, ShiftSlot, StaffResponse } from '@/types'
import { Loader2, CalendarDays } from 'lucide-react'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

interface GasData {
  shiftMonth: ShiftMonth
  slots: ShiftSlot[]
  responses: StaffResponse[]
}

export function PublicCalendar() {
  const { monthId } = useParams<{ monthId: string }>()
  const [searchParams] = useSearchParams()
  const gasUrl = searchParams.get('gas') ?? ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gasData, setGasData] = useState<GasData | null>(null)

  useEffect(() => {
    if (!monthId || !gasUrl) { setError('URLが不正です'); setLoading(false); return }
    gasGet<GasData>(gasUrl, { monthId })
      .then(d => {
        setGasData(d)
        // メンバー名はレスポンスから取れないのでIDのみ表示
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [monthId, gasUrl])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <Loader2 size={28} className="animate-spin text-dandy-500" />
        <p className="text-sm">読み込み中...</p>
      </div>
    </div>
  )

  if (error || !gasData) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border p-6 text-center max-w-sm w-full">
        <p className="text-red-500 text-sm">{error || 'データが見つかりません'}</p>
      </div>
    </div>
  )

  const { shiftMonth, slots } = gasData
  const confirmedSlots = slots.filter(s => s.status === 'confirmed')

  const firstDow = new Date(shiftMonth.year, shiftMonth.month - 1, 1).getDay()
  const days = getDaysInMonth(new Date(shiftMonth.year, shiftMonth.month - 1))
  const total = Math.ceil((firstDow + days) / 7) * 7
  const calendarCells = Array.from({ length: total }, (_, i) => {
    const d = i - firstDow + 1
    return d >= 1 && d <= days ? d : null
  })

  const slotsByDate = new Map<string, ShiftSlot[]>()
  confirmedSlots.forEach(s => {
    if (!slotsByDate.has(s.date)) slotsByDate.set(s.date, [])
    slotsByDate.get(s.date)!.push(s)
  })

  const now = new Date()

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* ヘッダー */}
      <div className="bg-dandy-500 text-white px-4 py-4 flex items-center gap-2">
        <CalendarDays size={20} />
        <h1 className="font-bold text-lg">{shiftMonth.year}年{shiftMonth.month}月 シフト表</h1>
      </div>

      <div className="max-w-2xl mx-auto px-3 pt-4 space-y-4">
        {confirmedSlots.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            まだ確定したシフトがありません
          </div>
        ) : (
          <>
            {/* カレンダー */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h2 className="font-semibold text-gray-700 text-sm">{shiftMonth.year}年{shiftMonth.month}月</h2>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-7 mb-1">
                  {DOW.map((d, i) => (
                    <div key={d} className={`text-center text-xs font-medium py-1
                      ${i === 0 ? 'text-red-500' : i === 6 ? 'text-dandy-400' : 'text-gray-500'}`}>
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
                  {calendarCells.map((dayNum, i) => {
                    if (!dayNum) return <div key={i} className="bg-gray-50 min-h-14" />
                    const dateStr = `${shiftMonth.year}-${String(shiftMonth.month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
                    const daySlots = slotsByDate.get(dateStr) ?? []
                    const dow = i % 7
                    const isToday = shiftMonth.year === now.getFullYear() && shiftMonth.month === now.getMonth() + 1 && dayNum === now.getDate()
                    return (
                      <div key={i} className="bg-white p-1 min-h-14">
                        <p className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-dandy-500 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-dandy-400' : 'text-gray-700'}`}>
                          {dayNum}
                        </p>
                        <div className="space-y-0.5">
                          {daySlots.map(slot => (
                            <div key={slot.id}
                              className="text-xs rounded px-1 py-0.5 truncate leading-tight bg-green-100 text-green-700 border border-green-200">
                              {slot.locationName}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* リスト表示 */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-600 px-1">確定シフト一覧</h2>
              {Array.from(slotsByDate.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, daySlots]) => {
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
                        {daySlots.map(slot => (
                          <div key={slot.id} className="px-4 py-3">
                            <p className="font-medium text-sm text-gray-800">{slot.locationName}</p>
                            {slot.note && <p className="text-xs text-gray-400 mt-0.5">{slot.note}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
