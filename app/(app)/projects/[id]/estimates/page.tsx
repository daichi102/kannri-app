'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserRole, getCurrentUserProfile, isAdmin } from '@/lib/auth'
import type { Estimate, EstimateItem, EstimateStatus } from '@/lib/types/estimate'
import type { Customer } from '@/lib/types/customer'
import type { Project } from '@/lib/types/project'
import { calcLine, calcTotals, type TaxMode } from '@/lib/estimate/calc'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: '下書き',
  pending_approval: '承認待ち',
  approved: '承認済み',
  sent: '送付済み',
}

const ISSUER_COMPANY_NAME = '株式会社アイザ'
const ISSUER_ADDRESS = '174-0076 東京都板橋区上板橋2-2-6'

function normalizeItem(item: Partial<EstimateItem>, estimateId = ''): EstimateItem {
  return {
    id: item.id ?? `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    estimate_id: item.estimate_id ?? estimateId,
    item_name: item.item_name ?? '',
    unit: item.unit ?? '式',
    unit_price: Number(item.unit_price) || 0,
    quantity: Number(item.quantity) || 0,
    subtotal: Number(item.subtotal) || 0,
    tax_rate: Number(item.tax_rate) || 0.1,
    amount_excl_tax: Number(item.amount_excl_tax) || 0,
    tax_amount: Number(item.tax_amount) || 0,
    amount_incl_tax: Number(item.amount_incl_tax) || 0,
    display_order: Number(item.display_order) || 0,
    created_at: item.created_at ?? new Date().toISOString(),
    updated_at: item.updated_at ?? new Date().toISOString(),
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return error instanceof Error ? error.message : fallback
}

function openNativeDatePicker(event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget
  if (typeof input.showPicker === 'function') {
    input.showPicker()
  }
}

function isUndefinedColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string }
  return err.code === '42703' || /column .* does not exist/i.test(err.message ?? '')
}

function EstimatePageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const shouldAutoEdit = searchParams.get('edit') === '1'

  const [project, setProject] = useState<Project | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const autoEditTriggeredRef = useRef(false)

  useEffect(() => {
    getCurrentUserRole().then(setUserRole)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      
      // 案件情報を取得
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectData) {
        const projectRecord = projectData as Project
        setProject(projectRecord)
        if (projectRecord.customer_id) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('id', projectRecord.customer_id)
            .maybeSingle()
          if (customerData) {
            setCustomer(customerData as Customer)
          }
        }
      }

      // 最新の見積を取得
      const { data: estimateData } = await supabase
        .from('estimates')
        .select('*')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (estimateData) {
        const normalizedEstimate = {
          ...(estimateData as Estimate),
          estimate_no: (estimateData as Estimate).estimate_no ?? null,
          subject: (estimateData as Estimate).subject ?? null,
          issue_date: (estimateData as Estimate).issue_date ?? null,
          valid_until: (estimateData as Estimate).valid_until ?? null,
          tax_mode: (estimateData as Estimate).tax_mode ?? 'exclusive',
          notes: (estimateData as Estimate).notes ?? null,
        }
        setEstimate(normalizedEstimate)
        
        // 見積明細を取得
        const { data: itemsData } = await supabase
          .from('estimate_items')
          .select('*')
          .eq('estimate_id', estimateData.id)
          .order('display_order')

        setItems(((itemsData ?? []) as EstimateItem[]).map((item) => normalizeItem(item, estimateData.id)))
      }

      setLoading(false)
    }
    load()
  }, [projectId])

  useEffect(() => {
    if (loading || editing || !shouldAutoEdit || autoEditTriggeredRef.current) return
    autoEditTriggeredRef.current = true
    void startEditing()
    // startEditing depends on current estimate/project state; autoEditTriggeredRef prevents loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, editing, shouldAutoEdit])

  async function createDraftEstimate(supabase = createClient()) {
    const { data: versionData } = await supabase
      .from('estimates')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = versionData ? versionData.version + 1 : 1
    const legacyPayload = {
      project_id: projectId,
      version: nextVersion,
      status: 'draft' as const,
    }
    const fullPayload = {
      ...legacyPayload,
      estimate_no: project?.project_number ?? null,
      subject: null,
      issue_date: null,
      valid_until: null,
      tax_mode: 'exclusive',
      notes: null,
    }
    let { data: newEstimate, error: estError } = await supabase
      .from('estimates')
      .insert(fullPayload)
      .select()
      .single()

    if (estError && isUndefinedColumnError(estError)) {
      const fallbackInsert = await supabase
        .from('estimates')
        .insert(legacyPayload)
        .select()
        .single()
      newEstimate = fallbackInsert.data
      estError = fallbackInsert.error
    }

    if (estError || !newEstimate) throw estError ?? new Error('見積の作成に失敗しました')
    return {
      ...(newEstimate as Estimate),
      tax_mode: (newEstimate as Estimate).tax_mode ?? 'exclusive',
    } as Estimate
  }

  async function startEditing() {
    setError(null)
    if (estimate) {
      setEditing(true)
      return
    }
    setSubmitting(true)
    try {
      const created = await createDraftEstimate()
      setEstimate(created)
      setItems([])
      setEditing(true)
    } catch (e: unknown) {
      setError(getErrorMessage(e, '編集開始に失敗しました'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)

    try {
      const supabase = createClient()
      const taxMode: TaxMode = estimate?.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'
      const normalizedItems = items.map((item, idx) => {
        const computed = calcLine(
          {
            item_name: item.item_name,
            unit: item.unit ?? '式',
            unit_price: Number(item.unit_price) || 0,
            quantity: Number(item.quantity) || 0,
            tax_rate: Number(item.tax_rate) || 0.1,
          },
          taxMode
        )
        return { ...normalizeItem(item), ...computed, display_order: idx }
      })

      if (!estimate) {
        const newEstimate = await createDraftEstimate(supabase)

        // 明細を追加
        if (normalizedItems.length > 0) {
          const itemsToInsert = normalizedItems.map((item, idx) => ({
            estimate_id: newEstimate.id,
            item_name: item.item_name,
            unit: item.unit,
            unit_price: item.unit_price,
            quantity: item.quantity,
            subtotal: item.subtotal,
            tax_rate: item.tax_rate,
            amount_excl_tax: item.amount_excl_tax,
            tax_amount: item.tax_amount,
            amount_incl_tax: item.amount_incl_tax,
            display_order: idx,
          }))

          let { error: itemsError } = await supabase
            .from('estimate_items')
            .insert(itemsToInsert)

          if (itemsError && isUndefinedColumnError(itemsError)) {
            const legacyItems = normalizedItems.map((item, idx) => ({
              estimate_id: newEstimate.id,
              item_name: item.item_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              subtotal: item.subtotal,
              display_order: idx,
            }))
            const fallbackInsert = await supabase
              .from('estimate_items')
              .insert(legacyItems)
            itemsError = fallbackInsert.error
          }

          if (itemsError) throw itemsError
        }

        setEstimate(newEstimate as Estimate)
      } else {
        // 既存見積の更新
        let { error: estError } = await supabase
          .from('estimates')
          .update({
            estimate_no: project?.project_number ?? estimate.estimate_no ?? null,
            subject: estimate.subject ?? null,
            issue_date: estimate.issue_date ?? null,
            valid_until: estimate.valid_until ?? null,
            tax_mode: estimate.tax_mode ?? 'exclusive',
            notes: estimate.notes ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', estimate.id)

        if (estError && isUndefinedColumnError(estError)) {
          const fallbackUpdate = await supabase
            .from('estimates')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', estimate.id)
          estError = fallbackUpdate.error
        }

        if (estError) throw estError

        // 既存明細を削除してから再挿入
        await supabase.from('estimate_items').delete().eq('estimate_id', estimate.id)

        if (normalizedItems.length > 0) {
          const itemsToInsert = normalizedItems.map((item, idx) => ({
            estimate_id: estimate.id,
            item_name: item.item_name,
            unit: item.unit,
            unit_price: item.unit_price,
            quantity: item.quantity,
            subtotal: item.subtotal,
            tax_rate: item.tax_rate,
            amount_excl_tax: item.amount_excl_tax,
            tax_amount: item.tax_amount,
            amount_incl_tax: item.amount_incl_tax,
            display_order: idx,
          }))

          let { error: itemsError } = await supabase
            .from('estimate_items')
            .insert(itemsToInsert)

          if (itemsError && isUndefinedColumnError(itemsError)) {
            const legacyItems = normalizedItems.map((item, idx) => ({
              estimate_id: estimate.id,
              item_name: item.item_name,
              unit_price: item.unit_price,
              quantity: item.quantity,
              subtotal: item.subtotal,
              display_order: idx,
            }))
            const fallbackInsert = await supabase
              .from('estimate_items')
              .insert(legacyItems)
            itemsError = fallbackInsert.error
          }

          if (itemsError) throw itemsError
        }
      }

      setEditing(false)
      // 再読み込み
      const { data: estimateData } = await supabase
        .from('estimates')
        .select('*')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (estimateData) {
        setEstimate({
          ...(estimateData as Estimate),
          tax_mode: (estimateData as Estimate).tax_mode ?? 'exclusive',
        })
        const { data: itemsData } = await supabase
          .from('estimate_items')
          .select('*')
          .eq('estimate_id', estimateData.id)
          .order('display_order')
        setItems(((itemsData ?? []) as EstimateItem[]).map((item) => normalizeItem(item, estimateData.id)))
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, '保存に失敗しました'))
    } finally {
      setSubmitting(false)
    }
  }

  function addItem() {
    const newItem = normalizeItem({
      id: `temp-${Date.now()}`,
      estimate_id: estimate?.id || '',
      item_name: '',
      unit: '式',
      unit_price: 0,
      quantity: 1,
      tax_rate: 0.1,
      display_order: items.length,
    })
    const computed = calcLine(newItem, (estimate?.tax_mode ?? 'exclusive') as TaxMode)
    setItems([...items, { ...newItem, ...computed }])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem<K extends keyof EstimateItem>(index: number, field: K, value: EstimateItem[K]) {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'unit_price' || field === 'quantity' || field === 'tax_rate' || field === 'unit' || field === 'item_name') {
      const computed = calcLine(newItems[index], (estimate?.tax_mode ?? 'exclusive') as TaxMode)
      newItems[index] = { ...newItems[index], ...computed }
    }
    setItems(newItems)
  }

  const totals = useMemo(
    () => calcTotals(items.map((item) => normalizeItem(item))),
    [items]
  )

  async function requestApproval() {
    if (!estimate || estimate.status !== 'draft') return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('estimates')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', estimate.id)
      if (err) throw err
      setEstimate((e) => (e ? { ...e, status: 'pending_approval' } : null))
    } catch (e: unknown) {
      setError(getErrorMessage(e, '承認依頼に失敗しました'))
    } finally {
      setSubmitting(false)
    }
  }

  async function approveEstimate(approve: boolean) {
    if (!estimate || estimate.status !== 'pending_approval') return
    setError(null)
    setSubmitting(true)
    try {
      const profile = await getCurrentUserProfile()
      const supabase = createClient()
      if (approve) {
        const { error: err } = await supabase
          .from('estimates')
          .update({
            status: 'approved',
            approved_by: profile?.id ?? null,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', estimate.id)
        if (err) throw err
        setEstimate((e) => (e ? { ...e, status: 'approved', approved_by: profile?.id ?? null, approved_at: new Date().toISOString() } : null))
      } else {
        const { error: err } = await supabase
          .from('estimates')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', estimate.id)
        if (err) throw err
        setEstimate((e) => (e ? { ...e, status: 'draft' } : null))
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, '操作に失敗しました'))
    } finally {
      setSubmitting(false)
    }
  }

  async function markSent() {
    if (!estimate || estimate.status !== 'approved') return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('estimates')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', estimate.id)
      if (err) throw err
      setEstimate((e) => (e ? { ...e, status: 'sent' } : null))
    } catch (e: unknown) {
      setError(getErrorMessage(e, '更新に失敗しました'))
    } finally {
      setSubmitting(false)
    }
  }

  function updateEstimateField<K extends keyof Estimate>(field: K, value: Estimate[K]) {
    if (!estimate) return
    setEstimate({ ...estimate, [field]: value })
  }

  async function handleExportJson() {
    if (!estimate) return
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/export`)
      if (!res.ok) throw new Error('JSONのエクスポートに失敗しました')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = `${project?.project_number ?? 'estimate'}-v${estimate.version}.json`
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'JSONのエクスポートに失敗しました'))
    }
  }

  async function handleImportFile(file: File) {
    setError(null)
    setSubmitting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!project || (parsed.projectId && parsed.projectId !== project.id)) {
        throw new Error('この案件に紐づかないJSONです')
      }
      if (!parsed.projectId) parsed.projectId = projectId
      if (!parsed.estimateNo && project?.project_number) parsed.estimateNo = project.project_number

      const res = await fetch('/api/estimates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'JSONの取り込みに失敗しました')
      window.location.reload()
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'JSONの取り込みに失敗しました'))
    } finally {
      setSubmitting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const canRequestApproval = estimate?.status === 'draft' && items.length > 0
  const canApprove = isAdmin(userRole) && estimate?.status === 'pending_approval'
  const canMarkSent = isAdmin(userRole) && estimate?.status === 'approved'
  const canReceive = estimate?.status === 'approved' || estimate?.status === 'sent'
  const canPrintEstimate = estimate && (estimate.status === 'approved' || estimate.status === 'sent')

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="px-6 py-16 text-center">
          <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="px-6 py-16 text-center">
          <p className="text-[var(--muted)] font-semibold">案件が見つかりません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight mb-1">
            見積作成・編集
          </h1>
          <p className="text-[var(--muted)]">案件番号: {project.project_number}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className={btnSecondary}
          >
            案件一覧に戻る
          </button>
          {!editing && (
            <button type="button" onClick={startEditing} disabled={submitting} className={btnPrimary}>
              編集
            </button>
          )}
          {estimate && (
            <>
              <button type="button" onClick={handleExportJson} className={btnSecondary}>
                JSON出力
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={submitting}
                className={btnSecondary}
              >
                JSON取込
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportFile(file)
                }}
              />
            </>
          )}
        </div>
      </div>

      {estimate && (
        <div className="mb-6 p-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-xl">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-semibold text-[var(--foreground)]">バージョン: {estimate.version}</span>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              ステータス: {STATUS_LABEL[estimate.status]}
            </span>
            {canRequestApproval && (
              <button type="button" onClick={requestApproval} disabled={submitting} className={btnPrimary}>
                承認依頼
              </button>
            )}
            {canApprove && (
              <>
                <button type="button" onClick={() => approveEstimate(true)} disabled={submitting} className={btnPrimary}>
                  承認
                </button>
                <button type="button" onClick={() => approveEstimate(false)} disabled={submitting} className={btnSecondary}>
                  差し戻し
                </button>
              </>
            )}
            {canMarkSent && (
              <button type="button" onClick={markSent} disabled={submitting} className={btnPrimary}>
                送付済みにする
              </button>
            )}
            {canReceive && (
              <>
                <Link
                  href={`/projects/${projectId}/estimates/print?doc=invoice`}
                  className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700"
                >
                  受領（請求書へ）
                </Link>
                {canPrintEstimate && (
                  <Link
                    href={`/projects/${projectId}/estimates/print?doc=estimate`}
                    className="px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)]"
                  >
                    見積書 PDF
                  </Link>
                )}
                <Link
                  href={`/projects/${projectId}/estimates/print?doc=invoice`}
                  className="px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)]"
                >
                  請求書 PDF
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-[var(--error)]">{error}</p>
        </div>
      )}

      <div className="mb-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6">
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="p-4 rounded-xl border-2 border-[var(--card-border)]">
            <h3 className="font-bold text-[var(--foreground)] mb-3">取引先情報（顧客一覧から）</h3>
            <div className="text-sm space-y-2 text-[var(--foreground)]">
              <p>宛名: {customer?.company_name || customer?.name || '—'}</p>
              <p>住所: {customer?.address || '—'}</p>
              <p>担当者: {customer?.contact_name || '—'}</p>
              <p>電話番号: {customer?.phone || '—'}</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border-2 border-[var(--card-border)]">
            <h3 className="font-bold text-[var(--foreground)] mb-3">自社情報</h3>
            <div className="text-sm space-y-2 text-[var(--foreground)]">
              <p>自社名: {ISSUER_COMPANY_NAME}</p>
              <p>自社情報: {ISSUER_ADDRESS}</p>
            </div>
          </div>
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">見積ヘッダ情報</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>見積番号（案件番号連動）</label>
            <input type="text" value={project.project_number} readOnly className={`${inputClass} bg-gray-100`} />
          </div>
          <div>
            <label className={labelClass}>税計算方式</label>
            {editing ? (
              <select
                value={estimate?.tax_mode ?? 'exclusive'}
                onChange={(e) => {
                  updateEstimateField('tax_mode', e.target.value as Estimate['tax_mode'])
                  const mode = e.target.value as TaxMode
                  setItems((prev) => prev.map((item) => ({ ...item, ...calcLine(item, mode) })))
                }}
                disabled={!editing}
                className={inputClass}
              >
                <option value="exclusive">税抜</option>
                <option value="inclusive">税込</option>
              </select>
            ) : (
              <input
                type="text"
                value={estimate?.tax_mode === 'inclusive' ? '税込' : '税抜'}
                readOnly
                className={`${inputClass} bg-gray-100`}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>発行日</label>
            <input
              type="date"
              value={estimate?.issue_date ?? ''}
              onChange={(e) => updateEstimateField('issue_date', e.target.value || null)}
              onFocus={openNativeDatePicker}
              onClick={openNativeDatePicker}
              disabled={!editing}
              className={`${inputClass} cursor-pointer`}
            />
          </div>
          <div>
            <label className={labelClass}>有効期限</label>
            <input
              type="date"
              value={estimate?.valid_until ?? ''}
              onChange={(e) => updateEstimateField('valid_until', e.target.value || null)}
              onFocus={openNativeDatePicker}
              onClick={openNativeDatePicker}
              disabled={!editing}
              className={`${inputClass} cursor-pointer`}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>件名</label>
            <input
              type="text"
              value={estimate?.subject ?? ''}
              onChange={(e) => updateEstimateField('subject', e.target.value || null)}
              disabled={!editing}
              className={inputClass}
              placeholder="例: 3月14日 冷蔵庫運入取付作業 2台"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>備考</label>
            <textarea
              value={estimate?.notes ?? ''}
              onChange={(e) => updateEstimateField('notes', e.target.value || null)}
              disabled={!editing}
              className={inputClass}
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">見積明細</h2>
          {editing && (
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--background)] font-semibold rounded-lg hover:opacity-90"
            >
              明細を追加
            </button>
          )}
        </div>

        {items.length === 0 && !editing ? (
          <div className="py-12 text-center">
            <p className="text-[var(--muted)] font-semibold mb-2">見積明細がありません</p>
            <p className="text-sm text-[var(--muted)]">「編集」ボタンから明細を追加してください。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <table className="min-w-full">
              <thead>
                <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">項目名</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">単位</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">単価</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">数量</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">税率</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">税抜小計</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">税額</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">税込小計</th>
                  {editing && <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {items.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                          className={inputClass}
                          placeholder="項目名"
                        />
                      ) : (
                        <span className="text-[var(--foreground)]">{item.item_name || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input
                          type="text"
                          value={item.unit ?? ''}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className={inputClass}
                          placeholder="式"
                        />
                      ) : (
                        <span className="text-[var(--foreground)]">{item.unit || '式'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className={inputClass}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-[var(--foreground)]">¥{item.unit_price.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className={inputClass}
                          placeholder="1"
                        />
                      ) : (
                        <span className="text-[var(--foreground)]">{item.quantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <select
                          value={String(item.tax_rate ?? 0.1)}
                          onChange={(e) => updateItem(index, 'tax_rate', parseFloat(e.target.value) || 0.1)}
                          className={inputClass}
                        >
                          <option value="0.1">10%</option>
                          <option value="0.08">8%</option>
                          <option value="0">0%</option>
                        </select>
                      ) : (
                        <span className="text-[var(--foreground)]">{Math.round((item.tax_rate ?? 0.1) * 100)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--foreground)] font-semibold">
                        ¥{(item.amount_excl_tax || item.subtotal || item.unit_price * item.quantity).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--foreground)] font-semibold">
                        ¥{(item.tax_amount || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--foreground)] font-semibold">
                        ¥{(item.amount_incl_tax || item.subtotal || item.unit_price * item.quantity).toLocaleString()}
                      </span>
                    </td>
                    {editing && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="px-3 py-1.5 text-sm bg-red-100 text-red-700 font-semibold rounded-lg hover:bg-red-200"
                        >
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                  <td colSpan={editing ? 8 : 7} className="px-4 py-4 text-right text-sm font-bold text-[var(--foreground)]">
                    合計（税抜）
                  </td>
                  <td className="px-4 py-4 text-left text-lg font-black text-[var(--foreground)]">
                    ¥{totals.subtotalExclTax.toLocaleString()}
                  </td>
                </tr>
                <tr className="bg-[var(--primary-light)] border-t border-[var(--card-border)]">
                  <td colSpan={editing ? 8 : 7} className="px-4 py-4 text-right text-sm font-bold text-[var(--foreground)]">
                    税額合計
                  </td>
                  <td className="px-4 py-4 text-left text-lg font-black text-[var(--foreground)]">
                    ¥{totals.totalTax.toLocaleString()}
                  </td>
                </tr>
                <tr className="bg-[var(--primary-light)] border-t border-[var(--card-border)]">
                  <td colSpan={editing ? 8 : 7} className="px-4 py-4 text-right text-sm font-bold text-[var(--foreground)]">
                    合計（税込）
                  </td>
                  <td className="px-4 py-4 text-left text-lg font-black text-[var(--foreground)]">
                    ¥{totals.totalInclTax.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {editing && (
          <div className="flex gap-3 mt-6 pt-6 border-t-2 border-[var(--card-border)]">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className={btnPrimary}
            >
              {submitting ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                // 再読み込み
                window.location.reload()
              }}
              className={btnSecondary}
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const EstimatePage = dynamic(
  () => Promise.resolve({ default: EstimatePageContent }),
  { ssr: false }
)
export default EstimatePage
