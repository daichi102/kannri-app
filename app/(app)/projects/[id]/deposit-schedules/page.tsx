'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DepositSchedule, DepositScheduleStatus } from '@/lib/types/depositSchedule'
import { DEPOSIT_SCHEDULE_STATUS_LABEL } from '@/lib/types/depositSchedule'

type DepositScheduleWithNames = DepositSchedule & {
  customer?: { name: string } | null
}

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function DepositSchedulesPageContent() {
  const params = useParams()
  const projectId = params.id as string

  const [projectNumber, setProjectNumber] = useState<string>('')
  const [customerId, setCustomerId] = useState<string>('')
  const [schedules, setSchedules] = useState<DepositScheduleWithNames[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    scheduled_date: '',
    scheduled_amount: '',
    status: 'scheduled' as DepositScheduleStatus,
    is_confirmed: false,
  })

  async function fetchSchedules() {
    const supabase = createClient()
    const { data: proj } = await supabase.from('projects').select('project_number, customer_id').eq('id', projectId).single()
    if (proj) {
      setProjectNumber((proj as { project_number: string }).project_number)
      setCustomerId((proj as { customer_id: string }).customer_id ?? '')
    }
    const { data } = await supabase
      .from('deposit_schedules')
      .select('*, customer:customers(name)')
      .eq('project_id', projectId)
      .order('scheduled_date', { ascending: true })
    setSchedules((data ?? []) as DepositScheduleWithNames[])
  }

  useEffect(() => {
    fetchSchedules().finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    createClient().from('customers').select('id, name').order('name').then(({ data }) => setCustomers(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const amount = parseFloat(form.scheduled_amount)
    if (isNaN(amount) || amount < 0) {
      setError('金額を正しく入力してください')
      setSubmitting(false)
      return
    }
    const supabase = createClient()
    if (!customerId) {
      setError('顧客を選択してください')
      setSubmitting(false)
      return
    }
    const { error: err } = await supabase.from('deposit_schedules').insert({
      project_id: projectId,
      customer_id: customerId,
      scheduled_date: form.scheduled_date,
      scheduled_amount: amount,
      status: form.status,
      is_confirmed: form.is_confirmed,
    })
    if (err) setError(err.message)
    else {
      await fetchSchedules()
      setShowForm(false)
      setForm({ scheduled_date: '', scheduled_amount: '', status: 'scheduled', is_confirmed: false })
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
        入金予定 — {projectNumber || '…'}
      </h1>

      {showForm && (
        <div className="mb-8 p-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">入金予定を追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>顧客 *</label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={inputClass}
              >
                <option value="">選択</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>予定日 *</label>
              <input
                type="date"
                required
                value={form.scheduled_date}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>予定額（円） *</label>
              <input
                type="number"
                required
                min={0}
                value={form.scheduled_amount}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_amount: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DepositScheduleStatus }))}
                className={inputClass}
              >
                {(Object.entries(DEPOSIT_SCHEDULE_STATUS_LABEL) as [DepositScheduleStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_confirmed"
                checked={form.is_confirmed}
                onChange={(e) => setForm((f) => ({ ...f, is_confirmed: e.target.checked }))}
              />
              <label htmlFor="is_confirmed" className={labelClass + ' mb-0'}>確定済み</label>
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
          入金予定を追加
        </button>
      </div>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">読み込み中...</div>
        ) : schedules.length === 0 ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">入金予定はありません</div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">予定日</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">予定額</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">ステータス</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">確定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-[var(--foreground)]">{s.scheduled_date}</td>
                  <td className="px-4 py-3 font-semibold">¥{Number(s.scheduled_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{s.customer?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-1 rounded text-sm font-semibold bg-[var(--primary-light)] text-[var(--foreground)]">
                      {DEPOSIT_SCHEDULE_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.is_confirmed ? '〇' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const DepositSchedulesPage = dynamic(() => Promise.resolve({ default: DepositSchedulesPageContent }), { ssr: false })
export default DepositSchedulesPage
