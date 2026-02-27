'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Estimate, EstimateItem } from '@/lib/types/estimate'
import type { Project } from '@/lib/types/project'
import { calcLine, calcTotals, type TaxMode } from '@/lib/estimate/calc'

type Customer = { id: string; name: string; name_kana: string | null; address: string | null; phone: string | null }

function PrintPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const docType = searchParams.get('doc') === 'invoice' ? 'invoice' : 'estimate'

  const [project, setProject] = useState<Project | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectData) {
        setProject(projectData as Project)
        const pid = (projectData as Project).customer_id
        if (pid) {
          const { data: cust } = await supabase.from('customers').select('id, name, name_kana, address, phone').eq('id', pid).single()
          if (cust) setCustomer(cust as Customer)
        }
      }

      const { data: estimateData } = await supabase
        .from('estimates')
        .select('*')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (estimateData) {
        setEstimate(estimateData as Estimate)
        const { data: itemsData } = await supabase
          .from('estimate_items')
          .select('*')
          .eq('estimate_id', estimateData.id)
          .order('display_order')
        setItems((itemsData ?? []) as EstimateItem[])
      }

      setLoading(false)
    }
    load()
  }, [projectId])

  const handlePrint = () => {
    window.print()
  }

  const title = docType === 'invoice' ? '請求書' : '見積書'
  const computedItems = items.map((item) => {
    const taxMode: TaxMode = estimate?.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'
    return { ...item, ...calcLine(item, taxMode) }
  })
  const totals = calcTotals(computedItems)

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <p className="text-center text-[var(--muted)]">読み込み中...</p>
      </div>
    )
  }

  if (!project || !estimate) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <p className="text-center text-[var(--error)]">見積データが見つかりません</p>
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/estimates`)}
          className="mt-4 px-4 py-2 bg-[var(--primary)] text-[var(--background)] rounded-xl"
        >
          見積に戻る
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="mb-6 flex justify-between items-start print:hidden">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/estimates`)}
          className="px-4 py-2 border-2 border-[var(--card-border)] rounded-xl text-[var(--foreground)] font-semibold"
        >
          見積に戻る
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="px-5 py-2.5 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl"
        >
          印刷 / PDFに保存
        </button>
      </div>

      <div ref={printRef} className="bg-white text-black p-10 rounded-lg shadow print:shadow-none">
        <h1 className="text-2xl font-bold text-center mb-8">{title}</h1>
        <div className="mb-8 flex justify-between text-sm">
          <div className="space-y-1">
            <div>見積番号: {project.project_number}</div>
            <div>件名: {estimate.subject || '—'}</div>
            <div>発行日: {estimate.issue_date || '—'}</div>
            <div>有効期限: {estimate.valid_until || '—'}</div>
            <div>税計算: {estimate.tax_mode === 'inclusive' ? '税込' : '税抜'}</div>
          </div>
          <div>案件番号: {project.project_number}</div>
        </div>
        {customer && (
          <div className="mb-8 text-sm">
            <p className="font-bold">{customer.name}</p>
            {customer.name_kana && <p className="text-gray-600">{customer.name_kana}</p>}
            {customer.address && <p>{customer.address}</p>}
            {customer.phone && <p>TEL: {customer.phone}</p>}
          </div>
        )}
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">項目名</th>
              <th className="border border-gray-300 px-4 py-2 text-right">単位</th>
              <th className="border border-gray-300 px-4 py-2 text-right">単価</th>
              <th className="border border-gray-300 px-4 py-2 text-right">数量</th>
              <th className="border border-gray-300 px-4 py-2 text-right">税率</th>
              <th className="border border-gray-300 px-4 py-2 text-right">税抜小計</th>
              <th className="border border-gray-300 px-4 py-2 text-right">税額</th>
              <th className="border border-gray-300 px-4 py-2 text-right">税込小計</th>
            </tr>
          </thead>
          <tbody>
            {computedItems.map((item) => (
              <tr key={item.id}>
                <td className="border border-gray-300 px-4 py-2">{item.item_name || '—'}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{item.unit || '式'}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">¥{item.unit_price.toLocaleString()}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{item.quantity}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">{Math.round((item.tax_rate || 0.1) * 100)}%</td>
                <td className="border border-gray-300 px-4 py-2 text-right">¥{(item.amount_excl_tax || 0).toLocaleString()}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">¥{(item.tax_amount || 0).toLocaleString()}</td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  ¥{(item.amount_incl_tax || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={7} className="border border-gray-300 px-4 py-3 text-right">合計（税抜）</td>
              <td className="border border-gray-300 px-4 py-3 text-right">¥{totals.subtotalExclTax.toLocaleString()}</td>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={7} className="border border-gray-300 px-4 py-3 text-right">税額合計</td>
              <td className="border border-gray-300 px-4 py-3 text-right">¥{totals.totalTax.toLocaleString()}</td>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={7} className="border border-gray-300 px-4 py-3 text-right">合計（税込）</td>
              <td className="border border-gray-300 px-4 py-3 text-right">¥{totals.totalInclTax.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default dynamic(() => Promise.resolve(PrintPageContent), { ssr: false })
