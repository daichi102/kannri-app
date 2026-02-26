'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, CustomerType } from '@/lib/types/customer'
import AdminOnly from '@/app/components/AdminOnly'
import { getCurrentUserRole } from '@/lib/auth'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function CustomersPageContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roleLoading, setRoleLoading] = useState(true)
  const [form, setForm] = useState({
    type: 'individual' as CustomerType,
    company_name: '',
    name: '',
    name_kana: '',
    address: '',
    phone: '',
    contact_name: '',
  })

  async function fetchCustomers() {
    const supabase = createClient()
    const { data } = await supabase.from('customers').select('*')
    setCustomers(data ?? [])
  }

  useEffect(() => {
    async function checkRole() {
      const role = await getCurrentUserRole()
      setIsAdmin(role === 'admin')
      setRoleLoading(false)
    }
    checkRole()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchCustomers().finally(() => setLoading(false))
    }
  }, [isAdmin])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('customers').insert({
        type: form.type,
        company_name: form.type === 'company' ? form.company_name || null : null,
        name: form.name.trim(),
        name_kana: form.name_kana.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        contact_name: form.type === 'company' ? form.contact_name.trim() || null : null,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchCustomers()
      setShowForm(false)
      setForm({
        type: 'individual',
        company_name: '',
        name: '',
        name_kana: '',
        address: '',
        phone: '',
        contact_name: '',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (roleLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="px-6 py-16 text-center">
          <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="px-6 py-16 text-center">
          <p className="text-[var(--muted)] font-semibold mb-2">このページは管理者のみ閲覧可能です</p>
          <p className="text-sm text-[var(--muted)]">顧客登録情報の閲覧には管理者権限が必要です。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          顧客一覧
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={btnPrimary}
        >
          新規登録
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">新規顧客登録</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <span className={labelClass}>種別</span>
              <div className="flex gap-6">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={form.type === 'individual'}
                    onChange={() => setForm((f) => ({ ...f, type: 'individual' }))}
                    className="w-4 h-4 text-[var(--primary)]"
                  />
                  <span className="font-semibold text-[var(--foreground)]">個人</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={form.type === 'company'}
                    onChange={() => setForm((f) => ({ ...f, type: 'company' }))}
                    className="w-4 h-4 text-[var(--primary)]"
                  />
                  <span className="font-semibold text-[var(--foreground)]">企業</span>
                </label>
              </div>
            </div>
            {form.type === 'company' && (
              <>
                <div>
                  <label className={labelClass}>企業名</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>担当者名</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>名前（氏名・代表者名） *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>名前（カナ） *</label>
              <input
                type="text"
                required
                value={form.name_kana}
                onChange={(e) => setForm((f) => ({ ...f, name_kana: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>住所 *</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>電話番号 *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
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
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">種別</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">名前</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">電話番号</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-16 text-center">
                    <p className="text-[var(--muted)] font-semibold mb-1">登録されている顧客はいません</p>
                    <p className="text-sm text-[var(--muted)]">「新規登録」ボタンから追加してください。</p>
                  </td>
                </tr>
              ) : (
                customers.map((c, i) => (
                  <tr
                    key={c.id}
                    className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                  >
                    <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">
                      {c.type === 'company' ? '企業' : '個人'}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--foreground)]">{c.name}</td>
                    <td className="px-4 py-3.5 text-[var(--muted)]">{c.phone}</td>
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

const CustomersPage = dynamic(
  () => Promise.resolve({ default: CustomersPageContent }),
  { ssr: false }
)
export default CustomersPage
