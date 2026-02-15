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
      ? 'px-4 py-2.5 text-sm font-bold text-[var(--primary)] bg-white rounded-full shadow-sm'
      : 'px-4 py-2.5 text-sm font-semibold text-white/95 hover:text-white hover:bg-white/20 rounded-full transition-colors'

  return (
    <header className="bg-gradient-to-r from-[var(--primary)] to-orange-500 border-b-4 border-orange-600/30 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="/"
            className="text-lg md:text-xl font-black text-white tracking-tight hover:opacity-95 transition-opacity"
          >
            kannri-app
          </Link>
          <nav className="ml-2 md:ml-6 flex flex-wrap gap-1 md:gap-2" aria-label="メイン">
            <Link href="/" className={navClass('/')}>
              ホーム
            </Link>
            <Link href="/customers" className={navClass('/customers')}>
              顧客一覧
            </Link>
            <Link href="/staff" className={navClass('/staff')}>
              担当者一覧
            </Link>
            <Link href="/projects" className={navClass('/projects')}>
              案件一覧
            </Link>
            {isAdmin(role) && (
              <Link href="/reports" className={navClass('/reports')}>
                集計
              </Link>
            )}
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2.5 text-sm font-bold text-[var(--primary)] bg-white rounded-full shadow-sm hover:bg-orange-50 hover:shadow-md transition-all"
        >
          ログアウト
        </button>
      </div>
    </header>
  )
}
