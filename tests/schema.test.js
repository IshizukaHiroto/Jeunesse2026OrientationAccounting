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
    collection: [],
    expenses: [],
    reimbursements: [],
    summary: {}
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
