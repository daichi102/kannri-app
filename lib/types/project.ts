export type Department = 'delivery' | 'construction' | 'repair'

export type WorkType = 'aircon' | 'construction' | 'delivery'

export type ProjectStatus =
  | 'estimate_draft'
  | 'estimate_sent'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Project = {
  id: string
  project_number: string
  department: Department
  work_type: WorkType
  customer_id: string
  staff_id: string
  start_date: string | null
  due_date: string | null
  status: ProjectStatus
  notes: string | null
  product_name: string | null
  product_code: string | null
  product_color: string | null
  product_quantity: number | null
  has_warranty: boolean | null
  created_at: string
  updated_at: string
}

export {}