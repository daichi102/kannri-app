# Cursor 操作手順

## 概要

本ドキュメントは、kannri-app のコードを **Cursor（エディタ）** で編集・追加する際の、初心者向けの詳細手順です。

**Supabase の作業は別ドキュメント**: `docs/Supabase操作手順.md` を参照してください。テーブル作成などの DB 作業は先に Supabase で行ってから、この Cursor の手順を進めてください。

---

## 前提条件

- Supabase で `customers` テーブル・`staff` テーブルが作成済み（操作 5・6）
- 案件を実装する場合は、Supabase で `projects` テーブルも作成済み（操作 7）であること
- ターミナルで `npm run dev` を実行し、開発サーバーが動いている
- アプリにログイン済み（未ログインだと `/login` にリダイレクトされる）

---

## 開発の進め方（全体の流れ）

1. **Supabase** でテーブルを作成（`docs/Supabase操作手順.md`）
2. **Cursor** で型定義 → 画面 → フォームを順に作成（本ドキュメント）

---

## 次の進め方（現在地とこのあとやること）

| タスク | 現在の状態 | 次にやること |
|--------|------------|--------------|
| 1-3 顧客・企業マスタ | 型定義・顧客一覧・Supabase 取得まで完了 | **手順 C**（下記詳細）：新規顧客登録フォームを追加 |
| 1-4 担当者マスタ | 型定義・担当者一覧・Supabase 取得まで完了 | **手順 D**（下記詳細）：新規担当者追加フォームを追加 |
| 1-5 案件テーブル・CRUD | 手順 A・B 完了（一覧表示まで） | **手順 C**：新規案件登録フォームを追加する（下記にコードあり） |

**次にやること**: タスク 1-5 の**手順 C**（新規案件登録フォーム）。進捗は [docs/進捗管理票.md](進捗管理票.md) で更新する。

---

## タスク 1-3: 顧客・企業マスタ

### 手順 A: 型定義ファイルを作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | Cursor の左サイドバーで `lib` フォルダを右クリック | メニューを表示する |
| 2 | **New Folder** を選択 | |
| 3 | フォルダ名に `types` と入力して Enter | `lib/types` フォルダができる |
| 4 | `lib/types` フォルダを右クリック → **New File** | |
| 5 | ファイル名を `customer.ts` にして Enter | |
| 6 | 次の内容を入力する | コピー＆ペーストで OK |
| 7 | 保存する（Ctrl+S または Cmd+S） | |

**入力する内容（customer.ts）**:

```typescript
export type CustomerType = 'company' | 'individual'

export type Customer = {
  id: string
  type: CustomerType
  company_name: string | null
  name: string
  name_kana: string
  address: string
  phone: string
  contact_name: string | null
  created_at: string
  updated_at: string
}
```

---

### 手順 B: 顧客一覧画面を作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左サイドバーで `app/(app)` フォルダを開く | |
| 2 | `app/(app)` を右クリック → **New Folder** | |
| 3 | フォルダ名を `customers` にする | `app/(app)/customers` ができる |
| 4 | `customers` フォルダを右クリック → **New File** | |
| 5 | ファイル名を `page.tsx` にする | `app/(app)/customers/page.tsx` |
| 6 | 次の内容を入力して保存 | |

