'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Staff } from '@/lib/types/staff'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function StaffPageContent() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', department: '' })

  async function fetchStaff() {
    const supabase = createClient()
    const { data } = await supabase.from('staff').select('*')
    setStaffList(data ?? [])
  }

  useEffect(() => {
    fetchStaff().finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('staff').insert({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchStaff()
      setShowForm(false)
      setForm({ name: '', phone: '', department: '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          担当者一覧
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={btnPrimary}
        >
          新規追加
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">新規担当者追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>氏名 *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>電話番号</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>所属</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className={inputClass}
              />
            </div>
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
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">氏名</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">電話番号</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">所属</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-16 text-center">
                    <p className="text-[var(--muted)] font-semibold mb-1">登録されている担当者はいません</p>
                    <p className="text-sm text-[var(--muted)]">「新規追加」ボタンから追加してください。</p>
                  </td>
                </tr>
              ) : (
                staffList.map((s, i) => (
                  <tr
                    key={s.id}
                    className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                  >
                    <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">{s.name}</td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">{s.department ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const StaffPage = dynamic(
  () => Promise.resolve({ default: StaffPageContent }),
  { ssr: false }
)
export default StaffPage
