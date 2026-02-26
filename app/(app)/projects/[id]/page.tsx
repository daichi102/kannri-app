'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department, WorkType, ProjectStatus } from '@/lib/types/project'

type ProjectWithNames = Project & {
  customer?: { name: string; address?: string; phone?: string } | null
  staff?: { name: string } | null
}

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
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
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function ProjectDetailContent() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<ProjectWithNames | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditForm, setShowEditForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])

  const [form, setForm] = useState({
    customer_id: '',
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

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('projects')
        .select('*, customer:customers(name, address, phone), staff:staff(name)')
        .eq('id', projectId)
        .single()

      if (data) {
        setProject(data as ProjectWithNames)
        setForm({
          customer_id: (data as ProjectWithNames).customer_id,
          staff_id: (data as ProjectWithNames).staff_id,
          start_date: (data as ProjectWithNames).start_date ?? '',
          due_date: (data as ProjectWithNames).due_date ?? '',
          status: (data as ProjectWithNames).status,
          notes: (data as ProjectWithNames).notes ?? '',
          product_name: (data as ProjectWithNames).product_name ?? '',
          product_code: (data as ProjectWithNames).product_code ?? '',
          product_color: (data as ProjectWithNames).product_color ?? '',
          product_quantity: (data as ProjectWithNames).product_quantity?.toString() ?? '',
          has_warranty: (data as ProjectWithNames).has_warranty ?? false,
        })
      }
      setLoading(false)
    }
    load()
  }, [projectId])

  useEffect(() => {
    if (!showEditForm) return
    async function loadOptions() {
      const supabase = createClient()
      const [custRes, staffRes] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('staff').select('id, name').order('name'),
      ])
      setCustomers((custRes.data ?? []) as { id: string; name: string }[])
      setStaffList((staffRes.data ?? []) as { id: string; name: string }[])
    }
    loadOptions()
  }, [showEditForm])

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error: err } = await supabase
      .from('projects')
      .update({
        customer_id: form.customer_id,
        staff_id: form.staff_id,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        product_name: project.department === 'delivery' ? form.product_name.trim() || null : null,
        product_code: project.department === 'delivery' ? form.product_code.trim() || null : null,
        product_color: project.department === 'delivery' ? form.product_color.trim() || null : null,
        product_quantity:
          project.department === 'delivery' && form.product_quantity
            ? parseInt(form.product_quantity, 10)
            : null,
        has_warranty: project.department === 'delivery' ? form.has_warranty : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id)

    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }

    const { data } = await supabase
      .from('projects')
      .select('*, customer:customers(name, address, phone), staff:staff(name)')
      .eq('id', projectId)
      .single()
    setProject(data as ProjectWithNames)
    setShowEditForm(false)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-[var(--error)] font-semibold">案件が見つかりません</p>
        <Link href="/" className="mt-4 inline-block text-[var(--primary)] font-bold hover:underline">
          ホームに戻る
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← ホームに戻る
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          案件詳細
        </h1>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowEditForm(true)}
            className={btnSecondary}
          >
            編集
          </button>
          <Link
            href={`/projects/${projectId}/costs`}
            className={btnPrimary}
          >
            原価入力
          </Link>
          <Link
            href={`/projects/${projectId}/expenses`}
            className={btnPrimary}
          >
            経費入力
          </Link>
          <Link
            href={`/projects/${projectId}/labor`}
            className={btnPrimary}
          >
            人件費入力
          </Link>
          <Link
            href={`/projects/${projectId}/completion-report`}
            className={btnSecondary}
          >
            完了報告
          </Link>
          <Link
            href={`/projects/${projectId}/completion-check`}
            className={btnSecondary}
          >
            完了チェック
          </Link>
        </div>
      </div>

      {showEditForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">案件を編集</h2>
          <form onSubmit={handleEditSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>顧客 *</label>
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
            {project.department === 'delivery' && (
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
                {submitting ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
                className={btnSecondary}
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">案件番号</dt>
            <dd className="text-lg font-bold text-[var(--foreground)]">{project.project_number}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">部門</dt>
            <dd className="text-[var(--foreground)]">{DEPARTMENT_LABEL[project.department]}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">顧客</dt>
            <dd className="text-[var(--foreground)]">{project.customer?.name ?? '—'}</dd>
            {project.customer?.address && (
              <dd className="text-sm text-[var(--muted)] mt-1">{project.customer.address}</dd>
            )}
            {project.customer?.phone && (
              <dd className="text-sm text-[var(--muted)]">{project.customer.phone}</dd>
            )}
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">担当者</dt>
            <dd className="text-[var(--foreground)]">{project.staff?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">着工日</dt>
            <dd className="text-[var(--foreground)]">{project.start_date ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">完了予定日</dt>
            <dd className="text-[var(--foreground)]">{project.due_date ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">ステータス</dt>
            <dd>
              <span className="inline-block px-2 py-1 text-sm font-semibold rounded-full bg-[var(--primary-light)] text-[var(--foreground)]">
                {STATUS_LABEL[project.status]}
              </span>
            </dd>
          </div>
          {project.notes && (
            <div>
              <dt className="text-sm font-bold text-[var(--muted)]">備考</dt>
              <dd className="text-[var(--foreground)] whitespace-pre-wrap">{project.notes}</dd>
            </div>
          )}
          {project.department === 'delivery' && (
            <>
              {(project.product_name || project.product_code) && (
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">設置商品</dt>
                  <dd className="text-[var(--foreground)]">
                    {project.product_name ?? '—'}
                    {project.product_code && `（品番: ${project.product_code}）`}
                    {project.product_color && ` 色: ${project.product_color}`}
                    {project.product_quantity != null && ` 数量: ${project.product_quantity}`}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-bold text-[var(--muted)]">保証書</dt>
                <dd className="text-[var(--foreground)]">{project.has_warranty ? 'あり' : 'なし'}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="mt-8 pt-6 border-t-2 border-[var(--card-border)]">
          <p className="text-sm font-bold text-[var(--foreground)] mb-3">メニュー</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/projects/${projectId}/estimates`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              見積
            </Link>
            <Link
              href={`/projects/${projectId}/payments`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              入金
            </Link>
            <Link
              href={`/projects/${projectId}/deposit-schedules`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              入金予定
            </Link>
            <Link
              href={`/projects/${projectId}/costs`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              原価
            </Link>
            <Link
              href={`/projects/${projectId}/expenses`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              経費
            </Link>
            <Link
              href={`/projects/${projectId}/labor`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              人件費
            </Link>
            <Link
              href={`/projects/${projectId}/sales`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
            >
              売上
            </Link>
            <Link
              href={`/projects/${projectId}/activity-logs`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all"
            >
              フォロー履歴
            </Link>
            <Link
              href={`/projects/${projectId}/cancellation`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all"
            >
              失注記録
            </Link>
            <Link
              href={`/projects/${projectId}/completion-check`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all"
            >
              完了チェック
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

const ProjectDetailPage = dynamic(
  () => Promise.resolve({ default: ProjectDetailContent }),
  { ssr: false }
)
export default ProjectDetailPage
