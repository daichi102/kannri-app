'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department, ProjectStatus } from '@/lib/types/project'
import type { Estimate, EstimateStatus } from '@/lib/types/estimate'

type ProjectWithNames = Project & {
  customer?: { name: string } | null
  staff?: { name: string } | null
}

type EstimateWithProject = Estimate & {
  project?: { project_number: string; customer?: { name: string } | null } | null
}

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  estimate_draft: '見積作成中',
  estimate_sent: '見積送付済み',
  in_progress: '作業中',
  completed: '完了',
  cancelled: 'キャンセル',
}

const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: '下書き',
  pending_approval: '承認待ち',
  approved: '承認済み',
  sent: '送付済み',
}

function EstimatesPageContent() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectWithNames[]>([])
  const [estimates, setEstimates] = useState<EstimateWithProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [projectsRes, estimatesRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*, customer:customers(name), staff:staff(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('estimates')
          .select('*, project:projects(project_number, customer:customers(name))')
          .order('version', { ascending: false }),
      ])
      if (!cancelled) {
        setProjects((projectsRes.data ?? []) as ProjectWithNames[])
        setEstimates((estimatesRes.data ?? []) as EstimateWithProject[])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const projectIdsWithEstimates = useMemo(() => {
    const set = new Set<string>()
    for (const e of estimates) set.add(e.project_id)
    return set
  }, [estimates])

  const noEstimateProjects = useMemo(() => {
    return projects.filter((p) => !projectIdsWithEstimates.has(p.id))
  }, [projects, projectIdsWithEstimates])

  const latestByProject = useMemo(() => {
    const map = new Map<string, EstimateWithProject>()
    for (const e of estimates) {
      if (!map.has(e.project_id)) map.set(e.project_id, e)
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [estimates])

  const formatDate = (s: string | null) => (s ? s.replace(/-/g, '/') : '—')

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight mb-6">
          見積一覧
        </h1>
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] px-6 py-16 text-center">
          <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">
        見積一覧
      </h1>

      {/* 見積未作成 */}
      <section>
        <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">見積未作成</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          見積がまだない案件です。行をタップして見積を作成してください。
        </p>
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
          {noEstimateProjects.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[var(--muted)] font-semibold">見積未作成の案件はありません</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">案件番号</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">部門</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">着工日</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">ステータス</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {noEstimateProjects.map((p, i) => (
                      <tr
                        key={p.id}
                        className={`${i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'} cursor-pointer hover:bg-[var(--primary-light)]/40`}
                        onClick={() => router.push(`/projects/${p.id}/estimates`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            router.push(`/projects/${p.id}/estimates`)
                          }
                        }}
                        tabIndex={0}
                      >
                        <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">
                          <Link
                            href={`/projects/${p.id}/estimates`}
                            className="hover:text-[var(--primary)] hover:underline"
                          >
                            {p.project_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--foreground)]">{DEPARTMENT_LABEL[p.department]}</td>
                        <td className="px-4 py-3.5 text-[var(--foreground)]">{p.customer?.name ?? '—'}</td>
                        <td className="px-4 py-3.5 text-[var(--foreground)]">{p.staff?.name ?? '—'}</td>
                        <td className="px-4 py-3.5 text-[var(--muted)]">{formatDate(p.start_date)}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-[var(--primary-light)] text-[var(--foreground)]">
                            {PROJECT_STATUS_LABEL[p.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-[var(--card-border)]">
                {noEstimateProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}/estimates`}
                    className="block p-4 hover:bg-[var(--primary-light)]/20 transition-colors"
                  >
                    <p className="font-bold text-[var(--foreground)] text-lg">{p.project_number}</p>
                    <p className="text-[var(--foreground)] mb-1">{p.customer?.name ?? '—'}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                      <span>{DEPARTMENT_LABEL[p.department]}</span>
                      <span>{p.staff?.name ?? '—'}</span>
                      <span>{formatDate(p.start_date)}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--primary)] font-semibold">見積を作成 →</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 作成済み */}
      <section>
        <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">作成済み</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          見積を作成済みの案件です。行をタップして編集できます。
        </p>
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
          {latestByProject.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[var(--muted)] font-semibold">作成済みの見積はありません</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-[var(--primary-light)] border-b-2 border-[var(--card-border)]">
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">案件番号</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">バージョン</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">見積ステータス</th>
                      <th className="px-4 py-4 text-left text-sm font-bold text-[var(--foreground)]">更新日</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {latestByProject.map((e, i) => (
                      <tr
                        key={e.id}
                        className={`${i % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'} cursor-pointer hover:bg-[var(--primary-light)]/40`}
                        onClick={() => router.push(`/projects/${e.project_id}/estimates`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            router.push(`/projects/${e.project_id}/estimates`)
                          }
                        }}
                        tabIndex={0}
                      >
                        <td className="px-4 py-3.5 font-semibold text-[var(--foreground)]">
                          <Link
                            href={`/projects/${e.project_id}/estimates`}
                            className="hover:text-[var(--primary)] hover:underline"
                          >
                            {e.project?.project_number ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--foreground)]">
                          {e.project?.customer?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--muted)]">v{e.version}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-[var(--primary-light)] text-[var(--foreground)]">
                            {ESTIMATE_STATUS_LABEL[e.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--muted)]">{formatDate(e.updated_at?.slice(0, 10))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-[var(--card-border)]">
                {latestByProject.map((e) => (
                  <Link
                    key={e.id}
                    href={`/projects/${e.project_id}/estimates`}
                    className="block p-4 hover:bg-[var(--primary-light)]/20 transition-colors"
                  >
                    <p className="font-bold text-[var(--foreground)] text-lg">
                      {e.project?.project_number ?? '—'}
                    </p>
                    <p className="text-[var(--foreground)] mb-1">{e.project?.customer?.name ?? '—'}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                      <span>v{e.version}</span>
                      <span>{ESTIMATE_STATUS_LABEL[e.status]}</span>
                      <span>{formatDate(e.updated_at?.slice(0, 10))}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--primary)] font-semibold">編集 →</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

const EstimatesPage = dynamic(
  () => Promise.resolve({ default: EstimatesPageContent }),
  { ssr: false }
)
export default EstimatesPage
