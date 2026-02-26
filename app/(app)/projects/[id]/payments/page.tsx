'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ProjectPayment, PaymentType } from '@/lib/types/cost'
import type { Project } from '@/lib/types/project'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  start: '着工金',
  middle: '中間金',
  completion: '完了金',
}

function PaymentsPageContent() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [payments, setPayments] = useState<ProjectPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formPaymentType, setFormPaymentType] = useState<PaymentType>('start')
  const [formAmount, setFormAmount] = useState('')
  const [formPaymentDate, setFormPaymentDate] = useState('')
  const [formNotes, setFormNotes] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // 案件情報を取得
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectData) {
        setProject(projectData as Project)
      }

      // 入金情報一覧を取得
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('project_payments')
        .select('*')
        .eq('project_id', projectId)
        .order('payment_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (paymentsError) {
        console.error('入金情報取得エラー:', paymentsError)
        setError('入金情報の取得に失敗しました')
      } else {
        setPayments(paymentsData as ProjectPayment[])
      }

      setLoading(false)
    }

    load()
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('金額を正しく入力してください')
      setSubmitting(false)
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase.from('project_payments').insert({
      project_id: projectId,
      payment_type: formPaymentType,
      amount: amount,
      payment_date: formPaymentDate || null,
      notes: formNotes || null,
    })

    if (insertError) {
      console.error('入金情報登録エラー:', insertError)
      setError('入金情報の登録に失敗しました')
      setSubmitting(false)
      return
    }

    // 再取得
    const { data: paymentsData } = await supabase
      .from('project_payments')
      .select('*')
      .eq('project_id', projectId)
      .order('payment_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (paymentsData) {
      setPayments(paymentsData as ProjectPayment[])
    }

    // フォームリセット
    setFormPaymentType('start')
    setFormAmount('')
    setFormPaymentDate('')
    setFormNotes('')
    setShowForm(false)
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この入金情報を削除しますか？')) return

    const supabase = createClient()
    const { error } = await supabase.from('project_payments').delete().eq('id', id)

    if (error) {
      console.error('削除エラー:', error)
      setError('削除に失敗しました')
      return
    }

    // 再取得
    const { data: paymentsData } = await supabase
      .from('project_payments')
      .select('*')
      .eq('project_id', projectId)
      .order('payment_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (paymentsData) {
      setPayments(paymentsData as ProjectPayment[])
    }
  }

  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[var(--muted)]">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-[var(--error)]">案件が見つかりません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-[var(--foreground)]">入金情報入力</h1>
            <p className="text-[var(--muted)] mt-1">案件番号: {project.project_number}</p>
          </div>
          <button
            onClick={() => router.back()}
            className={btnSecondary}
          >
            戻る
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-[var(--error)]">{error}</p>
          </div>
        )}

        {/* 新規登録フォーム */}
        {showForm && (
          <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-6 shadow-[var(--shadow)]">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">入金情報を追加</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>入金種別</label>
                <select
                  value={formPaymentType}
                  onChange={(e) => setFormPaymentType(e.target.value as PaymentType)}
                  className={inputClass}
                  required
                >
                  <option value="start">着工金</option>
                  <option value="middle">中間金</option>
                  <option value="completion">完了金</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>金額</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>入金日</label>
                <input
                  type="date"
                  value={formPaymentDate}
                  onChange={(e) => setFormPaymentDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>備考</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={inputClass}
                  placeholder="備考を入力してください"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className={btnPrimary}>
                  {submitting ? '登録中...' : '登録'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormPaymentType('start')
                    setFormAmount('')
                    setFormPaymentDate('')
                    setFormNotes('')
                  }}
                  className={btnSecondary}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 新規登録ボタン */}
        {!showForm && (
          <button onClick={() => setShowForm(true)} className={btnPrimary}>
            + 入金情報を追加
          </button>
        )}

        {/* 入金情報一覧 */}
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
          <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
            <h2 className="text-xl font-bold text-[var(--foreground)]">入金情報一覧</h2>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-[var(--muted)]">
              <p>入金情報が登録されていません</p>
              <p className="text-sm mt-2">「入金情報を追加」ボタンから追加してください。</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--primary-light)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">入金種別</th>
                      <th className="px-6 py-3 text-right text-sm font-bold text-[var(--foreground)]">金額</th>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">入金日</th>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">備考</th>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">登録日</th>
                      <th className="px-6 py-3 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment, idx) => (
                      <tr
                        key={payment.id}
                        className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                      >
                        <td className="px-6 py-4 text-sm text-[var(--foreground)]">
                          {PAYMENT_TYPE_LABEL[payment.payment_type]}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-[var(--foreground)]">
                          ¥{payment.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--foreground)]">
                          {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('ja-JP') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--foreground)]">
                          {payment.notes || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]">
                          {new Date(payment.created_at).toLocaleDateString('ja-JP')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleDelete(payment.id)}
                            className="text-sm text-[var(--error)] hover:underline"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                    <tr>
                      <td className="px-6 py-4 text-sm font-bold text-[var(--foreground)]">
                        合計
                      </td>
                      <td className="px-6 py-4 text-right text-lg font-bold text-[var(--foreground)]">
                        ¥{totalAmount.toLocaleString()}
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// SSR無効化
export default dynamic(() => Promise.resolve(PaymentsPageContent), { ssr: false })
