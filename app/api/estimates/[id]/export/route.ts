import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toEstimateJson } from '@/lib/estimate/json'
import type { Customer } from '@/lib/types/customer'
import type { Estimate, EstimateItem } from '@/lib/types/estimate'
import type { Project } from '@/lib/types/project'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: '見積IDが必要です' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { data: estimateData, error: estimateError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single()

  if (estimateError || !estimateData) {
    return NextResponse.json({ error: '見積が見つかりません' }, { status: 404 })
  }

  const estimate = estimateData as Estimate

  const [{ data: projectData }, { data: itemsData }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', estimate.project_id).single(),
    supabase.from('estimate_items').select('*').eq('estimate_id', id).order('display_order'),
  ])

  if (!projectData) {
    return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  }

  const project = projectData as Project
  const items = (itemsData ?? []) as EstimateItem[]

  let customer: Customer | null = null
  if (project.customer_id) {
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .eq('id', project.customer_id)
      .single()
    if (customerData) customer = customerData as Customer
  }

  const payload = toEstimateJson(estimate, items, project, customer)
  const fileName = `${payload.estimateNo || 'estimate'}-v${estimate.version}.json`

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
