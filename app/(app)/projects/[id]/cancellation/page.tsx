'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CancellationRecord = {
  id: string
  reason: string
  reason_detail: string | null
  proposed_amount: number | null
  cancelled_at: string
  created_at: string
}

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function CancellationPageContent() {
  const params = useParams()
  const projectId = params.id as string

  const [projectNumber, setProjectNumber] = useState<string>('')
  const [records, setRecords] = useState<CancellationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    reason: '',
    reason_detail: '',
    proposed_amount: '',
    cancelled_at: new Date().toISOString().slice(0, 10),
  })

  async function fetchRecords() {
    const supabase = createClient()
    const { data: proj } = await supabase.from('projects').select('project_number').eq('id', projectId).single()
    if (proj) setProjectNumber((proj as { project_number: string }).project_number)
    const { data } = await supabase
      .from('cancellation_records')
      .select('*')
      .eq('project_id', projectId)
      .order('cancelled_at', { ascending: false })
    setRecords((data ?? []) as CancellationRecord[])
  }

  useEffect(() => {
    fetchRecords().finally(() => setLoading(false))
  }, [projectId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const amount = form.proposed_amount ? parseFloat(form.proposed_amount) : null
    const supabase = createClient()
    const { error: err } = await supabase.from('cancellation_records').insert({
      project_id: projectId,
      reason: form.reason.trim(),
      reason_detail: form.reason_detail.trim() || null,
      proposed_amount: amount != null && !isNaN(amount) ? amount : null,
      cancelled_at: form.cancelled_at,
    })
    if (err) setError(err.message)
    else {
      await fetchRecords()
      setShowForm(false)
      setForm({ reason: '', reason_detail: '', proposed_amount: '', cancelled_at: new Date().toISOString().slice(0, 10) })
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
        失注記録 — {projectNumber || '…'}
      </h1>

      {showForm && (
        <div className="mb-8 p-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">失注を記録</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>失注理由 *</label>
              <input
                type="text"
                required
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className={inputClass}
                placeholder="例: 価格・他社発注"
              />
            </div>
            <div>
              <label className={labelClass}>理由の詳細</label>
              <textarea
                rows={3}
                value={form.reason_detail}
                onChange={(e) => setForm((f) => ({ ...f, reason_detail: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>見積金額（円）</label>
              <input
                type="number"
                min={0}
                value={form.proposed_amount}
                onChange={(e) => setForm((f) => ({ ...f, proposed_amount: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>失注日 *</label>
              <input
                type="date"
                required
                value={form.cancelled_at}
                onChange={(e) => setForm((f) => ({ ...f, cancelled_at: e.target.value }))}
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
          失注を記録
        </button>
      </div>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">読み込み中...</div>
        ) : records.length === 0 ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">失注記録はありません</div>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {records.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <span className="font-semibold text-[var(--foreground)]">{r.reason}</span>
                <span className="text-sm text-[var(--muted)] ml-2">{r.cancelled_at}</span>
                {r.proposed_amount != null && (
                  <span className="block text-sm">見積金額: ¥{r.proposed_amount.toLocaleString()}</span>
                )}
                {r.reason_detail && <p className="mt-1 text-sm text-[var(--foreground)]">{r.reason_detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const CancellationPage = dynamic(() => Promise.resolve({ default: CancellationPageContent }), { ssr: false })
export default CancellationPage
