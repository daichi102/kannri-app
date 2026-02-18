# Vercel デプロイ手順書

このドキュメントでは、kannri-app を Vercel にデプロイして外部からアクセス可能にする手順を説明します。

---

## 前提条件

- GitHub アカウントを持っていること
- プロジェクトが Git リポジトリとして管理されていること
- Supabase の認証設定が完了していること

---

## 手順 1: Git リポジトリの準備

### 1-1. 変更をコミット

プロジェクトディレクトリで以下を実行：

```bash
git add .
git commit -m "Initial commit for Vercel deployment"
```

### 1-2. GitHub にリポジトリを作成

1. https://github.com にアクセスしてログイン
2. 右上の「+」→「New repository」をクリック
3. リポジトリ名を入力（例: `kannri-app`）
4. 「Public」または「Private」を選択
5. 「Create repository」をクリック

### 1-3. ローカルリポジトリを GitHub にプッシュ

GitHub で作成したリポジトリの URL をコピーし、以下を実行：

```bash
git remote add origin https://github.com/daichi102/kannri-app
git branch -M main
git push -u origin main
```

**注意**: `あなたのユーザー名` の部分は実際の GitHub ユーザー名に置き換えてください。

---

## 手順 2: Vercel アカウントの作成

1. https://vercel.com にアクセス
2. 「Sign Up」をクリック
3. 「Continue with GitHub」を選択（推奨）
   - GitHub アカウントでログインすると、自動的にリポジトリが連携されます
4. 必要に応じて権限を承認

---

## 手順 3: Vercel にプロジェクトをインポート

1. Vercel ダッシュボードで「Add New...」→「Project」をクリック
2. 「Import Git Repository」から、先ほどプッシュした `kannri-app` リポジトリを選択
3. プロジェクト設定を確認：
   - **Framework Preset**: `Next.js`（自動検出されるはず）
   - **Root Directory**: `./`（そのまま）
   - **Build Command**: `next build`（デフォルト）
   - **Output Directory**: `.next`（デフォルト）
   - **Install Command**: `npm install`（デフォルト）
4. 「Deploy」をクリック（環境変数は後で設定するので、この時点ではそのまま進めます）

---

## 手順 4: 環境変数の設定

Supabase を使用しているため、Vercel に環境変数を設定する必要があります。

### 4-1. 環境変数を追加

1. Vercel ダッシュボードでプロジェクトを開く
2. 「Settings」タブをクリック
3. 左メニューから「Environment Variables」を選択
4. 以下の環境変数を追加：

| 名前 | 値 | 環境 |
|------|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mgqywkveimtonzyrbkcx.supabase.co` | Production, Preview, Development すべて |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` に記載されている値 | Production, Preview, Development すべて |

**値の確認方法**: プロジェクトの `.env.local` ファイルを開いて、該当する値をコピーしてください。

### 4-2. 再デプロイ

環境変数を追加した後、自動的に再デプロイが開始されます。完了するまで待ちます。

---

## 手順 5: Supabase の認証設定を更新

Vercel にデプロイした URL を Supabase の認証設定に追加する必要があります。

### 5-1. Vercel の URL を確認

デプロイが完了すると、以下のような URL が生成されます：
- `https://kannri-app-xxxxx.vercel.app`（自動生成）
- または、カスタムドメインを設定した場合はその URL

### 5-2. Supabase Dashboard で設定

1. https://supabase.com/dashboard にアクセス
2. プロジェクトを選択
3. 左メニューから「Authentication」→「URL Configuration」を開く
4. **Site URL** を Vercel の URL に変更：
   ```
   https://kannri-app-xxxxx.vercel.app
   ```
5. **Redirect URLs** に以下を追加：
   ```
   https://kannri-app-xxxxx.vercel.app/**
   https://kannri-app-xxxxx.vercel.app/auth/callback
   ```
   （`xxxxx` の部分は実際の Vercel の URL に置き換えてください）
6. 「Save」をクリック

---

## 手順 6: 動作確認

1. Vercel の URL（例: `https://kannri-app-xxxxx.vercel.app`）にアクセス
2. ログインページが表示されることを確認
3. ログインが正常に動作することを確認
4. 各ページが正常に表示されることを確認

---

## 手順 7: QRで控えを開けるようにする（Deployment Protection の設定）

作業チェック表の控えを、お客様がQRコードで読み取って**ログインなしでPDF表示**できるようにするには、Vercel の「Deployment Protection」を調整します。

### なぜ必要か

