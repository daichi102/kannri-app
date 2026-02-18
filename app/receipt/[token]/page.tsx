'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { pdf } from '@react-pdf/renderer'
import CompletionCheckPdfDocument from '@/components/CompletionCheckPdfDocument'
import type { CompletionCheckFormData } from '@/components/CompletionCheckPdfDocument'
import type { Project } from '@/lib/types/project'

type ProjectInfo = {
  project_number: string
  customer?: { name: string } | null
  staff?: { name: string } | null
}

type ApiResponse = {
  form_data: CompletionCheckFormData
  project_id: string
  project: ProjectInfo
}

const DELIVERY_ITEMS = [
  '① 開梱時、商品のキズ確認(キズがある場合、写真)',
  '② お客様立会いのもと、商品のキズ確認',
  '③ 商品の搬入前ルート確認',
  '④ 商品設置場所周囲のキズ確認(キズがある場合、写真)',
]
const COMPLETION_ITEMS = [
  '① お客様による商品の設置状況確認',
  '② 設置後、商品のキズの確認(キズがある場合、写真)',
  '③ 試運転をお客様立会いのもとで実施',
  '④ 給水栓の水漏れ、排水ホースの立上り確認',
  '⑤ 設置場所周辺、搬入ルート等の清掃(ゴミ、戸締り等)',
  '⑥ 商品搬入後ルート確認(キズがある場合、写真)',
  '⑦ 商品設置状況の説明・商品の簡易取り扱い説明',
]

function CheckCell({ v }: { v: boolean }) {
  return <td className="p-2 text-center border border-gray-300">{v ? '〇' : '－'}</td>
}

export default function ReceiptPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/receipt/${token}`)
        if (!res.ok) {
          if (!cancelled) setError('控えが見つかりません')
          return
        }
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError('読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  async function handleDownloadPdf() {
    if (!data) return
    setPdfLoading(true)
    try {
      const projectForPdf = { id: data.project_id, project_number: data.project.project_number, customer: data.project.customer, staff: data.project.staff } as Project & { customer?: { name: string } | null; staff?: { name: string } | null }
      const blob = await pdf(
        <CompletionCheckPdfDocument project={projectForPdf} form={data.form_data} />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `作業確認チェック表_${data.project.project_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <p className="text-red-600 font-semibold">{error ?? '控えが見つかりません'}</p>
          <p className="text-sm text-gray-500 mt-2">URLをご確認ください。</p>
        </div>
      </div>
    )
  }

  const f = data.form_data
  const project = data.project ?? { project_number: '', customer: null, staff: null }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-6 md:p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">作業確認チェック表（控え）</h1>
        <p className="text-sm text-gray-500 mb-6">※全項目が抜け漏れないようチェックをお願い致します。</p>

        <section className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3">基本情報</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">問い合わせ番号</dt><dd>{f.inquiry_number || '－'}</dd>
            <dt className="text-gray-500">作業担当者</dt><dd>{f.worker_name || project.staff?.name || '－'}</dd>
            <dt className="text-gray-500">販売店</dt><dd>{f.retailer || '－'}</dd>
            <dt className="text-gray-500">設置商品(品番)</dt><dd>{f.product_code || '－'}</dd>
            <dt className="text-gray-500">製造番号</dt><dd>{f.serial_number || '－'}</dd>
          </dl>
        </section>

        <section className="mb-6 overflow-x-auto">
          <h2 className="text-sm font-bold text-gray-700 mb-2">商品搬入時</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 border border-gray-300">確認事項</th>
                <th className="text-center w-14 border border-gray-300">床</th>
                <th className="text-center w-14 border border-gray-300">壁</th>
                <th className="text-center w-14 border border-gray-300">その他</th>
              </tr>
            </thead>
            <tbody>
              {DELIVERY_ITEMS.map((label, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="p-2 border border-gray-300">{label}</td>
                  <CheckCell v={f.delivery_checks?.[i]?.floor} />
                  <CheckCell v={f.delivery_checks?.[i]?.wall} />
                  <CheckCell v={f.delivery_checks?.[i]?.other} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-6 overflow-x-auto">
          <h2 className="text-sm font-bold text-gray-700 mb-2">作業終了後</h2>
          <p className="text-xs text-gray-500 mb-2">※搬入ルート等、キズがある場合は、お客様に確認して頂くこと。</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 border border-gray-300">確認事項</th>
                <th className="text-center w-14 border border-gray-300">床</th>
                <th className="text-center w-14 border border-gray-300">壁</th>
                <th className="text-center w-14 border border-gray-300">その他</th>
              </tr>
            </thead>
            <tbody>
              {COMPLETION_ITEMS.map((label, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="p-2 border border-gray-300">{label}</td>
                  <CheckCell v={f.completion_checks?.[i]?.floor} />
                  <CheckCell v={f.completion_checks?.[i]?.wall} />
                  <CheckCell v={f.completion_checks?.[i]?.other} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-2">設置環境・オプション・設置日時</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">エレベーター</dt><dd>{f.elevator === 'yes' ? '有' : '無'}</dd>
            <dt className="text-gray-500">設置階数</dt><dd>{f.installation_floor || '－'}</dd>
            <dt className="text-gray-500">階段</dt><dd>{f.stairs_location === 'outdoor' ? '屋外' : '屋内'} {f.stairs_steps ? f.stairs_steps + '段' : ''}</dd>
            <dt className="text-gray-500">設置日</dt><dd>{f.installation_date || '－'}</dd>
            <dt className="text-gray-500">設置時間</dt><dd>{f.installation_time || '－'}</dd>
            <dt className="text-gray-500">協力会社</dt><dd>{f.partner_company || '－'}</dd>
            <dt className="text-gray-500">お客様名（姓）</dt><dd>{f.customer_name || '－'}</dd>
          </dl>
          {f.change_notes && <p className="text-sm mt-2">変更内容・備考: {f.change_notes}</p>}
        </section>

        {f.customer_signature_data_url && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-gray-700 mb-2">お客様署名</h2>
            <img src={f.customer_signature_data_url} alt="署名" className="max-w-[200px] border border-gray-300 rounded" />
          </section>
        )}

        <div className="pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50"
          >
            {pdfLoading ? 'PDF作成中...' : 'PDFをダウンロード'}
          </button>
        </div>
      </div>
    </div>
  )
}
