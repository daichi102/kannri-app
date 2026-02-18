'use client'

import { useEffect, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import CompletionCheckPdfDocument from '@/components/CompletionCheckPdfDocument'
import type { CompletionCheckFormData } from '@/components/CompletionCheckPdfDocument'
import type { Project } from '@/lib/types/project'
import type { ReceiptData } from '@/lib/receipt'

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

export default function ReceiptClient({ data, token }: { data: ReceiptData; token: string }) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfPreparing, setPdfPreparing] = useState(false)
  const [pdfError, setPdfError] = useState(false)

  const formData = data.form_data as CompletionCheckFormData
  const project = data.project ?? { project_number: '', customer: null, staff: null }
  const pdfDownloadUrl = `/api/receipt/${token}/pdf`

  // データ取得後にPDFを1回生成し、表示・保存の両方に使う
  useEffect(() => {
    let cancelled = false
    let blobUrl: string | null = null
    setPdfPreparing(true)
    setPdfError(false)
    const projectForPdf = {
      id: data.project_id,
      project_number: data.project.project_number,
      customer: data.project.customer,
      staff: data.project.staff,
    } as Project & { customer?: { name: string } | null; staff?: { name: string } | null }
    pdf(
      <CompletionCheckPdfDocument project={projectForPdf} form={formData} />
    )
      .toBlob()
      .then((blob) => {
        if (cancelled) return
        blobUrl = URL.createObjectURL(blob)
        setPdfBlobUrl(blobUrl)
        setPdfPreparing(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setPdfPreparing(false)
          setPdfError(true)
        }
        console.error('PDF生成エラー:', err)
      })
    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [data])

  const f = formData

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* お客様用：PDFを前面に表示・保存できるブロック */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border-2 border-orange-200">
          <h1 className="text-xl font-bold text-gray-900 mb-1">作業確認チェック表（控え）</h1>
          <p className="text-sm text-gray-500 mb-4">※全項目が抜け漏れないようチェックをお願い致します。</p>
          {pdfPreparing ? (
            <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-600 font-medium">PDFを準備しています...</p>
            </div>
          ) : pdfError ? (
            <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl">
              <p className="text-red-600 font-medium mb-2">PDFの準備に失敗しました。</p>
              <p className="text-sm text-gray-500">下の「PDFを保存」ボタンから、テキスト内容を確認のうえご利用ください。</p>
            </div>
          ) : pdfBlobUrl ? (
            <>
              <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 bg-gray-100" style={{ minHeight: 480 }}>
                <iframe
                  src={pdfBlobUrl}
                  title="作業確認チェック表 PDF"
                  className="w-full h-[480px]"
                />
              </div>
              <p className="text-sm text-gray-600 mb-3">お客様は下のリンクからPDFを端末に保存できます。</p>
              <a
                href={pdfDownloadUrl}
                rel="noopener noreferrer"
                className="inline-block w-full sm:w-auto px-8 py-4 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 shadow-md text-center"
              >
                PDFを保存（お客様用）
              </a>
            </>
          ) : null}
        </div>

        {/* 詳細（テキスト） */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
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
            <a
              href={pdfDownloadUrl}
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600"
            >
              PDFを保存（お客様用）
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
