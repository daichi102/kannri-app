'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, CustomerType } from '@/lib/types/customer'
import type { Department } from '@/lib/types/project'
import { getCurrentUserRole } from '@/lib/auth'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

type CustomerProjectHistory = {
  id: string
  project_number: string
  department: Department
  customer_id: string
}

function CustomersPageContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectHistoryMap, setProjectHistoryMap] = useState<Record<string, CustomerProjectHistory[]>>({})
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<CustomerType>('individual')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
    const [customersRes, projectsRes] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase
        .from('projects')
        .select('id, project_number, department, customer_id')
        .order('created_at', { ascending: false }),
    ])

    const nextCustomers = (customersRes.data ?? []) as Customer[]
    const nextProjects = (projectsRes.data ?? []) as CustomerProjectHistory[]
    const nextHistoryMap: Record<string, CustomerProjectHistory[]> = {}

    for (const p of nextProjects) {
      if (!nextHistoryMap[p.customer_id]) {
        nextHistoryMap[p.customer_id] = []
      }
      nextHistoryMap[p.customer_id].push(p)
    }

    setCustomers(nextCustomers)
    setProjectHistoryMap(nextHistoryMap)
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

  const visibleCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (c.type !== 'individual') return true
      const history = projectHistoryMap[c.id] ?? []
      if (history.length === 0) return true
      // 配送案件しかない個人顧客は顧客一覧に表示しない
      return history.some((p) => p.department !== 'delivery')
    })
  }, [customers, projectHistoryMap])

  const filteredVisibleCustomers = useMemo(() => {
    return visibleCustomers.filter((c) => c.type === filterType)
  }, [visibleCustomers, filterType])

  const visibleTypeCounts = useMemo(() => {
    return visibleCustomers.reduce(
      (acc, c) => {
        if (c.type === 'company') acc.company += 1
        if (c.type === 'individual') acc.individual += 1
        return acc
      },
      { company: 0, individual: 0 }
    )
  }, [visibleCustomers])

  async function handleDeleteCustomer(c: Customer) {
    setError(null)
    const historyCount = (projectHistoryMap[c.id] ?? []).length
    if (historyCount > 0) {
      alert('この顧客には案件履歴があるため削除できません。')
      return
    }
    if (!confirm(`「${c.name}」を削除しますか？`)) return

    setDeletingId(c.id)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('customers').delete().eq('id', c.id)
      if (err) {
        setError(err.message)
        return
      }
      await fetchCustomers()
    } finally {
      setDeletingId(null)
    }
  }

  function toggleCustomerHistory(customerId: string) {
    setExpandedCustomerId((prev) => (prev === customerId ? null : customerId))
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

      <div className="flex gap-1 p-1 mb-6 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-xl shadow-[var(--shadow)] w-fit">
        <button
          type="button"
          onClick={() => setFilterType('individual')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            filterType === 'individual'
              ? 'bg-[var(--primary)] text-[var(--background)] shadow-[var(--shadow)]'
              : 'text-[var(--foreground)] hover:bg-[var(--primary-light)]/50'
          }`}
        >
          個人 ({visibleTypeCounts.individual})
        </button>
        <button
          type="button"
          onClick={() => setFilterType('company')}
          className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            filterType === 'company'
              ? 'bg-[var(--primary)] text-[var(--background)] shadow-[var(--shadow)]'
              : 'text-[var(--foreground)] hover:bg-[var(--primary-light)]/50'
          }`}
        >
          企業 ({visibleTypeCounts.company})
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
        {error && (
          <div className="px-6 pt-6">
            <p className="text-sm font-semibold text-[var(--error)] bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          </div>
        )}
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
                <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">案件履歴</th>
                <th className="px-4 py-4 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {filteredVisibleCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <p className="text-[var(--muted)] font-semibold mb-1">
                      {filterType === 'company' ? '登録されている企業顧客はいません' : '登録されている個人顧客はいません'}
                    </p>
                    <p className="text-sm text-[var(--muted)]">タブを切り替えるか、「新規登録」ボタンから追加してください。</p>
                  </td>
                </tr>
              ) : (
                filteredVisibleCustomers.map((c, i) => (
                  <Fragment key={c.id}>
                    <tr
                      className={i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                    >
                      <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">
                        {c.type === 'company' ? '企業' : '個人'}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--foreground)]">
                        <button
                          type="button"
                          onClick={() => toggleCustomerHistory(c.id)}
                          className="font-semibold hover:text-[var(--primary)] hover:underline"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-[var(--muted)]">{c.phone}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-[var(--muted)]">{(projectHistoryMap[c.id] ?? []).length} 件</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomer(c)}
                          disabled={deletingId === c.id}
                          className="text-sm font-semibold text-[var(--error)] hover:underline disabled:opacity-50"
                        >
                          {deletingId === c.id ? '削除中...' : '削除'}
                        </button>
                      </td>
                    </tr>
                    {expandedCustomerId === c.id && (
                      <tr className="bg-[var(--primary-light)]/20">
                        <td colSpan={5} className="px-4 py-3">
                          {(projectHistoryMap[c.id] ?? []).length === 0 ? (
                            <p className="text-sm text-[var(--muted)]">案件履歴はありません。</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                {c.name} さんの案件履歴
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {(projectHistoryMap[c.id] ?? []).map((h) => (
                                  <Link
                                    key={h.id}
                                    href={`/projects/${h.id}`}
                                    className="inline-flex items-center px-2.5 py-1 text-xs rounded-full bg-[var(--primary-light)] text-[var(--foreground)] hover:opacity-80"
                                    title={`${h.project_number} (${DEPARTMENT_LABEL[h.department]})`}
                                  >
                                    {h.project_number} {DEPARTMENT_LABEL[h.department]}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
