'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ProjectLaborCost } from '@/lib/types/cost'
import type { Project } from '@/lib/types/project'

const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

function LaborPageContent() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [laborCosts, setLaborCosts] = useState<ProjectLaborCost[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formWorkerName, setFormWorkerName] = useState('')
  const [formAmount, setFormAmount] = useState('')

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

      // 人件費一覧を取得
      const { data: laborData, error: laborError } = await supabase
        .from('project_labor_costs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (laborError) {
        console.error('人件費取得エラー:', laborError)
        setError('人件費の取得に失敗しました')
      } else {
        setLaborCosts(laborData as ProjectLaborCost[])
      }

      setLoading(false)
    }

    load()
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (!formWorkerName.trim()) {
      setError('作業者名を入力してください')
      setSubmitting(false)
      return
    }

    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('金額を正しく入力してください')
      setSubmitting(false)
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase.from('project_labor_costs').insert({
      project_id: projectId,
      worker_name: formWorkerName.trim(),
      amount: amount,
    })

    if (insertError) {
      console.error('人件費登録エラー:', insertError)
      setError('人件費の登録に失敗しました')
      setSubmitting(false)
      return
    }

    // 再取得
    const { data: laborData } = await supabase
      .from('project_labor_costs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (laborData) {
      setLaborCosts(laborData as ProjectLaborCost[])
    }

    // フォームリセット
    setFormWorkerName('')
    setFormAmount('')
    setShowForm(false)
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この人件費を削除しますか？')) return

    const supabase = createClient()
    const { error } = await supabase.from('project_labor_costs').delete().eq('id', id)

    if (error) {
      console.error('削除エラー:', error)
      setError('削除に失敗しました')
      return
    }

    // 再取得
    const { data: laborData } = await supabase
      .from('project_labor_costs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (laborData) {
      setLaborCosts(laborData as ProjectLaborCost[])
    }
  }

  const totalAmount = laborCosts.reduce((sum, cost) => sum + cost.amount, 0)

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
            <h1 className="text-3xl font-black text-[var(--foreground)]">人件費入力</h1>
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
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">人件費を追加</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>作業者名</label>
                <input
                  type="text"
                  value={formWorkerName}
                  onChange={(e) => setFormWorkerName(e.target.value)}
                  className={inputClass}
                  placeholder="作業者名を入力してください"
                  required
                />
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

              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className={btnPrimary}>
                  {submitting ? '登録中...' : '登録'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormWorkerName('')
                    setFormAmount('')
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
            + 人件費を追加
          </button>
        )}

        {/* 人件費一覧 */}
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
          <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
            <h2 className="text-xl font-bold text-[var(--foreground)]">人件費一覧</h2>
          </div>

          {laborCosts.length === 0 ? (
            <div className="p-8 text-center text-[var(--muted)]">
              <p>人件費が登録されていません</p>
              <p className="text-sm mt-2">「人件費を追加」ボタンから追加してください。</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--primary-light)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">作業者名</th>
                      <th className="px-6 py-3 text-right text-sm font-bold text-[var(--foreground)]">金額</th>
                      <th className="px-6 py-3 text-left text-sm font-bold text-[var(--foreground)]">登録日</th>
                      <th className="px-6 py-3 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborCosts.map((cost, idx) => (
                      <tr
                        key={cost.id}
                        className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}
                      >
                        <td className="px-6 py-4 text-sm text-[var(--foreground)]">
                          {cost.worker_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-[var(--foreground)]">
                          ¥{cost.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]">
                          {new Date(cost.created_at).toLocaleDateString('ja-JP')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleDelete(cost.id)}
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
                      <td colSpan={2}></td>
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
export default dynamic(() => Promise.resolve(LaborPageContent), { ssr: false })