- **Deployment Protection（パスワード保護）** が有効だと、**アプリのミドルウェアより先に** Vercel のログイン画面が表示されます。
- そのため、QRで `/receipt/[token]` を開いても、まず Vercel のログインを求められ、お客様が控えページにたどり着けません。
- **本番（Production）だけ保護を外し**、プレビュー（PR ごとの URL）はこれまでどおり保護する設定にすると、QR で本番の控えURLを開いたときだけログイン不要になります。

### 手順

1. **Vercel ダッシュボード**で、対象のプロジェクト（kannri-app）を開く
2. 上部タブの **「Settings」** をクリック
3. 左メニューから **「Deployment Protection」** を選択
4. 次のいずれかにする：
   - **「Protect only Preview Deployments」をオンにする**  
     - 本番（Production）は保護なし、プレビューのみパスワード保護されます。  
     - QR でお客様が開くのは本番URLなので、この設定で控えが開けるようになります。
   - または **「Password Protection」をオフにする**  
     - 本番・プレビューともに Vercel のパスワードがかかりません。  
     - アプリ側の Supabase ログインはそのまま有効です。
5. 変更を保存する（設定によっては「Save」や自動保存）

### 誰でもアプリにログインできるようになる？

**いいえ、なりません。** この設定で変わるのは「Vercel のパスワード／チームログイン」だけです。

- **誰でもできること**: 本番のURL（例: `https://kannri-app-xxxxx.vercel.app`）にアクセスし、**ログイン画面を開くこと**、および **控え用のURL（`/receipt/[token]`）を開くこと**（トークンを知っている場合のみ）。
- **誰でもできないこと**: メール・パスワードなしで**アプリにログインして中身（案件一覧・完了チェックなど）を見ること**。ログインにはこれまでどおり Supabase のアカウント（メール・パスワード）が必要です。

つまり、設定後も「アプリの認証（Supabase ログイン）」はそのまま有効なので、知らない人が勝手にログインすることはありません。

### デメリット・注意点

| 項目 | 内容 |
|------|------|
| **本番URLが誰でも開ける** | 本番のURLを知っていれば、ログイン画面や控えURLにアクセスできます。アプリの中身（案件一覧など）は Supabase ログイン必須のままです。 |
| **プレビューは保護のまま（推奨）** | 「Protect only Preview Deployments」にすると、PR のプレビューURLだけパスワード保護され、本番は保護なしになります。 |

この設定後、お客様がQRを読み取ると、本番の `/receipt/[token]` にそのままアクセスし、ログインなしで控え（PDF）が表示・保存できるようになります。

---

## 今後の更新方法

### 自動デプロイ（推奨）
GitHub にプッシュすると、自動的に Vercel で再デプロイが実行されます：


```bash
git add .
git commit -m "機能追加やバグ修正の説明"
git push origin main
```

### 手動デプロイ

Vercel ダッシュボードの「Deployments」タブから、特定のコミットを再デプロイすることもできます。

---

## カスタムドメインの設定（オプション）

独自のドメインを使用したい場合：

1. Vercel ダッシュボードでプロジェクトを開く
2. 「Settings」→「Domains」を開く
3. ドメイン名を入力して「Add」をクリック
4. 表示される DNS 設定に従って、ドメインの DNS レコードを設定
5. 設定完了後、数分で反映されます

---

## トラブルシューティング

### ビルドエラーが発生する

- Vercel の「Deployments」タブでビルドログを確認
- ローカルで `npm run build` を実行して、エラーがないか確認

### 環境変数が反映されない

- 環境変数を追加した後、必ず再デプロイが実行されているか確認
- 変数名にタイポがないか確認（`NEXT_PUBLIC_` プレフィックスが必要）
- 環境変数の「Environment」設定で、Production/Preview/Development すべてにチェックが入っているか確認

### Supabase 認証エラー

- Supabase Dashboard の「Authentication」→「URL Configuration」で、Vercel の URL が正しく設定されているか確認
- Redirect URLs に `/**` が含まれているか確認

### ページが表示されない

- ビルドログでエラーがないか確認
- ブラウザのコンソールでエラーメッセージを確認
- Vercel の「Functions」タブでサーバーサイドのエラーがないか確認

---

## 参考リンク

- [Vercel 公式ドキュメント](https://vercel.com/docs)
- [Next.js デプロイガイド](https://nextjs.org/docs/deployment)
- [Supabase 認証設定](https://supabase.com/docs/guides/auth)

---

## 補足: ローカル開発環境との違い

- **環境変数**: `.env.local` はローカル専用。Vercel ではダッシュボードで設定
- **URL**: ローカルは `http://localhost:3000`、Vercel は `https://xxxxx.vercel.app`
- **ビルド**: ローカルは `npm run dev`、Vercel は自動で `npm run build` を実行
- **HTTPS**: Vercel は自動で HTTPS が有効（無料プランでも利用可能）
