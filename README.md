# Jeunesse 2026 新歓会計ダッシュボード

神戸大学 Jeunesse の 2026 年度新歓会計を公開用 JSON から可視化する、静的な会計ダッシュボードです。
会費の納入状況と支出の進み具合を、`サマリー / 収入 / 支出` の 3 画面で確認できます。

## 概要

- GitHub Pages 上で公開する 1 ページ完結のダッシュボードです。
- データ取得元は Google スプレッドシートと GAS で、ブラウザ側は `index.html` と素の JavaScript で構成しています。
- 公開画面では、会計確認に必要な最小限の情報だけを表示し、個人情報や内部向け情報は含めません。

## 公開URL

- ライブダッシュボード: [https://ishizukahiroto.github.io/Jeunesse2026OrientationAccounting/](https://ishizukahiroto.github.io/Jeunesse2026OrientationAccounting/)

## 主要機能

- `サマリー` 画面で集金額、総経費額、返金予定額、納入状況を一覧で把握
- `収入` 画面で `氏名 / 金額 / 納入日 / 状態` を確認
- `支出` 画面で `経費 / 立替` を同じ一覧で確認し、`立替` フィルターで返金状況を追跡
- 手動更新ボタンと定期ポーリングによる最新データ反映
- スマホ幅 390px を含むレスポンシブ表示

## リポジトリ構成

- `index.html`: ダッシュボード本体
- `assets/app.js`: UI の状態管理と描画
- `src/calc.js`: 公開 JSON からの集計ロジック
- `src/styles/tailwind.css`: Tailwind のソース
- `assets/styles.css`: 配信用にビルドした CSS
- `gas/Code.gs`: スプレッドシートから公開 JSON を返す GAS
- `docs/`: 運用手順、JSON 契約、可視ガイド
- `tests/`: 集計と JSON 契約の単体テスト

## ローカル確認手順

```bash
npm install
npm run build:css
npm test
npx serve . -l 4173
```

ローカル表示後は、少なくとも次を確認してください。

- デスクトップ幅で `サマリー / 収入 / 支出` を切り替えられる
- スマホ幅 390px で横スクロールが出ない
- `支出` の `立替` フィルターで返金状況を確認できる
- 更新中は `更新中...` の非クリック表示になり、完了後に `更新` へ戻る

## GitHub Pages 公開

1. `main` ブランチへ反映する
2. GitHub の `Settings > Pages` を開く
3. `Build and deployment` を `Deploy from a branch` に設定する
4. `Branch: main` と `Folder: / (root)` を選択して保存する
5. 公開後、ライブ URL でスマホ幅 390px を含む表示確認を行う

## データ公開上の制約

このリポジトリは公開前提ですが、公開できるのはダッシュボード表示に必要な最小限の情報だけです。
JSON 契約や GAS を変更する場合も、以下の制約は維持してください。

- 公開 JSON に個人情報を含めない
- 未承認データを含めない
- `無効フラグ` が立ったデータを含めない
- レシート URL を含めない
- `立替返金管理` の行削除はせず、必ず `無効フラグ` で無効化する
- 年度更新時は `gas/Code.gs` の `seasonYear` と画面文言、関連ドキュメントを同時に更新する

## 関連ドキュメント

- [運用手順](./docs/dashboard-operation.md)
- [受け入れチェックリスト](./docs/acceptance-test-checklist.md)
- [GAS デプロイと JSON 契約](./docs/gas-deploy-and-json-contract.md)
- [図でわかる運用・構成ガイド](./docs/visual-guide.md)
- [スプレッドシートセットアップ](./docs/spreadsheet-setup.md)
