import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'user'

export interface UserProfile {
  id: string
  role: UserRole
}

/**
 * 現在のユーザーのロールを取得する（クライアント側）
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return data?.role as UserRole | null
}

/**
 * 現在のユーザーのプロフィールを取得する（クライアント側）
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!data) return null

  return {
    id: data.id,
    role: data.role as UserRole,
  }
}

/**
 * 管理者かどうかをチェックする
 */
export function isAdmin(role: UserRole | null): boolean {
  return role === 'admin'
}
