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

const DEPARTMENT_LABELS = {
  construction: '工事',
  delivery: '配送',
  repair: '修理',
  office: '事務',
} as const

type DepartmentKey = keyof typeof DEPARTMENT_LABELS
type DepartmentFilter = DepartmentKey | 'all'

function StaffPageContent() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; phone: string; department: DepartmentKey | '' }>({
    name: '',
    phone: '',
    department: '',
  })
  const [activeDept, setActiveDept] = useState<DepartmentFilter>('all')

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
      if (!form.department) {
        setError('所属を選択してください')
        setSubmitting(false)
        return
      }
      const supabase = createClient()
      const { error: err } = await supabase.from('staff').insert({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        department: form.department,
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

  const filteredStaff =
    activeDept === 'all'
      ? staffList
      : staffList.filter((s) => s.department === activeDept)

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
              <label className={labelClass}>所属 *</label>
              <select
                required
                value={form.department}
                onChange={(e) =>
                  setForm((f) => ({ ...f, department: e.target.value as DepartmentKey }))
                }
                className={inputClass}
              >
                <option value="">選択してください</option>
                <option value="construction">工事</option>
                <option value="delivery">配送</option>
                <option value="repair">修理</option>
                <option value="office">事務</option>
              </select>
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
          <>
            <div className="px-4 pt-4 pb-2 border-b border-[var(--card-border)] flex flex-wrap gap-2">
              {[
                { key: 'all' as DepartmentFilter, label: 'すべて' },
                { key: 'construction' as DepartmentFilter, label: '工事' },
                { key: 'delivery' as DepartmentFilter, label: '配送' },
                { key: 'repair' as DepartmentFilter, label: '修理' },
                { key: 'office' as DepartmentFilter, label: '事務' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveDept(key)}
                  className={
                    activeDept === key
                      ? 'px-4 py-1.5 text-xs md:text-sm font-bold rounded-full bg-[var(--primary)] text-white shadow-[var(--shadow)]'
                      : 'px-4 py-1.5 text-xs md:text-sm font-semibold rounded-full bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">氏名</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">電話番号</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">所属</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center">
                      <p className="text-[var(--muted)] font-semibold mb-1">登録されている担当者はいません</p>
                      <p className="text-sm text-[var(--muted)]">「新規追加」ボタンから追加してください。</p>
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s, i) => (
                    <tr
                      key={s.id}
                      className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                    >
                      <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">{s.name}</td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{s.phone ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">
                        {s.department && s.department in DEPARTMENT_LABELS
                          ? DEPARTMENT_LABELS[s.department as DepartmentKey]
                          : s.department ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
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
