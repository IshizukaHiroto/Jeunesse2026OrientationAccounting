# Jeunesse2026OrientationAccounting

ジュネスの2026年新歓における会計記録を公開するダッシュボードです。

## 構成
- `index.html` + `assets/app.js`: 画面本体
- `gas/Code.gs`: スプレッドシートからJSONを返すGAS
- `src/calc.js`: 集計ロジック
- `docs/`: スプレッドシート/フォーム/GAS/運用手順
- `testMovies/`: 動作確認動画（mp4）

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