**入力する内容（page.tsx）**:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/lib/types/customer'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchCustomers() {
      const { data } = await supabase.from('customers').select('*')
      setCustomers(data ?? [])
      setLoading(false)
    }
    fetchCustomers()
  }, [])

  if (loading) return <p>読み込み中...</p>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">顧客一覧</h1>
      <table className="min-w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-4 py-2 text-left">種別</th>
            <th className="border px-4 py-2 text-left">名前</th>
            <th className="border px-4 py-2 text-left">電話番号</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td className="border px-4 py-2">{c.type === 'company' ? '企業' : '個人'}</td>
              <td className="border px-4 py-2">{c.name}</td>
              <td className="border px-4 py-2">{c.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 7 | ブラウザで `http://localhost:3000/customers` を開く | 顧客一覧が表示される（まだデータがなければ空の表） |

---

### 手順 C: 新規顧客登録フォームを追加する（詳細）

顧客一覧画面（`app/(app)/customers/page.tsx`）に「新規登録」とフォームを追加し、Supabase の `customers` に insert する。

#### やること一覧

1. 一覧画面上に「新規登録」ボタンを置く。
2. ボタン押下でフォームを表示する（同じページ内のモーダル／折りたたみ、または別ページのどちらでも可）。
3. フォームの項目は `lib/types/customer.ts` の `Customer` 型に合わせる（必須は種別・名前・カナ・住所・電話。企業のときだけ担当者名を表示して入力）。

#### フォーム項目（要件定義に基づく）

| 項目 | 入力方法 | 備考 |
|------|----------|------|
| 種別 | ラジオまたはセレクト | 「企業」「個人」のどちらか。選択でフォームの出し分け |
| 担当者名 | テキスト | **企業**を選んだときだけ表示・入力。個人のときは非表示または空で送信 |
| 名前（企業名／氏名） | テキスト | 必須 |
| 名前（カナ） | テキスト | 必須 |
| 住所 | テキスト | 必須 |
| 電話番号 | テキスト | 必須 |

企業のときは `company_name` に企業名、`name` に代表者名など運用で決めたルールでよい。型では `company_name`, `name`, `name_kana`, `address`, `phone`, `contact_name`（担当者名）を利用する。

#### 実装の流れ（コード側）

| ステップ | 内容 |
|----------|------|
| 1 | 顧客一覧の state の近くに、フォームの開閉用 state を追加する（例: `showForm`）。「新規登録」ボタンの `onClick` で `showForm` を true にする |
| 2 | フォーム用の state を用意する（種別・担当者名・名前・カナ・住所・電話）。種別が「個人」のときは担当者名は送信時に空または null にする |
| 3 | フォームの submit 時に、`createClient()` を **useEffect 内** ではなく、submit ハンドラ内で呼んでもよい（ボタン押下はクライアントのみ）。`supabase.from('customers').insert({ type, company_name, name, name_kana, address, phone, contact_name })` を実行。`id`・`created_at`・`updated_at` は DB デフォルトでよい |
| 4 | insert 成功後に一覧を再取得する（既存の `fetchCustomers` 相当を再度実行して `setCustomers` で更新）。フォームを閉じる（`showForm` を false） |
| 5 | エラー時は `alert` や画面上のメッセージで表示する |

#### 注意

- 一覧取得と同じく、`createClient()` はクライアント側だけで使う（サーバーコンポーネントやページのトップレベルで呼ばない）。現在の `page.tsx` は `dynamic` で `ssr: false` になっているので、フォームの submit ハンドラ内で `createClient()` を呼ぶのは問題ない。
- RLS で `customers` の INSERT が許可されているか Supabase 側で確認する（操作 5 のポリシーで `FOR ALL` または `INSERT` が含まれていれば可）。

---

## タスク 1-4: 担当者マスタ

### 手順 A: 型定義ファイルを作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | `lib/types` フォルダを右クリック → **New File** | |
| 2 | ファイル名を `staff.ts` にする | |
| 3 | 次の内容を入力して保存 | |

**入力する内容（staff.ts）**:

```typescript
export type Staff = {
  id: string
  name: string
  phone: string | null
  department: string | null
  created_at: string
  updated_at: string
}
```

---

### 手順 B: 担当者一覧画面を作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | `app/(app)` を右クリック → **New Folder** | |
| 2 | フォルダ名を `staff` にする | `app/(app)/staff` |
| 3 | `staff` フォルダ内に `page.tsx` を新規作成 | |
| 4 | 次の内容を入力して保存 | |

**入力する内容（page.tsx）**:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Staff } from '@/lib/types/staff'

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStaff() {
      const { data } = await supabase.from('staff').select('*')
      setStaffList(data ?? [])
      setLoading(false)
    }
    fetchStaff()
  }, [])

  if (loading) return <p>読み込み中...</p>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">担当者一覧</h1>
      <table className="min-w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-4 py-2 text-left">氏名</th>
            <th className="border px-4 py-2 text-left">電話番号</th>
            <th className="border px-4 py-2 text-left">所属</th>
          </tr>
        </thead>
        <tbody>
          {staffList.map((s) => (
            <tr key={s.id}>
              <td className="border px-4 py-2">{s.name}</td>
              <td className="border px-4 py-2">{s.phone ?? '-'}</td>
              <td className="border px-4 py-2">{s.department ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 5 | ブラウザで `http://localhost:3000/staff` を開く | 担当者一覧が表示される |

---

### 手順 D: 新規担当者追加フォームを追加する（詳細）2/12

担当者一覧画面（`app/(app)/staff/page.tsx`）に「新規追加」とフォームを追加し、Supabase の `staff` に insert する。

#### やること一覧

1. 一覧画面上に「新規追加」ボタンを置く。
2. ボタン押下でフォームを表示する（顧客と同様、同一ページ内のモーダル／折りたたみ、または別ページで可）。
3. フォームの項目は `lib/types/staff.ts` の `Staff` 型に合わせる（氏名・電話番号・所属）。

#### フォーム項目

| 項目 | 入力方法 | 備考 |
|------|----------|------|
| 氏名 | テキスト | 必須（`name`） |
| 電話番号 | テキスト | 任意（`phone`、空なら null） |
| 所属 | テキスト | 任意（`department`、空なら null） |

#### 実装の流れ（コード側）

| ステップ | 内容 |
|----------|------|
| 1 | 担当者一覧の state の近くに、フォームの開閉用 state を追加する（例: `showForm`）。「新規追加」ボタンの `onClick` で `showForm` を true にする |
| 2 | フォーム用の state を用意する（氏名・電話番号・所属）。電話番号・所属は空文字を許容し、送信時に空なら `null` で insert する |
| 3 | フォームの submit 時に、`createClient()` で supabase を取得し、`supabase.from('staff').insert({ name, phone: phone || null, department: department || null })` を実行。`id`・`created_at`・`updated_at` は DB デフォルトでよい |
| 4 | insert 成功後に一覧を再取得する（既存の `fetchStaff` 相当を再度実行して `setStaffList` で更新）。フォームを閉じる |
| 5 | エラー時は `alert` や画面上のメッセージで表示する |

#### 注意

- 顧客と同様、`createClient()` はクライアント側のみで使用する。現在の `staff/page.tsx` も `dynamic` の `ssr: false` なので、submit ハンドラ内で `createClient()` を呼んでよい。
- RLS で `staff` の INSERT が許可されているか Supabase 側で確認する（操作 6 のポリシーで `FOR ALL` なら可）。

---

## タスク 1-5: 案件テーブル・CRUD

**前提**: Supabase で [操作 7: 案件テーブル（projects）の作成](Supabase操作手順.md#操作-7-案件テーブルprojectsの作成) を実行済みであること。

### 手順 A: 型定義ファイルを作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | `lib/types` フォルダを右クリック → **New File** | |
| 2 | ファイル名を `project.ts` にする | |
| 3 | 次の内容を入力して保存 | |

**入力する内容（project.ts）**:

```typescript
export type Department = 'delivery' | 'construction' | 'repair'

export type WorkType = 'aircon' | 'construction' | 'delivery'

export type ProjectStatus =
  | 'estimate_draft'
  | 'estimate_sent'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Project = {
  id: string
  project_number: string
  department: Department
  work_type: WorkType
  customer_id: string
  staff_id: string
  start_date: string | null
  due_date: string | null
  status: ProjectStatus
  notes: string | null
  product_name: string | null
  product_code: string | null
  product_color: string | null
  product_quantity: number | null
  has_warranty: boolean | null
  created_at: string
  updated_at: string
}
```

---

### 手順 B: 案件一覧画面を作る

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | `app/(app)` を右クリック → **New Folder** | |
| 2 | フォルダ名を `projects` にする | `app/(app)/projects` ができる |
| 3 | `projects` フォルダ内に `page.tsx` を新規作成 | |
| 4 | 案件一覧用のコードを入力して保存 | 顧客・担当者と同様、`dynamic` で `ssr: false` にすること |
| 5 | ヘッダーのナビに「案件一覧」リンクを追加する | `app/components/Header.tsx` に `<Link href="/projects">` を追加 |
| 6 | ブラウザで `http://localhost:3000/projects` を開く | 案件一覧が表示される（データがなければ空の表または「登録されている案件はありません」） |

**一覧で表示する項目の例**: 案件番号、部門、工事種別、顧客名（customers から取得）、担当者名（staff から取得）、着工日、完了予定日、ステータス。

**データ取得**: `supabase.from('projects').select('*, customer:customers(name), staff:staff(name)')` のように、外部キーで顧客名・担当者名をまとめて取得できる。型は `Project & { customer?: { name: string }, staff?: { name: string } }` などで拡張する。

---

### 手順 C: 新規案件登録フォームを追加する（詳細）

**※ 今、次にやることです。** 案件一覧画面に「新規登録」ボタンとフォームを追加し、Supabase の `projects` に insert する。下記「手順 C で追加するコード」を参照して実装する。

#### やること一覧

1. 一覧画面上に「新規登録」ボタンを置く。
2. ボタン押下でフォームを表示する（顧客・担当者と同様、同一ページ内で表示）。
3. フォームの項目は `lib/types/project.ts` の `Project` 型と Supabase の `projects` テーブルに合わせる。
4. 案件番号は、部門ごとの頭文字（工事=K、修理=S、配送=H）＋連番。同じ部門の既存案件の最大番号＋1 を Cursor 側で計算してから INSERT する。

#### フォーム項目（共通）

| 項目 | 入力方法 | 備考 |
|------|----------|------|
| 部門 | セレクト | delivery / construction / repair（配送・工事・修理） |
| 工事種別 | セレクト | aircon / construction / delivery（エアコン・工事・配送） |
| 顧客 | セレクト | `customers` から一覧取得し、選択した id を `customer_id` に |
| 担当者 | セレクト | `staff` から一覧取得し、選択した id を `staff_id` に |
| 着工日 | 日付（type="date" または日付ピッカー） | `start_date` |
| 完了予定日 | 日付 | `due_date` |
| ステータス | セレクト | 初期値は `estimate_draft`（見積作成中） |
| 備考 | テキストエリア | `notes`、任意 |

#### フォーム項目（配送部門のときだけ表示）

| 項目 | 入力方法 | 備考 |
|------|----------|------|
| 設置商品 | テキスト | `product_name` |
| 品番 | テキスト | `product_code` |
| 色 | テキスト | `product_color` |
| 数量 | 数値 | `product_quantity` |
| 保証書の有無 | チェックまたはセレクト | `has_warranty`（true/false） |

#### 案件番号の採番（実装の流れ）

| ステップ | 内容 |
|----------|------|
| 1 | 部門の頭文字を決める（delivery → H, construction → K, repair → S など） |
| 2 | 同じ頭文字の既存案件を取得する（例: `supabase.from('projects').select('project_number').ilike('K%')`） |
| 3 | 番号部分をパースして最大値を取り、+1 した番号を新案件番号にする（例: K-001, K-002） |
| 4 | フォーム送信時に、上記で求めた `project_number` を含めて `supabase.from('projects').insert({ ... })` を実行する |

#### 実装の流れ（コード側）

| ステップ | 内容 |
|----------|------|
| 1 | 案件一覧の state の近くに、フォームの開閉用 state（例: `showForm`）を追加。「新規登録」ボタンの `onClick` で `showForm` を true にする |
| 2 | フォーム用の state を用意する（部門・工事種別・customer_id・staff_id・着工日・完了予定日・ステータス・備考、および配送用の各項目）。部門が `delivery` のときだけ配送用項目を表示 |
| 3 | 顧客一覧・担当者一覧をフォーム表示時に取得する（`supabase.from('customers').select('id, name')` と `supabase.from('staff').select('id, name')`）。セレクトの option に使う |
| 4 | 送信時に、上記の採番ロジックで `project_number` を求め、`supabase.from('projects').insert({ project_number, department, work_type, customer_id, staff_id, start_date, due_date, status, notes, product_name?, ... })` を実行。配送以外のときは配送用カラムは null |
| 5 | insert 成功後に一覧を再取得し、フォームを閉じる。エラー時は画面上にメッセージを表示する |

#### 注意

- `createClient()` はクライアント側のみで使用する。`page.tsx` は `dynamic(..., { ssr: false })` でラップする（顧客・担当者ページと同様）。
- 日付は HTML の `input type="date"` で YYYY-MM-DD の文字列のまま送れば、Supabase の date 型に保存できる。
- RLS は操作 7 で認証済みユーザーが INSERT 可能になっている。

---

#### 手順 C で追加するコード（コピーして使う）

以下は、**既存の `app/(app)/projects/page.tsx` の `ProjectsPageContent` の中身を、以下のように拡張する**ときのコードです。既存の「案件一覧」の上に「新規登録」ボタンとフォームを追加し、採番・INSERT・再取得を行います。

**1. 部門ごとの案件番号プレフィックス（ファイル先頭の定数の下に追加）**

```typescript
const DEPARTMENT_PREFIX: Record<Department, string> = {
  delivery: 'H',
  construction: 'K',
  repair: 'S',
}
```

**2. コンポーネント内の state（既存の `projects`, `loading` に加えて追加）**

```typescript
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    department: 'construction' as Department,
    work_type: 'construction' as WorkType,
    customer_id: '',
    staff_id: '',
    start_date: '',
    due_date: '',
    status: 'estimate_draft' as ProjectStatus,
    notes: '',
    product_name: '',
    product_code: '',
    product_color: '',
    product_quantity: '',
    has_warranty: false,
  })
```

**3. 一覧再取得用の fetchProjects（useEffect の上に追加。手順 B で削除した場合は再追加）**

```typescript
  async function fetchProjects() {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*, customer:customers(name), staff:staff(name)')
      .order('created_at', { ascending: false })
    setProjects((data ?? []) as ProjectWithNames[])
  }
```

**4. フォーム表示時に顧客・担当者を取得（useEffect を拡張するか、showForm が true になったときの useEffect を追加）**

```typescript
  useEffect(() => {
    if (!showForm) return
    let cancelled = false
    async function loadOptions() {
      const supabase = createClient()
      const [custRes, staffRes] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('staff').select('id, name').order('name'),
      ])
      if (!cancelled) {
        setCustomers((custRes.data ?? []) as { id: string; name: string }[])
        setStaffList((staffRes.data ?? []) as { id: string; name: string }[])
      }
    }
    loadOptions()
    return () => { cancelled = true }
  }, [showForm])
```

**5. 案件番号採番のヘルパーと submit ハンドラ（fetchProjects の下に追加）**

```typescript
  async function getNextProjectNumber(department: Department): Promise<string> {
    const supabase = createClient()
    const prefix = DEPARTMENT_PREFIX[department]
    const { data } = await supabase
      .from('projects')
      .select('project_number')
      .ilike(`${prefix}%`)
    const numbers = (data ?? [])
      .map((r) => parseInt(r.project_number.replace(/^\D+/, ''), 10))
      .filter((n) => !Number.isNaN(n))
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1
    return `${prefix}-${String(next).padStart(3, '0')}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const project_number = await getNextProjectNumber(form.department)
      const { error: err } = await supabase.from('projects').insert({
        project_number,
        department: form.department,
        work_type: form.work_type,
        customer_id: form.customer_id || null,
        staff_id: form.staff_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        product_name: form.department === 'delivery' ? form.product_name.trim() || null : null,
        product_code: form.department === 'delivery' ? form.product_code.trim() || null : null,
        product_color: form.department === 'delivery' ? form.product_color.trim() || null : null,
        product_quantity: form.department === 'delivery' && form.product_quantity ? parseInt(form.product_quantity, 10) : null,
        has_warranty: form.department === 'delivery' ? form.has_warranty : null,
      })
      if (err) {
        setError(err.message)
        return
      }
      await fetchProjects()
      setShowForm(false)
      setForm({
        department: 'construction',
        work_type: 'construction',
        customer_id: '',
        staff_id: '',
        start_date: '',
        due_date: '',
        status: 'estimate_draft',
        notes: '',
        product_name: '',
        product_code: '',
        product_color: '',
        product_quantity: '',
        has_warranty: false,
      })
    } finally {
      setSubmitting(false)
    }
  }
```

**6. 見出しの右に「新規登録」ボタンを追加**

既存の `<h1>案件一覧</h1>` を、顧客一覧と同様に `flex` でボタンと並べる。

```tsx
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">案件一覧</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-blue-600 text-white text-base font-semibold rounded-lg shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          新規登録
        </button>
      </div>
```

**7. フォームブロック（上記ボタンの下、テーブルの上に追加）**

```tsx
      {showForm && (
        <div className="mb-6 p-6 border-2 border-gray-200 rounded-xl bg-white shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">新規案件登録</h2>
          <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">部門 *</label>
              <select
                required
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              >
                <option value="delivery">配送</option>
                <option value="construction">工事</option>
                <option value="repair">修理</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">工事種別 *</label>
              <select
                required
                value={form.work_type}
                onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value as WorkType }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              >
                <option value="aircon">エアコン</option>
                <option value="construction">工事</option>
                <option value="delivery">配送</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">顧客 *</label>
              <select
                required
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              >
                <option value="">選択してください</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">担当者 *</label>
              <select
                required
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              >
                <option value="">選択してください</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">着工日</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">完了予定日</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              >
                <option value="estimate_draft">見積作成中</option>
                <option value="estimate_sent">見積送付済み</option>
                <option value="in_progress">作業中</option>
                <option value="completed">完了</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">備考</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5 text-gray-900"
              />
            </div>
            {form.department === 'delivery' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">設置商品</label>
                  <input type="text" value={form.product_name} onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">品番</label>
                  <input type="text" value={form.product_code} onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">色</label>
                  <input type="text" value={form.product_color} onChange={(e) => setForm((f) => ({ ...f, product_color: e.target.value }))} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">数量</label>
                  <input type="number" value={form.product_quantity} onChange={(e) => setForm((f) => ({ ...f, product_quantity: e.target.value }))} className="w-full border-2 border-gray-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={form.has_warranty} onChange={(e) => setForm((f) => ({ ...f, has_warranty: e.target.checked }))} />
                    <span className="text-sm font-semibold text-gray-800">保証書あり</span>
                  </label>
                </div>
              </>
            )}
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-blue-600 text-white text-base font-semibold rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50">
                {submitting ? '登録中...' : '登録'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-white border-2 border-gray-300 text-gray-800 text-base font-semibold rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}
```

上記を **既存の `ProjectsPageContent` 内** に組み込み、`fetchProjects` を useEffect の初回ロード後にも使う場合は、useEffect 内で `load()` の代わりに `fetchProjects().finally(() => setLoading(false))` を呼んでもよい（その場合は lint 対策で `load` 内から `fetchProjects` を呼ぶ形にするとよい）。

---

## 用語の簡単な説明

| 用語 | 意味 |
|------|------|
| Cursor | コードを書くためのエディタ（今使っているソフト） |
| Supabase | データを保存するクラウドのデータベース。ブラウザで操作 |
| `lib` | 型定義や共通ロジックを置くフォルダ |
| `app/(app)/○○/page.tsx` | `/○○` という URL で表示される画面のファイル |
| 型定義（TypeScript） | データの形（どの項目があるか）を決めるコード |
| `createClient()` | Supabase に接続するための関数 |

---

## 困ったときの確認ポイント

| 現象 | 確認すること |
|------|--------------|
| 顧客一覧・担当者一覧が表示されない | Supabase で customers / staff テーブルを作成したか確認 |
| 案件一覧が表示されない | Supabase で projects テーブル（操作 7）を作成したか確認。ヘッダーに「案件一覧」リンクを追加したか確認 |
| 「ファイルが見つからない」エラー | ファイル名やパス（`lib/types/` など）が正しいか確認 |
| 画面が真っ白・エラーになる | ターミナルで `npm run dev` が動いているか確認。エラーメッセージを読む |
| ログイン画面に飛ばされる | ログインしていない。`/login` からログインする |
| 一覧が空のまま | Table Editor で Supabase にデータが入っているか確認。テスト用に 1 件手動追加してみる |

---

## 進捗管理票との対応

- **1-3 顧客・企業マスタ**: 本ドキュメントの「タスク 1-3」＋ Supabase 操作手順の操作 5
- **1-4 担当者マスタ**: 本ドキュメントの「タスク 1-4」＋ Supabase 操作手順の操作 6
- **1-5 案件テーブル・CRUD**: 本ドキュメントの「タスク 1-5」＋ Supabase 操作手順の操作 7
- **次の進め方**: 上記「次の進め方（現在地とこのあとやること）」を参照
