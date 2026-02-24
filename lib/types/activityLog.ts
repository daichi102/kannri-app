export type ActivityType = 'phone' | 'visit' | 'email' | 'meeting'

export type ActivityLog = {
  id: string
  inquiry_id: string | null
  project_id: string | null
  activity_type: ActivityType
  content: string | null
  activity_at: string
  staff_id: string
  created_at: string
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  phone: '電話',
  visit: '訪問',
  email: 'メール',
  meeting: '商談',
}
