'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Origin } from '@/lib/types/origin'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function OriginsPageContent() {
  const [origins, setOrigins] = useState<Origin[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', display_order: 0 })

  async function fetchOrigins() {
    const supabase = createClient()
    const { data } = await supabase
      .from('origins')
      .select('*')
      .order('display_order', { ascending: true })
    setOrigins(data ?? [])
  }

  useEffect(() => {
    fetchOrigins().finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('origins').insert({
        name: form.name.trim(),
        display_order: form.display_order,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchOrigins()
      setShowForm(false)
      setForm({ name: '', display_order: origins.length })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          発生元マスタ
        </h1>
        <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
          新規追加
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">新規発生元追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>発生元名 *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="例: ホームページ、紹介、チラシ"
              />
            </div>
            <div>
              <label className={labelClass}>表示順</label>
              <input
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))}
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
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">表示順</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">発生元名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {origins.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-16 text-center">
                    <p className="text-[var(--muted)] font-semibold mb-1">登録されている発生元はありません</p>
                    <p className="text-sm text-[var(--muted)]">「新規追加」から追加してください。</p>
                  </td>
                </tr>
              ) : (
                origins.map((o, i) => (
                  <tr
                    key={o.id}
                    className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                  >
                    <td className="px-4 py-3.5 text-[var(--muted)]">{o.display_order}</td>
                    <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">{o.name}</td>
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

const OriginsPage = dynamic(
  () => Promise.resolve({ default: OriginsPageContent }),
  { ssr: false }
)
export default OriginsPage
