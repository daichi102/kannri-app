'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department } from '@/lib/types/project'

type ProjectWithNames = Project & {
  customer?: { name: string; address?: string; phone?: string } | null
  staff?: { name: string } | null
}

type CompletionReport = {
  id: string
  project_id: string
  completed_at: string | null
  signer_name: string | null
  signature_data_url: string | null
  notes: string | null
}

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

const labelClass = 'block text-sm font-bold text-[var(--foreground)] mb-2'
const inputClass =
  'w-full border-2 border-[var(--card-border)] rounded-xl px-4 py-2.5 text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] transition-colors'
const btnPrimary =
  'px-5 py-2.5 bg-[var(--primary)] text-white font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 shadow-[var(--shadow)] transition-all'
const btnSecondary =
  'px-5 py-2.5 bg-[var(--card)] border-2 border-[var(--card-border)] text-[var(--foreground)] font-bold rounded-xl hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-all'

export default function CompletionReportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<ProjectWithNames | null>(null)
  const [report, setReport] = useState<CompletionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [completedAt, setCompletedAt] = useState('')
  const [signerName, setSignerName] = useState('')
  const [notes, setNotes] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [projectRes, reportRes] = await Promise.all([
        supabase.from('projects').select('*, customer:customers(name, address, phone), staff:staff(name)').eq('id', projectId).single(),
        supabase.from('project_completion_reports').select('*').eq('project_id', projectId).maybeSingle(),
      ])
      if (projectRes.data) setProject(projectRes.data as ProjectWithNames)
      if (reportRes.data) {
        const r = reportRes.data as CompletionReport
        setReport(r)
        setCompletedAt(r.completed_at ?? '')
        setSignerName(r.signer_name ?? '')
        setNotes(r.notes ?? '')
        setSignatureDataUrl(r.signature_data_url)
      }
      setLoading(false)
    }
    load()
  }, [projectId])

  const getCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return { canvas, ctx }
  }

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const g = getCanvas()
    if (!g) return
    const { ctx } = g
    ctx.strokeStyle = '#1c1917'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    isDrawing.current = true
    const { x, y } = getCoords(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const { ctx } = getCanvas() ?? {}
    if (!ctx) return
    const { x, y } = getCoords(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const { ctx } = getCanvas() ?? {}
    if (ctx) ctx.closePath()
  }

  const clearSignature = () => {
    const { canvas, ctx } = getCanvas() ?? {}
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureDataUrl(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setError(null)
    setSaving(true)

    const canvas = canvasRef.current
    const dataUrl = canvas && canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL('image/png') : signatureDataUrl

    const supabase = createClient()
    const payload = {
      project_id: projectId,
      completed_at: completedAt || null,
      signer_name: signerName.trim() || null,
      signature_data_url: dataUrl || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error: err } = await supabase.from('project_completion_reports').upsert(payload, {
      onConflict: 'project_id',
    })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    const { error: statusErr } = await supabase
      .from('projects')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (statusErr) {
      setError(statusErr.message)
      setSaving(false)
      return
    }
    setSignatureDataUrl(dataUrl)
    setReport({ ...report!, ...payload } as CompletionReport)
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-[var(--error)] font-semibold">案件が見つかりません</p>
        <Link href="/" className="text-[var(--primary)] hover:underline mt-2 inline-block">ホームに戻る</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← 案件詳細に戻る
        </Link>
      </div>

      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight mb-6">
        完了報告書
      </h1>

      <div className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8 space-y-6">
        <section>
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">報告内容（内容は未定のためプレースホルダーです）</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">案件番号</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.project_number}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">部門</dt>
              <dd className="font-semibold text-[var(--foreground)]">{DEPARTMENT_LABEL[project.department]}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">顧客名</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.customer?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">担当者</dt>
              <dd className="font-semibold text-[var(--foreground)]">{project.staff?.name ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className={labelClass}>完了日</label>
            <input
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <section>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">お客様のデジタルサイン</h2>
            <p className="text-sm text-[var(--muted)] mb-3">
              下の枠内にマウスまたは指で署名してください。
            </p>
            <div className="border-2 border-[var(--card-border)] rounded-xl overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full max-w-full touch-none block border-0"
                style={{ height: '200px' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={clearSignature} className={btnSecondary}>
                署名をクリア
              </button>
            </div>
            {report?.signature_data_url && (
              <p className="mt-2 text-sm text-[var(--muted)]">保存済みの署名があります。上で書き直して保存すると更新されます。</p>
            )}
          </section>

          <div>
            <label className={labelClass}>署名者名（任意）</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="お客様のお名前"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>備考（任意）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-sm font-semibold text-[var(--error)]">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? '処理中...' : '完了'}
            </button>
            <Link href={`/projects/${projectId}`} className={btnSecondary}>
              キャンセル
            </Link>
          </div>
        </form>

        {report?.signature_data_url && (
          <section className="pt-6 border-t-2 border-[var(--card-border)]">
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">保存された署名</h2>
            <img
              src={report.signature_data_url}
              alt="保存された署名"
              className="max-w-full h-auto border-2 border-[var(--card-border)] rounded-xl bg-white"
              style={{ maxHeight: '120px', objectFit: 'contain' }}
            />
            {report.signer_name && <p className="mt-2 text-sm text-[var(--muted)]">署名者: {report.signer_name}</p>}
            {report.completed_at && <p className="text-sm text-[var(--muted)]">完了日: {report.completed_at}</p>}
          </section>
        )}
      </div>
    </div>
  )
}
