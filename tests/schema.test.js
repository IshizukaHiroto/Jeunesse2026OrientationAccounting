const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePayloadShape } = require("../src/calc");

test("validatePayloadShape passes expected payload", () => {
  const payload = {
    meta: {
      generatedAt: "2026-04-01T09:00:00+09:00",
      seasonYear: 2026,
      collectionAmountPerMember: 4000,
      refundCapPerFreshman: 700,
      pollingIntervalSec: 60
    },
    collection: [
      {
        nickname: "あおい",
        paymentStatus: "済",
        confirmedDate: "2026-04-01"
      }
    ],
    expenses: [
      {
        id: 2,
        date: "2026-04-01",
        category: "備品",
        description: "名札",
        amount: 3000
      }
    ],
    reimbursements: [
      {
        id: 3,
        nickname: "ひろと",
        description: "お菓子",
        paymentAmount: 1200,
        reimbursementAmount: 700,
        refundStatus: "未返金"
      }
    ],
    summary: {
      paidMembers: 1,
      unpaidMembers: 0,
      collectionTotal: 4000,
      expensesTotal: 3000,
      plannedReimbursementsTotal: 700,
      availableAfterExpenses: 1000,
      currentBalance: 300
    }
  };

  const errors = validatePayloadShape(payload);
  assert.equal(errors.length, 0);
});

test("validatePayloadShape rejects forbidden receipt fields", () => {
  const payload = {
    meta: {
      generatedAt: "2026-04-01T09:00:00+09:00",
      seasonYear: 2026,
      collectionAmountPerMember: 4000,
      refundCapPerFreshman: 700,
      pollingIntervalSec: 60
    },
    collection: [],
    expenses: [],
    reimbursements: [
      {
        id: 1,
        receiptUrl: "https://example.com/receipt.png"
      }
    ],
    summary: {}
  };

  const errors = validatePayloadShape(payload);
  assert.ok(errors.some((error) => error.includes("forbidden receipt field")));
});

test("validatePayloadShape rejects non-public keys on list items and summary", () => {
  const payload = {
    meta: {
      generatedAt: "2026-04-01T09:00:00+09:00",
      seasonYear: 2026,
      collectionAmountPerMember: 4000,
      refundCapPerFreshman: 700,
      pollingIntervalSec: 60
    },
    collection: [
      {
        nickname: "あおい",
        paymentStatus: "済",
        confirmedDate: "2026-04-01",
        note: "内部メモ"
      }
    ],
    expenses: [
      {
        id: 2,
        date: "2026-04-01",
        category: "備品",
        description: "名札",
        amount: 3000,
        payer: "内部"
      }
    ],
    reimbursements: [
      {
        id: 3,
        nickname: "ひろと",
        description: "お菓子",
        paymentAmount: 1200,
        reimbursementAmount: 700,
        refundStatus: "未返金",
        approvalStatus: "承認済"
      }
    ],
    summary: {
      paidMembers: 1,
      unpaidMembers: 0,
      collectionTotal: 4000,
      expensesTotal: 3000,
      plannedReimbursementsTotal: 700,
      availableAfterExpenses: 1000,
      currentBalance: 300,
      prorationRate: 0.5
    }
  };

  const errors = validatePayloadShape(payload);

  assert.ok(errors.some((error) => error.includes("collection[0] includes forbidden key: note")));
  assert.ok(errors.some((error) => error.includes("expenses[0] includes forbidden key: payer")));
  assert.ok(errors.some((error) => error.includes("reimbursements[0] includes forbidden key: approvalStatus")));
  assert.ok(errors.some((error) => error.includes("summary includes forbidden key: prorationRate")));
});
