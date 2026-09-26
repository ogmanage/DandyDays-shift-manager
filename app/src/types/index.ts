export type Role = 'user' | 'staff' | 'admin'
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
  startTime?: string        // "HH:MM"
  endTime?: string          // "HH:MM"
  isPrivate?: boolean       // true = バイト側に非表示（社員の休みなど）
  isStaffSchedule?: boolean // true = 社員シフト（通常シフト枠と区別）
}

export interface StaffResponse {
  id: string
  shiftSlotId: string
  memberId: string
  isAvailable: boolean
  submittedAt: string
  isAssigned: boolean
  requestedStartTime?: string // バイトが希望する開始時間（部分参加）
  requestedEndTime?: string   // バイトが希望する終了時間（部分参加）
}

export interface AppData {
  members: Member[]
  shiftMonths: ShiftMonth[]
  shiftSlots: ShiftSlot[]
  staffResponses: StaffResponse[]
  currentAdminId: string | null
}
