import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { StoreProvider, useStoreContext } from '@/store/StoreContext'
import { AdminLayout } from '@/components/Layout'
import { Login } from '@/pages/admin/Login'
import { Dashboard } from '@/pages/admin/Dashboard'
import { ShiftManagement } from '@/pages/admin/ShiftManagement'
import { StaffManagement } from '@/pages/admin/StaffManagement'
import { StaffResponse } from '@/pages/staff/StaffResponse'
import { PublicCalendar } from '@/pages/staff/PublicCalendar'

function AdminGuard() {
  const { currentAdmin } = useStoreContext()
  if (!currentAdmin || currentAdmin.role !== 'admin') return <Navigate to="/admin/login" replace />
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* バイト向け（認証不要） */}
      <Route path="/s/:monthId" element={<StaffResponse />} />
      <Route path="/cal/:monthId" element={<PublicCalendar />} />

      {/* 管理者向け */}
      <Route path="/admin/login" element={<Login />} />
      <Route element={<AdminGuard />}>
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/shifts" element={<ShiftManagement />} />
        <Route path="/admin/staff" element={<StaffManagement />} />
      </Route>

      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </StoreProvider>
  )
}
