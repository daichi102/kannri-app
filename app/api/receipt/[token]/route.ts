import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'サーバー設定エラー。Vercelの環境変数に SUPABASE_SERVICE_ROLE_KEY を設定してください。' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await supabase
    .from('project_completion_checks')
    .select('form_data, project_id, project:projects(project_number, product_code, customer:customers(name), staff:staff(name))')
    .contains('form_data', { receipt_token: token })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: '控えが見つかりません。URLまたはトークンをご確認ください。' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json(data, { headers: NO_STORE_HEADERS })
}
