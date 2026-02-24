export type InquiryStatus =
  | 'pending'    // 未対応
  | 'in_progress' // 対応中
  | 'estimate_done' // 見積済
  | 'won'        // 受注
  | 'lost'       // 失注

export type Inquiry = {
  id: string
  customer_id: string | null
  contact_name: string | null
  contact_phone: string
  contact_address: string | null
  inquiry_content: string
  staff_id: string
  origin_id: string | null
  status: InquiryStatus
  project_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: '未対応',
  in_progress: '対応中',
  estimate_done: '見積済',
  won: '受注',
  lost: '失注',
}
