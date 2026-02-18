import { createClient } from '@supabase/supabase-js'

export type ReceiptData = {
  form_data: Record<string, unknown>
  project_id: string
  project: {
    project_number: string
    product_code?: string | null
    customer?: { name: string } | null
    staff?: { name: string } | null
  }
}

/**
 * トークンで控えデータを取得（サーバー専用・SUPABASE_SERVICE_ROLE_KEY 使用）
 */
export async function getReceiptByToken(token: string): Promise<ReceiptData | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await supabase
    .from('project_completion_checks')
    .select('form_data, project_id, project:projects(project_number, product_code, customer:customers(name), staff:staff(name))')
    .contains('form_data', { receipt_token: token })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as ReceiptData
}
