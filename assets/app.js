(function () {
  "use strict";

  var LIST_STEP = 5;
  var config = window.APP_CONFIG || {};
  var calc = window.AccountingCalc;

  if (!calc) {
    throw new Error("AccountingCalc is not available. Make sure src/calc.js is loaded.");
  }

  var state = {
    latestPayload: null,
    isRefreshing: false,
    chart: null,
    limits: {
      collection: LIST_STEP,
      expenses: LIST_STEP,
      reimbursements: LIST_STEP
    }
  };

  var dom = {
    refreshButton: document.getElementById("manual-refresh-btn"),
    syncChip: document.getElementById("sync-chip"),
    updatedAt: document.getElementById("updated-at"),
    syncBanner: document.getElementById("sync-banner"),
    metricCollection: document.getElementById("metric-collection"),
    metricOutflow: document.getElementById("metric-outflow"),
    metricBalance: document.getElementById("metric-balance"),
    metricPaidInfo: document.getElementById("metric-paid-info"),
    metricOutflowInfo: document.getElementById("metric-outflow-info"),
    metricBalanceInfo: document.getElementById("metric-balance-info"),
    settlementTitle: document.getElementById("settlement-title"),
    settlementBody: document.getElementById("settlement-body"),
    settlementFootnote: document.getElementById("settlement-footnote"),
    collectionList: document.getElementById("collection-list"),
    expensesList: document.getElementById("expenses-list"),
    reimbursementsList: document.getElementById("reimbursements-list"),
    collectionMoreButton: document.getElementById("collection-more-btn"),
    expensesMoreButton: document.getElementById("expenses-more-btn"),
    reimbursementsMoreButton: document.getElementById("reimbursements-more-btn"),
    collectionChart: document.getElementById("collection-chart")
  };

  attachEvents();
  refreshData({ source: "initial" });
  window.setInterval(function () {
    refreshData({ source: "polling" });
  }, normalizeNumber(config.POLLING_MS, 60000));

  function attachEvents() {
    dom.refreshButton.addEventListener("click", function () {
      refreshData({ source: "manual", force: true });
    });

    dom.collectionMoreButton.addEventListener("click", function () {
      toggleListLimit("collection", state.latestPayload ? state.latestPayload.collection.length : 0);
      renderCollectionList((state.latestPayload && state.latestPayload.collection) || []);
    });

    dom.expensesMoreButton.addEventListener("click", function () {
      toggleListLimit("expenses", state.latestPayload ? state.latestPayload.expenses.length : 0);
      renderExpensesList((state.latestPayload && state.latestPayload.expenses) || []);
    });

    dom.reimbursementsMoreButton.addEventListener("click", function () {
      toggleListLimit("reimbursements", state.latestPayload ? state.latestPayload.reimbursements.length : 0);
      renderReimbursementsList((state.latestPayload && state.latestPayload.reimbursements) || []);
    });
  }

  async function refreshData(options) {
    var source = options && options.source ? options.source : "unknown";
    var force = Boolean(options && options.force);

    if (state.isRefreshing && !force) {
      return;
    }

    state.isRefreshing = true;
    setLoading(true);

    try {
      var payload = await fetchJsonWithTimeout(
        config.GAS_ENDPOINT,
        normalizeNumber(config.REQUEST_TIMEOUT_MS, 12000)
      );

      if (payload && payload.error) {
        throw new Error(payload.message || "GAS response included an error flag.");
      }

      var schemaErrors = calc.validatePayloadShape(payload);
      if (schemaErrors.length > 0) {
        throw new Error("JSON schema error: " + schemaErrors.join(" | "));
      }

      state.latestPayload = payload;
      render(payload);
      setSyncState("ok", source === "manual" ? "手動更新が完了しました。" : "最新データを表示しています。");
    } catch (error) {
      if (state.latestPayload) {
        render(state.latestPayload);
        setSyncState("warn", "最新取得に失敗したため、前回成功データを表示中です。");
      } else {
        setSyncState("warn", "初回データ取得に失敗しました。GAS URLと公開設定を確認してください。");
        renderEmpty();
      }
      console.error(error);
    } finally {
      setLoading(false);
      state.isRefreshing = false;
    }
  }

  function render(payload) {
    var summary = payload.summary || calc.computeSummary(payload);
    var collection = Array.isArray(payload.collection) ? payload.collection : [];
    var expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
    var reimbursements = Array.isArray(payload.reimbursements) ? payload.reimbursements : [];

    dom.updatedAt.textContent = formatDateTime(payload.meta && payload.meta.generatedAt);

    dom.metricCollection.textContent = formatYen(summary.collectionTotal);
    dom.metricOutflow.textContent = formatYen(summary.expensesTotal + summary.plannedReimbursementsTotal);
    dom.metricBalance.textContent = formatYen(summary.currentBalance);
    dom.metricPaidInfo.textContent = "済 " + summary.paidMembers + "名 / 未 " + summary.unpaidMembers + "名";
    dom.metricOutflowInfo.textContent =
      "経費 " + formatYen(summary.expensesTotal) + " / 返金予定 " + formatYen(summary.plannedReimbursementsTotal);

    updateBalanceInfo(summary);
    renderCollectionList(collection);
    renderExpensesList(expenses);
    renderReimbursementsList(reimbursements);
    renderCollectionChart(summary.paidMembers, summary.unpaidMembers);
  }

  function renderEmpty() {
    dom.updatedAt.textContent = "--";
    dom.metricCollection.textContent = formatYen(0);
    dom.metricOutflow.textContent = formatYen(0);
    dom.metricBalance.textContent = formatYen(0);
    dom.metricPaidInfo.textContent = "済 0名 / 未 0名";
    dom.metricOutflowInfo.textContent = "経費 ¥0 / 返金予定 ¥0";
    dom.metricBalanceInfo.textContent = "表示データがありません。";
    dom.collectionList.innerHTML = '<p class="line-sub">表示データがありません。</p>';
    dom.expensesList.innerHTML = '<p class="line-sub">表示データがありません。</p>';
    dom.reimbursementsList.innerHTML = '<p class="line-sub">表示データがありません。</p>';
    renderCollectionChart(0, 0);
  }

  function renderCollectionList(rows) {
    renderList({
      rows: rows,
      limitKey: "collection",
      container: dom.collectionList,
      button: dom.collectionMoreButton,
      emptyMessage: "集金データはまだありません。",
      renderRow: function (row) {
        var statusLabel = row.paymentStatus === "済" ? "支払い済" : "未払い";
        var statusClass = row.paymentStatus === "済" ? "status-chip-ok" : "status-chip-warn";
        return (
          '<article class="line-item">' +
          '<div class="flex items-start justify-between gap-3">' +
          '<div><p class="line-title">' +
          escapeHtml(row.nickname || "名前未設定") +
          "</p>" +
          '<p class="line-sub">確認日: ' +
          escapeHtml(row.confirmedDate || "--") +
          "</p></div>" +
          '<span class="' +
          statusClass +
          '">' +
          statusLabel +
          "</span></div></article>"
        );
      }
    });
  }

  function renderExpensesList(rows) {
    renderList({
      rows: rows,
      limitKey: "expenses",
      container: dom.expensesList,
      button: dom.expensesMoreButton,
      emptyMessage: "経費データはまだありません。",
      renderRow: function (row) {
        var detailParts = [];
        detailParts.push(row.date || "日付未入力");
        if (row.category) {
          detailParts.push(row.category);
        }

        return (
          '<article class="line-item">' +
          '<div class="flex items-start justify-between gap-3">' +
          '<div><p class="line-title">' +
          escapeHtml(row.description || "内容未入力") +
          "</p>" +
          '<p class="line-sub">' +
          escapeHtml(detailParts.join(" / ")) +
          "</p></div>" +
          '<p class="text-sm font-bold text-court-900">' +
          formatYen(row.amount) +
          "</p></div></article>"
        );
      }
    });
  }

  function renderReimbursementsList(rows) {
    renderList({
      rows: rows,
      limitKey: "reimbursements",
      container: dom.reimbursementsList,
      button: dom.reimbursementsMoreButton,
      emptyMessage: "対象の立替データはまだありません。",
      renderRow: function (row) {
        var refundStatus = row.refundStatus === "返金済" ? "返金済" : "未返金";
        var refundChipClass = row.refundStatus === "返金済" ? "status-chip-ok" : "status-chip-warn";

        return (
          '<article class="line-item">' +
          '<div class="flex items-start justify-between gap-3">' +
          '<div><p class="line-title">' +
          escapeHtml(row.nickname || "名前未設定") +
          " / " +
          escapeHtml(row.description || "内容未入力") +
          "</p>" +
          '<p class="line-sub">支払: ' +
          formatYen(row.paymentAmount) +
          " / 返金予定: " +
          formatYen(row.reimbursementAmount) +
          "</p></div>" +
          '<span class="' +
          refundChipClass +
          '">' +
          refundStatus +
          "</span></div></article>"
        );
      }
    });
  }

  function renderList(params) {
    var rows = params.rows || [];
    var limitKey = params.limitKey;
    var limit = state.limits[limitKey];

    if (rows.length === 0) {
      params.container.innerHTML = '<p class="line-sub">' + escapeHtml(params.emptyMessage) + "</p>";
      params.button.classList.add("hidden");
      return;
    }

    var visibleRows = rows.slice(0, limit);
    params.container.innerHTML = visibleRows.map(params.renderRow).join("");

    if (rows.length > LIST_STEP) {
      params.button.classList.remove("hidden");
      params.button.textContent =
        limit < rows.length ? "もっと見る（残り" + (rows.length - limit) + "件）" : "折りたたむ";
    } else {
      params.button.classList.add("hidden");
    }
  }

  function toggleListLimit(key, totalRows) {
    if (state.limits[key] < totalRows) {
      state.limits[key] = Math.min(totalRows, state.limits[key] + LIST_STEP);
      return;
    }
    state.limits[key] = LIST_STEP;
  }

  function updateBalanceInfo(summary) {
    var balance = normalizeNumber(summary.currentBalance, 0);
    dom.metricBalance.classList.remove("text-court-700", "text-clay-700", "text-ink-900");

    if (balance > 0) {
      dom.metricBalance.classList.add("text-court-700");
      dom.metricBalanceInfo.textContent =
        "1人あたりの返金目安: " + formatYen(summary.equalRefundBase) + "（余り " + formatYen(summary.equalRefundRemainder) + " は最後に調整）";

      dom.settlementTitle.textContent = "お金が余っています。みんなに同じ金額を返します。";
      dom.settlementBody.textContent =
        "集金した人全員に同じ金額を返し、余りは最後の1人に足して合計をぴったり合わせます。";
      dom.settlementFootnote.textContent =
        "いま余っているお金 " + formatYen(balance) + " / 基本の返金額 " + formatYen(summary.equalRefundBase);
      return;
    }

    if (balance < 0) {
      dom.metricBalance.classList.add("text-clay-700");
      dom.metricBalanceInfo.textContent =
        "返せる割合: " + formatRate(summary.prorationRate) + "（端数は最後に調整）";

      dom.settlementTitle.textContent = "お金が足りません。返金額を同じ割合で減らします。";
      dom.settlementBody.textContent =
        "追加で集金はしません。もとの返金予定を同じ割合で減らして、返せる合計金額に合わせます。";
      dom.settlementFootnote.textContent =
        "いま返せるお金 " + formatYen(summary.availableAfterExpenses) + " / もとの返金予定合計 " + formatYen(summary.plannedReimbursementsTotal);
      return;
    }

    dom.metricBalance.classList.add("text-ink-900");
    dom.metricBalanceInfo.textContent = "差額なし。返金・徴収は不要です。";

    dom.settlementTitle.textContent = "残高は0円です。";
    dom.settlementBody.textContent = "この時点で追加精算は不要です。返金ステータスの更新だけ実施してください。";
    dom.settlementFootnote.textContent = "計算上の差額はありません。";
  }

  function renderCollectionChart(paidMembers, unpaidMembers) {
    if (typeof Chart === "undefined") {
      return;
    }

    if (state.chart) {
      state.chart.destroy();
    }

    state.chart = new Chart(dom.collectionChart, {
      type: "doughnut",
      data: {
        labels: ["支払い済", "未払い"],
        datasets: [
          {
            data: [paidMembers, unpaidMembers],
            backgroundColor: ["#4f8a4a", "#c86134"],
            borderColor: "#ffffff",
            borderWidth: 2
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              font: {
                family: "BIZ UDPGothic"
              }
            }
          }
        }
      }
    });
  }

  function setLoading(isLoading) {
    dom.refreshButton.disabled = isLoading;
    dom.refreshButton.textContent = isLoading ? "更新中..." : "今すぐ更新";
  }

  function setSyncState(type, message) {
    if (type === "ok") {
      dom.syncChip.className = "status-chip-ok";
      dom.syncChip.textContent = "同期OK";
      dom.syncBanner.className = "mt-4 hidden rounded-xl border px-4 py-3 text-sm";
      dom.syncBanner.textContent = "";
      return;
    }

    dom.syncChip.className = "status-chip-warn";
    dom.syncChip.textContent = "同期注意";
    dom.syncBanner.className = "mt-4 rounded-xl border border-clay-500/40 bg-clay-100 px-4 py-3 text-sm text-clay-700";
    dom.syncBanner.textContent = message;
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    if (!url || String(url).indexOf("REPLACE_WITH_YOUR_DEPLOYMENT_ID") !== -1) {
      throw new Error("GAS_ENDPOINT is not configured.");
    }

    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    try {
      var response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Failed to fetch JSON: HTTP " + response.status);
      }

      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  function formatYen(value) {
    var numeric = normalizeNumber(value, 0);
    return "¥" + numeric.toLocaleString("ja-JP");
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatRate(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }

    return (Number(value) * 100).toFixed(1) + "%";
  }

  function normalizeNumber(value, fallback) {
    var numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    return fallback;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
