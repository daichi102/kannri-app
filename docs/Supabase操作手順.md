# Supabase 操作手順

## 概要

本ドキュメントは、kannri-app で Supabase の設定・操作が必要な場合に、実施手順と成功例をまとめたものです。

**ルール**: Supabase で設定が必要な作業はこのドキュメントに記載し、更新したときは開発者に知らせる。

**実施タイミング**: 認証機能を初めて動かす前、および新しいテーブルや機能を追加したとき。

---

## 前提条件

- Supabase プロジェクトが作成済み
- `.env.local` に以下が設定済み
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 操作一覧

### 認証まわり

| 順番 | 操作                       | 場所                         | 必須/任意    |
|------|----------------------------|------------------------------|--------------|
| 1    | profiles テーブルの作成    | SQL Editor                   | 必須         |
| 2    | テストユーザーの作成       | Authentication > Users       | 必須         |
| 3    | 管理者ロールの設定         | SQL Editor                   | 任意         |
| 4    | Email 認証の確認           | Authentication > Providers   | 任意（確認） |

### マスタ・案件まわり

| 順番 | 操作                       | 場所       | 必須/任意 |
|------|----------------------------|------------|-----------|
| 5    | is_admin() 関数の作成      | SQL Editor | 必須      |
| 6    | 顧客・企業テーブルの作成   | SQL Editor | 必須      |
| 7    | 担当者テーブルの作成       | SQL Editor | 必須      |
| 8    | 案件テーブルの作成         | SQL Editor | 1-5-6-7 で必要 |
| 9    | 見積テーブルの作成         | SQL Editor | Phase 2 で必要 |
| 10   | 原価・人件費・経費テーブルの作成 | SQL Editor | Phase 3 で必要 |
| 11   | 入金情報テーブルの作成     | SQL Editor | Phase 3 で必要 |
| 12   | 売上管理票テーブルの作成   | SQL Editor | Phase 3 で必要 |
| 13   | 完了報告テーブルの作成   | SQL Editor | 完了報告・デジタルサインで必要 |

### カレンダー右パネル機能

ホームのカレンダーで「日付」や「他 N 件」（＋ボタン）をタップすると、画面右側にその日の案件一覧が表示される機能があります。

**Supabase での対応**: 既存の `projects` テーブル（`start_date` / `due_date`）を使用するため、**新規テーブルやカラムの追加は不要**です。追加作業は行わずに利用できます。

### 案件削除と子テーブル（外部キー）

案件一覧画面から案件を削除すると、次の子テーブルのデータも一緒に削除されます。

- **アプリ側の動き**: 削除時に、見積明細（`estimate_items`）→ 見積（`estimates`）→ 原価・経費・人件費・入金・売上・完了報告（`project_costs` / `project_expenses` / `project_labor_costs` / `project_payments` / `project_sales` / `project_completion_reports`）の順で子レコードを削除してから、最後に `projects` を削除しています。このため、**本手順書のとおりにテーブルを作成していれば、Supabase 側の追加設定は不要**です。

- **既存環境で「外部キー制約で削除できない」エラーが出る場合**  
  子テーブルを本手順書より先に手動で作成していると、外部キーに `ON DELETE CASCADE` が付いていないことがあります。その場合は次のいずれかで対応してください。
  1. **推奨**: 本手順書の「操作 9」「操作 10」「操作 11」「操作 12」の SQL を参照し、該当テーブルの外部キーを `ON DELETE CASCADE` に変更する（SQL Editor で制約を `DROP` してから `REFERENCES ... ON DELETE CASCADE` で作り直す）。
  2. アプリ側で上記の順に子レコードを削除してから案件を削除する処理は実装済みのため、**子テーブルが本手順書と同じ名前・同じ `project_id` カラム**であれば、そのまま削除できる場合もあります。それでもエラーになる場合は 1 の CASCADE 設定を確認してください。

### 見積一覧

見積一覧画面（`/estimates`）では、**見積未作成**（見積が 1 件もない案件）と**作成済み**（見積が 1 件以上ある案件）を表示します。

