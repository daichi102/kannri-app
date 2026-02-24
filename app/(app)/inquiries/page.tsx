'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Inquiry, InquiryStatus } from '@/lib/types/inquiry'
import { INQUIRY_STATUS_LABEL } from '@/lib/types/inquiry'

type InquiryWithNames = Inquiry & {
  customer?: { name: string } | null
  staff?: { name: string } | null
  origin?: { name: string } | null
}

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function InquiriesPageContent() {
  const [inquiries, setInquiries] = useState<InquiryWithNames[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<InquiryStatus | ''>('')
  const [customers, setCustomers] = useState<{ id: string; name: string; address: string | null; phone: string }[]>([])
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const [origins, setOrigins] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    customer_id: '',
    contact_name: '',
    contact_phone: '',
    contact_address: '',
    inquiry_content: '',
    staff_id: '',
    origin_id: '',
    status: 'pending' as InquiryStatus,
  })

  async function fetchInquiries() {
    const supabase = createClient()
    let q = supabase
      .from('inquiries')
      .select('*, customer:customers(name), staff:staff(name), origin:origins(name)')
      .order('created_at', { ascending: false })
    if (filterStatus) {
      q = q.eq('status', filterStatus)
    }
    const { data } = await q
    setInquiries((data ?? []) as any as InquiryWithNames[])
  }

  useEffect(() => {
    fetchInquiries().finally(() => setLoading(false))
  }, [filterStatus])

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('customers').select('id, name, address, phone').order('name'),
      supabase.from('staff').select('id, name').order('name'),
      supabase.from('origins').select('id, name').order('display_order'),
    ]).then(([c, s, o]) => {
      setCustomers(c.data ?? [])
      setStaffList(s.data ?? [])
      setOrigins(o.data ?? [])
    })
  }, [])

  function handleRepeatCustomer(customerId: string) {
    const c = customers.find((x) => x.id === customerId)
    if (!c) return
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      contact_name: c.name,
      contact_phone: c.phone ?? '',
      contact_address: c.address ?? '',
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error: err } = await supabase.from('inquiries').insert({
        customer_id: form.customer_id || null,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim(),
        contact_address: form.contact_address.trim() || null,
        inquiry_content: form.inquiry_content.trim(),
        staff_id: form.staff_id,
        origin_id: form.origin_id || null,
        status: form.status,
        created_by: user?.id ?? null,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchInquiries()
      setShowForm(false)
      setForm({
        customer_id: '',
        contact_name: '',
        contact_phone: '',
        contact_address: '',
        inquiry_content: '',
        staff_id: form.staff_id || '',
        origin_id: '',
        status: 'pending',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
          問い合わせ一覧
        </h1>
        <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
          新規問い合わせ
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 md:p-8 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">新規問い合わせ登録</h2>
          <div className="mb-4">
            <label className={labelClass}>既存顧客からリピート</label>
            <select
              className={inputClass}
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (v) handleRepeatCustomer(v)
              }}
            >
              <option value="">選択して顧客情報を転記</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
            <div>
              <label className={labelClass}>連絡先氏名</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>電話番号 *</label>
              <input
                type="text"
                required
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>住所</label>
              <input
                type="text"
                value={form.contact_address}
                onChange={(e) => setForm((f) => ({ ...f, contact_address: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>問い合わせ内容 *</label>
              <textarea
                required
                rows={3}
                value={form.inquiry_content}
                onChange={(e) => setForm((f) => ({ ...f, inquiry_content: e.target.value }))}
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
              <label className={labelClass}>発生元</label>
              <select
                value={form.origin_id}
                onChange={(e) => setForm((f) => ({ ...f, origin_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">選択</option>
                {origins.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as InquiryStatus }))}
                className={inputClass}
              >
                {(Object.entries(INQUIRY_STATUS_LABEL) as [InquiryStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {error && (
              <p className="text-sm font-semibold text-[var(--error)] bg-red-50 px-3 py-2 rounded-xl">{error}</p>
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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterStatus('')}
          className={filterStatus === '' ? btnPrimary : btnSecondary}
        >
          すべて
        </button>
        {(Object.entries(INQUIRY_STATUS_LABEL) as [InquiryStatus, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterStatus(value)}
            className={filterStatus === value ? btnPrimary : btnSecondary}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">日時</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">連絡先・顧客</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">内容</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">担当</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">発生元</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">状態</th>
                  <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">案件</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {inquiries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <p className="text-[var(--muted)] font-semibold">問い合わせはありません</p>
                    </td>
                  </tr>
                ) : (
                  inquiries.map((inq, i) => (
                    <tr
                      key={inq.id}
                      className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                    >
                      <td className="px-4 py-3.5 text-sm text-[var(--muted)]">
                        {new Date(inq.created_at).toLocaleString('ja-JP')}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-[var(--foreground)]">
                          {inq.contact_name || (inq.customer?.name ?? '—')}
                        </span>
                        {inq.contact_phone && (
                          <span className="block text-sm text-[var(--muted)]">{inq.contact_phone}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[var(--foreground)] max-w-xs truncate">
                        {inq.inquiry_content || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{inq.staff?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{inq.origin?.name ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block px-2 py-1 rounded-lg text-sm font-semibold bg-[var(--primary-light)] text-[var(--foreground)]">
                          {INQUIRY_STATUS_LABEL[inq.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {inq.project_id ? (
                          <Link href={`/projects/${inq.project_id}`} className="text-[var(--primary)] font-semibold hover:underline">
                            案件へ
                          </Link>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const InquiriesPage = dynamic(
  () => Promise.resolve({ default: InquiriesPageContent }),
  { ssr: false }
)
export default InquiriesPage
