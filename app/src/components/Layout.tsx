import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Users, LayoutDashboard, LogOut, Database, Settings } from 'lucide-react'
import { useStoreContext } from '@/store/StoreContext'
import { getGasUrl, saveGasUrl } from '@/services/gasService'

const navItems = [
  { to: '/admin/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/admin/shifts',    label: 'シフト管理',     icon: CalendarDays },
  { to: '/admin/staff',     label: 'スタッフ管理',   icon: Users },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { currentAdmin, logout, changeSheet, spreadsheetId, isLoadingSheets, saveGasUrlToSheet } = useStoreContext()

  const [showChangeSheet, setShowChangeSheet] = useState(false)
  const [newSheetId, setNewSheetId] = useState('')
  const [sheetError, setSheetError] = useState('')

  const [showSettings, setShowSettings] = useState(false)
  const [settingsGasUrl, setSettingsGasUrl] = useState(() => getGasUrl() ?? '')
  const [gasSaved, setGasSaved] = useState(false)

  const handleSaveGasUrl = () => {
    saveGasUrl(settingsGasUrl)
    saveGasUrlToSheet(settingsGasUrl)
    setGasSaved(true)
    setTimeout(() => setGasSaved(false), 2000)
  }

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const handleChangeSheet = async () => {
    setSheetError('')
    try {
      await changeSheet(newSheetId)
      setShowChangeSheet(false)
      setNewSheetId('')
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー */}
      <header className="bg-dandy-500 text-white shadow">
        <div style={{ height: 'env(safe-area-inset-top)' }} />
        <div className="px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg tracking-wide">シフト管理</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:block">{currentAdmin?.name}</span>
          <button
            onClick={() => { setSettingsGasUrl(getGasUrl() ?? ''); setShowSettings(true) }}
            className="flex items-center gap-1 hover:text-dandy-100"
            title="設定">
            <Settings size={15} />
          </button>
          <button
            onClick={() => { setShowChangeSheet(true); setNewSheetId(spreadsheetId ?? '') }}
            className="flex items-center gap-1 hover:text-dandy-100"
            title="スプレッドシートを変更">
            <Database size={15} />
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1 hover:text-dandy-100">
            <LogOut size={16} />
            <span className="hidden sm:block">ログアウト</span>
          </button>
        </div>
        </div>
      </header>

      {/* スプレッドシート変更モーダル */}
      {showChangeSheet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Database size={18} className="text-dandy-500" />
              スプレッドシートを変更
            </h2>
            <p className="text-xs text-gray-500">
              現在: <span className="font-mono text-gray-700 break-all">{spreadsheetId ?? '未設定'}</span>
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">新しいスプレッドシートID</label>
              <input
                type="text"
                value={newSheetId}
                onChange={e => setNewSheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                シートURLの /spreadsheets/d/<span className="font-bold">ここの部分</span>/edit
              </p>
            </div>
            {sheetError && <p className="text-red-500 text-xs">{sheetError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowChangeSheet(false); setSheetError('') }}
                className="flex-1 border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button
                onClick={handleChangeSheet}
                disabled={isLoadingSheets || !newSheetId.trim()}
                className="flex-1 bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600 disabled:opacity-50">
                {isLoadingSheets ? '接続中...' : '変更する'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 設定モーダル */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Settings size={18} className="text-dandy-500" />
              設定
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GAS URL</label>
              <p className="text-xs text-gray-400 mb-2">Google Apps ScriptのウェブアプリURL（バイト回答機能に必要）</p>
              <input
                type="text"
                value={settingsGasUrl}
                onChange={e => setSettingsGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSettings(false); setGasSaved(false) }}
                className="flex-1 border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                閉じる
              </button>
              <button
                onClick={handleSaveGasUrl}
                className="flex-1 bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600">
                {gasSaved ? '✓ 保存しました' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1">
        {/* サイドバー（デスクトップ） */}
        <nav className="hidden sm:flex flex-col w-48 bg-white border-r pt-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-dandy-50 hover:text-dandy-600 transition-colors
                ${pathname.startsWith(to) ? 'bg-dandy-50 text-dandy-600 border-r-2 border-dandy-500' : 'text-gray-600'}`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        {/* メインコンテンツ */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>

      {/* ボトムナビ（モバイル） */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center py-2 text-xs
                ${pathname.startsWith(to) ? 'text-dandy-500' : 'text-gray-500'}`}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
