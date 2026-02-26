'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ActivityLog, ActivityType } from '@/lib/types/activityLog'
import { ACTIVITY_TYPE_LABEL } from '@/lib/types/activityLog'

type ActivityLogWithStaff = ActivityLog & { staff?: { name: string } | null }

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function ActivityLogsPageContent() {
  const params = useParams()
  const projectId = params.id as string

  const [projectNumber, setProjectNumber] = useState<string>('')
  const [logs, setLogs] = useState<ActivityLogWithStaff[]>([])
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    activity_type: 'phone' as ActivityType,
    content: '',
    activity_at: new Date().toISOString().slice(0, 16),
    staff_id: '',
  })

  async function fetchLogs() {
    const supabase = createClient()
    const { data: proj } = await supabase.from('projects').select('project_number').eq('id', projectId).single()
    if (proj) setProjectNumber((proj as { project_number: string }).project_number)
    const { data } = await supabase
      .from('activity_logs')
      .select('*, staff:staff(name)')
      .eq('project_id', projectId)
      .order('activity_at', { ascending: false })
    setLogs((data ?? []) as ActivityLogWithStaff[])
  }

  useEffect(() => {
    fetchLogs().finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    createClient().from('staff').select('id, name').order('name').then(({ data }) => setStaffList(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('activity_logs').insert({
      project_id: projectId,
      activity_type: form.activity_type,
      content: form.content.trim() || null,
      activity_at: form.activity_at,
      staff_id: form.staff_id,
    })
    if (err) setError(err.message)
    else {
      await fetchLogs()
      setShowForm(false)
      setForm({ activity_type: 'phone', content: '', activity_at: new Date().toISOString().slice(0, 16), staff_id: form.staff_id })
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← 案件詳細に戻る
        </Link>
      </div>
      <h1 className="text-2xl font-black text-[var(--foreground)] mb-2">
        フォロー履歴 — {projectNumber || '…'}
      </h1>

      {showForm && (
        <div className="mb-8 p-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">フォローを追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>種別 *</label>
              <select
                required
                value={form.activity_type}
                onChange={(e) => setForm((f) => ({ ...f, activity_type: e.target.value as ActivityType }))}
                className={inputClass}
              >
                {(Object.entries(ACTIVITY_TYPE_LABEL) as [ActivityType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>日時 *</label>
              <input
                type="datetime-local"
                required
                value={form.activity_at}
                onChange={(e) => setForm((f) => ({ ...f, activity_at: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>担当者 *</label>
              <select
                required
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">選択</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>内容</label>
              <textarea
                rows={3}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className={inputClass}
              />
            </div>
            {error && <p className="text-sm font-semibold text-[var(--error)]">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className={btnPrimary}>登録</button>
              <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>キャンセル</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
          フォローを追加
        </button>
      </div>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">フォロー履歴はありません</div>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {logs.map((log) => (
              <li key={log.id} className="px-4 py-3">
                <span className="font-semibold text-[var(--foreground)]">{ACTIVITY_TYPE_LABEL[log.activity_type]}</span>
                <span className="text-sm text-[var(--muted)] ml-2">
                  {new Date(log.activity_at).toLocaleString('ja-JP')} · {log.staff?.name ?? '—'}
                </span>
                {log.content && <p className="mt-1 text-sm text-[var(--foreground)]">{log.content}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const ActivityLogsPage = dynamic(() => Promise.resolve({ default: ActivityLogsPageContent }), { ssr: false })
export default ActivityLogsPage
