'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserRole, isAdmin } from '@/lib/auth'
import type { Project } from '@/lib/types/project'

type ProjectWithStaff = Project & { staff?: { name: string } | null; customer?: { name: string } | null }
type SalesRow = { project_id: string; sales_amount: number; is_fixed: boolean; fixed_at: string | null }
type Aggregates = Record<string, { costs: number; labor: number; expenses: number }>

type SaleWithProject = {
  id: string
  project_id: string
  sales_amount: number
  is_fixed: boolean
  fixed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  project?: {
    project_number: string
    customer?: { name: string } | null
    staff?: { name: string } | null
  } | null
}

const TABS = [
  { id: 'list', label: '一覧' },
  { id: 'aggregate', label: '集計' },
] as const
type TabId = (typeof TABS)[number]['id']

function SalesManagementContent() {
  const searchParams = useSearchParams()
  const [role, setRole] = useState<'admin' | 'user' | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab')
    return t === 'aggregate' ? 'aggregate' : 'list'
  })
  const [loading, setLoading] = useState(true)
  const [salesList, setSalesList] = useState<SaleWithProject[]>([])
  const [projects, setProjects] = useState<ProjectWithStaff[]>([])
  const [salesRaw, setSalesRaw] = useState<SalesRow[]>([])
  const [aggregates, setAggregates] = useState<Aggregates>({})
  const [staffNames, setStaffNames] = useState<Record<string, string>>({})

  useEffect(() => {
    getCurrentUserRole().then(setRole)
  }, [])

  useEffect(() => {
    if (!isAdmin(role)) {
      setLoading(false)
      return
    }
    async function load() {
      const supabase = createClient()

      const { data: salesData } = await supabase
        .from('project_sales')
        .select('*, project:projects(project_number, customer:customers(name), staff:staff(name))')
        .order('updated_at', { ascending: false })
      setSalesList((salesData ?? []) as SaleWithProject[])

      const { data: projectsData } = await supabase
        .from('projects')
        .select('*, staff:staff(name), customer:customers(name)')
        .order('created_at', { ascending: false })
      setProjects((projectsData ?? []) as ProjectWithStaff[])

      const { data: salesPlain } = await supabase
        .from('project_sales')
        .select('project_id, sales_amount, is_fixed, fixed_at')
      setSalesRaw((salesPlain ?? []) as SalesRow[])

      const [costsRes, laborRes, expensesRes] = await Promise.all([
        supabase.from('project_costs').select('project_id, amount'),
        supabase.from('project_labor_costs').select('project_id, amount'),
        supabase.from('project_expenses').select('project_id, amount'),
      ])
      const agg: Aggregates = {}
      const add = (projectId: string, key: 'costs' | 'labor' | 'expenses', amount: number) => {
        if (!agg[projectId]) agg[projectId] = { costs: 0, labor: 0, expenses: 0 }
        agg[projectId][key] += Number(amount)
      }
      ;(costsRes.data ?? []).forEach((r: { project_id: string; amount: number }) => add(r.project_id, 'costs', r.amount))
      ;(laborRes.data ?? []).forEach((r: { project_id: string; amount: number }) => add(r.project_id, 'labor', r.amount))
      ;(expensesRes.data ?? []).forEach((r: { project_id: string; amount: number }) => add(r.project_id, 'expenses', r.amount))
      setAggregates(agg)

      const { data: staffData } = await supabase.from('staff').select('id, name')
      const names: Record<string, string> = {}
      ;(staffData ?? []).forEach((s: { id: string; name: string }) => { names[s.id] = s.name })
      setStaffNames(names)

      setLoading(false)
    }
    load()
  }, [role])

  const salesByProject: Record<string, number> = {}
  salesRaw.forEach((s) => { salesByProject[s.project_id] = Number(s.sales_amount) })

  const projectRows = projects.map((p) => {
    const sales = salesByProject[p.id] ?? 0
    const ag = aggregates[p.id] ?? { costs: 0, labor: 0, expenses: 0 }
    const gross = sales - ag.costs
    const net = gross - ag.labor - ag.expenses
    return {
      project: p,
      sales,
      costs: ag.costs,
      labor: ag.labor,
      expenses: ag.expenses,
      grossProfit: gross,
      netProfit: net,
    }
  })

  const monthlyMap: Record<string, number> = {}
  salesRaw.filter((s) => s.is_fixed && s.fixed_at).forEach((s) => {
    const key = s.fixed_at!.slice(0, 7)
    monthlyMap[key] = (monthlyMap[key] ?? 0) + Number(s.sales_amount)
  })
  const monthlyRows = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, amount]) => ({ month, amount }))

  const staffMap: Record<string, { sales: number; costs: number; labor: number; expenses: number }> = {}
  projectRows.forEach((row) => {
    const sid = row.project.staff_id
    if (!sid) return
    if (!staffMap[sid]) staffMap[sid] = { sales: 0, costs: 0, labor: 0, expenses: 0 }
    staffMap[sid].sales += row.sales
    staffMap[sid].costs += row.costs
    staffMap[sid].labor += row.labor
    staffMap[sid].expenses += row.expenses
  })
  const staffRows = Object.entries(staffMap).map(([staffId, v]) => ({
    staffName: staffNames[staffId] ?? '（未設定）',
    staffId,
    ...v,
    grossProfit: v.sales - v.costs,
    netProfit: v.sales - v.costs - v.labor - v.expenses,
  }))

  const fixedSalesProjectIds = new Set(salesRaw.filter((s) => s.is_fixed).map((s) => s.project_id))
  const unrecordedSalesProjects = projects.filter(
    (p) => p.status === 'completed' && !fixedSalesProjectIds.has(p.id)
  )

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-[var(--muted)] py-12">読み込み中...</p>
      </div>
    )
  }

  if (!isAdmin(role)) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-8 text-center shadow-[var(--shadow)]">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">売上管理</h2>
          <p className="text-[var(--muted)]">この画面は管理者のみ閲覧できます。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">売上管理一覧</h1>

      <div className="flex gap-1 p-1 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-xl shadow-[var(--shadow)] w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === id
                ? 'bg-[var(--primary)] text-[var(--background)] shadow-[var(--shadow)]'
                : 'text-[var(--foreground)] hover:bg-[var(--primary-light)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
        <>
          {unrecordedSalesProjects.length > 0 && (
            <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
              <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
                <h2 className="text-xl font-bold text-[var(--foreground)]">売上未記入</h2>
                <p className="text-sm text-[var(--muted)] mt-1">完了した案件のうち、売上未確定の一覧です。</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--primary-light)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">案件番号</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                      <th className="px-4 py-3 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unrecordedSalesProjects.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">{p.project_number}</td>
                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">{p.customer?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">{p.staff?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <Link href={`/projects/${p.id}/sales`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                            売上を入力
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
            <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
              <h2 className="text-xl font-bold text-[var(--foreground)]">売上一覧</h2>
            </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--primary-light)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">案件番号</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">顧客</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                  <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">売上金額</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-[var(--foreground)]">確定</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">確定日</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-[var(--foreground)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {salesList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">売上管理票が登録されていません</td>
                  </tr>
                ) : (
                  salesList.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.project?.project_number ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.project?.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.project?.staff?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{Number(row.sales_amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${row.is_fixed ? 'bg-green-100 text-green-800' : 'bg-[var(--primary-light)] text-[var(--foreground)]'}`}>
                          {row.is_fixed ? '確定' : '未確定'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--muted)]">{row.fixed_at ? row.fixed_at.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/projects/${row.project_id}/sales`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                          売上管理票
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        </>
      )}

      {activeTab === 'aggregate' && (
        <div className="space-y-8">
          <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
            <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
              <h2 className="text-xl font-bold text-[var(--foreground)]">案件別損益</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--primary-light)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">案件番号</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">売上</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">原価</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">人件費</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">経費</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">粗利</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">純利</th>
                  </tr>
                </thead>
                <tbody>
                  {projectRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">案件がありません</td></tr>
                  ) : projectRows.map((row, idx) => (
                    <tr key={row.project.id} className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.project.project_number}</td>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.project.staff?.name ?? staffNames[row.project.staff_id] ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.sales.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.costs.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.labor.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.expenses.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{row.grossProfit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{row.netProfit.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {projectRows.length > 0 && (
                  <tfoot className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-sm font-bold text-[var(--foreground)]">合計</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.sales, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.costs, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.labor, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.expenses, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.grossProfit, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{projectRows.reduce((s, r) => s + r.netProfit, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
            <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
              <h2 className="text-xl font-bold text-[var(--foreground)]">月別売上集計（確定済みのみ）</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--primary-light)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">年月</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">売上合計</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.length === 0 ? (
                    <tr><td colSpan={2} className="px-4 py-8 text-center text-[var(--muted)]">確定済みの売上がありません</td></tr>
                  ) : monthlyRows.map((row, idx) => (
                    <tr key={row.month} className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.month}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{row.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {monthlyRows.length > 0 && (
                  <tfoot className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-[var(--foreground)]">合計</td>
                      <td className="px-4 py-3 text-right font-bold">¥{monthlyRows.reduce((s, r) => s + r.amount, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
            <div className="bg-[var(--primary-light)] px-6 py-4 border-b-2 border-[var(--card-border)]">
              <h2 className="text-xl font-bold text-[var(--foreground)]">担当者別売上・利益集計</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--primary-light)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-bold text-[var(--foreground)]">担当者</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">売上</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">原価</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">人件費</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">経費</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">粗利</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-[var(--foreground)]">純利</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">担当者別のデータがありません</td></tr>
                  ) : staffRows.map((row, idx) => (
                    <tr key={row.staffId} className={idx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--primary-light)]/30'}>
                      <td className="px-4 py-3 text-sm text-[var(--foreground)]">{row.staffName}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.sales.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.costs.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.labor.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">¥{row.expenses.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{row.grossProfit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">¥{row.netProfit.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {staffRows.length > 0 && (
                  <tfoot className="bg-[var(--primary-light)] border-t-2 border-[var(--card-border)]">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-[var(--foreground)]">合計</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.sales, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.costs, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.labor, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.expenses, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.grossProfit, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{staffRows.reduce((s, r) => s + r.netProfit, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

const SalesManagementPage = dynamic(() => Promise.resolve(SalesManagementContent), { ssr: false })
export default SalesManagementPage
