import { notFound } from 'next/navigation'
import { getReceiptByToken } from '@/lib/receipt'
import ReceiptClient from './ReceiptClient'

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token) notFound()

  const data = await getReceiptByToken(token)
  if (!data) notFound()

  return <ReceiptClient data={data} token={token} />
}
