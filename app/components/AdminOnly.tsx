'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserRole, isAdmin } from '@/lib/auth'

interface AdminOnlyProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * 管理者のみにコンテンツを表示するコンポーネント
 */
export default function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
  const [role, setRole] = useState<'admin' | 'user' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkRole() {
      const userRole = await getCurrentUserRole()
      setRole(userRole)
      setLoading(false)
    }
    checkRole()
  }, [])

  if (loading) {
    return null
  }

  if (!isAdmin(role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
