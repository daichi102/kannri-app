'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Department } from '@/lib/types/project'

type ProjectWithNames = Project & {
  customer?: { name: string } | null
  staff?: { name: string } | null
}

type CheckRow = { floor: boolean; wall: boolean; other: boolean }

type FormData = {
  inquiry_number: string
  worker_name: string
  retailer: string
  product_code: string
  serial_number: string
  installation_date: string
  installation_time: string
  partner_company: string
  change_notes: string
  customer_name: string
  delivery_checks: CheckRow[]
  completion_checks: CheckRow[]
  elevator: 'none' | 'yes'
  installation_floor: string
  stairs_location: 'indoor' | 'outdoor'
  stairs_steps: string
  warranty: 'take_home' | 'customer_retailer'
  carry_out: 'none' | 'yes'
  refrigerator: '' | '400l_or_less' | '500l_or_more'
  washing_machine: '' | 'vertical' | 'drum'
  option_unic: boolean
  option_high_altitude: boolean
  option_door_window: boolean
  option_special: boolean
  option_counter: boolean
  option_recycling: boolean
}

const DEFAULT_CHECK_ROW: CheckRow = { floor: false, wall: false, other: false }
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

const defaultFormData = (): FormData => ({
  inquiry_number: '',
  worker_name: '',
  retailer: '',
  product_code: '',
  serial_number: '',
  installation_date: '',
  installation_time: '',
  partner_company: '',
  change_notes: '',
  customer_name: '',
  delivery_checks: DELIVERY_ITEMS.map(() => ({ ...DEFAULT_CHECK_ROW })),
  completion_checks: COMPLETION_ITEMS.map(() => ({ ...DEFAULT_CHECK_ROW })),
  elevator: 'none',
  installation_floor: '',
  stairs_location: 'indoor',
  stairs_steps: '',
  warranty: 'take_home',
  carry_out: 'none',
  refrigerator: '',
  washing_machine: '',
  option_unic: false,
  option_high_altitude: false,
  option_door_window: false,
  option_special: false,
  option_counter: false,
  option_recycling: false,
})

