import { useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { UserPlus, Trash2, Pencil, Loader2 } from 'lucide-react'
import { useStoreContext } from '@/store/StoreContext'
import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { Member, Role } from '@/types'

export function StaffManagement() {
  const { data, currentAdmin, addMember, updateMember, updateMemberRole, deleteMember } = useStoreContext()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'admin' | 'staff' | 'user'>('all')
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<Role>('user')

  // 編集モーダル用
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editError, setEditError] = useState('')

  const filtered = data.members.filter(m => filter === 'all' || m.role === filter)

  const ROLE_LABEL: Record<Role, string> = { admin: '管理者', staff: '社員', user: 'バイト' }
  const ROLE_NEXT: Record<Role, Role> = { admin: 'staff', staff: 'user', user: 'admin' }

  const handleAdd = () => {
    if (!name.trim() || !email.trim()) { setError('名前とメールは必須です'); return }
    if (data.members.find(m => m.email === email.trim())) { setError('このメールは既に登録されています'); return }
    addMember({ name: name.trim(), email: email.trim(), city: city.trim(), role: addRole })
    setName(''); setEmail(''); setCity(''); setError(''); setAddRole('user'); setShowAdd(false)
  }

  const handleRoleChange = async (memberId: string, currentRole: Role, memberName: string) => {
    if (!currentAdmin) return
    const newRole = ROLE_NEXT[currentRole]
    const label = ROLE_LABEL[newRole]
    if (!confirm(`${memberName} を「${label}」に変更しますか？\n（スプレッドシートに即時反映されます）`)) return
    setRoleChangingId(memberId)
    try {
      await updateMemberRole(memberId, newRole, currentAdmin.id)
    } catch (e) {
      alert(`権限変更に失敗しました: ${String(e)}\nスプレッドシートへの接続を確認してください。`)
    } finally {
      setRoleChangingId(null)
    }
  }

  const handleDelete = (memberId: string, memberName: string) => {
    if (!confirm(`${memberName} を削除しますか？`)) return
    deleteMember(memberId)
  }

  const handleOpenEdit = (member: Member) => {
    setEditName(member.name)
    setEditEmail(member.email)
    setEditCity(member.city ?? '')
    setEditError('')
    setEditingMember(member)
  }

  const handleSaveEdit = () => {
    if (!editingMember) return
    if (!editName.trim() || !editEmail.trim()) { setEditError('名前とメールは必須です'); return }
    // メール変更時の重複チェック
    if (editEmail.trim() !== editingMember.email) {
      if (data.members.find(m => m.email === editEmail.trim() && m.id !== editingMember.id)) {
        setEditError('このメールアドレスは既に使われています')
        return
      }
    }
    updateMember(editingMember.id, {
      name: editName.trim(),
      email: editEmail.trim(),
      city: editCity.trim(),
    })
    setEditingMember(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20 sm:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">スタッフ管理</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 bg-dandy-500 hover:bg-dandy-600 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          <UserPlus size={14} /> スタッフ追加
        </button>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'admin', 'staff', 'user'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors
              ${filter === f ? 'bg-dandy-500 text-white border-dandy-500' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'all' ? `全員 (${data.members.length})`
              : f === 'admin' ? `管理者 (${data.members.filter(m=>m.role==='admin').length})`
              : f === 'staff' ? `社員 (${data.members.filter(m=>m.role==='staff').length})`
              : `バイト (${data.members.filter(m=>m.role==='user').length})`}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
          スタッフが登録されていません
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y overflow-hidden">
          {filtered.map(member => (
            <div key={member.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-dandy-100 flex items-center justify-center text-dandy-600 font-bold text-sm shrink-0">
                {member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{member.name}</span>
                  <Badge
                    label={member.role === 'admin' ? '管理者' : member.role === 'staff' ? '社員' : 'バイト'}
                    variant={member.role === 'admin' ? 'blue' : member.role === 'staff' ? 'green' : 'gray'} />
                </div>
                <p className="text-xs text-gray-400 truncate">{member.email}</p>
                {member.city && <p className="text-xs text-gray-400">{member.city}</p>}
              </div>
              <div className="text-xs text-gray-400 hidden sm:block shrink-0">
                {format(new Date(member.createdAt), 'M/d登録', { locale: ja })}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* 編集ボタン */}
                <button
                  onClick={() => handleOpenEdit(member)}
                  title="名前・住所を編集"
                  className="text-gray-400 hover:text-dandy-400 p-1"
                >
                  <Pencil size={15} />
                </button>
                {member.id !== currentAdmin?.id && (
                  <button
                    onClick={() => handleRoleChange(member.id, member.role, member.name)}
                    disabled={roleChangingId === member.id}
                    title={`→ ${ROLE_LABEL[ROLE_NEXT[member.role]]} に変更`}
                    className="text-xs text-gray-400 hover:text-dandy-500 border rounded px-1.5 py-0.5 hover:border-dandy-400 disabled:opacity-50 transition-colors"
                  >
                    {roleChangingId === member.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : `→${ROLE_LABEL[ROLE_NEXT[member.role]]}`}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(member.id, member.name)}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加モーダル */}
      {showAdd && (
        <Modal title="スタッフを追加" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">名前 *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="田中 花子"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">メールアドレス *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="hanako@example.com"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">住所（市区町村）</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="横浜市"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">例: 横浜市・葛飾区 など市区町村までご入力ください</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">役割</label>
              <div className="flex gap-2">
                {(['user', 'staff', 'admin'] as Role[]).map(r => (
                  <button key={r} type="button"
                    onClick={() => setAddRole(r)}
                    className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors
                      ${addRole === r ? 'bg-dandy-500 text-white border-dandy-500' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button onClick={handleAdd}
              className="w-full bg-dandy-500 text-white py-2 rounded-lg text-sm hover:bg-dandy-600">
              追加する
            </button>
          </div>
        </Modal>
      )}

      {/* 編集モーダル */}
      {editingMember && (
        <Modal title="スタッフ情報を編集" onClose={() => setEditingMember(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">名前 *</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">メールアドレス *</label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">住所（市区町村）</label>
              <input type="text" value={editCity} onChange={e => setEditCity(e.target.value)}
                placeholder="横浜市"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">例: 横浜市・葛飾区 など市区町村までご入力ください</p>
            </div>
            {editError && <p className="text-red-500 text-xs">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEditingMember(null)}
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
    </div>
  )
}
