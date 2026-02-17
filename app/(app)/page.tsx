'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'

const ProjectCalendar = dynamic(() => import('@/app/components/ProjectCalendar'), { ssr: false })

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] mb-2 tracking-tight">
        ダッシュボード
      </h1>
      <p className="text-[var(--muted)] mb-4 text-base md:text-lg leading-relaxed">
        ログイン済みです。カレンダーで日付ごとの案件を確認できます。
      </p>

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
        </nav>
      </section>
    </div>
  )
}