- **Supabase での対応**: 既存の `projects` テーブルと `estimates` テーブル（および見積作成時に使用する `estimate_items`）を参照するだけのため、**新規テーブル・カラムの追加やポリシー変更は不要**です。操作 8（案件テーブル）・操作 9（見積テーブル）が完了していれば、そのまま利用できます。

---

## 操作 1: profiles テーブルの作成

### 目的

ユーザーのロール（`admin` / `user`）を管理する `profiles` テーブルを作成し、新規ユーザー作成時に自動でレコードが入るようにする。

### 手順

1. Supabase ダッシュボードにログイン
2. 左メニュー **SQL Editor** を開く
3. **New query** をクリック
4. 以下の SQL を貼り付けて **Run** を実行

```sql
-- profiles テーブル（ユーザーロール管理）
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 自分のプロフィールは閲覧・更新可能
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- admin は全プロフィールを閲覧・更新可能
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 新規ユーザー登録時にプロフィールを自動作成（auth.users のトリガー）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー作成（既存の場合はスキップ）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 成功の確認

1. 左メニュー **Table Editor** を開く
2. `profiles` テーブルが表示されている
3. カラムに `id / role / created_at / updated_at` がある

### 成功例

- SQL Editor のメッセージ:  
  `Success. No rows returned`
- Table Editor > `profiles` に上記カラム構成のテーブルが見えていれば OK

---

## 操作 2: テストユーザーの作成

### 目的

アプリにログイン可能なユーザー（デフォルト role = `user`）を作成する。

### 手順

1. 左メニュー **Authentication** → **Users**
2. **Add user** → **Create new user** を選択
3. 次を入力
   - Email: 例）`test@example.com`
   - Password: 任意（8文字以上推奨）
4. **Create user** をクリック

### 成功の確認

1. Authentication > Users 一覧に新しいユーザーが表示される
2. Table Editor > `profiles` に、同じ `id` のレコードが自動で追加されている（`role = user`）

### 成功例

- Users 一覧の例:
  - Email: `test@example.com`
  - Created at: `2025-02-09 ...`
- profiles の例:

| id                                   | role  |
|--------------------------------------|-------|
| a1b2c3d4-e5f6-7890-abcd-ef1234567890 | user  |

---

## 操作 3: 管理者ロールの設定

### 目的

特定のユーザーの `role` を `admin` に変更し、管理者権限を付与する。

### 手順

1. **Authentication** → **Users** で対象ユーザーの **ID（UUID）** をコピー
2. **SQL Editor** を開く
3. 次のような SQL を実行（`ユーザーのUUID` を実際の ID に置き換え）

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'ユーザーのUUID'
RETURNING *;
```

### 成功の確認

1. SQL 実行結果に 1 行のデータが返っている
2. Table Editor > `profiles` で該当ユーザーの `role` が `admin` になっている

### 成功例

- SQL Editor のメッセージの例:
  - `Success. 1 row returned`
- 返ってくる行の例:

| id                                   | role  |
|--------------------------------------|-------|
| a1b2c3d4-e5f6-7890-abcd-ef1234567890 | admin |

---

## 操作 4: Email 認証の確認

### 目的

メールアドレス＋パスワードでのログインが有効かを確認する。

### 手順

1. 左メニュー **Authentication** → **Providers**
2. **Email** をクリック
3. **Enable Email provider** が ON になっていることを確認

### 成功の確認・成功例

- Providers > Email の画面で:
  - **Enable Email provider**: ON（緑）
  - 必要に応じて **Confirm email** の ON/OFF を設定
- アプリ側で:
  - `/login` にアクセスし、作成したユーザーでログイン
  - ダッシュボード（トップ画面）が表示されれば成功

---

## トラブルシューティング（概要）

- ログインできない場合
  - profiles テーブルが存在するか（操作1）
  - Users にユーザーが存在するか（操作2）
  - 管理者ロールを付与したい場合は操作3の SQL 実行結果と profiles の role を確認
  - Email Provider が ON か（操作4）

詳細な認証まわりのセットアップ概要は `docs/認証セットアップ.md` も参照してください。

---

## 操作 5: is_admin() 関数の作成

### 目的

RLS（Row Level Security）ポリシーで無限再帰を防ぐための `is_admin()` 関数を作成する。この関数は `SECURITY DEFINER` を使用して RLS をバイパスし、管理者チェックを安全に行う。

