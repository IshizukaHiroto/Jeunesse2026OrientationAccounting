const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeSummary,
  computeEqualRefundPlan,
  computeProrationPlan,
  computeBalanceComposition,
  filterValidReimbursements,
  sortByNickname
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

test("computeProrationPlan never exceeds plannedAmount when distributing remainder", () => {
  const summary = {
    collectionTotal: 101,
    expensesTotal: 0,
    availableAfterExpenses: 101,
    currentBalance: -1
  };

  const reimbursements = [
    { id: 1, nickname: "A", reimbursementAmount: 100, approvalStatus: "承認済", invalidFlag: "有効" },
    { id: 2, nickname: "B", reimbursementAmount: 1, approvalStatus: "承認済", invalidFlag: "有効" },
    { id: 3, nickname: "C", reimbursementAmount: 1, approvalStatus: "承認済", invalidFlag: "有効" }
  ];

  const plan = computeProrationPlan(summary, reimbursements);

  assert.equal(plan.reduce((sum, row) => sum + row.finalAmount, 0), 101);
  assert.ok(plan.every((row) => row.finalAmount <= row.plannedAmount));
  assert.ok(plan.every((row) => row.reduction >= 0));
  assert.deepEqual(
    plan.map((row) => row.finalAmount),
    [100, 1, 0]
  );
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

test("sortByNickname sorts rows by nickname in ascending order", () => {
  const rows = [
    { id: 1, nickname: "たろう" },
    { id: 2, nickname: "あいこ" },
    { id: 3, nickname: "さくら" }
  ];

  const sorted = sortByNickname(rows, "asc");

  assert.deepEqual(
    sorted.map((row) => row.id),
    [2, 3, 1]
  );
});

test("sortByNickname sorts rows by nickname in descending order", () => {
  const rows = [
    { id: 1, nickname: "たろう" },
    { id: 2, nickname: "あいこ" },
    { id: 3, nickname: "さくら" }
  ];

  const sorted = sortByNickname(rows, "desc");

  assert.deepEqual(
    sorted.map((row) => row.id),
    [1, 3, 2]
  );
});

test("sortByNickname places blank nicknames at the end", () => {
  const rows = [
    { id: 1, nickname: "" },
    { id: 2, nickname: "あいこ" },
    { id: 3 },
    { id: 4, nickname: "さくら" }
  ];

  const sorted = sortByNickname(rows, "asc");

  assert.deepEqual(
    sorted.map((row) => row.id),
    [2, 4, 1, 3]
  );
});

test("sortByNickname does not mutate original rows", () => {
  const rows = [
    { id: 1, nickname: "たろう" },
    { id: 2, nickname: "あいこ" }
  ];
  const before = rows.map((row) => row.id);

  const sorted = sortByNickname(rows, "asc");

  assert.deepEqual(rows.map((row) => row.id), before);
  assert.notEqual(sorted, rows);
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

test("computeBalanceComposition returns expected percentages in normal case", () => {
  const composition = computeBalanceComposition({
    collectionTotal: 100000,
    expensesTotal: 30000,
    plannedReimbursementsTotal: 40000
  });

  assert.equal(composition.baseAmount, 100000);
  assert.equal(composition.expensesInBase, 30000);
  assert.equal(composition.reimburseInBase, 40000);
  assert.equal(composition.balanceInBase, 30000);
  assert.equal(composition.shortageAmount, 0);
  assert.equal(composition.percentages.expenses, 30);
  assert.equal(composition.percentages.reimbursements, 40);
  assert.equal(composition.percentages.balance, 30);
});

test("computeBalanceComposition returns shortage in deficit case", () => {
  const composition = computeBalanceComposition({
    collectionTotal: 100000,
    expensesTotal: 60000,
    plannedReimbursementsTotal: 50000
  });

  assert.equal(composition.expensesInBase, 60000);
  assert.equal(composition.reimburseInBase, 40000);
  assert.equal(composition.balanceInBase, 0);
  assert.equal(composition.shortageAmount, 10000);
  assert.equal(composition.percentages.expenses, 60);
  assert.equal(composition.percentages.reimbursements, 40);
  assert.equal(composition.percentages.shortage, 10);
});

test("computeBalanceComposition handles zero base amount", () => {
  const composition = computeBalanceComposition({
    collectionTotal: 0,
    expensesTotal: 0,
    plannedReimbursementsTotal: 1400
  });

  assert.equal(composition.baseAmount, 0);
  assert.equal(composition.expensesInBase, 0);
  assert.equal(composition.reimburseInBase, 0);
  assert.equal(composition.balanceInBase, 0);
  assert.equal(composition.shortageAmount, 1400);
  assert.equal(composition.percentages.shortage, 100);
});
