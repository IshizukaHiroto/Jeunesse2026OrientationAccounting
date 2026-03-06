# ダッシュボード運用手順

図で全体を確認したい場合は、先に [`docs/visual-guide.md`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/docs/visual-guide.md) を参照してください。

## 1. 初期設定
1. [`assets/config.js`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/assets/config.js) の `GAS_ENDPOINT` を本番URLに更新。
2. `POLLING_MS` は既定値 `60000`（60秒）を維持。
3. CSS更新時は `npm run build:css` を実行して [`assets/styles.css`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/assets/styles.css) を再生成。

## 2. ローカル確認
1. `npm install`
2. `npm run build:css`
3. `npm test`
4. 静的サーバーで表示確認（例: `npx serve .`）

## 3. GitHub Pages公開
1. `main` ブランチへ反映。
2. `Settings > Pages` の公開対象を `main` に設定。
3. 公開URLでスマホ表示（幅390px）を検証。

## 4. 日常運用
1. 申請承認後、最大60秒で反映。
2. 取得失敗時は黄色バナーで前回成功データ表示に切り替わる。
3. 返金完了後は `返金状況` を更新。

## 5. 画面操作
1. PCでは左サイドバー、スマホでは下部タブで `サマリー / 集金 / 出費` を切り替える。
2. `出費` は `経費` と `立替返金予定` をまとめた上位カテゴリで、画面内では `経費明細` と `立替一覧` を続けて確認する。
3. 集金画面と出費画面の立替一覧は `昇順 / 降順` ボタンで名前順ソートできる（初期は昇順）。
4. 一覧は上位5件から表示され、`もっと見る` で段階表示する。
5. 返金上限（新入生1人あたり）はサマリーの精算ルールと出費画面の立替欄説明に表示される。表示値は `meta.refundCapPerFreshman` を優先し、欠損・不正時は700円を表示する。

## 6. 障害時対応
1. バナー表示が続く場合、まずGAS URLと公開権限を確認。
2. シート名変更時は [`gas/Code.gs`](/Users/hirotoishizuka/Desktop/Jeunesse2026OrientationAccounting/gas/Code.gs) の候補名を更新。
3. JSON契約変更時は `docs/gas-deploy-and-json-contract.md` とテストを同時更新。
