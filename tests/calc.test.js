const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeSummary,
  computeEqualRefundPlan,
  computeProrationPlan,
  filterValidReimbursements
} = require("../src/calc");

test("computeSummary calculates totals with approved and valid reimbursements only", () => {
  const data = {
    meta: {
      collectionAmountPerMember: 4000
    },
    collection: [
      { nickname: "A", paymentStatus: "済" },
      { nickname: "B", paymentStatus: "済" },
      { nickname: "C", paymentStatus: "未" }
    ],
    expenses: [
      { amount: 2000 },
      { amount: 500 }
    ],
    reimbursements: [
      { nickname: "A", reimbursementAmount: 700, approvalStatus: "承認済", invalidFlag: "有効" },
      { nickname: "B", reimbursementAmount: 1000, approvalStatus: "未承認", invalidFlag: "有効" },
      { nickname: "C", reimbursementAmount: 400, approvalStatus: "承認済", invalidFlag: "無効" }
    ]
  };

  const summary = computeSummary(data);

  assert.equal(summary.paidMembers, 2);
  assert.equal(summary.collectionTotal, 8000);
  assert.equal(summary.expensesTotal, 2500);
  assert.equal(summary.plannedReimbursementsTotal, 700);
  assert.equal(summary.currentBalance, 4800);
});

test("computeEqualRefundPlan allocates remainder to last member", () => {
  const summary = {
    currentBalance: 1000
  };

  const plan = computeEqualRefundPlan(summary, ["A", "B", "C"]);

  assert.equal(plan.length, 3);
  assert.equal(plan[0].finalAmount, 333);
  assert.equal(plan[1].finalAmount, 333);
  assert.equal(plan[2].finalAmount, 334);
  assert.equal(plan.reduce((sum, row) => sum + row.finalAmount, 0), 1000);
});

test("computeProrationPlan allocates remainder to max planned reimbursement", () => {
  const summary = {
    collectionTotal: 40000,
    expensesTotal: 0,
    availableAfterExpenses: 40000,
    currentBalance: -10000
  };

  const reimbursements = [
    { id: 1, nickname: "A", reimbursementAmount: 20000, approvalStatus: "承認済", invalidFlag: "有効" },
    { id: 2, nickname: "B", reimbursementAmount: 15000, approvalStatus: "承認済", invalidFlag: "有効" },
    { id: 3, nickname: "C", reimbursementAmount: 15000, approvalStatus: "承認済", invalidFlag: "有効" }
  ];

  const plan = computeProrationPlan(summary, reimbursements);
  const totalFinal = plan.reduce((sum, row) => sum + row.finalAmount, 0);

  assert.equal(totalFinal, 40000);
  assert.equal(plan[0].finalAmount, 16000);
  assert.equal(plan[1].finalAmount, 12000);
  assert.equal(plan[2].finalAmount, 12000);
});

test("filterValidReimbursements keeps only approved and valid rows", () => {
  const rows = [
    { id: 1, approvalStatus: "承認済", invalidFlag: "有効", reimbursementAmount: 100 },
    { id: 2, approvalStatus: "未承認", invalidFlag: "有効", reimbursementAmount: 200 },
    { id: 3, approvalStatus: "承認済", invalidFlag: "無効", reimbursementAmount: 300 }
  ];

  const filtered = filterValidReimbursements(rows);

  assert.deepEqual(
    filtered.map((row) => row.id),
    [1]
  );
});

test("computeSummary clamps prorationRate at zero when available budget is negative", () => {
  const data = {
    meta: {
      collectionAmountPerMember: 4000
    },
    collection: [{ paymentStatus: "済" }],
    expenses: [{ amount: 6000 }],
    reimbursements: [{ reimbursementAmount: 1000, approvalStatus: "承認済", invalidFlag: "有効" }]
  };

  const summary = computeSummary(data);

  assert.equal(summary.availableAfterExpenses, -2000);
  assert.equal(summary.currentBalance, -3000);
  assert.equal(summary.prorationRate, 0);
});
