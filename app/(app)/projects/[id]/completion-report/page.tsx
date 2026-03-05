'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department } from '@/lib/types/project'
import type { CostCategory, ExpenseCategory, ProjectCost, ProjectExpense, ProjectLaborCost } from '@/lib/types/cost'

type ProjectWithNames = Project & {
  customer?: { name: string; address?: string; phone?: string } | null
  staff?: { name: string } | null
}

type CompletionReport = {
  id: string
  project_id: string
  completed_at: string | null
  signer_name: string | null
  signature_data_url: string | null
  notes: string | null
}

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  material: '材料費',
  other: 'その他',
}

const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  transport: '交通費',
  highway: '高速代',
  accommodation: '宿泊代',
  other: 'その他',
}

const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

export default function CompletionReportPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<ProjectWithNames | null>(null)
  const [report, setReport] = useState<CompletionReport | null>(null)
  const [costs, setCosts] = useState<ProjectCost[]>([])
  const [expenses, setExpenses] = useState<ProjectExpense[]>([])
  const [laborCosts, setLaborCosts] = useState<ProjectLaborCost[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [costSubmitting, setCostSubmitting] = useState(false)
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [laborSubmitting, setLaborSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [completedAt, setCompletedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [costCategory, setCostCategory] = useState<CostCategory>('material')
  const [costDescription, setCostDescription] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('transport')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [laborWorkerName, setLaborWorkerName] = useState('')
  const [laborAmount, setLaborAmount] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [projectRes, reportRes, costsRes, expensesRes, laborRes] = await Promise.all([
        supabase.from('projects').select('*, customer:customers(name, address, phone), staff:staff(name)').eq('id', projectId).single(),
        supabase.from('project_completion_reports').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('project_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('project_expenses').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('project_labor_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      ])
      if (projectRes.data) setProject(projectRes.data as ProjectWithNames)
      if (reportRes.data) {
        const r = reportRes.data as CompletionReport
        setReport(r)
        setCompletedAt(r.completed_at ?? '')
        setNotes(r.notes ?? '')
      }
      setCosts((costsRes.data ?? []) as ProjectCost[])
      setExpenses((expensesRes.data ?? []) as ProjectExpense[])
      setLaborCosts((laborRes.data ?? []) as ProjectLaborCost[])
      setLoading(false)
    }
    load()
  }, [projectId])

  async function reloadFinancials() {
    const supabase = createClient()
    const [costsRes, expensesRes, laborRes] = await Promise.all([
      supabase.from('project_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_expenses').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_labor_costs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])
    setCosts((costsRes.data ?? []) as ProjectCost[])
    setExpenses((expensesRes.data ?? []) as ProjectExpense[])
    setLaborCosts((laborRes.data ?? []) as ProjectLaborCost[])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setError(null)
    setSaving(true)

    const supabase = createClient()
    const payload = {
      project_id: projectId,
      completed_at: completedAt || null,
      signer_name: null,
      signature_data_url: null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error: err } = await supabase.from('project_completion_reports').upsert(payload, {
      onConflict: 'project_id',
    })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    const { error: statusErr } = await supabase
      .from('projects')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (statusErr) {
      setError(statusErr.message)
      setSaving(false)
      return
    }
    setReport({ ...report!, ...payload } as CompletionReport)
    setSaving(false)
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = parseFloat(costAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setError('原価の金額を正しく入力してください')
      return
    }
    setCostSubmitting(true)
    try {
      const supabase = createClient()
      const { error: insertErr } = await supabase.from('project_costs').insert({
        project_id: projectId,
        category: costCategory,
        description: costCategory === 'other' && costDescription.trim() ? costDescription.trim() : null,
        amount,
      })
      if (insertErr) {
        setError(insertErr.message)
        return
      }
      setCostCategory('material')
      setCostDescription('')
      setCostAmount('')
      await reloadFinancials()
    } finally {
      setCostSubmitting(false)
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = parseFloat(expenseAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setError('経費の金額を正しく入力してください')
      return
    }
    setExpenseSubmitting(true)
    try {
      const supabase = createClient()
      const { error: insertErr } = await supabase.from('project_expenses').insert({
        project_id: projectId,
        category: expenseCategory,
        description: expenseCategory === 'other' && expenseDescription.trim() ? expenseDescription.trim() : null,
        amount,
      })
      if (insertErr) {
        setError(insertErr.message)
        return
      }
      setExpenseCategory('transport')
      setExpenseDescription('')
      setExpenseAmount('')
      await reloadFinancials()
    } finally {
      setExpenseSubmitting(false)
    }
  }

  async function handleAddLabor(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!laborWorkerName.trim()) {
      setError('人件費の作業者名を入力してください')
      return
    }
    const amount = parseFloat(laborAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setError('人件費の金額を正しく入力してください')
      return
    }
    setLaborSubmitting(true)
    try {
      const supabase = createClient()
      const { error: insertErr } = await supabase.from('project_labor_costs').insert({
        project_id: projectId,
        worker_name: laborWorkerName.trim(),
        amount,
      })
      if (insertErr) {
        setError(insertErr.message)
        return
      }
      setLaborWorkerName('')
      setLaborAmount('')
      await reloadFinancials()
    } finally {
      setLaborSubmitting(false)
    }
  }

  async function handleDeleteCost(id: string) {
    if (!confirm('この原価を削除しますか？')) return
    setError(null)
    const supabase = createClient()
    const { error: deleteErr } = await supabase.from('project_costs').delete().eq('id', id)
    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    await reloadFinancials()
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('この経費を削除しますか？')) return
    setError(null)
    const supabase = createClient()
    const { error: deleteErr } = await supabase.from('project_expenses').delete().eq('id', id)
    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    await reloadFinancials()
  }

  async function handleDeleteLabor(id: string) {
    if (!confirm('この人件費を削除しますか？')) return
    setError(null)
    const supabase = createClient()
    const { error: deleteErr } = await supabase.from('project_labor_costs').delete().eq('id', id)
    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    await reloadFinancials()
  }

  const totalCost = costs.reduce((sum, row) => sum + row.amount, 0)
  const totalExpense = expenses.reduce((sum, row) => sum + row.amount, 0)
  const totalLabor = laborCosts.reduce((sum, row) => sum + row.amount, 0)

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-[var(--error)] font-semibold">案件が見つかりません</p>
        <Link href="/" className="text-[var(--primary)] hover:underline mt-2 inline-block">ホームに戻る</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← 案件詳細に戻る
        </Link>
      </div>

      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight mb-6">
        完了報告書
      </h1>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8 space-y-6">
        <section>
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">報告内容（内容は未定のためプレースホルダーです）</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">案件番号</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.project_number}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">部門</dt>
              <dd className="font-semibold text-[var(--foreground)]">{DEPARTMENT_LABEL[project.department]}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">顧客名</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.customer?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">担当者</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.staff?.name ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="pt-4 border-t-2 border-[var(--card-border)] space-y-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">原価・経費・人件費</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
            <div className="bg-[var(--primary-light)]/20 rounded-xl p-4 border border-[var(--card-border)]">
              <p className="text-[var(--muted)]">原価合計</p>
              <p className="text-xl font-bold text-[var(--foreground)]">¥{totalCost.toLocaleString()}</p>
            </div>
            <div className="bg-[var(--primary-light)]/20 rounded-xl p-4 border border-[var(--card-border)]">
              <p className="text-[var(--muted)]">経費合計</p>
              <p className="text-xl font-bold text-[var(--foreground)]">¥{totalExpense.toLocaleString()}</p>
            </div>
            <div className="bg-[var(--primary-light)]/20 rounded-xl p-4 border border-[var(--card-border)]">
              <p className="text-[var(--muted)]">人件費合計</p>
              <p className="text-xl font-bold text-[var(--foreground)]">¥{totalLabor.toLocaleString()}</p>
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="font-bold text-[var(--foreground)]">原価</h3>
            <form onSubmit={handleAddCost} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value as CostCategory)}
                className={inputClass}
              >
                <option value="material">材料費</option>
                <option value="other">その他</option>
              </select>
              <input
                type="text"
                value={costDescription}
                onChange={(e) => setCostDescription(e.target.value)}
                className={inputClass}
                placeholder="内容（任意）"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                className={inputClass}
                placeholder="金額"
                required
              />
              <button type="submit" disabled={costSubmitting} className={btnPrimary}>
                {costSubmitting ? '追加中...' : '原価を追加'}
              </button>
            </form>
            <div className="space-y-2">
              {costs.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">原価データがありません</p>
              ) : (
                costs.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-3 border border-[var(--card-border)] rounded-xl">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--foreground)]">
                        {COST_CATEGORY_LABEL[row.category]} / ¥{row.amount.toLocaleString()}
                      </p>
                      <p className="text-sm text-[var(--muted)] truncate">{row.description || '—'}</p>
                    </div>
                    <button type="button" onClick={() => handleDeleteCost(row.id)} className="text-sm text-[var(--error)] hover:underline">
                      削除
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold text-[var(--foreground)]">経費</h3>
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                className={inputClass}
              >
                <option value="transport">交通費</option>
                <option value="highway">高速代</option>
                <option value="accommodation">宿泊代</option>
                <option value="other">その他</option>
              </select>
              <input
                type="text"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                className={inputClass}
                placeholder="内容（任意）"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className={inputClass}
                placeholder="金額"
                required
              />
              <button type="submit" disabled={expenseSubmitting} className={btnPrimary}>
                {expenseSubmitting ? '追加中...' : '経費を追加'}
              </button>
            </form>
            <div className="space-y-2">
              {expenses.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">経費データがありません</p>
              ) : (
                expenses.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-3 border border-[var(--card-border)] rounded-xl">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--foreground)]">
                        {EXPENSE_CATEGORY_LABEL[row.category]} / ¥{row.amount.toLocaleString()}
                      </p>
                      <p className="text-sm text-[var(--muted)] truncate">{row.description || '—'}</p>
                    </div>
                    <button type="button" onClick={() => handleDeleteExpense(row.id)} className="text-sm text-[var(--error)] hover:underline">
                      削除
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold text-[var(--foreground)]">人件費</h3>
            <form onSubmit={handleAddLabor} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={laborWorkerName}
                onChange={(e) => setLaborWorkerName(e.target.value)}
                className={inputClass}
                placeholder="作業者名"
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={laborAmount}
                onChange={(e) => setLaborAmount(e.target.value)}
                className={inputClass}
                placeholder="金額"
                required
              />
              <button type="submit" disabled={laborSubmitting} className={btnPrimary}>
                {laborSubmitting ? '追加中...' : '人件費を追加'}
              </button>
            </form>
            <div className="space-y-2">
              {laborCosts.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">人件費データがありません</p>
              ) : (
                laborCosts.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-3 border border-[var(--card-border)] rounded-xl">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--foreground)]">
                        {row.worker_name} / ¥{row.amount.toLocaleString()}
                      </p>
                    </div>
                    <button type="button" onClick={() => handleDeleteLabor(row.id)} className="text-sm text-[var(--error)] hover:underline">
                      削除
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className={labelClass}>完了日</label>
            <input
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>備考（任意）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-sm font-semibold text-[var(--error)]">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? '処理中...' : '完了'}
            </button>
            <Link href={`/projects/${projectId}`} className={btnSecondary}>
              キャンセル
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
