export type Role = 'user' | 'admin'
export type ShiftMonthStatus = 'draft' | 'published' | 'closed'
export type ShiftSlotStatus = 'draft' | 'confirmed' | 'undecided'

export interface Member {
  id: string
  name: string
  email: string
  city: string
  role: Role
  createdAt: string
  lastAccessedAt: string
  lineUserId?: string
}

export interface ShiftMonth {
  id: string
  year: number
  month: number
  status: ShiftMonthStatus
  deadlineAt: string | null
  publishedAt: string | null
  closedAt: string | null
}

export interface ShiftSlot {
  id: string
  shiftMonthId: string
  locationName: string
  date: string // YYYY-MM-DD
  requiredCount: number
  status: ShiftSlotStatus
  note: string
}

export interface StaffResponse {
  id: string
  shiftSlotId: string
  memberId: string
  isAvailable: boolean
  submittedAt: string
  isAssigned: boolean
}

export interface AppData {
  members: Member[]
  shiftMonths: ShiftMonth[]
  shiftSlots: ShiftSlot[]
  staffResponses: StaffResponse[]
  currentAdminId: string | null
}
