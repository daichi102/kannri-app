# Google Maps Platform 高速料金API設定書

このドキュメントは、`kannri-app` で高速代（出発IC/到着ICベース）を自動算出するために、Google Maps Platform の Routes API を設定する手順です。  
対象構成は **Next.js (Vercel) + Supabase** です。

---

## 1. 結論（相性）

- **Google Maps Platform × Vercel × Supabase の相性は良い**です。
- 理由:
  - Vercel の Serverless Function（`app/api/...`）から Google Routes API を安全に呼べる
  - APIキーを Vercel 環境変数に隠せる（クライアントへ露出しない）
  - 計算結果を Supabase の `project_expenses` に保存しやすい

---

## 2. 公式ドキュメント（参照元）

- Routes API セットアップ  
  https://developers.google.com/maps/documentation/routes/get-api-key
- 料金計算（TOLLS）  
  https://developers.google.com/maps/documentation/routes/calculate_toll_fees
- APIキー保護ベストプラクティス  
  https://developers.google.com/maps/api-security-best-practices
- Vercel 環境変数  
  https://vercel.com/docs/environment-variables

---

## 3. 前提

- Google Cloud アカウント作成済み
- Vercel プロジェクト作成済み
- Supabase 接続済み（`project_expenses` テーブル利用中）
- 課金（Billing）を有効化できること

> 注意: Routes API の `TOLLS` は従量課金です。無料運用前提ではなく、上限設定とアラート設定を必ず行ってください。

---

## 4. Google Cloud 側の設定

## 4-1. プロジェクト作成

1. Google Cloud Console にログイン
2. 新規プロジェクト作成（例: `kannri-app-maps`）

## 4-2. Billing 有効化

1. 左メニュー `Billing`
2. 対象プロジェクトへ課金アカウントを紐づけ

## 4-3. Routes API 有効化

1. 左メニュー `APIs & Services` → `Library`
2. `Routes API` を検索
3. `Enable`

## 4-4. APIキー作成

1. `APIs & Services` → `Credentials`
2. `Create credentials` → `API key`
3. 作成されたキーを控える

## 4-5. APIキー制限（必須）

Google公式の推奨どおり、**アプリ制限 + API制限**を設定します。

- **Application restrictions**: `IP addresses`  
  - Vercel から呼ぶ場合は固定IP制限が難しいケースがあります。固定IP運用ができない場合は、まず API制限を厳格にし、必要ならプロキシ/固定出口IPを検討。
- **API restrictions**: `Restrict key`
  - `Routes API` のみ許可

> 補足: Google公式ではサーバーサイドの Web Service 呼び出しは IP制限が推奨です。

---

## 5. Vercel 側の設定

## 5-1. 環境変数追加

Vercel Project Settings → `Environment Variables` に以下を追加:

- `GOOGLE_MAPS_API_KEY` = （Google Cloudで作成したキー）

環境は少なくとも:

- `Preview`
- `Production`
- （必要なら `Development`）

## 5-2. ローカル開発用

`.env.local` に同名キーを追加:

```env
GOOGLE_MAPS_API_KEY=xxxxxxxxxxxxxxxx
```

---

## 6. 実装方針（kannri-app）

APIキーはクライアントへ出さず、**Next.js のサーバールート経由**で呼びます。

- 追加先（例）: `app/api/highway-toll/route.ts`
- 入力: `originIc`, `destIc`, `roundTrip`, `vehicleType`, `departAt`
- 出力: `tollYen`, `distanceMeters`, `durationSeconds`, `provider`

## 6-1. 呼び出しパラメータの要点

Routes API で高速料金を得るには、公式どおり以下を指定:

- `extraComputations: ["TOLLS"]`
- `routeModifiers.vehicleInfo.emissionType`（例: `GASOLINE`）
- 必要に応じて `routeModifiers.tollPasses`
- Field mask に `routes.travelAdvisory.tollInfo` を含める

---

## 7. Supabase 連携方針

計算後は既存の経費テーブルへ保存:

- テーブル: `project_expenses`
- `category`: `highway`
- `description`: 例 `練馬IC -> 高井戸IC`
- `amount`: API算出金額（円）

既存実装上、`expenses/page.tsx` の登録処理に `amount` を渡せば保存できます。

---

## 8. 最小テスト項目

- 出発IC/到着IC未入力でエラー表示
- 料金取得成功で `amount` に自動反映
- `project_expenses` に `category=highway` で保存
- API失敗時に手入力へ切替可能
- 見積/売上画面への合計反映に問題がない

---

## 9. 運用上の注意

- 月次の利用上限（Quota）を設定
- 請求アラートを設定
- APIキーは公開しない（`NEXT_PUBLIC_` で始まる変数名にしない）
- 料金の精度確認として、実際の主要区間で突合テスト（10〜20区間）を実施

---

## 10. 参考レスポンス項目（業務で使う値）

- `routes[0].travelAdvisory.tollInfo.estimatedPrice[]`
  - `currencyCode`（JPY想定）
  - `units` / `nanos`

アプリ側は最終的に円整数へ正規化して保存してください。

---

## 11. 導入チェックリスト

- [ ] Google Cloud プロジェクト作成
- [ ] Billing 有効化
- [ ] Routes API 有効化
- [ ] APIキー作成
- [ ] APIキー制限（Routes API限定）
- [ ] Vercel 環境変数設定（`GOOGLE_MAPS_API_KEY`）
- [ ] `app/api/highway-toll/route.ts` 実装
- [ ] `expenses/page.tsx` に「料金取得」UI追加
- [ ] Supabase 保存連携
- [ ] 主要区間で料金精度テスト

