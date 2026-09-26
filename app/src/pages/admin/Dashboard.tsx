import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarDays, Users, AlertCircle, CheckCircle2, Clock, Database, UserPlus, Link } from 'lucide-react'
import { useStoreContext } from '@/store/StoreContext'
import { Badge } from '@/components/Badge'

const statusLabel: Record<string, { label: string; variant: 'blue' | 'green' | 'gray' }> = {
  draft:     { label: '下書き',   variant: 'gray' },
  published: { label: '募集中',   variant: 'blue' },
  closed:    { label: '締め切り', variant: 'green' },
}

export function Dashboard() {
  const { data, spreadsheetId, disconnectSheet, connectExistingSheet, isLoadingSheets } = useStoreContext()
  const navigate = useNavigate()
  const [showSheetChange, setShowSheetChange] = useState(false)
  const [newSheetId, setNewSheetId] = useState('')
  const [sheetError, setSheetError] = useState('')
  const [adminLinkCopied, setAdminLinkCopied] = useState(false)

  const adminLoginUrl = `${window.location.origin}${window.location.pathname}#/admin/login`
  const handleCopyAdminLink = () => {
    navigator.clipboard.writeText(adminLoginUrl)
    setAdminLinkCopied(true)
    setTimeout(() => setAdminLinkCopied(false), 2000)
  }

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1

  const sortedMonths = [...data.shiftMonths].sort(
    (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)
  )

  const totalStaff = data.members.filter(m => m.role === 'user').length
  const totalAdmins = data.members.filter(m => m.role === 'admin').length

  const currentMonthSlots = data.shiftSlots.filter(s => {
    const m = data.shiftMonths.find(m => m.id === s.shiftMonthId)
    return m?.year === thisYear && m?.month === thisMonth
  })
  const undecidedCount = currentMonthSlots.filter(s => s.status === 'undecided').length
  const confirmedCount = currentMonthSlots.filter(s => s.status === 'confirmed').length

  const handleChangeSheet = async () => {
    const id = newSheetId.trim()
    if (!id) { setSheetError('スプレッドシートIDを入力してください'); return }
    setSheetError('')
    try {
      await connectExistingSheet(id)
      setShowSheetChange(false)
      setNewSheetId('')
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : '接続に失敗しました')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 sm:pb-6">
      {/* タイトル + スプレッドシート設定 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>
        <button
          onClick={() => setShowSheetChange(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-dandy-500 border rounded-lg px-2.5 py-1.5 hover:bg-dandy-50 transition-colors"
        >
          <Database size={13} />
          スプレッドシート変更
        </button>
      </div>

      {/* スプレッドシート変更パネル */}
      {showSheetChange && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">スプレッドシートを変更する</p>
            {spreadsheetId && (
              <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{spreadsheetId}</p>
            )}
          </div>
          <p className="text-xs text-gray-500">
            スプレッドシートのURL中の <code className="bg-gray-100 px-1 rounded">/d/<strong>XXXX</strong>/edit</code> の <strong>XXXX</strong> 部分を貼り付けてください
          </p>
          <input
            type="text"
            value={newSheetId}
            onChange={e => setNewSheetId(e.target.value)}
            placeholder="スプレッドシートID"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
          />
          {sheetError && <p className="text-red-500 text-xs">{sheetError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowSheetChange(false); setNewSheetId(''); setSheetError('') }}
              className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleChangeSheet}
              disabled={isLoadingSheets}
              className="flex-1 bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600 disabled:opacity-50"
            >
              {isLoadingSheets ? '接続中...' : '接続する'}
            </button>
          </div>
          {spreadsheetId && (
            <button
              onClick={() => { disconnectSheet(); setShowSheetChange(false) }}
              className="w-full text-xs text-red-400 hover:text-red-600 py-1"
            >
              接続を解除してセットアップ画面に戻る
            </button>
          )}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users size={20} className="text-dandy-400" />} label="バイト" value={`${totalStaff}名`} />
        <StatCard icon={<Users size={20} className="text-dandy-400" />} label="管理者" value={`${totalAdmins}名`} />
        <StatCard icon={<CheckCircle2 size={20} className="text-green-500" />} label="今月確定枠" value={`${confirmedCount}枠`} />
        <StatCard icon={<AlertCircle size={20} className="text-red-500" />} label="今月未確定" value={`${undecidedCount}枠`} color={undecidedCount > 0 ? 'red' : undefined} />
      </div>

      {/* 管理者招待リンク */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-dandy-400" />
            <p className="text-sm font-semibold text-gray-700">管理者を招待する</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          新しい管理者にこのURLを共有してください。Google アカウントでログインすると管理者として登録されます。
        </p>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
            <Link size={12} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 font-mono truncate">{adminLoginUrl}</span>
          </div>
          <button
            onClick={handleCopyAdminLink}
            className="flex items-center gap-1.5 text-xs font-bold bg-dandy-500 text-white px-4 py-2 rounded-lg hover:bg-dandy-600 transition-colors shrink-0">
            {adminLinkCopied ? '✓ コピー済み' : 'コピー'}
          </button>
        </div>
      </div>

      {/* 月別シフト一覧 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">月別シフト</h2>
          <button
            onClick={() => navigate('/admin/shifts')}
            className="text-sm text-dandy-500 hover:underline flex items-center gap-1"
          >
            <CalendarDays size={14} />
            シフト管理へ
          </button>
        </div>

        {sortedMonths.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            シフトがまだ作成されていません
          </div>
        ) : (
          <div className="space-y-2">
            {sortedMonths.map(month => {
              const slots = data.shiftSlots.filter(s => s.shiftMonthId === month.id)
              const undecided = slots.filter(s => s.status === 'undecided').length
              const { label, variant } = statusLabel[month.status]

              return (
                <div
                  key={month.id}
                  onClick={() => navigate('/admin/shifts', { state: { monthId: month.id } })}
                  className="bg-white rounded-xl border p-4 flex items-center justify-between cursor-pointer hover:bg-dandy-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Clock size={18} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-800">
                        {month.year}年{month.month}月
                      </p>
                      <p className="text-xs text-gray-500">
                        {slots.length}枠
                        {month.deadlineAt && (
                          <> ・ 締切: {format(new Date(month.deadlineAt), 'M/d HH:mm', { locale: ja })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {undecided > 0 && (
                      <Badge label={`未確定 ${undecided}`} variant="red" />
                    )}
                    <Badge label={label} variant={variant} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'red'
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${color === 'red' ? 'border-red-200' : ''}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <p className={`text-2xl font-bold ${color === 'red' ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
