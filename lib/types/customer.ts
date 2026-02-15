export type CustomerType = 'company' | 'individual'

export type Customer = {
  id: string
  type: CustomerType
  company_name: string | null
  name: string
  name_kana: string
  address: string
  phone: string
  contact_name: string | null
  created_at: string
  updated_at: string
}