**前提**: 操作 1（profiles テーブル）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | is_admin() 関数用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、profiles テーブルが存在するか確認 |

### 使用する SQL

```sql
-- is_admin() 関数（無限再帰対策）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 関数の説明

- `SECURITY DEFINER`: この関数を実行するユーザーの権限ではなく、関数を作成したユーザー（通常はスーパーユーザー）の権限で実行される。これにより、RLS ポリシーをバイパスできる。
- `auth.uid()`: 現在ログインしているユーザーの ID を取得。
- 戻り値: 現在のユーザーが `admin` ロールを持っている場合に `true`、そうでない場合に `false` を返す。

### 成功例

- SQL Editor: `Success. No rows returned`
- 関数が作成されていれば OK（Table Editor の Functions タブで確認可能）

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.profiles" does not exist | 操作 1 で profiles テーブルを作成する |

---

## 操作 6: 顧客・企業テーブル（customers）の作成

### 目的

顧客・企業マスタを管理するための `customers` テーブルを作成する。種別（企業/個人）、企業名、顧客名、住所、電話、企業担当者名などを保存する。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | ブラウザで Supabase のサイトを開く | https://supabase.com にログインし、プロジェクトを選択 |
| 2 | 左メニュー **SQL Editor** をクリック | SQL を実行する画面を開く |
| 3 | **New query** ボタンをクリック | 新しいクエリ入力欄が表示される |
| 4 | 以下の SQL をコピーして貼り付ける | 顧客テーブル用の SQL |
| 5 | **Run** ボタンをクリック | SQL を実行する |
| 6 | 「Success」と表示されることを確認 | エラーが出たら、SQL のコピー漏れやタイポを確認 |
| 7 | 左メニュー **Table Editor** をクリック | テーブル一覧を開く |
| 8 | **customers** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- 顧客・企業マスタ
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('company', 'individual')),
  company_name TEXT,
  name TEXT NOT NULL,
  name_kana TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all" ON public.customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "User can select" ON public.customers
  FOR SELECT USING (auth.role() = 'authenticated');
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー（自動採番） |
| type | text | 種別（company=企業、individual=個人） |
| company_name | text | 会社名（企業の場合） |
| name | text | 顧客名 |
| name_kana | text | 顧客カナ名 |
| address | text | 住所 |
| phone | text | 電話番号 |
| contact_name | text | 企業担当者名（企業の場合） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > customers に上記カラムが表示されていれば OK

---

## 操作 7: 担当者テーブル（staff）の作成

### 目的

担当者マスタを管理するための `staff` テーブルを作成する。氏名、電話番号、所属を保存する。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 担当者テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | |
| 6 | **Table Editor** で **staff** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- 担当者マスタ
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can all" ON public.staff
  FOR ALL USING (auth.role() = 'authenticated');
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー（自動採番） |
| name | text | 担当者名 |
| phone | text | 電話番号 |
| department | text | 所属 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > staff に上記カラムが表示されていれば OK

---

## 操作 8: 案件テーブル（projects）の作成

### 目的

案件（工事・配送・修理）を管理するための `projects` テーブルを作成する。顧客・担当者との紐づけ、部門・工事種別、着工日・完了予定日、ステータス、備考を保存する。配送部門の場合は設置商品・品番・色・数量・保証書の有無も保存する。

**前提**: 操作 5（is_admin関数）・操作 6（customers）・操作 7（staff）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 案件テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、is_admin() / customers / staff が存在するか確認 |
| 6 | **Table Editor** で **projects** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- 案件テーブル（要件定義・進捗管理票に基づく）
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_number TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('delivery', 'construction', 'repair')),
  work_type TEXT NOT NULL CHECK (work_type IN ('aircon', 'construction', 'delivery')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  start_date DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'estimate_draft' CHECK (status IN (
    'estimate_draft',
    'estimate_sent',
    'in_progress',
    'completed',
    'cancelled'
  )),
  notes TEXT,
  -- 配送部門用の追加項目（配送以外は NULL 可）
  product_name TEXT,
  product_code TEXT,
  product_color TEXT,
  product_quantity INTEGER,
  has_warranty BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能（is_admin() を使用して無限再起を防ぐ）
CREATE POLICY "Admin can do all on projects"
  ON public.projects FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは参照・挿入・更新可能
CREATE POLICY "Authenticated can select insert update projects"
  ON public.projects
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー（自動採番） |
| project_number | text | 案件番号（例: K-001, S-001, H-001）。採番は Cursor 側で部門ごとの最大+1 で実装可能 |
| department | text | 部門（delivery=配送, construction=工事, repair=修理） |
| work_type | text | 工事種別（aircon=エアコン, construction=工事, delivery=配送） |
| customer_id | uuid | 顧客 ID（customers への外部キー） |
| staff_id | uuid | 担当者 ID（staff への外部キー） |
| start_date | date | 着工日・設置訪問日 |
| due_date | date | 完了予定日 |
| status | text | ステータス（estimate_draft=見積作成中, estimate_sent=見積送付済み, in_progress=作業中, completed=完了, cancelled=キャンセル） |
| notes | text | 備考 |
| product_name | text | 設置商品（配送部門用） |
| product_code | text | 品番（配送部門用） |
| product_color | text | 色（配送部門用） |
| product_quantity | integer | 数量（配送部門用） |
| has_warranty | boolean | 保証書の有無（配送部門用） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 案件番号について

- 部門ごとに頭文字を変えて採番する（例: 工事=K、修理=S、配送=H）。
- 本 SQL では `project_number` は単なるテキスト。Cursor 側で「同じ部門の最大番号＋1」を取得してから INSERT する実装が簡単です。
- 将来的に DB で自動採番したい場合は、部門ごとのシーケンスやトリガーを追加できます。

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > projects に上記カラムが表示されている
- customers / staff を選択したときに、外部キーで正しく参照できる

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.customers" does not exist | 操作 6 で customers テーブルを作成する |
| relation "public.staff" does not exist | 操作 7 で staff テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 操作 9: 見積テーブルの作成

### 目的

見積・請求書機能のための `estimates`（見積ヘッダー）と `estimate_items`（見積明細）テーブルを作成する。

**前提**: 操作 5（is_admin関数）・操作 8（projects）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 見積テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、is_admin() / projects が存在するか確認 |
| 6 | **Table Editor** で **estimates** と **estimate_items** が表示されているか確認 | あれば成功 |

```sql
-- estimates テーブル（見積ヘッダー）
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, version)
);

