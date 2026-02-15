/**
 * 売上管理票（1案件=1レコード）
 */
export type ProjectSale = {
  id: string
  project_id: string
  sales_amount: number
  is_fixed: boolean
  fixed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
