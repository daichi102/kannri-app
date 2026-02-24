'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProjectStatus } from '@/lib/types/project'
import { INQUIRY_STATUS_LABEL } from '@/lib/types/inquiry'
import type { InquiryStatus } from '@/lib/types/inquiry'

const ProjectCalendar = dynamic(() => import('@/app/components/ProjectCalendar'), { ssr: false })

const STATUS_LABEL: Record<ProjectStatus, string> = {
  estimate_draft: '見積作成中',
  estimate_sent: '見積送付済み',
  in_progress: '作業中',
  completed: '完了',
  cancelled: 'キャンセル',
}

type ProjectRow = { id: string; project_number: string; status: ProjectStatus; customer?: { name: string } | null; staff?: { name: string } | null }
type InquiryRow = { id: string; contact_name: string | null; inquiry_content: string; status: InquiryStatus; created_at: string; staff?: { name: string } | null; customer?: { name: string } | null }
type DepositRow = { id: string; scheduled_date: string; scheduled_amount: number; project_id: string; project?: { project_number: string } | null; customer?: { name: string } | null }

export default function Home() {
  const [progressByStatus, setProgressByStatus] = useState<Record<ProjectStatus, ProjectRow[]>>({
    estimate_draft: [],
    estimate_sent: [],
    in_progress: [],
    completed: [],
    cancelled: [],
  })
  const [recentInquiries, setRecentInquiries] = useState<InquiryRow[]>([])
  const [overdueDeposits, setOverdueDeposits] = useState<DepositRow[]>([])
  const [loadingProgress, setLoadingProgress] = useState(true)
  const [loadingInquiries, setLoadingInquiries] = useState(true)
  const [loadingDeposits, setLoadingDeposits] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('projects')
      .select('id, project_number, status, customer:customers(name), staff:staff(name)')
      .in('status', ['estimate_draft', 'estimate_sent', 'in_progress'])
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as any as ProjectRow[]
        const byStatus = {
          estimate_draft: list.filter((p) => p.status === 'estimate_draft'),
          estimate_sent: list.filter((p) => p.status === 'estimate_sent'),
          in_progress: list.filter((p) => p.status === 'in_progress'),
          completed: [],
          cancelled: [],
        }
        setProgressByStatus(byStatus)
      })
      .finally(() => setLoadingProgress(false))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('inquiries')
      .select('id, contact_name, inquiry_content, status, created_at, staff:staff(name), customer:customers(name)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRecentInquiries((data ?? []) as InquiryRow[])
      })
      .catch(() => setRecentInquiries([]))
      .finally(() => setLoadingInquiries(false))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    supabase
      .from('deposit_schedules')
      .select('id, scheduled_date, scheduled_amount, project_id, project:projects(project_number), customer:customers(name)')
      .lte('scheduled_date', nextWeek)
      .gte('scheduled_date', today)
      .in('status', ['scheduled', 'delayed', 'uncollected', 'discrepancy'])
      .then(({ data }) => {
        const list = (data ?? []) as DepositRow[]
        setOverdueDeposits(list)
      })
      .catch(() => setOverdueDeposits([]))
      .finally(() => setLoadingDeposits(false))
  }, [])

  const hasProgress = progressByStatus.estimate_draft.length > 0 ||
    progressByStatus.estimate_sent.length > 0 ||
    progressByStatus.in_progress.length > 0

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] mb-2 tracking-tight">
        ダッシュボード
      </h1>
      <p className="text-[var(--muted)] mb-4 text-base md:text-lg leading-relaxed">
        ログイン済みです。進行中案件・問い合わせ・入金予定を確認し、カレンダーで日付ごとの案件を確認できます。
      </p>

      {/* 進行中案件を状態別一覧 */}
      <section>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-3">進行中・商談中の案件（状態別）</h2>
        {loadingProgress ? (
          <p className="text-[var(--muted)]">読み込み中...</p>
        ) : !hasProgress ? (
          <p className="text-[var(--muted)] py-4">現在、進行中・商談中の案件はありません。</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(['estimate_draft', 'estimate_sent', 'in_progress'] as const).map((status) => (
              <div
                key={status}
                className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-4 shadow-[var(--shadow)]"
              >
                <h3 className="font-bold text-[var(--foreground)] mb-2">{STATUS_LABEL[status]}</h3>
                <ul className="space-y-2">
                  {progressByStatus[status].slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-[var(--primary)] font-semibold hover:underline block truncate"
                      >
                        {p.project_number}
                      </Link>
                      <span className="text-sm text-[var(--muted)]">
                        {p.customer?.name ?? '—'} / {p.staff?.name ?? '—'}
                      </span>
                    </li>
                  ))}
                  {progressByStatus[status].length > 5 && (
                    <li>
                      <Link href="/projects" className="text-sm text-[var(--primary)] hover:underline">
                        + 他 {progressByStatus[status].length - 5} 件 →
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 問い合わせ（未対応・対応中） */}
      <section>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-3">問い合わせ（未対応・対応中）</h2>
        {loadingInquiries ? (
          <p className="text-[var(--muted)]">読み込み中...</p>
        ) : recentInquiries.length === 0 ? (
          <p className="text-[var(--muted)] py-4">未対応・対応中の問い合わせはありません。</p>
        ) : (
          <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden shadow-[var(--shadow)]">
            <ul className="divide-y divide-[var(--card-border)]">
              {recentInquiries.map((inq) => (
                <li key={inq.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">
                      {inq.contact_name || (inq.customer?.name ?? '—')}
                    </span>
                    <span className="ml-2 text-sm text-[var(--muted)]">
                      {INQUIRY_STATUS_LABEL[inq.status]} · {inq.staff?.name ?? '—'}
                    </span>
                    <p className="text-sm text-[var(--muted)] truncate max-w-md mt-0.5">{inq.inquiry_content}</p>
                  </div>
                  <Link
                    href="/inquiries"
                    className="text-sm font-semibold text-[var(--primary)] hover:underline"
                  >
                    一覧へ →
                  </Link>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 bg-[var(--primary-light)]/30 border-t border-[var(--card-border)]">
              <Link href="/inquiries" className="text-sm font-bold text-[var(--primary)] hover:underline">
                問い合わせ一覧を見る
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* 入金予定（当日〜1週間・未入金） */}
      {!loadingDeposits && overdueDeposits.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-3">入金予定（当日〜1週間）</h2>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl overflow-hidden shadow-[var(--shadow)]">
            <ul className="divide-y divide-amber-200">
              {overdueDeposits.map((d) => (
                <li key={d.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">
                      {d.scheduled_date} · ¥{Number(d.scheduled_amount).toLocaleString()}
                    </span>
                    <span className="ml-2 text-sm text-[var(--muted)]">
                      {d.customer?.name ?? '—'} / {d.project?.project_number ?? '—'}
                    </span>
                  </div>
                  <Link
                    href={`/projects/${d.project_id}`}
                    className="text-sm font-semibold text-[var(--primary)] hover:underline"
                  >
                    案件へ →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-3">案件カレンダー</h2>
        <ProjectCalendar />
      </section>

      <section>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-3">メニュー</h2>
        <nav className="flex flex-wrap gap-4">
          <Link
            href="/customers"
            className="inline-flex items-center gap-2 px-6 py-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl text-[var(--foreground)] font-bold shadow-[var(--shadow)] hover:border-[var(--primary)] hover:shadow-lg hover:scale-[1.02] transition-all"
          >
            <span className="text-2xl" aria-hidden>👥</span>
            顧客一覧
          </Link>
          <Link
            href="/staff"
            className="inline-flex items-center gap-2 px-6 py-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl text-[var(--foreground)] font-bold shadow-[var(--shadow)] hover:border-[var(--primary)] hover:shadow-lg hover:scale-[1.02] transition-all"
          >
            <span className="text-2xl" aria-hidden>🧑‍💼</span>
            担当者一覧
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 px-6 py-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl text-[var(--foreground)] font-bold shadow-[var(--shadow)] hover:border-[var(--primary)] hover:shadow-lg hover:scale-[1.02] transition-all"
          >
            <span className="text-2xl" aria-hidden>📋</span>
            案件一覧
          </Link>
          <Link
            href="/inquiries"
            className="inline-flex items-center gap-2 px-6 py-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl text-[var(--foreground)] font-bold shadow-[var(--shadow)] hover:border-[var(--primary)] hover:shadow-lg hover:scale-[1.02] transition-all"
          >
            <span className="text-2xl" aria-hidden>📩</span>
            問い合わせ
          </Link>
          <Link
            href="/estimates"
            className="inline-flex items-center gap-2 px-6 py-4 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl text-[var(--foreground)] font-bold shadow-[var(--shadow)] hover:border-[var(--primary)] hover:shadow-lg hover:scale-[1.02] transition-all"
          >
            <span className="text-2xl" aria-hidden>📄</span>
            見積一覧
          </Link>
        </nav>
      </section>
    </div>
  )
}
