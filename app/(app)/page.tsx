import Link from 'next/link'

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-black text-[var(--foreground)] mb-2 tracking-tight">
        ダッシュボード
      </h1>
      <p className="text-[var(--muted)] mb-8 text-base md:text-lg leading-relaxed">
        ログイン済みです。案件管理・見積・損益管理の機能は順次追加していきます。
      </p>
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
    </div>
  )
}
