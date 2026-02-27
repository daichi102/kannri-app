'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Estimate, EstimateItem } from '@/lib/types/estimate'
import type { Project } from '@/lib/types/project'
import { calcLine, calcTotals, type TaxMode } from '@/lib/estimate/calc'

type Customer = {
  id: string
  name: string
  company_name: string | null
  contact_name: string | null
  name_kana: string | null
  address: string | null
  phone: string | null
}

const ISSUER_COMPANY_NAME = '株式会社アイザ'
const ISSUER_ADDRESS = '174-0076 東京都板橋区上板橋2-2-6'
const MAX_DETAIL_ROWS = 13

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
          const { data: cust } = await supabase
            .from('customers')
            .select('id, name, company_name, contact_name, name_kana, address, phone')
            .eq('id', pid)
            .single()
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
  const dateLabel = docType === 'invoice' ? '請求日' : '見積日'

  const computedItems = useMemo(() => {
    const taxMode: TaxMode = estimate?.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'
    return items.map((item) => ({ ...item, ...calcLine(item, taxMode) }))
  }, [items, estimate?.tax_mode])

  const totals = useMemo(() => calcTotals(computedItems), [computedItems])
  const detailRows = useMemo(() => {
    const filled = computedItems.slice(0, MAX_DETAIL_ROWS)
    while (filled.length < MAX_DETAIL_ROWS) filled.push(null as unknown as EstimateItem)
    return filled
  }, [computedItems])

  const taxRateLabel = useMemo(() => {
    const firstRate = computedItems[0]?.tax_rate
    const percent = Math.round((Number(firstRate) || 0.1) * 100)
    return `${percent}%`
  }, [computedItems])

  function formatAmount(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return ''
    return `${Number(value).toLocaleString()}円`
  }

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
    <div className="estimate-print-page">
      <div className="estimate-print-toolbar print:hidden">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/estimates`)}
          className="estimate-print-btn"
        >
          見積に戻る
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="estimate-print-btn estimate-print-btn-primary"
        >
          印刷 / PDFに保存
        </button>
      </div>

      <div ref={printRef} className="estimate-print-sheet">
        <div className="estimate-title">{title}</div>

        <div className="estimate-company-info">
          {(customer?.company_name || customer?.name || '') && (
            <>
              {customer?.company_name || customer?.name} 御中
              <br />
            </>
          )}
          {customer?.address || ''}
        </div>

        <div className="estimate-meta">
          {dateLabel}：{estimate.issue_date || ''}
          <br />
          見積番号：{project.project_number || ''}
          <br />
          有効期限：{estimate.valid_until || ''}
        </div>

        <div className="estimate-issue-company">
          {ISSUER_COMPANY_NAME}
          <br />
          {ISSUER_ADDRESS}
        </div>

        <div className="estimate-stamp">印</div>

        <div className="estimate-total-box">
          <table>
            <tbody>
              <tr>
                <td>小計</td>
                <td>{formatAmount(totals.subtotalExclTax)}</td>
              </tr>
              <tr>
                <td>消費税({taxRateLabel})</td>
                <td>{formatAmount(totals.totalTax)}</td>
              </tr>
              <tr>
                <td>
                  <b>{docType === 'invoice' ? '請求金額' : '見積金額'}</b>
                </td>
                <td className="estimate-total-amount">{formatAmount(totals.totalInclTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <table className="estimate-detail">
          <thead>
            <tr>
              <th style={{ width: '80mm' }}>摘要</th>
              <th style={{ width: '20mm' }}>数量</th>
              <th style={{ width: '30mm' }}>単価</th>
              <th style={{ width: '40mm' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((item, index) => (
              <tr key={item?.id ?? `empty-${index}`}>
                <td>{item?.item_name || ''}</td>
                <td align="center">
                  {item ? `${item.quantity}${item.unit || ''}` : ''}
                </td>
                <td align="right">{item ? Number(item.unit_price).toLocaleString() : ''}</td>
                <td align="right">
                  {item ? Number(item.amount_excl_tax || item.subtotal || 0).toLocaleString() : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="estimate-note">
          <b>備考</b>
          <br />
          <span className="estimate-note-content">{estimate.notes || ''}</span>
        </div>

        <div className="estimate-page-number">1 / 1</div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }

        .estimate-print-page {
          margin: 0;
          background: #ccc;
          min-height: 100vh;
          padding: 12px 0;
        }

        .estimate-print-toolbar {
          width: 210mm;
          margin: 0 auto 12px;
          display: flex;
          justify-content: space-between;
        }

        .estimate-print-btn {
          padding: 8px 14px;
          border: 1px solid #cfd4dc;
          border-radius: 10px;
          background: #ffffff;
          color: #111827;
          font-weight: 700;
        }

        .estimate-print-btn-primary {
          background: #111827;
          color: #ffffff;
          border-color: #111827;
        }

        .estimate-print-sheet {
          position: relative;
          width: 210mm;
          height: 296mm;
          background: #fff;
          margin: 0 auto;
          font-family: 'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif;
          color: #000;
          overflow: hidden;
        }

        .estimate-title {
          position: absolute;
          top: 15mm;
          left: 0;
          width: 210mm;
          text-align: center;
          font-size: 20pt;
          font-weight: bold;
        }

        .estimate-company-info {
          position: absolute;
          top: 30mm;
          left: 20mm;
          width: 85mm;
          font-size: 10pt;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .estimate-meta {
          position: absolute;
          top: 30mm;
          right: 20mm;
          font-size: 10pt;
          line-height: 1.8;
          text-align: right;
          white-space: nowrap;
        }

        .estimate-issue-company {
          position: absolute;
          top: 55mm;
          right: 20mm;
          width: 60mm;
          font-size: 10pt;
          line-height: 1.6;
          text-align: left;
        }

        .estimate-stamp {
          position: absolute;
          top: 55mm;
          right: 85mm;
          width: 25mm;
          height: 25mm;
          border: 2px solid red;
          border-radius: 50%;
          text-align: center;
          line-height: 25mm;
          color: red;
          font-weight: bold;
          font-size: 10pt;
        }

        .estimate-total-box {
          position: absolute;
          top: 92mm;
          left: 20mm;
          width: 80mm;
          border: 1px solid #000;
        }

        .estimate-total-box table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10pt;
        }

        .estimate-total-box td {
          border: 1px solid #000;
          padding: 2.4mm 3mm;
          text-align: right;
        }

        .estimate-total-amount {
          font-size: 14pt;
          font-weight: bold;
        }

        .estimate-detail {
          position: absolute;
          top: 132mm;
          left: 20mm;
          width: 170mm;
          border-collapse: collapse;
          font-size: 9pt;
          table-layout: fixed;
        }

        .estimate-detail th,
        .estimate-detail td {
          border: 1px solid #000;
          padding: 2.2mm;
          vertical-align: middle;
        }

        .estimate-detail th {
          background: #eee;
          text-align: center;
        }

        .estimate-detail tbody tr {
          height: 6.5mm;
        }

        .estimate-note {
          position: absolute;
          bottom: 16mm;
          left: 20mm;
          width: 170mm;
          min-height: 18mm;
          border: 1px solid #000;
          padding: 3mm 4mm;
          font-size: 9pt;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .estimate-note-content {
          white-space: pre-wrap;
        }

        .estimate-page-number {
          position: absolute;
          bottom: 8mm;
          width: 210mm;
          text-align: center;
          font-size: 9pt;
        }

        @media print {
          header {
            display: none !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .estimate-print-page {
            background: #fff;
            padding: 0;
            min-height: auto;
          }

          .estimate-print-toolbar {
            display: none !important;
          }

          .estimate-print-sheet {
            margin: 0;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}

export default dynamic(() => Promise.resolve(PrintPageContent), { ssr: false })