export default function CompletionCheckPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<ProjectWithNames | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(() => defaultFormData())

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [projectRes, checkRes] = await Promise.all([
        supabase.from('projects').select('*, customer:customers(name), staff:staff(name)').eq('id', projectId).single(),
        supabase.from('project_completion_checks').select('form_data').eq('project_id', projectId).maybeSingle(),
      ])
      if (projectRes.data) setProject(projectRes.data as ProjectWithNames)
      if (checkRes.data?.form_data) {
        const saved = checkRes.data.form_data as Record<string, unknown>
        setForm((prev) => ({
          ...prev,
          ...saved,
          delivery_checks: Array.isArray(saved.delivery_checks) ? saved.delivery_checks as CheckRow[] : prev.delivery_checks,
          completion_checks: Array.isArray(saved.completion_checks) ? saved.completion_checks as CheckRow[] : prev.completion_checks,
        }))
      }
      setLoading(false)
    }
    load()
  }, [projectId])

  const setDeliveryCheck = (index: number, key: keyof CheckRow, value: boolean) => {
    setForm((f) => {
      const next = [...f.delivery_checks]
      next[index] = { ...next[index], [key]: value }
      return { ...f, delivery_checks: next }
    })
  }

  const setCompletionCheck = (index: number, key: keyof CheckRow, value: boolean) => {
    setForm((f) => {
      const next = [...f.completion_checks]
      next[index] = { ...next[index], [key]: value }
      return { ...f, completion_checks: next }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('project_completion_checks').upsert(
      {
        project_id: projectId,
        form_data: form,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-[var(--muted)] font-semibold">読み込み中...</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-[var(--error)] font-semibold">案件が見つかりません</p>
        <Link href="/" className="text-[var(--primary)] hover:underline mt-2 inline-block">ホームに戻る</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← 案件詳細に戻る
        </Link>
      </div>

      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight mb-2">
        作業確認チェック表
      </h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        ※全項目が抜け漏れないようチェックをお願い致します。
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 基本情報 */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">基本情報</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>問い合わせ番号</label>
              <input type="text" value={form.inquiry_number} onChange={(e) => setForm((f) => ({ ...f, inquiry_number: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>作業担当者</label>
              <input type="text" value={form.worker_name} onChange={(e) => setForm((f) => ({ ...f, worker_name: e.target.value }))} className={inputClass} placeholder={project.staff?.name ?? ''} />
            </div>
            <div>
              <label className={labelClass}>販売店</label>
              <input type="text" value={form.retailer} onChange={(e) => setForm((f) => ({ ...f, retailer: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>設置商品(品番)</label>
              <input type="text" value={form.product_code} onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))} className={inputClass} placeholder={project.product_code ?? ''} />
            </div>
            <div>
              <label className={labelClass}>製造番号</label>
              <input type="text" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} className={inputClass} />
            </div>
          </div>
        </section>

        {/* 商品搬入時 */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8 overflow-x-auto">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">商品搬入時</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--card-border)]">
                <th className="text-left py-3 pr-4 text-sm font-bold text-[var(--foreground)]">確認事項</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">床</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">壁</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">その他</th>
              </tr>
            </thead>
            <tbody>
              {DELIVERY_ITEMS.map((label, i) => (
                <tr key={i} className="border-b border-[var(--card-border)]">
                  <td className="py-2 pr-4 text-sm text-[var(--foreground)]">{label}</td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.delivery_checks[i]?.floor ?? false} onChange={(e) => setDeliveryCheck(i, 'floor', e.target.checked)} className="w-4 h-4" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.delivery_checks[i]?.wall ?? false} onChange={(e) => setDeliveryCheck(i, 'wall', e.target.checked)} className="w-4 h-4" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.delivery_checks[i]?.other ?? false} onChange={(e) => setDeliveryCheck(i, 'other', e.target.checked)} className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 作業終了後 */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8 overflow-x-auto">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">作業終了後</h2>
          <p className="text-sm text-[var(--muted)] mb-4">※搬入ルート等、キズがある場合は、お客様に確認して頂くこと。</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--card-border)]">
                <th className="text-left py-3 pr-4 text-sm font-bold text-[var(--foreground)]">確認事項</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">床</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">壁</th>
                <th className="text-center py-3 px-2 text-sm font-bold text-[var(--foreground)] w-20">その他</th>
              </tr>
            </thead>
            <tbody>
              {COMPLETION_ITEMS.map((label, i) => (
                <tr key={i} className="border-b border-[var(--card-border)]">
                  <td className="py-2 pr-4 text-sm text-[var(--foreground)]">{label}</td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.completion_checks[i]?.floor ?? false} onChange={(e) => setCompletionCheck(i, 'floor', e.target.checked)} className="w-4 h-4" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.completion_checks[i]?.wall ?? false} onChange={(e) => setCompletionCheck(i, 'wall', e.target.checked)} className="w-4 h-4" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={form.completion_checks[i]?.other ?? false} onChange={(e) => setCompletionCheck(i, 'other', e.target.checked)} className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 設置環境・搬出 */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">設置環境・搬出</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>エレベーター</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="elevator" checked={form.elevator === 'none'} onChange={() => setForm((f) => ({ ...f, elevator: 'none' }))} className="w-4 h-4" /> 無</label>
                <label className="flex items-center gap-2"><input type="radio" name="elevator" checked={form.elevator === 'yes'} onChange={() => setForm((f) => ({ ...f, elevator: 'yes' }))} className="w-4 h-4" /> 有</label>
              </div>
            </div>
            <div>
              <label className={labelClass}>設置階数</label>
              <input type="text" value={form.installation_floor} onChange={(e) => setForm((f) => ({ ...f, installation_floor: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>階段</label>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2"><input type="radio" name="stairs" checked={form.stairs_location === 'indoor'} onChange={() => setForm((f) => ({ ...f, stairs_location: 'indoor' }))} className="w-4 h-4" /> 屋内</label>
                <label className="flex items-center gap-2"><input type="radio" name="stairs" checked={form.stairs_location === 'outdoor'} onChange={() => setForm((f) => ({ ...f, stairs_location: 'outdoor' }))} className="w-4 h-4" /> 屋外</label>
                <input type="number" min={0} value={form.stairs_steps} onChange={(e) => setForm((f) => ({ ...f, stairs_steps: e.target.value }))} className="w-20 border-2 border-[var(--card-border)] rounded-lg px-2 py-1" placeholder="段" />
              </div>
            </div>
            <div>
              <label className={labelClass}>保証書</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="warranty" checked={form.warranty === 'take_home'} onChange={() => setForm((f) => ({ ...f, warranty: 'take_home' }))} className="w-4 h-4" /> 持ち帰り口</label>
                <label className="flex items-center gap-2"><input type="radio" name="warranty" checked={form.warranty === 'customer_retailer'} onChange={() => setForm((f) => ({ ...f, warranty: 'customer_retailer' }))} className="w-4 h-4" /> お客様/販売店口</label>
              </div>
            </div>
            <div>
              <label className={labelClass}>搬出品</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="carry_out" checked={form.carry_out === 'none'} onChange={() => setForm((f) => ({ ...f, carry_out: 'none' }))} className="w-4 h-4" /> 無</label>
                <label className="flex items-center gap-2"><input type="radio" name="carry_out" checked={form.carry_out === 'yes'} onChange={() => setForm((f) => ({ ...f, carry_out: 'yes' }))} className="w-4 h-4" /> 有</label>
              </div>
            </div>
            <div>
              <label className={labelClass}>冷蔵庫</label>
              <select value={form.refrigerator} onChange={(e) => setForm((f) => ({ ...f, refrigerator: e.target.value as FormData['refrigerator'] }))} className={inputClass}>
                <option value="">—</option>
                <option value="400l_or_less">400Lクラス以下</option>
                <option value="500l_or_more">500Lクラス以上</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>洗濯機</label>
              <select value={form.washing_machine} onChange={(e) => setForm((f) => ({ ...f, washing_machine: e.target.value as FormData['washing_machine'] }))} className={inputClass}>
                <option value="">—</option>
                <option value="vertical">縦型</option>
                <option value="drum">ドラム式</option>
              </select>
            </div>
          </div>
        </section>

        {/* オプション */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">オプション</h2>
          <div className="flex flex-wrap gap-6 mb-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_unic} onChange={(e) => setForm((f) => ({ ...f, option_unic: e.target.checked }))} className="w-4 h-4" /> ユニック作業</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_high_altitude} onChange={(e) => setForm((f) => ({ ...f, option_high_altitude: e.target.checked }))} className="w-4 h-4" /> 高所作業</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_door_window} onChange={(e) => setForm((f) => ({ ...f, option_door_window: e.target.checked }))} className="w-4 h-4" /> ドア・窓・手すり外し</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_special} onChange={(e) => setForm((f) => ({ ...f, option_special: e.target.checked }))} className="w-4 h-4" /> 特殊作業</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_counter} onChange={(e) => setForm((f) => ({ ...f, option_counter: e.target.checked }))} className="w-4 h-4" /> カウンター越え</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.option_recycling} onChange={(e) => setForm((f) => ({ ...f, option_recycling: e.target.checked }))} className="w-4 h-4" /> リサイクル有口</label>
          </div>
          <div>
            <label className={labelClass}>変更内容・備考</label>
            <textarea value={form.change_notes} onChange={(e) => setForm((f) => ({ ...f, change_notes: e.target.value }))} rows={3} className={inputClass} />
          </div>
        </section>

        {/* 設置日時・協力会社・お客様名 */}
        <section className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] p-6 md:p-8">
          <p className="text-sm text-[var(--muted)] mb-4">※チェック表の項目に不足・誤り・作業内容に変更がないことを報告します。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>設置日</label>
              <input type="date" value={form.installation_date} onChange={(e) => setForm((f) => ({ ...f, installation_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>設置時間</label>
              <input type="time" value={form.installation_time} onChange={(e) => setForm((f) => ({ ...f, installation_time: e.target.value }))} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>協力会社</label>
              <input type="text" value={form.partner_company} onChange={(e) => setForm((f) => ({ ...f, partner_company: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>お客様名（姓のみ）</label>
              <input type="text" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} className={inputClass} placeholder="個人情報保護の為、姓のみ記入" />
            </div>
          </div>
        </section>

        {error && <p className="text-sm font-semibold text-[var(--error)]">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? '保存中...' : '保存'}
          </button>
          <Link href={`/projects/${projectId}`} className={btnSecondary}>
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  )
}
