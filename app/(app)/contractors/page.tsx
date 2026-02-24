'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Contractor } from '@/lib/types/contractor'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function ContractorsPageContent() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', short_name: '', contact_info: '' })

  async function fetchContractors() {
    const supabase = createClient()
    const { data } = await supabase.from('contractors').select('*').order('name')
    setContractors(data ?? [])
  }

  useEffect(() => {
    fetchContractors().finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('contractors').insert({
        name: form.name.trim(),
        short_name: form.short_name.trim() || null,
        contact_info: form.contact_info.trim() || null,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchContractors()
      setShowForm(false)
      setForm({ name: '', short_name: '', contact_info: '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          業者マスタ
        </h1>
        <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
          新規追加
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">新規業者追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className={labelClass}>業者名 *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>略称</label>
              <input
                type="text"
                value={form.short_name}
                onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
                className={inputClass}
                placeholder="帳票・ラベル用"
              />
            </div>
            <div>
              <label className={labelClass}>連絡先・担当者</label>
              <textarea
                rows={2}
                value={form.contact_info}
                onChange={(e) => setForm((f) => ({ ...f, contact_info: e.target.value }))}
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
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">業者名</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">略称</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">連絡先</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {contractors.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-16 text-center">
                    <p className="text-[var(--muted)] font-semibold mb-1">登録されている業者はありません</p>
                    <p className="text-sm text-[var(--muted)]">「新規追加」から追加してください。</p>
                  </td>
                </tr>
              ) : (
                contractors.map((c, i) => (
                  <tr
                    key={c.id}
                    className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                  >
                    <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">{c.name}</td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">{c.short_name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-[var(--muted)]">{c.contact_info ?? '—'}</td>
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

const ContractorsPage = dynamic(
  () => Promise.resolve({ default: ContractorsPageContent }),
  { ssr: false }
)
export default ContractorsPage
