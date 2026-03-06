# GASデプロイ手順とJSON契約

## 1. 配置
1. スプレッドシートの `拡張機能 > Apps Script` を開く。
2. [`gas/Code.gs`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/gas/Code.gs) の内容を貼り付ける。

## 2. デプロイ
1. `デプロイ > 新しいデプロイ`。
2. 種別は `ウェブアプリ`。
3. 実行ユーザーは自分、アクセスは `全員` を選択。
4. 発行されたURLを控えて [`assets/config.js`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/assets/config.js) の `GAS_ENDPOINT` に設定。

## 3. JSON契約
ルートキー:
- `meta`
- `collection[]`
- `expenses[]`
- `reimbursements[]`
- `summary`

`meta` 必須キー:
- `generatedAt` (ISO8601)
- `seasonYear` (2026)
- `collectionAmountPerMember`
- `refundCapPerFreshman`
- `pollingIntervalSec` (60)

`meta` 任意キー:
- `seasonStart`
- `seasonEnd`

`collection[]` 公開キー:
- `nickname`
- `paymentStatus`
- `confirmedDate`

`expenses[]` 公開キー:
- `id`
- `date`
- `category`
- `description`
- `amount`

`reimbursements[]` 公開キー:
- `id`
- `nickname`
- `description`
- `paymentAmount`
- `reimbursementAmount`
- `refundStatus`

`summary` 公開キー:
- `paidMembers`
- `unpaidMembers`
- `collectionTotal`
- `expensesTotal`
- `plannedReimbursementsTotal`
- `availableAfterExpenses`
- `currentBalance`

### 返却例
```json
{
  "meta": {
    "generatedAt": "2026-04-10T11:20:00+09:00",
    "seasonYear": 2026,
    "collectionAmountPerMember": 4000,
    "refundCapPerFreshman": 700,
    "pollingIntervalSec": 60
  },
  "collection": [],
  "expenses": [],
  "reimbursements": [],
  "summary": {
    "paidMembers": 0,
    "unpaidMembers": 0,
    "collectionTotal": 0,
    "expensesTotal": 0,
    "plannedReimbursementsTotal": 0,
    "availableAfterExpenses": 0,
    "currentBalance": 0
  }
}
```

## 4. フィルタ規約
1. `reimbursements` は `承認済` かつ `有効` のみ。
2. 誤申請は無効化で保持し、JSONでは非表示にする。
3. 公開JSONは whitelist 方式で返す。UIで未使用でも、公開不要な項目は含めない。
4. 以下は公開JSONに含めない。
   - `receiptUrl` などのレシート関連項目
   - `approvalStatus` / `invalidFlag` / `invalidReason`
   - `note`
   - `payer`
   - `collectedAmount`
   - `appliedDate`
   - `freshmanCount`
   - 本名、連絡先

## 4-1. 列名互換
`reimbursements[].nickname` は以下の列名候補を優先順に参照して生成する。

1. `立替者ニックネーム`
2. `立替者(ニックネーム)`
3. `立替者（ニックネーム）`
4. `申請者名`
5. `申請者名(上記に名前がない場合)`
6. `申請者名（上記に名前がない場合）`

## 5. エラー時仕様
`doGet` で例外が起きた場合は以下形式で返す。
```json
{
  "error": true,
  "message": "...",
  "generatedAt": "..."
}
```

## 6. テスト確認
1. ブラウザでGAS URLを開き、JSONが表示されること。
2. 必須キー欠落がないこと。
3. `collection[]` / `expenses[]` / `reimbursements[]` / `summary` に公開対象外キーが含まれないこと。
4. 個人情報やレシートURLが含まれないこと。
