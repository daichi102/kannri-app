export type DepositScheduleStatus =
  | 'scheduled'
  | 'delayed'
  | 'uncollected'
  | 'completed'
  | 'discrepancy'

export type DepositSchedule = {
  id: string
  project_id: string
  customer_id: string
  scheduled_date: string
  scheduled_amount: number
  status: DepositScheduleStatus
  is_confirmed: boolean
  changed_by: string | null
  created_at: string
  updated_at: string
}

export const DEPOSIT_SCHEDULE_STATUS_LABEL: Record<DepositScheduleStatus, string> = {
  scheduled: '予定',
  delayed: '遅延',
  uncollected: '未回収',
  completed: '入金済',
  discrepancy: '相違',
}
