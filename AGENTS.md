# AGENTS.md

## Purpose
このリポジトリは Jeunesse 2026 新歓会計ダッシュボードを管理する。

## Mandatory Rules
1. 仕様変更時は `docs/` を同一PRで更新する。
2. 立替申請データの行削除は禁止。必ず `無効フラグ` で無効化する。
3. 公開JSONに個人情報、未承認、無効、レシートURLを含めない。
4. 年度更新時は `gas/Code.gs` の `seasonYear` と表示文言を同時更新する。
5. UI変更時はスマホ表示（390px）確認と「AIっぽさ」ダブルチェックを必須にする。

## Development Workflow
1. `npm install`
2. `npm run build:css`
3. `npm test`
4. 変更後は `docs/acceptance-test-checklist.md` の該当項目を確認する。

## Frontend Guidelines
1. Tailwind CSS は CLI ビルドで運用し、配信CSSは `assets/styles.css` に出力する。
2. 画面は `index.html` 1ページ完結、主要情報はアコーディオンで展開する。
3. 初期表示はサマリー優先、一覧は上位5件＋段階表示を維持する。

## GAS Guidelines
1. シート名を変更する場合は `SHEET_CANDIDATES` を更新する。
2. JSON契約を変更する場合はテストと `docs/gas-deploy-and-json-contract.md` を同時に更新する。
