import Link from 'next/link'

export default function ReceiptNotFound() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow p-8 text-center max-w-md">
        <p className="text-red-600 font-semibold">控えが見つかりません。</p>
        <p className="text-sm text-gray-500 mt-2">URLまたはトークンをご確認ください。</p>
        <Link
          href="/"
          className="inline-block mt-6 text-sm text-orange-600 font-medium hover:underline"
        >
          トップへ
        </Link>
      </div>
    </div>
  )
}
