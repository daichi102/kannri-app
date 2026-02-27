export type EstimateStatus = 'draft' | 'pending_approval' | 'approved' | 'sent'

export type Estimate = {
  id: string
  project_id: string
  version: number
  status: EstimateStatus
  estimate_no: string | null
  subject: string | null
  issue_date: string | null
  valid_until: string | null
  tax_mode: 'exclusive' | 'inclusive' | null
  notes: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type EstimateItem = {
  id: string
  estimate_id: string
  item_name: string
  unit: string | null
  unit_price: number
  quantity: number
  subtotal: number
  tax_rate: number
  amount_excl_tax: number
  tax_amount: number
  amount_incl_tax: number
  display_order: number
  created_at: string
  updated_at: string
}

export type EstimateWithItems = Estimate & {
  items: EstimateItem[]
}

export type EstimateJsonItemV1 = {
  lineNo: number
  description: string
  qty: number
  unit: string
  unitPrice: number
  taxRate: number
  amountExclTax: number
  taxAmount: number
  amountInclTax: number
}

export type EstimateJsonV1 = {
  format: 'kannri-estimate'
  version: '1.0'
  estimateNo: string
  projectId: string
  subject: string
  issueDate: string
  validUntil: string
  taxMode: 'exclusive' | 'inclusive'
  customer: {
    name: string
    address: string
  }
  issuer: {
    companyName: string
    address: string
  }
  items: EstimateJsonItemV1[]
  totals: {
    subtotalExclTax: number
    totalTax: number
    totalInclTax: number
  }
  notes: string
}

export {}
