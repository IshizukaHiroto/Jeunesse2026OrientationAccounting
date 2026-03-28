const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeSummary,
  computeEqualRefundPlan,
  computeProrationPlan,
  computeBalanceComposition,
  buildDashboardOverview,
  createOutflowRows,
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
  assert.equal(composition.expensesTotal, 30000);
  assert.equal(composition.plannedReimbursementsTotal, 40000);
  assert.equal(composition.expensesInBase, 30000);
  assert.equal(composition.reimburseInBase, 40000);
  assert.equal(composition.outflowTotal, 70000);
  assert.equal(composition.outflowInBase, 70000);
  assert.equal(composition.balanceInBase, 30000);
  assert.equal(composition.shortageAmount, 0);
  assert.equal(composition.percentages.expenses, 30);
  assert.equal(composition.percentages.reimbursements, 40);
  assert.equal(composition.percentages.outflow, 70);
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
  assert.equal(composition.outflowTotal, 110000);
  assert.equal(composition.outflowInBase, 100000);
  assert.equal(composition.balanceInBase, 0);
  assert.equal(composition.shortageAmount, 10000);
  assert.equal(composition.percentages.expenses, 60);
  assert.equal(composition.percentages.reimbursements, 40);
  assert.equal(composition.percentages.outflow, 100);
  assert.equal(composition.percentages.shortage, 10);
});

test("computeBalanceComposition handles zero base amount", () => {
  const composition = computeBalanceComposition({
    collectionTotal: 0,
    expensesTotal: 0,
    plannedReimbursementsTotal: 1400
  });

  assert.equal(composition.baseAmount, 0);
  assert.equal(composition.outflowTotal, 1400);
  assert.equal(composition.outflowInBase, 0);
  assert.equal(composition.expensesInBase, 0);
  assert.equal(composition.reimburseInBase, 0);
  assert.equal(composition.balanceInBase, 0);
  assert.equal(composition.shortageAmount, 1400);
  assert.equal(composition.percentages.outflow, 0);
  assert.equal(composition.percentages.shortage, 100);
});

test("buildDashboardOverview derives target and progress values from public payload fields", () => {
  const overview = buildDashboardOverview({
    meta: {
      collectionAmountPerMember: 4000
    },
    collection: [
      { nickname: "A", paymentStatus: "済" },
      { nickname: "B", paymentStatus: "済" },
      { nickname: "C", paymentStatus: "未" }
    ],
    expenses: [
      { category: "備品", amount: 3200 },
      { category: "飲食", amount: 1800 },
      { category: "飲食", amount: 1200 }
    ],
    reimbursements: [
      { reimbursementAmount: 700, refundStatus: "未返金" },
      { reimbursementAmount: 500, refundStatus: "返金済" }
    ],
    summary: {
      paidMembers: 2,
      unpaidMembers: 1,
      collectionTotal: 8000,
      expensesTotal: 6200,
      plannedReimbursementsTotal: 1200,
      availableAfterExpenses: 1800,
      currentBalance: 600
    }
  });

  assert.equal(overview.totalMembers, 3);
  assert.equal(overview.targetCollection, 12000);
  assert.ok(Math.abs(overview.collectionRate - 8000 / 120) < 1e-9);
  assert.ok(Math.abs(overview.paymentRate - 200 / 3) < 1e-9);
  assert.equal(overview.unpaidTargetAmount, 4000);
  assert.equal(overview.spentInTarget, 6200);
  assert.equal(overview.remainingTargetAmount, 1800);
  assert.equal(overview.expenseCategoryCount, 2);
  assert.equal(overview.pendingRefundCount, 1);
  assert.equal(overview.pendingRefundTotal, 700);
});

test("createOutflowRows normalizes expenses and reimbursements without exposing private fields", () => {
  const rows = createOutflowRows({
    expenses: [
      { id: 10, date: "2026-04-01", category: "備品", description: "名札", amount: 3200, payer: "内部" }
    ],
    reimbursements: [
      { id: 20, nickname: "あおい", description: "ランチ会", reimbursementAmount: 1400, refundStatus: "未返金", approvalStatus: "承認済" }
    ]
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: 10,
    kind: "expense",
    nickname: "--",
    typeLabel: "経費",
    description: "名札",
    amount: 3200,
    dateLabel: "2026-04-01",
    statusLabel: "-",
    statusTone: "neutral"
  });
  assert.deepEqual(rows[1], {
    id: 20,
    kind: "reimbursement",
    nickname: "あおい",
    typeLabel: "返金予定",
    description: "ランチ会",
    amount: 1400,
    dateLabel: "--",
    statusLabel: "未返金",
    statusTone: "pending"
  });
});
