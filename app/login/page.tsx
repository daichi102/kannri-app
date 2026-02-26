'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** ロゴ表示: /logo.png → /logo.png/logo.png の順で試し、どちらも失敗したらテキスト表示 */
function LoginLogo() {
  const [src, setSrc] = useState<'/logo.png' | '/logo.png/logo.png'>('/logo.png')
  const [failed, setFailed] = useState(false)

  const handleError = () => {
    if (src === '/logo.png') {
      setSrc('/logo.png/logo.png')
    } else {
      setFailed(true)
    }
  }

  if (failed) {
    return <span className="text-2xl font-black text-[var(--foreground)]">kannri-app</span>
  }
  return (
    <img
      src={src}
      alt="kannri-app"
      className="h-20 w-auto object-contain"
      onError={handleError}
    />
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // 控えページなどから来た場合はログイン後に戻す（/ で始まるアプリ内パスのみ許可）
    const target =
      redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
    router.push(target)
    router.refresh()
  }

  return (
    <div className="w-full max-w-md p-8 md:p-10 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-3xl shadow-[var(--shadow)]">
      <div className="flex justify-center mb-2">
        <LoginLogo />
      </div>
      <p className="text-center text-[var(--muted)] mb-8">ログイン</p>

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-bold text-[var(--foreground)] mb-2">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-[var(--background)] border-2 border-[var(--card-border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30 transition-colors"
            placeholder="email@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-bold text-[var(--foreground)] mb-2">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-[var(--background)] border-2 border-[var(--card-border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30 transition-colors"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="text-sm font-semibold text-[var(--error)] bg-red-950/40 border border-red-500/50 px-3 py-2 rounded-xl">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[var(--primary)] text-[var(--background)] font-bold rounded-xl hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow)] hover:shadow-lg transition-all"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="w-full max-w-md p-8 md:p-10 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-3xl shadow-[var(--shadow)]">
      <div className="flex justify-center mb-2">
        <LoginLogo />
      </div>
      <p className="text-center text-[var(--muted)] mb-8">ログイン</p>
      <p className="text-center text-[var(--muted)]">読み込み中...</p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