-- estimate_items テーブル（見積明細）
CREATE TABLE IF NOT EXISTS public.estimate_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能
CREATE POLICY "Admin can do all on estimates"
  ON public.estimates FOR ALL
  USING (public.is_admin());

CREATE POLICY "Admin can do all on estimate_items"
  ON public.estimate_items FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは参照・挿入・更新可能
CREATE POLICY "Authenticated can select insert update estimates"
  ON public.estimates FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can select insert update estimate_items"
  ON public.estimate_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON public.estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON public.estimate_items(estimate_id);
```

### 作成されるカラム

#### estimates テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー） |
| version | integer | バージョン番号（履歴管理用、1から開始） |
| status | text | ステータス（draft=下書き, pending_approval=承認待ち, approved=承認済み, sent=送付済み） |
| approved_by | uuid | 承認者ID（profilesへの外部キー、NULL可） |
| approved_at | timestamptz | 承認日時（NULL可） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

#### estimate_items テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| estimate_id | uuid | 見積ID（estimatesへの外部キー） |
| item_name | text | 項目名 |
| unit_price | numeric(10,2) | 単価 |
| quantity | numeric(10,2) | 数量 |
| subtotal | numeric(10,2) | 小計（単価×数量） |
| display_order | integer | 表示順序 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > estimates / estimate_items に上記カラムが表示されている
- 外部キー制約が正しく設定されている（projects, profiles への参照）

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.projects" does not exist | 操作 8 で projects テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 操作 10: 原価・人件費・経費テーブルの作成

### 目的

案件ごとの原価（材料費・その他）、人件費（作業者名+単価）、経費（交通費・高速代・宿泊代・その他）を管理するためのテーブルを作成する。

**前提**: 操作 5（is_admin関数）・操作 8（projects）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 原価・人件費・経費テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、is_admin() / projects が存在するか確認 |
| 6 | **Table Editor** で **project_costs**、**project_labor_costs**、**project_expenses** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- project_costs テーブル（原価）
CREATE TABLE IF NOT EXISTS public.project_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('material', 'other')),
  description TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- project_labor_costs テーブル（人件費）
CREATE TABLE IF NOT EXISTS public.project_labor_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- project_expenses テーブル（経費）
CREATE TABLE IF NOT EXISTS public.project_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('transport', 'highway', 'accommodation', 'other')),
  description TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_labor_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能
CREATE POLICY "Admin can do all on project_costs"
  ON public.project_costs FOR ALL
  USING (public.is_admin());

CREATE POLICY "Admin can do all on project_labor_costs"
  ON public.project_labor_costs FOR ALL
  USING (public.is_admin());

CREATE POLICY "Admin can do all on project_expenses"
  ON public.project_expenses FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは参照・挿入・更新・削除可能
CREATE POLICY "Authenticated can all on project_costs"
  ON public.project_costs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can all on project_labor_costs"
  ON public.project_labor_costs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can all on project_expenses"
  ON public.project_expenses FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON public.project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_labor_costs_project_id ON public.project_labor_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id ON public.project_expenses(project_id);
```

