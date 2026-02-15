// 原価の区分
export type CostCategory = 'material' | 'other'

// 経費の区分
export type ExpenseCategory = 'transport' | 'highway' | 'accommodation' | 'other'

// 原価
export type ProjectCost = {
  id: string
  project_id: string
  category: CostCategory
  description: string | null
  amount: number
  created_at: string
  updated_at: string
}

// 人件費
export type ProjectLaborCost = {
  id: string
  project_id: string
  worker_name: string
  amount: number
  created_at: string
  updated_at: string
}

// 経費
export type ProjectExpense = {
  id: string
  project_id: string
  category: ExpenseCategory
  description: string | null
  amount: number
  created_at: string
  updated_at: string
}

// 入金種別
export type PaymentType = 'start' | 'middle' | 'completion'

// 入金情報
export type ProjectPayment = {
  id: string
  project_id: string
  payment_type: PaymentType
  amount: number
  payment_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export {}
