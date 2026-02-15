import Header from '@/app/components/Header'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header />
      <main className="p-6 md:p-8">{children}</main>
    </div>
  )
}