### 作成されるカラム

#### project_costs テーブル（原価）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー） |
| category | text | 区分（material=材料費、other=その他） |
| description | text | 内容（その他の場合のみ入力、NULL可） |
| amount | numeric(10,2) | 金額 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

#### project_labor_costs テーブル（人件費）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー） |
| worker_name | text | 作業者名 |
| amount | numeric(10,2) | 金額 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

#### project_expenses テーブル（経費）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー） |
| category | text | 区分（transport=交通費、highway=高速代、accommodation=宿泊代、other=その他） |
| description | text | 内容（その他の場合のみ入力、NULL可） |
| amount | numeric(10,2) | 金額 |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > project_costs / project_labor_costs / project_expenses に上記カラムが表示されている
- 外部キー制約が正しく設定されている（projects への参照）

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.projects" does not exist | 操作 8 で projects テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 操作 11: 入金情報テーブルの作成

### 目的

案件ごとの入金情報（着工金・中間金・完了金）を管理するためのテーブルを作成する。入金情報の閲覧は管理者のみ可能とする。

**前提**: 操作 5（is_admin関数）・操作 8（projects）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 入金情報テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、is_admin() / projects が存在するか確認 |
| 6 | **Table Editor** で **project_payments** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- project_payments テーブル（入金情報）
CREATE TABLE IF NOT EXISTS public.project_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('start', 'middle', 'completion')),
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能
CREATE POLICY "Admin can do all on project_payments"
  ON public.project_payments FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは入力・更新可能（閲覧は管理者のみ）
CREATE POLICY "Authenticated can insert project_payments"
  ON public.project_payments
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update project_payments"
  ON public.project_payments
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 管理者のみ閲覧可能
CREATE POLICY "Admin can select project_payments"
  ON public.project_payments FOR SELECT
  USING (public.is_admin());

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_project_payments_project_id ON public.project_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_payments_payment_type ON public.project_payments(payment_type);
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー） |
| payment_type | text | 入金種別（start=着工金、middle=中間金、completion=完了金） |
| amount | numeric(10,2) | 金額 |
| payment_date | date | 入金日（NULL可） |
| notes | text | 備考（NULL可） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > project_payments に上記カラムが表示されている
- 外部キー制約が正しく設定されている（projects への参照）

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.projects" does not exist | 操作 8 で projects テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 操作 12: 売上管理票テーブルの作成

### 目的

案件ごとの売上金額と確定状態を管理するためのテーブルを作成する。売上は見積・請求書と同じ金額で開始し、作業中に変動する。確定後も修正可能とする。

**前提**: 操作 5（is_admin関数）・操作 8（projects）が完了していること。

### 手順（初心者向け）

