'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCurrentUserRole, isAdmin } from '@/lib/auth'

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [role, setRole] = useState<'admin' | 'user' | null>(null)

  useEffect(() => {
    getCurrentUserRole().then(setRole)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navClass = (path: string) =>
    pathname === path
      ? 'px-4 py-2.5 text-sm font-bold text-[var(--background)] bg-[var(--primary)] rounded-full shadow-[var(--glow)] transition-all duration-300'
      : 'px-4 py-2.5 text-sm font-semibold text-[var(--foreground)]/90 hover:text-[var(--primary)] hover:bg-[var(--primary)]/20 rounded-full transition-all duration-300'

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--card)]/85 border-b border-[var(--primary)]/20 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/" className="flex items-center shrink-0" aria-label="kannri-app ホーム">
            <img src="/logo.png" alt="kannri-app" className="h-10 md:h-11 w-auto object-contain" />
          </Link>
          <nav className="ml-2 md:ml-6 flex flex-wrap gap-1 md:gap-2" aria-label="メイン">
            <Link href="/" className={navClass('/')}>
              ホーム
            </Link>
            <Link href="/projects" className={navClass('/projects')}>
              案件一覧
            </Link>
            <Link href="/estimates" className={navClass('/estimates')}>
              見積一覧
            </Link>
            <Link href="/customers" className={navClass('/customers')}>
              顧客一覧
            </Link>
            <Link href="/staff" className={navClass('/staff')}>
              担当者一覧
            </Link>
            <Link href="/inquiries" className={navClass('/inquiries')}>
              問い合わせ
            </Link>
            <Link href="/origins" className={navClass('/origins')}>
              発生元
            </Link>
            <Link href="/contractors" className={navClass('/contractors')}>
              業者
            </Link>
            {isAdmin(role) && (
              <Link href="/sales" className={navClass('/sales')}>
                売上管理
              </Link>
            )}
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2.5 text-sm font-bold text-[var(--background)] bg-[var(--primary)] rounded-full shadow-[var(--glow)] hover:bg-[var(--primary-hover)] hover:shadow-[var(--glow-strong)] transition-all duration-300"
        >
          ログアウト
        </button>
      </div>
    </header>
  )
}
