var SHEET_CANDIDATES = {
  collection: ["集金管理", "Sheet1"],
  reimbursements: ["立替返金管理", "立替・返金管理", "立替・返金管理", "Sheet2"],
  expenses: ["経費記録", "Sheet3"],
  settings: ["設定", "Sheet4"]
};

function doGet() {
  try {
    var payload = buildPayload_();
    return jsonResponse_(payload);
  } catch (error) {
    return jsonResponse_({
      error: true,
      message: error && error.message ? error.message : "Unexpected error",
      generatedAt: new Date().toISOString()
    });
  }
}

function buildPayload_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsSheet = getSheetByCandidates_(ss, SHEET_CANDIDATES.settings);
  var collectionSheet = getSheetByCandidates_(ss, SHEET_CANDIDATES.collection);
  var reimbursementsSheet = getSheetByCandidates_(ss, SHEET_CANDIDATES.reimbursements);
  var expensesSheet = getSheetByCandidates_(ss, SHEET_CANDIDATES.expenses);

  var config = readSettings_(settingsSheet);
  var collection = readCollection_(collectionSheet, config.collectionAmountPerMember);
  var reimbursementsAll = readReimbursements_(reimbursementsSheet, config.refundCapPerFreshman);
  var reimbursements = reimbursementsAll.filter(function (row) {
    return row.approvalStatus === "承認済" && row.invalidFlag !== "無効";
  });
  var expenses = readExpenses_(expensesSheet);
  var summary = computeSummary_(collection, expenses, reimbursements, config.collectionAmountPerMember);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      seasonYear: 2026,
      collectionAmountPerMember: config.collectionAmountPerMember,
      refundCapPerFreshman: config.refundCapPerFreshman,
      pollingIntervalSec: 60,
      seasonStart: config.seasonStart,
      seasonEnd: config.seasonEnd
    },
    collection: collection,
    expenses: expenses,
    reimbursements: reimbursements,
    summary: summary
  };
}

function readSettings_(sheet) {
  var values = sheet.getDataRange().getValues();
  var mapping = {};

  for (var i = 0; i < values.length; i += 1) {
    var key = String(values[i][0] || "").trim();
    var value = values[i][1];
    if (!key || key === "項目" || key.toLowerCase() === "key") {
      continue;
    }
    mapping[key] = value;
  }

  return {
    collectionAmountPerMember: toYen_(pickByLabel_(mapping, ["集金額（1人あたり）", "集金額", "徴収額"]) || 4000),
    refundCapPerFreshman: toYen_(pickByLabel_(mapping, ["返金上限（新入生1人あたり）", "返金上限"]) || 700),
    seasonStart: normalizeDate_(pickByLabel_(mapping, ["新歓期間（開始）", "新歓開始", "期間開始"])),
    seasonEnd: normalizeDate_(pickByLabel_(mapping, ["新歓期間（終了）", "新歓終了", "期間終了"]))
  };
}

function readCollection_(sheet, collectionAmountPerMember) {
  var rows = toRows_(sheet);
  return rows
    .filter(function (row) {
      return text_(row["ニックネーム"]) !== "";
    })
    .map(function (row) {
      var paymentStatus = text_(row["支払い状況"]) || "未";
      return {
        nickname: text_(row["ニックネーム"]),
        paymentStatus: paymentStatus,
        collectedAmount: paymentStatus === "済" ? collectionAmountPerMember : 0,
        confirmedDate: normalizeDate_(row["確認日"]),
        note: text_(row["備考"])
      };
    });
}

function readReimbursements_(sheet, refundCapPerFreshman) {
  var rows = toRows_(sheet);
  return rows
    .map(function (row, index) {
      var paymentAmount = toYen_(row["支払い金額"]);
      var freshmanCount = toYen_(row["新入生の人数"]);
      var computedCapAmount = Math.min(paymentAmount, freshmanCount * refundCapPerFreshman);
      var reimbursementAmount = toYen_(row["返金額"]);

      return {
        id: index + 2,
        appliedDate: normalizeDate_(row["申請日"]),
        nickname: text_(row["立替者ニックネーム"]),
        description: text_(row["内容"]),
        paymentAmount: paymentAmount,
        freshmanCount: freshmanCount,
        reimbursementAmount: reimbursementAmount > 0 ? reimbursementAmount : computedCapAmount,
        approvalStatus: text_(row["承認状況"]) || "未承認",
        refundStatus: text_(row["返金状況"]) || "未返金",
        invalidFlag: text_(row["無効フラグ"]) || "有効",
        invalidReason: text_(row["無効理由"])
      };
    })
    .filter(function (row) {
      return row.nickname !== "" || row.description !== "" || row.paymentAmount > 0;
    });
}

