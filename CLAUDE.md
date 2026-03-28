# CLAUDE.md

> AI assistant instructions for the **Jeunesse 2026 新歓会計ダッシュボード** repository.

---

## Project Overview

A transparent, read-only accounting dashboard for a Japanese university tennis club's 2026 orientation (新歓) activities. The system displays real-time collection/expense data pulled from Google Sheets via a Google Apps Script (GAS) endpoint.

**Key design constraints:**
- Static frontend (GitHub Pages) — no server-side write access from the UI
- Personal data and unapproved entries are filtered server-side before the public JSON
- Mobile-first layout (primary test width: 390px)
- Vanilla ES5 JavaScript — no bundler, no npm runtime dependencies

---

## Repository Structure

```
.
├── index.html                    # Single-page application (SPA) entry point
├── assets/
│   ├── app.js                    # Main frontend logic (~1,150 lines, ES5)
│   ├── config.js                 # GAS endpoint URL + polling config
│   └── styles.css                # Compiled Tailwind CSS output (do not edit manually)
├── src/
│   ├── calc.js                   # Pure calculation library (UMD module, ES5)
│   └── styles/
│       └── tailwind.css          # Tailwind CSS input file
├── gas/
│   └── Code.gs                   # Google Apps Script — reads Sheets, returns JSON
├── tests/
│   ├── calc.test.js              # Node.js native test runner tests for calc.js
│   └── schema.test.js            # JSON payload shape/whitelist validation tests
├── docs/
│   ├── acceptance-test-checklist.md   # 59-item QA checklist
│   ├── gas-deploy-and-json-contract.md
│   ├── dashboard-operation.md
│   ├── spreadsheet-setup.md
│   ├── google-form-setup.md
│   ├── visual-guide.md
│   └── diagrams/                 # Mermaid (.mmd) + exported SVG diagrams
├── tailwind.config.js            # Tailwind config (custom colors + fonts)
├── package.json                  # npm scripts only (Tailwind CLI build + tests)
├── AGENTS.md                     # Concise mandatory rules (keep in sync with this file)
└── 新歓会計管理システム_仕様書_v3.md  # Full Japanese operational specification
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JavaScript ES5 | No framework, no bundler |
| Styling | Tailwind CSS v3 | CLI build only; output to `assets/styles.css` |
| Charts | Chart.js (CDN) | Loaded in `index.html` via `<script>` tag |
| Server logic | Google Apps Script | `gas/Code.gs`, deployed as Web App |
| Data source | Google Sheets | 4 tabs: 集金管理, 立替返金管理, 経費記録, 設定 |
| Hosting | GitHub Pages | Static, root of `main` branch |
| Tests | Node.js native (`node --test`) | No Jest/Mocha/Vitest |

---

## Development Workflow

### Setup
```bash
npm install          # installs Tailwind CLI only
npm run build:css    # compiles src/styles/tailwind.css → assets/styles.css (minified)
npm test             # runs tests/calc.test.js + tests/schema.test.js
```

### Local preview
```bash
npx serve . -l 4173
```
Then open `http://localhost:4173`. Note: the GAS endpoint in `assets/config.js` must be a valid deployed URL for data to load.

### CSS rebuild
Whenever you add or change Tailwind classes in `index.html` or `assets/app.js`, re-run:
```bash
npm run build:css
```
**Never edit `assets/styles.css` directly** — it is a build artifact.

### Deploying GAS changes
1. Edit `gas/Code.gs`
2. Paste into the Google Apps Script editor (script.google.com)
3. Deploy → "New deployment" → type "Web app" → access "Anyone"
4. Update the URL in `assets/config.js` if the deployment ID changes

---

## Mandatory Rules (enforce on every PR)

1. **Spec changes require docs update** — any business logic or UI change must update the relevant file in `docs/` in the same commit/PR.
2. **Never delete reimbursement rows** — always use `無効フラグ = TRUE` to invalidate entries. Row deletion breaks audit trails.
3. **Public JSON whitelist** — the GAS response must never include: receipt URLs (`receiptUrl`, `receiptURL`, `receipt*`), `approvalStatus`, `invalidFlag`, `invalidReason`, or any personal contact info. Only whitelisted fields may be added.
4. **Year update atomicity** — when updating to a new season year, change `seasonYear` in `gas/Code.gs` AND all display strings in the same commit.
5. **UI changes require mobile + "AI-likeness" check** — test at 390px viewport width and review that copy/colors do not feel AI-generated or template-like.

---

## Architecture Details

### Frontend State Model (`assets/app.js`)

The app uses a single mutable `state` object:
```javascript
state = {
  data: null,           // last successful JSON payload
  lastUpdated: null,    // Date of last successful fetch
  activeTab: 'summary', // 'summary' | 'collection' | 'outflow'
  collectionFilter: 'all',
  sortKey: '...',
  sortDir: 'asc',
  // ...
}
```

Key patterns:
- `fetchData()` polls GAS every 60 seconds; polling pauses when the tab is hidden (`visibilitychange`)
- `render()` is the single re-render function — always call it after state mutations
- Charts are lazy-initialized (only when the Summary tab is active)
- List pagination shows 5 items initially with a "もっと見る" button

### Calculation Library (`src/calc.js`)

Pure functions, no side effects, UMD module (works in both Node and browser):

