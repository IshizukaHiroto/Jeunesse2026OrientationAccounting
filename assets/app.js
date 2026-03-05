(function () {
  "use strict";

  var LIST_STEP = 5;
  var VIEW_IDS = ["summary", "collection", "expenses", "reimbursements"];
  var config = window.APP_CONFIG || {};
  var calc = window.AccountingCalc;

  if (!calc) {
    throw new Error("AccountingCalc is not available. Make sure src/calc.js is loaded.");
  }

  var state = {
    latestPayload: null,
    isRefreshing: false,
    currentView: "summary",
    chartSnapshot: null,
    charts: {
      collection: null,
      balance: null
    },
    limits: {
      collection: LIST_STEP,
      expenses: LIST_STEP,
      reimbursements: LIST_STEP
    },
    sort: {
      collection: "asc",
      reimbursements: "asc"
    }
  };

  var dom = {
    refreshButton: document.getElementById("manual-refresh-btn"),
    refreshLabel: document.getElementById("refresh-label"),
    syncChip: document.getElementById("sync-chip"),
    updatedAt: document.getElementById("updated-at"),
    syncBanner: document.getElementById("sync-banner"),
    loadingNotice: document.getElementById("loading-notice"),
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
    collectionSortAscButton: document.getElementById("collection-sort-asc-btn"),
    collectionSortDescButton: document.getElementById("collection-sort-desc-btn"),
    reimbursementsSortAscButton: document.getElementById("reimbursements-sort-asc-btn"),
    reimbursementsSortDescButton: document.getElementById("reimbursements-sort-desc-btn"),
    collectionChart: document.getElementById("collection-chart"),
    balanceChart: document.getElementById("balance-chart"),
    collectionChartEmpty: document.getElementById("collection-chart-empty"),
    balanceChartEmpty: document.getElementById("balance-chart-empty"),
    balanceBreakdown: document.getElementById("balance-breakdown"),
    viewButtons: document.querySelectorAll("[data-view]"),
    viewPanels: document.querySelectorAll("[data-view-panel]")
  };

  attachEvents();
  switchView(state.currentView);
  updateSortControlUI("collection");
  updateSortControlUI("reimbursements");

  refreshData({ source: "initial" });
  window.setInterval(function () {
    refreshData({ source: "polling" });
  }, normalizeNumber(config.POLLING_MS, 60000));

  function attachEvents() {
    if (dom.refreshButton) {
      dom.refreshButton.addEventListener("click", function () {
        refreshData({ source: "manual", force: true });
      });
    }

    if (dom.collectionMoreButton) {
      dom.collectionMoreButton.addEventListener("click", function () {
        toggleListLimit("collection", state.latestPayload ? state.latestPayload.collection.length : 0);
        renderCollectionList((state.latestPayload && state.latestPayload.collection) || []);
      });
    }

    if (dom.expensesMoreButton) {
      dom.expensesMoreButton.addEventListener("click", function () {
        toggleListLimit("expenses", state.latestPayload ? state.latestPayload.expenses.length : 0);
        renderExpensesList((state.latestPayload && state.latestPayload.expenses) || []);
      });
    }

    if (dom.reimbursementsMoreButton) {
      dom.reimbursementsMoreButton.addEventListener("click", function () {
        toggleListLimit("reimbursements", state.latestPayload ? state.latestPayload.reimbursements.length : 0);
        renderReimbursementsList((state.latestPayload && state.latestPayload.reimbursements) || []);
      });
    }

    if (dom.collectionSortAscButton) {
      dom.collectionSortAscButton.addEventListener("click", function () {
        setSortDirection("collection", "asc");
      });
    }

    if (dom.collectionSortDescButton) {
      dom.collectionSortDescButton.addEventListener("click", function () {
        setSortDirection("collection", "desc");
      });
    }

    if (dom.reimbursementsSortAscButton) {
      dom.reimbursementsSortAscButton.addEventListener("click", function () {
        setSortDirection("reimbursements", "asc");
      });
    }

    if (dom.reimbursementsSortDescButton) {
      dom.reimbursementsSortDescButton.addEventListener("click", function () {
        setSortDirection("reimbursements", "desc");
      });
    }

    Array.prototype.forEach.call(dom.viewButtons, function (button) {
      button.addEventListener("click", function () {
        var viewId = button.getAttribute("data-view");
        switchView(viewId);
      });
    });
  }

  function switchView(viewId) {
    if (VIEW_IDS.indexOf(viewId) === -1) {
      return;
    }

    state.currentView = viewId;

    Array.prototype.forEach.call(dom.viewPanels, function (panel) {
      var panelId = panel.getAttribute("data-view-panel");
      var isActive = panelId === viewId;
      panel.classList.toggle("hidden", !isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    Array.prototype.forEach.call(dom.viewButtons, function (button) {
      var isActive = button.getAttribute("data-view") === viewId;
      button.classList.toggle("is-active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (viewId === "summary") {
      renderChartsFromSnapshot();
    }
  }

  function setSortDirection(key, direction) {
    if (!state.sort[key]) {
      return;
    }

    var normalized = direction === "desc" ? "desc" : "asc";
    if (state.sort[key] === normalized) {
      return;
    }

    state.sort[key] = normalized;
    state.limits[key] = LIST_STEP;
    updateSortControlUI(key);

    if (!state.latestPayload) {
      return;
    }

    if (key === "collection") {
      renderCollectionList(state.latestPayload.collection || []);
      return;
    }

    if (key === "reimbursements") {
      renderReimbursementsList(state.latestPayload.reimbursements || []);
    }
  }

  function updateSortControlUI(key) {
    if (key === "collection") {
      setSortButtonState(dom.collectionSortAscButton, state.sort.collection === "asc");
      setSortButtonState(dom.collectionSortDescButton, state.sort.collection === "desc");
      return;
    }

    if (key === "reimbursements") {
      setSortButtonState(dom.reimbursementsSortAscButton, state.sort.reimbursements === "asc");
      setSortButtonState(dom.reimbursementsSortDescButton, state.sort.reimbursements === "desc");
    }
  }

  function setSortButtonState(button, isActive) {
    if (!button) {
      return;
    }

    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.classList.toggle("is-active", isActive);
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
    var balanceComposition = calc.computeBalanceComposition
      ? calc.computeBalanceComposition(summary)
      : createFallbackBalanceComposition(summary);

    var collection = Array.isArray(payload.collection) ? payload.collection : [];
    var expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
    var reimbursements = Array.isArray(payload.reimbursements) ? payload.reimbursements : [];

    state.chartSnapshot = {
      paidMembers: summary.paidMembers,
      unpaidMembers: summary.unpaidMembers,
      composition: balanceComposition
    };

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

    if (state.currentView === "summary") {
      renderChartsFromSnapshot();
    }
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

    state.chartSnapshot = {
      paidMembers: 0,
      unpaidMembers: 0,
      composition: createFallbackBalanceComposition({
        collectionTotal: 0,
        expensesTotal: 0,
        plannedReimbursementsTotal: 0
      })
    };

    dom.settlementTitle.textContent = "データ待機中";
    dom.settlementBody.textContent = "JSON取得後に精算方針を表示します。";
    dom.settlementFootnote.textContent = "";

    if (state.currentView === "summary") {
      renderChartsFromSnapshot();
    }
  }

  function renderChartsFromSnapshot() {
    if (!state.chartSnapshot) {
      toggleChartPlaceholders(true);
      renderBalanceBreakdown(null);
      return;
    }

    toggleChartPlaceholders(false);
    renderCollectionChart(state.chartSnapshot.paidMembers, state.chartSnapshot.unpaidMembers);
    renderBalanceChart(state.chartSnapshot.composition);
    renderBalanceBreakdown(state.chartSnapshot.composition);
  }

  function toggleChartPlaceholders(showPlaceholder) {
    if (dom.collectionChart) {
      dom.collectionChart.classList.toggle("hidden", showPlaceholder);
    }
    if (dom.balanceChart) {
      dom.balanceChart.classList.toggle("hidden", showPlaceholder);
    }
    if (dom.collectionChartEmpty) {
      dom.collectionChartEmpty.classList.toggle("hidden", !showPlaceholder);
    }
    if (dom.balanceChartEmpty) {
      dom.balanceChartEmpty.classList.toggle("hidden", !showPlaceholder);
    }
  }

  function sortRowsByState(key, rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    if (key !== "collection" && key !== "reimbursements") {
      return rows.slice();
    }

    if (calc.sortByNickname) {
      return calc.sortByNickname(rows, state.sort[key]);
    }

    return fallbackSortByNickname(rows, state.sort[key]);
  }

  function fallbackSortByNickname(rows, direction) {
    var dir = direction === "desc" ? "desc" : "asc";

    return rows
      .map(function (row, index) {
        return {
          row: row,
          index: index,
          nickname: normalizeName(row && row.nickname)
        };
      })
      .sort(function (a, b) {
        var aHasName = a.nickname.length > 0;
        var bHasName = b.nickname.length > 0;

        if (aHasName !== bHasName) {
          return aHasName ? -1 : 1;
        }

        if (!aHasName && !bHasName) {
          return a.index - b.index;
        }

        var compared = a.nickname.localeCompare(b.nickname, "ja", { sensitivity: "base", numeric: true });
        if (compared !== 0) {
          return dir === "asc" ? compared : -compared;
        }

        return a.index - b.index;
      })
      .map(function (item) {
        return item.row;
      });
  }

  function normalizeName(value) {
    return String(value || "").trim();
  }

  function renderCollectionList(rows) {
    var sortedRows = sortRowsByState("collection", rows);

    renderList({
      rows: sortedRows,
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
    var sortedRows = sortRowsByState("reimbursements", rows);

    renderList({
      rows: sortedRows,
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
        "1人あたりの返金目安: " +
        formatYen(summary.equalRefundBase) +
        "（余り " +
        formatYen(summary.equalRefundRemainder) +
        " は最後に調整）";

      dom.settlementTitle.textContent = "お金が余っています。みんなに同じ金額を返します。";
      dom.settlementBody.textContent =
        "集金した人全員に同じ金額を返し、余りは最後の1人に足して合計をぴったり合わせます。";
      dom.settlementFootnote.textContent =
        "いま余っているお金 " + formatYen(balance) + " / 基本の返金額 " + formatYen(summary.equalRefundBase);
      return;
    }

    if (balance < 0) {
      dom.metricBalance.classList.add("text-clay-700");
      dom.metricBalanceInfo.textContent = "返せる割合: " + formatRate(summary.prorationRate) + "（端数は最後に調整）";

      dom.settlementTitle.textContent = "お金が足りません。返金額を同じ割合で減らします。";
      dom.settlementBody.textContent =
        "追加で集金はしません。もとの返金予定を同じ割合で減らして、返せる合計金額に合わせます。";
      dom.settlementFootnote.textContent =
        "いま返せるお金 " +
        formatYen(summary.availableAfterExpenses) +
        " / もとの返金予定合計 " +
        formatYen(summary.plannedReimbursementsTotal);
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

    if (state.charts.collection) {
      state.charts.collection.destroy();
    }

    state.charts.collection = new Chart(dom.collectionChart, {
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
        animation: false,
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

  function renderBalanceChart(composition) {
    if (typeof Chart === "undefined") {
      return;
    }

    if (state.charts.balance) {
      state.charts.balance.destroy();
    }

    var hasInnerData =
      composition.baseAmount > 0 &&
      composition.expensesInBase + composition.reimburseInBase + composition.balanceInBase > 0;

    var innerData = hasInnerData
      ? [composition.expensesInBase, composition.reimburseInBase, composition.balanceInBase]
      : [1];

    var innerMeta = [
      {
        label: "経費",
        amount: composition.expensesInBase,
        percent: composition.percentages.expenses
      },
      {
        label: "返金予定（予算内）",
        amount: composition.reimburseInBase,
        percent: composition.percentages.reimbursements
      },
      {
        label: "残高",
        amount: composition.balanceInBase,
        percent: composition.percentages.balance
      }
    ];

    var innerColors = hasInnerData ? ["#4f8a4a", "#c86134", "#78b86f"] : ["#dce6dd"];

    var outerBase = composition.baseAmount > 0 ? composition.baseAmount : composition.shortageAmount > 0 ? composition.shortageAmount : 1;
    var outerShortageVisual = composition.shortageAmount > 0 ? Math.min(composition.shortageAmount, outerBase) : 0;
    var outerNeutral = Math.max(outerBase - outerShortageVisual, 0);

    state.charts.balance = new Chart(dom.balanceChart, {
      type: "doughnut",
      data: {
        labels: ["不足分", "外側余白"],
        datasets: [
          {
            label: "内訳",
            data: innerData,
            backgroundColor: innerColors,
            borderColor: "#ffffff",
            borderWidth: 2,
            weight: 1
          },
          {
            label: "不足",
            data: [outerShortageVisual, outerNeutral],
            backgroundColor: ["#d2372c", "rgba(0,0,0,0)"],
            borderColor: ["#ffffff", "rgba(0,0,0,0)"],
            borderWidth: [outerShortageVisual > 0 ? 2 : 0, 0],
            weight: 0.55
          }
        ]
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        cutout: "48%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                if (context.datasetIndex === 0) {
                  var meta = innerMeta[context.dataIndex];
                  if (!meta || meta.amount <= 0) {
                    return "";
                  }
                  return meta.label + ": " + formatYen(meta.amount) + " (" + formatPercent(meta.percent) + ")";
                }

                if (context.datasetIndex === 1 && context.dataIndex === 0 && composition.shortageAmount > 0) {
                  return "不足分: " + formatYen(composition.shortageAmount) + " (" + formatPercent(composition.percentages.shortage) + ")";
                }

                return "";
              }
            }
          }
        }
      }
    });
  }

  function renderBalanceBreakdown(composition) {
    if (!dom.balanceBreakdown) {
      return;
    }

    if (!composition) {
      dom.balanceBreakdown.innerHTML = '<li class="line-sub">データ待機中です。</li>';
      return;
    }

    var items = [
      {
        label: "経費",
        color: "#4f8a4a",
        amount: composition.expensesInBase,
        percent: composition.percentages.expenses
      },
      {
        label: "返金予定（予算内）",
        color: "#c86134",
        amount: composition.reimburseInBase,
        percent: composition.percentages.reimbursements
      },
      {
        label: "残高",
        color: "#78b86f",
        amount: composition.balanceInBase,
        percent: composition.percentages.balance
      }
    ];

    if (composition.shortageAmount > 0) {
      items.push({
        label: "不足分（外側リング）",
        color: "#d2372c",
        amount: composition.shortageAmount,
        percent: composition.percentages.shortage
      });
    }

    dom.balanceBreakdown.innerHTML = items
      .map(function (item) {
        return (
          '<li class="flex items-center justify-between gap-2">' +
          '<span class="inline-flex min-w-0 items-center gap-2">' +
          '<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color:' +
          item.color +
          '"></span>' +
          '<span class="truncate">' +
          escapeHtml(item.label) +
          "</span>" +
          "</span>" +
          '<span class="shrink-0 font-semibold">' +
          formatYen(item.amount) +
          " / " +
          formatPercent(item.percent) +
          "</span></li>"
        );
      })
      .join("");

    if (items.length === 0) {
      dom.balanceBreakdown.innerHTML = '<li class="line-sub">内訳データがありません。</li>';
    }
  }

  function setLoading(isLoading) {
    if (!dom.refreshButton) {
      return;
    }

    dom.refreshButton.disabled = isLoading;
    dom.refreshButton.dataset.loading = isLoading ? "true" : "false";
    dom.refreshButton.setAttribute("aria-busy", isLoading ? "true" : "false");

    if (dom.refreshLabel) {
      dom.refreshLabel.textContent = isLoading ? "更新中..." : "今すぐ更新";
    }

    if (dom.loadingNotice) {
      if (isLoading) {
        dom.loadingNotice.classList.remove("hidden");
        dom.loadingNotice.textContent = state.latestPayload
          ? "最新データを取得中です。現在の表示は前回取得データです。"
          : "初回データを読み込み中です。数秒お待ちください。";
      } else {
        dom.loadingNotice.classList.add("hidden");
        dom.loadingNotice.textContent = "";
      }
    }

    if (isLoading && !state.latestPayload && dom.syncChip) {
      dom.syncChip.className = "status-chip-ok shrink-0 whitespace-nowrap";
      dom.syncChip.textContent = "同期中";
    }
  }

  function setSyncState(type, message) {
    if (type === "ok") {
      dom.syncChip.className = "status-chip-ok shrink-0 whitespace-nowrap";
      dom.syncChip.textContent = "同期OK";
      dom.syncBanner.className = "mt-4 hidden rounded-xl border px-4 py-3 text-sm";
      dom.syncBanner.textContent = "";
      return;
    }

    dom.syncChip.className = "status-chip-warn shrink-0 whitespace-nowrap";
    dom.syncChip.textContent = "同期注意";
    dom.syncBanner.className = "mt-4 rounded-xl border border-clay-500/40 bg-clay-100 px-4 py-3 text-sm text-clay-700";
    dom.syncBanner.textContent = message;
  }

  function createFallbackBalanceComposition(summary) {
    var baseAmount = Math.max(0, toNumber(summary.collectionTotal));
    var expensesInBase = Math.min(Math.max(0, toNumber(summary.expensesTotal)), baseAmount);
    var refundBudget = Math.max(baseAmount - expensesInBase, 0);
    var reimburseInBase = Math.min(Math.max(0, toNumber(summary.plannedReimbursementsTotal)), refundBudget);
    var balanceInBase = Math.max(refundBudget - reimburseInBase, 0);
    var shortageAmount = Math.max(Math.max(0, toNumber(summary.plannedReimbursementsTotal)) - refundBudget, 0);

    var percentages = {
      expenses: 0,
      reimbursements: 0,
      balance: 0,
      shortage: 0
    };

    if (baseAmount > 0) {
      percentages.expenses = (expensesInBase / baseAmount) * 100;
      percentages.reimbursements = (reimburseInBase / baseAmount) * 100;
      percentages.balance = (balanceInBase / baseAmount) * 100;
      percentages.shortage = (shortageAmount / baseAmount) * 100;
    } else if (shortageAmount > 0) {
      percentages.shortage = 100;
    }

    return {
      baseAmount: baseAmount,
      expensesInBase: expensesInBase,
      reimburseInBase: reimburseInBase,
      balanceInBase: balanceInBase,
      shortageAmount: shortageAmount,
      percentages: percentages
    };
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

  function formatPercent(value) {
    var numeric = normalizeNumber(value, 0);
    var rounded = Math.round(numeric * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + "%";
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (value === null || value === undefined) {
      return 0;
    }

    var parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
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
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