| ステップ | どこで | 何をする |
|----------|--------|----------|
| 1 | 左メニュー **SQL Editor** をクリック | SQL 実行画面を開く |
| 2 | **New query** をクリック | 新しいクエリを開始 |
| 3 | 以下の SQL をコピーして貼り付ける | 売上管理票テーブル用の SQL |
| 4 | **Run** をクリック | 実行 |
| 5 | 「Success」を確認 | エラーが出たら、is_admin() / projects が存在するか確認 |
| 6 | **Table Editor** で **project_sales** が表示されているか確認 | あれば成功 |

### 使用する SQL

```sql
-- project_sales テーブル（売上管理票）
CREATE TABLE IF NOT EXISTS public.project_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  sales_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  fixed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.project_sales ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能
CREATE POLICY "Admin can do all on project_sales"
  ON public.project_sales FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは参照・挿入・更新可能
CREATE POLICY "Authenticated can all on project_sales"
  ON public.project_sales FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_project_sales_project_id ON public.project_sales(project_id);
CREATE INDEX IF NOT EXISTS idx_project_sales_is_fixed ON public.project_sales(is_fixed);
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projectsへの外部キー、UNIQUE制約） |
| sales_amount | numeric(10,2) | 売上金額（変動あり） |
| is_fixed | boolean | 確定フラグ（false=未確定、true=確定） |
| fixed_at | timestamptz | 確定日時（NULL可） |
| notes | text | 備考（NULL可） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 損益計算について

- **粗利**: 売上 - 原価（project_costs の合計）
- **純利**: 粗利 - 人件費（project_labor_costs の合計）- 経費（project_expenses の合計）
- これらの計算は Cursor 側で実装する（SQL ビューや関数でも実装可能）

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > project_sales に上記カラムが表示されている
- 外部キー制約が正しく設定されている（projects への参照）
- project_id に UNIQUE 制約が設定されている（1案件=1売上管理票）

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.projects" does not exist | 操作 8 で projects テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 操作 13: 完了報告テーブル（project_completion_reports）の作成

### 目的

案件の完了報告書およびお客様のデジタルサイン（署名画像）を保存するためのテーブルです。案件詳細画面の「完了報告」から完了報告書を表示し、署名パッドで署名を保存できます。

### 手順

1. Supabase ダッシュボードにログイン
2. 左メニュー **SQL Editor** を開く
3. **New query** をクリック
4. 以下の SQL を貼り付けて **Run** を実行

### 使用する SQL

```sql
-- 完了報告テーブル（1案件1件、署名画像は data URL で保存）
CREATE TABLE IF NOT EXISTS public.project_completion_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  completed_at DATE,
  signer_name TEXT,
  signature_data_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 有効化
ALTER TABLE public.project_completion_reports ENABLE ROW LEVEL SECURITY;

-- admin は全件操作可能
CREATE POLICY "Admin can do all on project_completion_reports"
  ON public.project_completion_reports FOR ALL
  USING (public.is_admin());

-- 認証済みユーザーは参照・挿入・更新可能
CREATE POLICY "Authenticated can all on project_completion_reports"
  ON public.project_completion_reports FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_project_completion_reports_project_id ON public.project_completion_reports(project_id);
```

### 作成されるカラム

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| project_id | uuid | 案件ID（projects への外部キー、UNIQUE） |
| completed_at | date | 完了日（NULL可） |
| signer_name | text | 署名者名（NULL可） |
| signature_data_url | text | 署名画像の data URL（NULL可） |
| notes | text | 備考（NULL可） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### 成功例

- SQL Editor: `Success. No rows returned`
- Table Editor > project_completion_reports が表示されている

### エラーが出たとき

| メッセージ | 確認すること |
|------------|----------------|
| relation "public.projects" does not exist | 操作 8 で projects テーブルを作成する |
| function public.is_admin() does not exist | 操作 5 で `is_admin()` 関数を作成する |

---

## 次の進め方（現在地とこのあとやること）

### いま Supabase でやること

顧客・担当者・案件・見積・原価・人件費・経費・入金情報・売上管理票のテーブル（操作 5-12）が済んでいれば、Supabase 側の追加作業は不要。Cursor で画面を実装する。

### このあと Supabase でやること

集計・レポート用のビューや関数が必要になったら、操作 13 以降として本ドキュメントに手順を追記する。進捗は [docs/進捗管理票.md](進捗管理票.md) で更新する。
