'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ProjectSale } from '@/lib/types/sale'
import type { Project } from '@/lib/types/project'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function SalesPageContent() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [sale, setSale] = useState<ProjectSale | null>(null)
  const [costsTotal, setCostsTotal] = useState(0)
  const [laborTotal, setLaborTotal] = useState(0)
  const [expensesTotal, setExpensesTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [salesAmountInput, setSalesAmountInput] = useState('')
  const [notesInput, setNotesInput] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (projectData) setProject(projectData as Project)

      const { data: saleData } = await supabase
        .from('project_sales')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      if (saleData) {
        setSale(saleData as ProjectSale)
        setSalesAmountInput(String(saleData.sales_amount))
        setNotesInput(saleData.notes ?? '')
      } else {
        // 見積合計を初期値にする
        const { data: est } = await supabase
          .from('estimates')
          .select('id')
          .eq('project_id', projectId)
          .order('version', { ascending: false })
          .limit(1)
          .single()
        let initialSales = 0
        if (est) {
          const { data: items } = await supabase
            .from('estimate_items')
            .select('subtotal')
            .eq('estimate_id', est.id)
          if (items) initialSales = items.reduce((s, i) => s + Number(i.subtotal), 0)
        }
        const { data: inserted } = await supabase
          .from('project_sales')
          .insert({ project_id: projectId, sales_amount: initialSales })
          .select()
          .single()
        if (inserted) {
          setSale(inserted as ProjectSale)
          setSalesAmountInput(String(inserted.sales_amount))
        }
      }

      const [costsRes, laborRes, expensesRes] = await Promise.all([
        supabase.from('project_costs').select('amount').eq('project_id', projectId),
        supabase.from('project_labor_costs').select('amount').eq('project_id', projectId),
        supabase.from('project_expenses').select('amount').eq('project_id', projectId),
      ])
      setCostsTotal((costsRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0))
      setLaborTotal((laborRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0))
      setExpensesTotal((expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0))

      setLoading(false)
    }
    load()
  }, [projectId])

  const handleSaveAmount = async () => {
    if (!sale || sale.is_fixed) return
    const amount = parseFloat(salesAmountInput)
    if (isNaN(amount) || amount < 0) {
      setError('売上金額を正しく入力してください')
      return
    }
    setError(null)
    setSubmitting(true)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('project_sales')
      .update({ sales_amount: amount, notes: notesInput || null, updated_at: new Date().toISOString() })
      .eq('id', sale.id)
      .select()
      .single()
    setSubmitting(false)
    if (err) {
      setError('更新に失敗しました')
      return
    }
    setSale(data as ProjectSale)
  }

  const handleFix = async () => {
    if (!sale || sale.is_fixed) return
    if (!confirm('売上を確定しますか？確定後も金額の修正は可能です。')) return
    setError(null)
    setSubmitting(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    const { data, error: err } = await supabase
      .from('project_sales')
      .update({ is_fixed: true, fixed_at: now, updated_at: now })
      .eq('id', sale.id)
      .select()
      .single()
    setSubmitting(false)
    if (err) {
      setError('確定に失敗しました')
      return
    }
    setSale(data as ProjectSale)
  }

  const salesAmount = sale ? (sale.is_fixed ? sale.sales_amount : parseFloat(salesAmountInput) || 0) : 0
  const grossProfit = salesAmount - costsTotal
  const netProfit = grossProfit - laborTotal - expensesTotal

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[var(--muted)]">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[var(--error)]">案件が見つかりません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-[var(--foreground)]">売上管理票</h1>
            <p className="text-[var(--muted)] mt-1">案件番号: {project.project_number}</p>
          </div>
          <button onClick={() => router.back()} className={btnSecondary}>
            戻る
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-[var(--error)]">{error}</p>
          </div>
        )}

        {sale && (
          <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-6 shadow-[var(--shadow)] space-y-6">
            <h2 className="text-xl font-bold text-[var(--foreground)]">売上金額</h2>
            {sale.is_fixed ? (
              <div className="flex items-center gap-4">
                <p className="text-2xl font-bold text-[var(--foreground)]">¥{sale.sales_amount.toLocaleString()}</p>
                <span className="px-3 py-1 bg-green-100 text-green-800 font-semibold rounded-lg">確定済み</span>
                {sale.fixed_at && (
                  <span className="text-sm text-[var(--muted)]">
                    確定日: {new Date(sale.fixed_at).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>売上金額（円）</label>
                  <input
                    type="number"
                    value={salesAmountInput}
                    onChange={(e) => setSalesAmountInput(e.target.value)}
                    className={inputClass}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className={labelClass}>備考</label>
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    className={inputClass}
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSaveAmount} disabled={submitting} className={btnPrimary}>
                    {submitting ? '保存中...' : '保存'}
                  </button>
                  <button type="button" onClick={handleFix} disabled={submitting} className={btnPrimary}>
                    確定する
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-6 shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">損益（自動算出）</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody className="divide-y divide-[var(--card-border)]">
                <tr>
                  <td className="py-3 text-[var(--foreground)]">売上</td>
                  <td className="py-3 text-right font-semibold">¥{salesAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-3 text-[var(--foreground)]">原価合計</td>
                  <td className="py-3 text-right">¥{costsTotal.toLocaleString()}</td>
                </tr>
                <tr className="bg-[var(--primary-light)]/30">
                  <td className="py-3 font-bold text-[var(--foreground)]">粗利（売上 − 原価）</td>
                  <td className="py-3 text-right font-bold">¥{grossProfit.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-3 text-[var(--foreground)]">人件費合計</td>
                  <td className="py-3 text-right">¥{laborTotal.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-3 text-[var(--foreground)]">経費合計</td>
                  <td className="py-3 text-right">¥{expensesTotal.toLocaleString()}</td>
                </tr>
                <tr className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                  <td className="py-4 font-bold text-[var(--foreground)]">純利（粗利 − 人件費 − 経費）</td>
                  <td className="py-4 text-right font-bold text-lg">¥{netProfit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default dynamic(() => Promise.resolve(SalesPageContent), { ssr: false })