function readExpenses_(sheet) {
  var rows = toRows_(sheet);
  return rows
    .map(function (row, index) {
      return {
        id: index + 2,
        date: normalizeDate_(row["日付"]),
        description: text_(row["内容"]),
        amount: toYen_(row["金額"]),
        payer: text_(row["支払い者"]),
        category: text_(row["カテゴリ"]),
        note: text_(row["備考"])
      };
    })
    .filter(function (row) {
      return row.description !== "" || row.amount > 0;
    });
}

function computeSummary_(collection, expenses, reimbursements, collectionAmountPerMember) {
  var paidMembers = collection.filter(function (row) {
    return row.paymentStatus === "済";
  }).length;

  var unpaidMembers = collection.length - paidMembers;
  var collectionTotal = paidMembers * collectionAmountPerMember;
  var expensesTotal = expenses.reduce(function (sum, row) {
    return sum + toYen_(row.amount);
  }, 0);

  var plannedReimbursementsTotal = reimbursements.reduce(function (sum, row) {
    return sum + toYen_(row.reimbursementAmount);
  }, 0);

  var availableAfterExpenses = collectionTotal - expensesTotal;
  var currentBalance = availableAfterExpenses - plannedReimbursementsTotal;

  var equalRefundBase = 0;
  var equalRefundRemainder = 0;
  if (currentBalance > 0 && paidMembers > 0) {
    equalRefundBase = Math.floor(currentBalance / paidMembers);
    equalRefundRemainder = currentBalance - equalRefundBase * paidMembers;
  }

  var prorationRate = null;
  if (currentBalance < 0 && plannedReimbursementsTotal > 0) {
    prorationRate = availableAfterExpenses / plannedReimbursementsTotal;
  }

  return {
    paidMembers: paidMembers,
    unpaidMembers: unpaidMembers,
    collectionAmountPerMember: collectionAmountPerMember,
    collectionTotal: collectionTotal,
    expensesTotal: expensesTotal,
    plannedReimbursementsTotal: plannedReimbursementsTotal,
    availableAfterExpenses: availableAfterExpenses,
    currentBalance: currentBalance,
    equalRefundBase: equalRefundBase,
    equalRefundRemainder: equalRefundRemainder,
    prorationRate: prorationRate,
    balanceState: currentBalance > 0 ? "plus" : currentBalance < 0 ? "minus" : "zero"
  };
}

function toRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return [];
  }

  var headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  return values.slice(1).map(function (row) {
    var mapped = {};
    headers.forEach(function (header, index) {
      mapped[header] = row[index];
    });
    return mapped;
  });
}

function pickByLabel_(map, labels) {
  for (var i = 0; i < labels.length; i += 1) {
    if (labels[i] in map) {
      return map[labels[i]];
    }
  }
  return null;
}

function toYen_(value) {
  if (typeof value === "number" && isFinite(value)) {
    return Math.floor(value);
  }

  if (value === null || value === undefined) {
    return 0;
  }

  var normalized = String(value).replace(/[^0-9.-]/g, "");
  var parsed = Number(normalized);
  return isFinite(parsed) ? Math.floor(parsed) : 0;
}

function text_(value) {
  return String(value || "").trim();
}

function normalizeDate_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return text_(value);
}

function getSheetByCandidates_(ss, candidates) {
  for (var i = 0; i < candidates.length; i += 1) {
    var sheet = ss.getSheetByName(candidates[i]);
    if (sheet) {
      return sheet;
    }
  }

  throw new Error("Required sheet not found: " + candidates.join(", "));
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
