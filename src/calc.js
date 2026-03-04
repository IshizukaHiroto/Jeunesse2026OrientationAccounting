(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AccountingCalc = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (value === null || value === undefined) {
      return 0;
    }

    var numeric = String(value).replace(/[^0-9.-]/g, "");
    var parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalize(value) {
    return String(value || "").trim();
  }

  function isPaid(row) {
    return normalize(row.paymentStatus) === "済";
  }

  function isApprovedValid(row) {
    var approval = normalize(row.approvalStatus || row.approval);
    var invalidFlag = normalize(row.invalidFlag || row.validFlag || "有効");
    return approval === "承認済" && invalidFlag !== "無効";
  }

  function pickReimbursementAmount(row) {
    return toNumber(row.reimbursementAmount || row.refundAmount || row.amount);
  }

  function sumBy(rows, getter) {
    return rows.reduce(function (acc, row) {
      return acc + toNumber(getter(row));
    }, 0);
  }

  function normalizePaidMembers(paidMembers) {
    if (Array.isArray(paidMembers)) {
      return paidMembers.map(function (name, index) {
        return {
          index: index,
          nickname: normalize(name) || "メンバー" + String(index + 1)
        };
      });
    }

    var count = Math.max(0, Math.floor(toNumber(paidMembers)));
    var members = [];

    for (var i = 0; i < count; i += 1) {
      members.push({
        index: i,
        nickname: "メンバー" + String(i + 1)
      });
    }

    return members;
  }

  function filterValidReimbursements(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .filter(function (row) {
        if (row == null || typeof row !== "object") {
          return false;
        }

        if (row.approvalStatus === undefined && row.invalidFlag === undefined) {
          return true;
        }

        return isApprovedValid(row);
      })
      .map(function (row) {
        return Object.assign({}, row, {
          reimbursementAmount: pickReimbursementAmount(row)
        });
      });
  }

  function computeSummary(data) {
    var payload = data && typeof data === "object" ? data : {};
    var collection = Array.isArray(payload.collection) ? payload.collection : [];
    var expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
    var reimbursements = filterValidReimbursements(payload.reimbursements || []);

    var collectionAmountPerMember = toNumber(
      payload.meta && payload.meta.collectionAmountPerMember !== undefined
        ? payload.meta.collectionAmountPerMember
        : payload.summary && payload.summary.collectionAmountPerMember !== undefined
          ? payload.summary.collectionAmountPerMember
          : 4000
    );

    var paidMembers = collection.filter(isPaid);
    var paidMembersCount = paidMembers.length;
    var unpaidMembersCount = collection.length - paidMembersCount;

    var collectionTotal = paidMembersCount * collectionAmountPerMember;
    var expensesTotal = sumBy(expenses, function (expense) {
      return expense.amount;
    });

    var plannedReimbursementsTotal = sumBy(reimbursements, function (row) {
      return row.reimbursementAmount;
    });

    var currentBalance = collectionTotal - expensesTotal - plannedReimbursementsTotal;
    var availableAfterExpenses = collectionTotal - expensesTotal;

    var equalRefundBase = 0;
    var equalRefundRemainder = 0;

    if (currentBalance > 0 && paidMembersCount > 0) {
      equalRefundBase = Math.floor(currentBalance / paidMembersCount);
      equalRefundRemainder = currentBalance - equalRefundBase * paidMembersCount;
    }

    var prorationRate = null;
    if (currentBalance < 0 && plannedReimbursementsTotal > 0) {
      prorationRate = Math.max(0, availableAfterExpenses) / plannedReimbursementsTotal;
    }

    return {
      collectionAmountPerMember: collectionAmountPerMember,
      paidMembers: paidMembersCount,
      unpaidMembers: unpaidMembersCount,
      collectionTotal: collectionTotal,
      expensesTotal: expensesTotal,
      plannedReimbursementsTotal: plannedReimbursementsTotal,
      availableAfterExpenses: availableAfterExpenses,
      currentBalance: currentBalance,
      equalRefundBase: equalRefundBase,
      equalRefundRemainder: equalRefundRemainder,
      prorationRate: prorationRate
    };
  }

  function computeEqualRefundPlan(summary, paidMembers) {
    var source = summary && typeof summary === "object" ? summary : {};
    var currentBalance = toNumber(source.currentBalance);
    var members = normalizePaidMembers(paidMembers);

    if (currentBalance <= 0 || members.length === 0) {
      return [];
    }

    var baseAmount = Math.floor(currentBalance / members.length);
    var remainder = currentBalance - baseAmount * members.length;

    return members.map(function (member, index) {
      var finalAmount = baseAmount;
      var adjustment = 0;

      if (index === members.length - 1) {
        finalAmount += remainder;
        adjustment = remainder;
      }

      return {
        nickname: member.nickname,
        baseAmount: baseAmount,
        adjustment: adjustment,
        finalAmount: finalAmount
      };
    });
  }

  function computeProrationPlan(summary, reimbursements) {
    var source = summary && typeof summary === "object" ? summary : {};
    var rows = filterValidReimbursements(reimbursements || []);

    if (rows.length === 0) {
      return [];
    }

    var plannedTotal = rows.reduce(function (acc, row) {
      return acc + pickReimbursementAmount(row);
    }, 0);

    if (plannedTotal <= 0) {
      return [];
    }

    var availableAfterExpenses = toNumber(
      source.availableAfterExpenses !== undefined
        ? source.availableAfterExpenses
        : toNumber(source.collectionTotal) - toNumber(source.expensesTotal)
    );

    if (availableAfterExpenses <= 0) {
      return rows.map(function (row) {
        return {
          id: row.id,
          nickname: normalize(row.nickname) || "不明",
          plannedAmount: pickReimbursementAmount(row),
          baseAmount: 0,
          adjustment: 0,
          finalAmount: 0,
          reduction: pickReimbursementAmount(row)
        };
      });
    }

    if (availableAfterExpenses >= plannedTotal) {
      return rows.map(function (row) {
        var planned = pickReimbursementAmount(row);
        return {
          id: row.id,
          nickname: normalize(row.nickname) || "不明",
          plannedAmount: planned,
          baseAmount: planned,
          adjustment: 0,
          finalAmount: planned,
          reduction: 0
        };
      });
    }

    var distributed = 0;
    var maxIndex = 0;

    var plan = rows.map(function (row, index) {
      var plannedAmount = pickReimbursementAmount(row);
      var baseAmount = Math.floor((plannedAmount * availableAfterExpenses) / plannedTotal);
      distributed += baseAmount;

      if (plannedAmount > pickReimbursementAmount(rows[maxIndex])) {
        maxIndex = index;
      }

      return {
        id: row.id,
        nickname: normalize(row.nickname) || "不明",
        plannedAmount: plannedAmount,
        baseAmount: baseAmount,
        adjustment: 0,
        finalAmount: baseAmount,
        reduction: plannedAmount - baseAmount
      };
    });

    var remainder = availableAfterExpenses - distributed;

    if (remainder > 0) {
      plan[maxIndex].adjustment = remainder;
      plan[maxIndex].finalAmount += remainder;
      plan[maxIndex].reduction = plan[maxIndex].plannedAmount - plan[maxIndex].finalAmount;
    }

    return plan;
  }

  function validatePayloadShape(payload) {
    var errors = [];

    if (!payload || typeof payload !== "object") {
      return ["payload must be an object"];
    }

    var requiredRoot = ["meta", "collection", "expenses", "reimbursements", "summary"];
    requiredRoot.forEach(function (key) {
      if (!(key in payload)) {
        errors.push("missing root key: " + key);
      }
    });

    var meta = payload.meta || {};
    ["generatedAt", "seasonYear", "collectionAmountPerMember", "refundCapPerFreshman", "pollingIntervalSec"].forEach(function (key) {
      if (!(key in meta)) {
        errors.push("missing meta key: " + key);
      }
    });

    if (!Array.isArray(payload.collection)) {
      errors.push("collection must be an array");
    }

    if (!Array.isArray(payload.expenses)) {
      errors.push("expenses must be an array");
    }

    if (!Array.isArray(payload.reimbursements)) {
      errors.push("reimbursements must be an array");
    }

    if (Array.isArray(payload.reimbursements)) {
      payload.reimbursements.forEach(function (item, index) {
        if (item && typeof item === "object") {
          if ("receiptUrl" in item || "receiptURL" in item || "receipt" in item) {
            errors.push("reimbursements[" + index + "] includes forbidden receipt field");
          }
        }
      });
    }

    return errors;
  }

  return {
    toNumber: toNumber,
    filterValidReimbursements: filterValidReimbursements,
    computeSummary: computeSummary,
    computeEqualRefundPlan: computeEqualRefundPlan,
    computeProrationPlan: computeProrationPlan,
    validatePayloadShape: validatePayloadShape
  };
});
