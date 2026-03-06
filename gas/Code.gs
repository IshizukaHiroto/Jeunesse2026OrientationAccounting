var SHEET_CANDIDATES = {
  collection: ["集金管理", "Sheet1"],
  reimbursements: ["立替返金管理", "立替・返金管理", "Sheet2"],
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
  var reimbursementsSheet = getReimbursementsSheet_(ss);
  var expensesSheet = getSheetByCandidates_(ss, SHEET_CANDIDATES.expenses);

  var config = readSettings_(settingsSheet);
  var collection = readCollection_(collectionSheet);
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
    collection: collection.map(toPublicCollectionRow_),
    expenses: expenses.map(toPublicExpenseRow_),
    reimbursements: reimbursements.map(toPublicReimbursementRow_),
    summary: toPublicSummary_(summary)
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

function readCollection_(sheet) {
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
        confirmedDate: normalizeDate_(row["確認日"])
      };
    });
}

function readReimbursements_(sheet, refundCapPerFreshman) {
  var rows = toRows_(sheet);
  return rows
    .map(function (row, index) {
      var nickname = getTextByHeaderCandidates_(row, [
        "立替者ニックネーム",
        "立替者(ニックネーム)",
        "立替者（ニックネーム）",
        "申請者名",
        "申請者名(上記に名前がない場合)",
        "申請者名（上記に名前がない場合）"
      ]);
      var description = getTextByHeaderCandidates_(row, ["内容", "内容（記述）", "内容(記述)"]);
      var paymentAmount = Math.max(0, toYen_(getByHeaderCandidates_(row, ["支払い金額", "立替金額の合計(数字のみ記載)"])));
      var freshmanCount = Math.max(0, toYen_(getByHeaderCandidates_(row, ["新入生の人数", "立て替えた新入生の合計人数"])));
      var computedCapAmount = Math.max(0, Math.min(paymentAmount, freshmanCount * refundCapPerFreshman));
      var reimbursementAmount = Math.max(0, toYen_(getByHeaderCandidates_(row, ["返金額"])));
      var normalizedReimbursementAmount = reimbursementAmount > 0 ? reimbursementAmount : computedCapAmount;

      return {
        id: index + 2,
        nickname: nickname,
        description: description,
        paymentAmount: paymentAmount,
        reimbursementAmount: Math.min(normalizedReimbursementAmount, computedCapAmount),
        approvalStatus: getTextByHeaderCandidates_(row, ["承認状況"]) || "未承認",
        refundStatus: getTextByHeaderCandidates_(row, ["返金状況"]) || "未返金",
        invalidFlag: getTextByHeaderCandidates_(row, ["無効フラグ"]) || "有効"
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
        category: text_(row["カテゴリ"])
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
    prorationRate = Math.max(0, availableAfterExpenses) / plannedReimbursementsTotal;
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

function toPublicCollectionRow_(row) {
  return {
    nickname: row.nickname,
    paymentStatus: row.paymentStatus,
    confirmedDate: row.confirmedDate
  };
}

function toPublicExpenseRow_(row) {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount
  };
}

function toPublicReimbursementRow_(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    description: row.description,
    paymentAmount: row.paymentAmount,
    reimbursementAmount: row.reimbursementAmount,
    refundStatus: row.refundStatus
  };
}

function toPublicSummary_(summary) {
  return {
    paidMembers: summary.paidMembers,
    unpaidMembers: summary.unpaidMembers,
    collectionTotal: summary.collectionTotal,
    expensesTotal: summary.expensesTotal,
    plannedReimbursementsTotal: summary.plannedReimbursementsTotal,
    availableAfterExpenses: summary.availableAfterExpenses,
    currentBalance: summary.currentBalance
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

function normalizeHeader_(header) {
  return text_(header)
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[ 　]/g, "");
}

function getByHeaderCandidates_(row, candidates) {
  if (!row || typeof row !== "object") {
    return "";
  }

  var keys = Object.keys(row);
  var normalizedKeyMap = {};

  keys.forEach(function (key) {
    normalizedKeyMap[normalizeHeader_(key)] = key;
  });

  for (var i = 0; i < candidates.length; i += 1) {
    var candidate = candidates[i];
    if (candidate in row) {
      return row[candidate];
    }

    var normalizedCandidate = normalizeHeader_(candidate);
    if (normalizedCandidate in normalizedKeyMap) {
      return row[normalizedKeyMap[normalizedCandidate]];
    }
  }

  return "";
}

function getTextByHeaderCandidates_(row, candidates) {
  for (var i = 0; i < candidates.length; i += 1) {
    var value = text_(getByHeaderCandidates_(row, [candidates[i]]));
    if (value !== "") {
      return value;
    }
  }

  return "";
}

function normalizeDate_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  if (typeof value === "number" && isFinite(value)) {
    var dateFromNumber = normalizeDateSerial_(value);
    if (dateFromNumber !== "") {
      return dateFromNumber;
    }
  }

  var textValue = text_(value);
  if (textValue === "") {
    return "";
  }

  if (/^-?\d+(\.\d+)?$/.test(textValue)) {
    var numericValue = Number(textValue);
    if (isFinite(numericValue)) {
      var dateFromTextNumber = normalizeDateSerial_(numericValue);
      if (dateFromTextNumber !== "") {
        return dateFromTextNumber;
      }
    }
  }

  return textValue;
}

function normalizeDateSerial_(serial) {
  var normalizedSerial = Math.floor(Number(serial));
  if (!isFinite(normalizedSerial)) {
    return "";
  }

  // Guard against non-date IDs while still covering practical sheet date ranges.
  if (normalizedSerial < 20000 || normalizedSerial > 80000) {
    return "";
  }

  var serialEpochUtc = Date.UTC(1899, 11, 30);
  var millis = serialEpochUtc + normalizedSerial * 24 * 60 * 60 * 1000;
  var date = new Date(millis);
  if (!isFinite(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getReimbursementsSheet_(ss) {
  var exactMatch = findSheetByCandidates_(ss, SHEET_CANDIDATES.reimbursements);
  if (exactMatch) {
    return exactMatch;
  }

  var fallbackMatches = findSheetsByNamePatterns_(ss, [
    /^フォームの回答\s*\d+$/,
    /^Form Responses \d+$/
  ]);

  if (fallbackMatches.length === 1) {
    return fallbackMatches[0];
  }

  if (fallbackMatches.length > 1) {
    throw new Error("Multiple reimbursement sheet candidates found. Rename the target sheet to 立替返金管理.");
  }

  throw new Error("Required sheet not found: " + SHEET_CANDIDATES.reimbursements.join(", "));
}

function findSheetByCandidates_(ss, candidates) {
  for (var i = 0; i < candidates.length; i += 1) {
    var sheet = ss.getSheetByName(candidates[i]);
    if (sheet) {
      return sheet;
    }
  }

  return null;
}

function findSheetsByNamePatterns_(ss, patterns) {
  var sheets = ss.getSheets();
  var matches = [];

  for (var i = 0; i < sheets.length; i += 1) {
    var name = sheets[i].getName();
    for (var j = 0; j < patterns.length; j += 1) {
      if (patterns[j].test(name)) {
        matches.push(sheets[i]);
        break;
      }
    }
  }

  return matches;
}

function getSheetByCandidates_(ss, candidates) {
  var sheet = findSheetByCandidates_(ss, candidates);
  if (sheet) {
    return sheet;
  }

  throw new Error("Required sheet not found: " + candidates.join(", "));
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