| Function | Purpose |
|---|---|
| `computeSummary(payload)` | Aggregate totals from all sheets |
| `computeEqualRefundPlan(members)` | Distributes surplus equally to paid members |
| `computeProrationPlan(members, deficit)` | Reduces refunds proportionally when in deficit |
| `computeBalanceComposition(summary)` | Pie chart segment values |
| `filterValidReimbursements(list)` | Keeps only `承認済` + valid (not `無効`) entries |
| `sortByNickname(list)` | Japanese-aware sort using `Intl.Collator` |
| `validatePayloadShape(payload)` | Strict schema check; throws on forbidden keys |

### GAS Server (`gas/Code.gs`)

- `doGet(e)` is the entry point
- Reads 4 sheets using `SHEET_CANDIDATES` fallback arrays (handles sheet name variations)
- Applies business logic: return cap = `MIN(paymentAmount, freshmanCount × 700)`
- Returns JSON with only whitelisted fields
- Wraps all logic in try/catch; returns `{ error: "...", message: "..." }` on failure

### JSON Contract

The GAS endpoint returns this shape (abridged):
```json
{
  "meta": {
    "generatedAt": "ISO8601",
    "seasonYear": 2026,
    "collectionAmountPerMember": 4000,
    "refundCapPerFreshman": 700,
    "pollingIntervalSec": 60,
    "seasonStart": "YYYY-MM-DD",
    "seasonEnd": "YYYY-MM-DD"
  },
  "collection": [
    { "nickname": "...", "paymentStatus": "済|未", "confirmedDate": "..." }
  ],
  "expenses": [
    { "id": 1, "date": "...", "category": "...", "description": "...", "amount": 1000 }
  ],
  "reimbursements": [
    { "id": 1, "nickname": "...", "description": "...", "paymentAmount": 2000, "reimbursementAmount": 1400, "refundStatus": "..." }
  ],
  "summary": {
    "paidMembers": 10, "unpaidMembers": 2, "collectionTotal": 40000,
    "expensesTotal": 5000, "plannedReimbursementsTotal": 8000,
    "availableAfterExpenses": 35000, "currentBalance": 27000
  }
}
```

**Changing the contract:** update `gas/Code.gs`, `tests/schema.test.js`, and `docs/gas-deploy-and-json-contract.md` together.

---

## Testing

```bash
npm test
```

Tests use Node.js native `node --test` (no external test library). All test files are in `tests/`.

- `tests/calc.test.js` — tests for pure calculation functions
- `tests/schema.test.js` — validates JSON payload shape and forbidden-key enforcement

When adding or changing calculation logic:
1. Add/update tests in `tests/calc.test.js`
2. Run `npm test` to confirm all pass
3. Check the relevant items in `docs/acceptance-test-checklist.md`

---

## Tailwind Configuration

Custom design tokens in `tailwind.config.js`:

| Token | Value | Usage |
|---|---|---|
| `court` | Green palette | Primary brand color (tennis court) |
| `clay` | Orange/brown palette | Secondary accent |
| `ink` | Dark palette | Text and borders |
| `shadow-panel` | `0 10px 30px rgba(31,42,36,0.08)` | Card shadows |

Fonts: **M PLUS 1p** (display headings) and **BIZ UDPGothic** (body text), loaded from Google Fonts in `index.html`.

---

## Google Sheets Schema

| Sheet (tab name) | Key columns |
|---|---|
| 集金管理 | ニックネーム, 支払い状況(済/未), 確認日 |
| 立替返金管理 | 申請日, 立替者ニックネーム, 内容, 支払額, 新入生人数, 返金額(auto), 承認状況, 返金状況, 無効フラグ, 無効理由 |
| 経費記録 | 日付, 内容, 金額, 支払者, カテゴリ, 備考 |
| 設定 | 集金額(1人あたり)=4000, 返金上限(新入生1人あたり)=700, 新歓期間開始, 新歓期間終了 |

Sheet name variants are handled in GAS via `SHEET_CANDIDATES` arrays — update these if the sheet names change.

---

## Business Logic Rules

- **Collection amount:** ¥4,000 per member
- **Reimbursement cap:** `MIN(actual payment, freshman_count × ¥700)` per request
- **Settlement (surplus):** divide equally among paid members
- **Settlement (deficit):** reduce each reimbursement proportionally (proration)
- **Approval filter:** only `承認済` entries appear in the public JSON
- **Validity filter:** entries with `無効フラグ = TRUE` are excluded from all calculations and public JSON

---

## Pre-publish Checklist (condensed)

Before merging any change:
- [ ] `npm run build:css` run and `assets/styles.css` committed
- [ ] `npm test` passes
- [ ] GAS endpoint URL in `assets/config.js` is correct
- [ ] Mobile layout tested at 390px width
- [ ] Relevant `docs/acceptance-test-checklist.md` items verified
- [ ] Any spec/contract changes reflected in `docs/`

---

## Common Pitfalls

- **CSS not updating:** Always run `npm run build:css` after adding new Tailwind classes. Purging removes unused classes — new classes must appear in scanned files (`index.html`, `assets/**/*.js`).
- **Chart not rendering:** Charts only initialize when the Summary tab is active. Ensure `initCharts()` is called after the tab switch.
- **GAS 403/redirect:** A new GAS deployment needs "Execute as: Me, Who has access: Anyone". Re-deploy and update the URL in `config.js`.
- **Stale data:** Default polling is 60s. Force refresh via the reload button in the header; the button calls `fetchData()` directly.
- **Forbidden keys in JSON:** `validatePayloadShape()` throws if the payload contains keys from the blocklist. Always run `npm test` after GAS changes.
