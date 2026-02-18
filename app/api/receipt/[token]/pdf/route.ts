import React from 'react'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getReceiptByToken } from '@/lib/receipt'
import CompletionCheckPdfDocument from '@/components/CompletionCheckPdfDocument'
import type { CompletionCheckFormData } from '@/components/CompletionCheckPdfDocument'
import type { Project } from '@/lib/types/project'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const data = await getReceiptByToken(token)
  if (!data) {
    return NextResponse.json({ error: '控えが見つかりません。' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const formData = data.form_data as CompletionCheckFormData
  const projectForPdf = {
    id: data.project_id,
    project_number: data.project.project_number,
    customer: data.project.customer,
    staff: data.project.staff,
  } as Project & { customer?: { name: string } | null; staff?: { name: string } | null }

  try {
    const doc = React.createElement(CompletionCheckPdfDocument, {
      project: projectForPdf,
      form: formData,
    })
    const buffer = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0])
    const fileName = `作業確認チェック表_${data.project.project_number || '控え'}.pdf`
    const encodedFileName = encodeURIComponent(fileName)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
      },
    })
  } catch (err) {
    console.error('PDF生成エラー:', err)
    return NextResponse.json(
      { error: 'PDFの生成に失敗しました。' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
