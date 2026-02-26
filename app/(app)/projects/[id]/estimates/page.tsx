'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserRole, getCurrentUserProfile, isAdmin } from '@/lib/auth'
import type { Estimate, EstimateItem, EstimateStatus } from '@/lib/types/estimate'
import type { Project } from '@/lib/types/project'

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

function EstimatePageContent() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null)

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
        setProject(projectData as Project)
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
        setEstimate(estimateData as Estimate)
        
        // 見積明細を取得
        const { data: itemsData } = await supabase
          .from('estimate_items')
          .select('*')
          .eq('estimate_id', estimateData.id)
          .order('display_order')

        setItems((itemsData ?? []) as EstimateItem[])
      }

      setLoading(false)
    }
    load()
  }, [projectId])

  async function handleSave() {
    setError(null)
    setSubmitting(true)

    try {
      const supabase = createClient()

      if (!estimate) {
        // 新規見積作成
        const { data: versionData } = await supabase
          .from('estimates')
          .select('version')
          .eq('project_id', projectId)
          .order('version', { ascending: false })
          .limit(1)
          .single()

        const nextVersion = versionData ? versionData.version + 1 : 1

        const { data: newEstimate, error: estError } = await supabase
          .from('estimates')
          .insert({
            project_id: projectId,
            version: nextVersion,
            status: 'draft',
          })
          .select()
          .single()

        if (estError) throw estError

        // 明細を追加
        if (items.length > 0) {
          const itemsToInsert = items.map((item, idx) => ({
            estimate_id: newEstimate.id,
            item_name: item.item_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            subtotal: item.unit_price * item.quantity,
            display_order: idx,
          }))

          const { error: itemsError } = await supabase
            .from('estimate_items')
            .insert(itemsToInsert)

          if (itemsError) throw itemsError
        }

        setEstimate(newEstimate as Estimate)
      } else {
        // 既存見積の更新
        const { error: estError } = await supabase
          .from('estimates')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', estimate.id)

        if (estError) throw estError

        // 既存明細を削除してから再挿入
        await supabase.from('estimate_items').delete().eq('estimate_id', estimate.id)

        if (items.length > 0) {
          const itemsToInsert = items.map((item, idx) => ({
            estimate_id: estimate.id,
            item_name: item.item_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            subtotal: item.unit_price * item.quantity,
            display_order: idx,
          }))

          const { error: itemsError } = await supabase
            .from('estimate_items')
            .insert(itemsToInsert)

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
        setEstimate(estimateData as Estimate)
        const { data: itemsData } = await supabase
          .from('estimate_items')
          .select('*')
          .eq('estimate_id', estimateData.id)
          .order('display_order')
        setItems((itemsData ?? []) as EstimateItem[])
      }
    } catch (err: any) {
      setError(err.message || '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  function addItem() {
    setItems([
      ...items,
      {
        id: `temp-${Date.now()}`,
        estimate_id: estimate?.id || '',
        item_name: '',
        unit_price: 0,
        quantity: 1,
        subtotal: 0,
        display_order: items.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof EstimateItem, value: any) {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'unit_price' || field === 'quantity') {
      newItems[index].subtotal = newItems[index].unit_price * newItems[index].quantity
    }
    setItems(newItems)
  }

  const total = items.reduce((sum, item) => sum + (item.subtotal || item.unit_price * item.quantity), 0)

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
    } catch (e: any) {
      setError(e.message || '承認依頼に失敗しました')
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
    } catch (e: any) {
      setError(e.message || '操作に失敗しました')
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
    } catch (e: any) {
      setError(e.message || '更新に失敗しました')
    } finally {
      setSubmitting(false)
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
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={btnPrimary}
            >
              編集
            </button>
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
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">単価</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">数量</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">小計</th>
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
                      <span className="text-[var(--foreground)] font-semibold">
                        ¥{(item.subtotal || item.unit_price * item.quantity).toLocaleString()}
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
                  <td colSpan={editing ? 4 : 3} className="px-4 py-4 text-right text-sm font-bold text-[var(--foreground)]">
                    合計
                  </td>
                  <td className="px-4 py-4 text-left text-lg font-black text-[var(--foreground)]">
                    ¥{total.toLocaleString()}
                  </td>
                  {editing && <td></td>}
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
