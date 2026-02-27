import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcLine, type TaxMode } from '@/lib/estimate/calc'
import { parseEstimateJson } from '@/lib/estimate/json'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  let jsonBody: unknown
  try {
    jsonBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSONを読み取れませんでした' }, { status: 400 })
  }

  let parsed
  try {
    parsed = parseEstimateJson(jsonBody)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '見積JSONの検証に失敗しました' },
      { status: 400 }
    )
  }

  let projectId = parsed.projectId
  if (!projectId && parsed.estimateNo) {
    const { data: projectByNo } = await supabase
      .from('projects')
      .select('id')
      .eq('project_number', parsed.estimateNo)
      .maybeSingle()
    projectId = projectByNo?.id ?? ''
  }
  if (!projectId) {
    return NextResponse.json({ error: '案件を特定できません（projectId または estimateNo）' }, { status: 400 })
  }

  const { data: latestVersion } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = latestVersion?.version ? Number(latestVersion.version) + 1 : 1

  const { data: createdEstimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      version: nextVersion,
      status: 'draft',
      estimate_no: parsed.estimateNo || null,
      subject: parsed.subject || null,
      issue_date: parsed.issueDate || null,
      valid_until: parsed.validUntil || null,
      tax_mode: parsed.taxMode as TaxMode,
      notes: parsed.notes || null,
    })
    .select('id, version')
    .single()

  if (estimateError || !createdEstimate) {
    return NextResponse.json({ error: '見積の作成に失敗しました' }, { status: 500 })
  }

  const itemsToInsert = parsed.items.map((item, idx) => {
    const computed = calcLine(
      {
        item_name: item.description,
        unit: item.unit,
        unit_price: Number(item.unitPrice) || 0,
        quantity: Number(item.qty) || 0,
        tax_rate: Number(item.taxRate) || 0.1,
      },
      parsed.taxMode as TaxMode
    )
    return {
      estimate_id: createdEstimate.id,
      item_name: computed.item_name,
      unit: computed.unit,
      unit_price: computed.unit_price,
      quantity: computed.quantity,
      subtotal: computed.subtotal,
      tax_rate: computed.tax_rate,
      amount_excl_tax: computed.amount_excl_tax,
      tax_amount: computed.tax_amount,
      amount_incl_tax: computed.amount_incl_tax,
      display_order: idx,
    }
  })

  if (itemsToInsert.length > 0) {
    const { error: itemsError } = await supabase.from('estimate_items').insert(itemsToInsert)
    if (itemsError) {
      return NextResponse.json({ error: '見積明細の保存に失敗しました' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    estimateId: createdEstimate.id,
    version: createdEstimate.version,
    message: '見積JSONを取り込みました',
  })
}
