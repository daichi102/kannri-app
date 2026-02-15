export type EstimateStatus = 'draft' | 'pending_approval' | 'approved' | 'sent'

export type Estimate = {
  id: string
  project_id: string
  version: number
  status: EstimateStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type EstimateItem = {
  id: string
  estimate_id: string
  item_name: string
  unit_price: number
  quantity: number
  subtotal: number
  display_order: number
  created_at: string
  updated_at: string
}

export type EstimateWithItems = Estimate & {
  items: EstimateItem[]
}

export {}
