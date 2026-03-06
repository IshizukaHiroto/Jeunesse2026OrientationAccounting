# Jeunesse2026OrientationAccounting

ジュネスの2026年新歓における会計記録を公開するダッシュボードです。

## 構成
- `index.html` + `assets/app.js`: 画面本体
- `gas/Code.gs`: スプレッドシートからJSONを返すGAS
- `src/calc.js`: 集計ロジック
- `docs/`: スプレッドシート/フォーム/GAS/運用手順
- `testMovies/`: 動作確認動画（mp4）

## スプレッドシート運用で触ってはいけない箇所
- シート名の基準は `集金管理` / `立替返金管理` / `経費記録` / `設定`。変更する場合は `gas/Code.gs` の候補名と `docs/` を同時更新する。
- Googleフォーム連携で `フォームの回答 1` ができた場合も、運用上は `立替返金管理` にリネームする。既定名タブが複数あるとGASが判別できない。
- `立替返金管理` の行削除は禁止。誤申請や締切後申請は `無効フラグ=無効` と `無効理由` で処理する。
- `設定` シートの項目名は固定。`集金額（1人あたり）`、`返金上限（新入生1人あたり）`、`新歓期間（開始）`、`新歓期間（終了）` を別名にしない。
- `集金管理!C:C` と `立替返金管理!F:F` は計算列として扱う。手入力で上書きする場合は、式が消えても問題ないか確認してから行う。
- `立替返金管理` の `承認状況`、`返金状況`、`無効フラグ` は既定値で運用する。公開JSONは `承認済` かつ `有効` のみを出す。
- レシートURL、個人情報、未承認データ、無効データを公開JSONに載せない。列追加やGAS改修時もこの制約を崩さない。
- 年度更新時は `gas/Code.gs` の `seasonYear`、画面文言、`docs/` を同じ変更で揃える。

## ローカル起動
```bash
npm install
npm run build:css
npm test
npx serve . -l 4173
```

## GitHub Pages 公開手順
1. GitHubリポジトリの `Settings` を開く。
2. 左メニュー `Pages` を開く。
3. `Build and deployment` を `Deploy from a branch` にする。
4. `Branch: main` / `Folder: / (root)` を選んで `Save`。
5. 数分後に発行される公開URLへアクセスする。

## 公開前チェック
1. `assets/config.js` の `GAS_ENDPOINT` が本番URLであること。
2. スマホ幅（390px前後）で表示確認。
3. `docs/acceptance-test-checklist.md` を全チェック。
