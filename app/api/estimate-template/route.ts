import { NextResponse } from 'next/server'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const CANDIDATE_PATHS = [
  path.join(process.cwd(), 'public', 'estimate-template.png'),
  path.join(process.cwd(), 'public', 'estimate-template.jpg'),
  path.join(
    'C:',
    'Users',
    'user',
    '.cursor',
    'projects',
    'c-projects-kannri-app',
    'assets',
    'c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_ccec7f20c3d685e679e6f5ce49858e08_images_image-85a6bd75-9d70-4905-ace0-c2c0b984afc7.png'
  ),
]

function detectContentType(filePath: string) {
  return filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg'
    : 'image/png'
}

export async function GET() {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      await access(candidate)
      const data = await readFile(candidate)
      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': detectContentType(candidate),
          'Cache-Control': 'no-store',
        },
      })
    } catch {
      // Try next candidate path.
    }
  }

  return NextResponse.json(
    { error: '見積テンプレート画像が見つかりません。public/estimate-template.png を配置してください。' },
    { status: 404 }
  )
}
