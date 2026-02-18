'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department, WorkType, ProjectStatus } from '@/lib/types/project'

type ProjectWithNames = Project & {
  customer?: { name: string } | null
  staff?: { name: string } | null
}

type SortKey = 'project_number' | 'start_date' | 'due_date' | 'created_at'

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

const DEPARTMENT_PREFIX: Record<Department, string> = {
  delivery: 'H',
  construction: 'K',
  repair: 'S',
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  estimate_draft: '見積作成中',
  estimate_sent: '見積送付済み',
  in_progress: '作業中',
  completed: '完了',
  cancelled: 'キャンセル',
}

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function ProjectsPageContent() {
  const [projects, setProjects] = useState<ProjectWithNames[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])

  // 検索・フィルタ・ソート
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDepartment, setFilterDepartment] = useState<Department | ''>('')
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    department: 'construction' as Department,
    customer_input_mode: 'select' as 'select' | 'new',
    customer_id: '',
    new_customer_name: '',
    new_customer_name_kana: '',
    new_customer_address: '',
    new_customer_phone: '',
    staff_id: '',
    start_date: '',
    due_date: '',
    status: 'estimate_draft' as ProjectStatus,
    notes: '',
    product_name: '',
    product_code: '',
    product_color: '',
    product_quantity: '',
    has_warranty: false,
  })

  async function fetchProjects() {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*, customer:customers(name), staff:staff(name)')
    setProjects((data ?? []) as ProjectWithNames[])
  }

  // 検索・フィルタ・ソート適用
  const filteredProjects = useMemo(() => {
    let list = [...projects]

    // 検索（案件番号・顧客名・担当者名）
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.project_number.toLowerCase().includes(q) ||
          (p.customer?.name ?? '').toLowerCase().includes(q) ||
          (p.staff?.name ?? '').toLowerCase().includes(q)
      )
    }
    // 部門フィルタ
    if (filterDepartment) {
      list = list.filter((p) => p.department === filterDepartment)
    }
    // ステータスフィルタ
    if (filterStatus) {
      list = list.filter((p) => p.status === filterStatus)
    }
    // ソート
    list.sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const cmp = String(aVal).localeCompare(String(bVal), 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, searchQuery, filterDepartment, filterStatus, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'created_at' ? 'desc' : 'asc')
    }
  }

  async function handleDelete(p: ProjectWithNames) {
    if (!confirm(`「${p.project_number}」を削除しますか？\n関連する見積・原価・経費・人件費・入金・売上のデータも削除されます。`)) return
    setError(null)
    setDeletingId(p.id)
    try {
      const supabase = createClient()
      const projectId = p.id

      // 見積明細 → 見積（依存のため先に削除）
      const { data: estimates } = await supabase.from('estimates').select('id').eq('project_id', projectId)
      const estimateIds = (estimates ?? []).map((e) => e.id)
      if (estimateIds.length > 0) {
        await supabase.from('estimate_items').delete().in('estimate_id', estimateIds)
        await supabase.from('estimates').delete().eq('project_id', projectId)
      }

      // 原価・経費・人件費・入金・売上・完了報告 → 案件（子を先に削除）
      await supabase.from('project_costs').delete().eq('project_id', projectId)
      await supabase.from('project_expenses').delete().eq('project_id', projectId)
      await supabase.from('project_labor_costs').delete().eq('project_id', projectId)
      await supabase.from('project_payments').delete().eq('project_id', projectId)
      await supabase.from('project_sales').delete().eq('project_id', projectId)
      await supabase.from('project_completion_reports').delete().eq('project_id', projectId)

      const { error: err } = await supabase.from('projects').delete().eq('id', projectId)
      if (err) {
        setError(err.message)
        alert('削除に失敗しました: ' + err.message)
        return
      }
      await fetchProjects()
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchProjects()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!showForm) return
    let cancelled = false
    async function loadOptions() {
      const supabase = createClient()
      const [custRes, staffRes] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('staff').select('id, name').order('name'),
      ])
      if (!cancelled) {
        setCustomers((custRes.data ?? []) as { id: string; name: string }[])
        setStaffList((staffRes.data ?? []) as { id: string; name: string }[])
      }
    }
    loadOptions()
    return () => { cancelled = true }
  }, [showForm])

  async function getNextProjectNumber(department: Department): Promise<string> {
    const supabase = createClient()
    const prefix = DEPARTMENT_PREFIX[department]
    const { data } = await supabase
      .from('projects')
      .select('project_number')
      .filter('project_number', 'ilike', `${prefix}-%`)
    const numbers = (data ?? [])
      .map((r) => parseInt(r.project_number.replace(/^\D+/, ''), 10))
      .filter((n) => !Number.isNaN(n))
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1
    return `${prefix}-${String(next).padStart(3, '0')}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      
      // 新規顧客入力モードの場合は、先に顧客を登録
      let customerId = form.customer_id
      if (form.customer_input_mode === 'new') {
        if (!form.new_customer_name.trim() || !form.new_customer_name_kana.trim() || !form.new_customer_address.trim() || !form.new_customer_phone.trim()) {
          setError('顧客情報をすべて入力してください')
          setSubmitting(false)
          return
        }
        
        const { data: newCustomer, error: customerErr } = await supabase
          .from('customers')
          .insert({
            type: 'individual', // デフォルトで個人
            name: form.new_customer_name.trim(),
            name_kana: form.new_customer_name_kana.trim(),
            address: form.new_customer_address.trim(),
            phone: form.new_customer_phone.trim(),
          })
          .select('id')
          .single()
        
        if (customerErr || !newCustomer) {
          setError('顧客の登録に失敗しました: ' + (customerErr?.message || '不明なエラー'))
          setSubmitting(false)
          return
        }
        
        customerId = newCustomer.id
      }
      
      if (!customerId) {
        setError('顧客を選択または入力してください')
        setSubmitting(false)
        return
      }
      
      const project_number = await getNextProjectNumber(form.department)
      const { error: err } = await supabase.from('projects').insert({
        project_number,
        department: form.department,
        work_type: 'construction' as WorkType, // デフォルト値
        customer_id: customerId,
        staff_id: form.staff_id,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        product_name: form.department === 'delivery' ? form.product_name.trim() || null : null,
        product_code: form.department === 'delivery' ? form.product_code.trim() || null : null,
        product_color: form.department === 'delivery' ? form.product_color.trim() || null : null,
        product_quantity:
          form.department === 'delivery' && form.product_quantity
            ? parseInt(form.product_quantity, 10)
            : null,
        has_warranty: form.department === 'delivery' ? form.has_warranty : null,
      })
      if (err) {
        setError(err.message)
        return
      }
      
      // 新規顧客を登録した場合は、顧客リストも更新
      if (form.customer_input_mode === 'new') {
        const { data: updatedCustomers } = await supabase
          .from('customers')
          .select('id, name')
          .order('created_at', { ascending: false })
        if (updatedCustomers) {
          setCustomers(updatedCustomers)
        }
      }
      
      await fetchProjects()
      setShowForm(false)
      setForm({
        department: 'construction' as Department,
        customer_input_mode: 'select' as const,
        customer_id: '',
        new_customer_name: '',
        new_customer_name_kana: '',
        new_customer_address: '',
        new_customer_phone: '',
        staff_id: '',
        start_date: '',
        due_date: '',
        status: 'estimate_draft' as ProjectStatus,
        notes: '',
        product_name: '',
        product_code: '',
        product_color: '',
        product_quantity: '',
        has_warranty: false,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const departmentTabs: { value: Department | ''; label: string }[] = [
    { value: '', label: 'すべて' },
    { value: 'delivery', label: DEPARTMENT_LABEL.delivery },
    { value: 'construction', label: DEPARTMENT_LABEL.construction },
    { value: 'repair', label: DEPARTMENT_LABEL.repair },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          案件一覧
        </h1>
        <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
          新規登録
        </button>
      </div>

      {/* 部門タブ */}
      <div className="flex gap-1 p-1 mb-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-xl shadow-[var(--shadow)] w-fit">
        {departmentTabs.map(({ value, label }) => (
          <button
            key={value || 'all'}
            type="button"
            onClick={() => setFilterDepartment(value)}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              filterDepartment === value
                ? 'bg-[var(--primary)] text-white shadow-[var(--shadow)]'
                : 'text-[var(--foreground)] hover:bg-[var(--primary-light)]/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 検索・フィルタ */}
      <div className="mb-6 p-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] space-y-4">
        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1 min-w-0">
            <label className={labelClass}>検索</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="案件番号・顧客名・担当者名"
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className={labelClass}>部門</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment((e.target.value || '') as Department | '')}
                className={inputClass}
              >
                <option value="">すべて</option>
                <option value="delivery">配送</option>
                <option value="construction">工事</option>
                <option value="repair">修理</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>ステータス</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus((e.target.value || '') as ProjectStatus | '')}
                className={inputClass}
              >
                <option value="">すべて</option>
                <option value="estimate_draft">見積作成中</option>
                <option value="estimate_sent">見積送付済み</option>
                <option value="in_progress">作業中</option>
                <option value="completed">完了</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {filteredProjects.length} 件（全 {projects.length} 件）
        </p>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">新規案件登録</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>部門 *</label>
              <select
                required
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))}
                className={inputClass}
              >
                <option value="delivery">配送</option>
                <option value="construction">工事</option>
                <option value="repair">修理</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>顧客 *</label>
              <div className="mb-3">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="customer_mode"
                      value="select"
                      checked={form.customer_input_mode === 'select'}
                      onChange={() => setForm((f) => ({ ...f, customer_input_mode: 'select' as const, customer_id: '', new_customer_name: '', new_customer_name_kana: '', new_customer_address: '', new_customer_phone: '' }))}
                      className="w-4 h-4 text-[var(--primary)]"
                    />
                    <span className="text-sm text-[var(--foreground)]">既存顧客から選択</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="customer_mode"
                      value="new"
                      checked={form.customer_input_mode === 'new'}
                      onChange={() => setForm((f) => ({ ...f, customer_input_mode: 'new' as const, customer_id: '', new_customer_name: '', new_customer_name_kana: '', new_customer_address: '', new_customer_phone: '' }))}
                      className="w-4 h-4 text-[var(--primary)]"
                    />
                    <span className="text-sm text-[var(--foreground)]">新規入力</span>
                  </label>
                </div>
              </div>
              {form.customer_input_mode === 'select' ? (
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">選択してください</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    required
                    value={form.new_customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, new_customer_name: e.target.value }))}
                    className={inputClass}
                    placeholder="顧客名 *"
                  />
                  <input
                    type="text"
                    required
                    value={form.new_customer_name_kana}
                    onChange={(e) => setForm((f) => ({ ...f, new_customer_name_kana: e.target.value }))}
                    className={inputClass}
                    placeholder="顧客カナ名 *"
                  />
                  <input
                    type="text"
                    required
                    value={form.new_customer_address}
                    onChange={(e) => setForm((f) => ({ ...f, new_customer_address: e.target.value }))}
                    className={inputClass}
                    placeholder="住所 *"
                  />
                  <input
                    type="text"
                    required
                    value={form.new_customer_phone}
                    onChange={(e) => setForm((f) => ({ ...f, new_customer_phone: e.target.value }))}
                    className={inputClass}
                    placeholder="電話番号 *"
                  />
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>担当者 *</label>
              <select
                required
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">選択してください</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>着工日</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>完了予定日</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
                className={inputClass}
              >
                <option value="estimate_draft">見積作成中</option>
                <option value="estimate_sent">見積送付済み</option>
                <option value="in_progress">作業中</option>
                <option value="completed">完了</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>備考</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className={inputClass}
              />
            </div>
            {form.department === 'delivery' && (
              <>
                <div>
                  <label className={labelClass}>設置商品</label>
                  <input
                    type="text"
                    value={form.product_name}
                    onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>品番</label>
                  <input
                    type="text"
                    value={form.product_code}
                    onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>色</label>
                  <input
                    type="text"
                    value={form.product_color}
                    onChange={(e) => setForm((f) => ({ ...f, product_color: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>数量</label>
                  <input
                    type="number"
                    value={form.product_quantity}
                    onChange={(e) => setForm((f) => ({ ...f, product_quantity: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.has_warranty}
                      onChange={(e) => setForm((f) => ({ ...f, has_warranty: e.target.checked }))}
                      className="w-4 h-4 text-[var(--primary)] rounded"
                    />
                    <span className="text-sm font-semibold text-[var(--foreground)]">保証書あり</span>
                  </label>
                </div>
              </>
            )}
            {error && (
              <p className="text-sm font-semibold text-[var(--error)] bg-red-50 px-3 py-2 rounded-xl">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className={btnPrimary}>
                {submitting ? '登録中...' : '登録'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[var(--muted)] font-semibold mb-1">
              {projects.length === 0 ? '登録されている案件はありません' : '条件に合う案件がありません'}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {projects.length === 0 ? '「新規登録」ボタンから追加してください。' : '検索・フィルタを変更してください。'}
            </p>
          </div>
        ) : (
          <>
            {/* デスクトップ: テーブル表示 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                    <th className="px-4 py-4 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('project_number')}
                        className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                      >
                        案件番号 {sortKey === 'project_number' && (sortDir === 'asc' ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">部門</th>
                    <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                    <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                    <th className="px-4 py-4 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('start_date')}
                        className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                      >
                        着工日 {sortKey === 'start_date' && (sortDir === 'asc' ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('due_date')}
                        className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                      >
                        完了予定日 {sortKey === 'due_date' && (sortDir === 'asc' ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">ステータス</th>
                    <th className="px-4 py-4 w-24 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {filteredProjects.map((p, i) => (
                    <tr
                      key={p.id}
                      className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                    >
                      <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">
                        <Link href={`/projects/${p.id}/estimates`} className="hover:text-[var(--primary)] hover:underline">
                          {p.project_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-[var(--foreground)]">{DEPARTMENT_LABEL[p.department]}</td>
                      <td className="px-4 py-3.5 text-[var(--foreground)]">{p.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--foreground)]">{p.staff?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{p.start_date ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{p.due_date ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-[var(--primary-light)] text-[var(--foreground)]">
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="text-sm font-semibold text-[var(--error)] hover:underline disabled:opacity-50"
                          aria-label={`${p.project_number}を削除`}
                        >
                          {deletingId === p.id ? '削除中...' : '削除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* モバイル・タブレット: カード表示 */}
            <div className="md:hidden divide-y divide-[var(--card-border)]">
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  className="p-4 hover:bg-[var(--primary-light)]/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link
                      href={`/projects/${p.id}/estimates`}
                      className="font-bold text-[var(--foreground)] text-lg hover:text-[var(--primary)] hover:underline"
                    >
                      {p.project_number}
                    </Link>
                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-[var(--primary-light)] text-[var(--foreground)] shrink-0">
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="text-[var(--foreground)] mb-1">{p.customer?.name ?? '—'}</p>
                  <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)] mb-3">
                    <span>{DEPARTMENT_LABEL[p.department]}</span>
                    <span>{p.staff?.name ?? '—'}</span>
                    <span>{p.start_date ?? '—'} ～ {p.due_date ?? '—'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    className="text-sm font-semibold text-[var(--error)] hover:underline disabled:opacity-50"
                  >
                    {deletingId === p.id ? '削除中...' : '削除'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const ProjectsPage = dynamic(
  () => Promise.resolve({ default: ProjectsPageContent }),
  { ssr: false }
)
export default ProjectsPage
