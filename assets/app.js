(function () {
  "use strict";

  var LIST_STEP = 5;
  var DEFAULT_REFUND_CAP = 700;
  var VIEW_IDS = ["summary", "collection", "outflow"];
  var config = window.APP_CONFIG || {};
  var calc = window.AccountingCalc;
  var POLLING_MS = normalizeNumber(config.POLLING_MS, 60000);

  if (!calc) {
    throw new Error("AccountingCalc is not available. Make sure src/calc.js is loaded.");
  }

  var state = {
    latestPayload: null,
    isRefreshing: false,
    currentView: "summary",
    activeFilterPanel: null,
    usageChart: null,
    summarySnapshot: null,
    pollingTimerId: null,
    limits: {
      collection: LIST_STEP,
      outflow: LIST_STEP
    },
    filters: {
      collectionPaidOnly: false,
      outflowType: "all"
    },
    sort: {
      collection: "asc"
    }
  };

  var dom = {
    refreshButton: document.getElementById("manual-refresh-btn"),
    refreshLoading: document.getElementById("manual-refresh-loading"),
    updatedAt: document.getElementById("updated-at"),
    updatedAtSidebar: document.getElementById("updated-at-sidebar"),
    syncBanner: document.getElementById("sync-banner"),
    summaryCollectionAmount: document.getElementById("summary-collection-amount"),
    summaryCollectionTarget: document.getElementById("summary-collection-target"),
    summaryCollectionRate: document.getElementById("summary-collection-rate"),
    summaryCollectionBar: document.getElementById("summary-collection-bar"),
    summaryExpensesAmount: document.getElementById("summary-expenses-amount"),
    summaryExpensesMeta: document.getElementById("summary-expenses-meta"),
    summaryRefundsAmount: document.getElementById("summary-refunds-amount"),
    summaryRefundsMeta: document.getElementById("summary-refunds-meta"),
    summaryPaymentMain: document.getElementById("summary-payment-main"),
    summaryPaymentMeta: document.getElementById("summary-payment-meta"),
    summaryPaymentRate: document.getElementById("summary-payment-rate"),
    summaryPaymentBar: document.getElementById("summary-payment-bar"),
    summaryBalanceCollection: document.getElementById("summary-balance-collection"),
    summaryBalanceExpenses: document.getElementById("summary-balance-expenses"),
    summaryAvailableBalance: document.getElementById("summary-available-balance"),
    summaryAvailableSurface: document.getElementById("summary-available-surface"),
    budgetExpensesAmount: document.getElementById("budget-expenses-amount"),
    budgetBalanceAmount: document.getElementById("budget-balance-amount"),
    budgetUnpaidAmount: document.getElementById("budget-unpaid-amount"),
    budgetUsageRate: document.getElementById("budget-usage-rate"),
    usageChart: document.getElementById("usage-chart"),
    usageChartEmpty: document.getElementById("usage-chart-empty"),
    collectionTable: document.getElementById("collection-table"),
    collectionMoreButton: document.getElementById("collection-more-btn"),
    collectionCount: document.getElementById("collection-count"),
    outflowTable: document.getElementById("outflow-table"),
    outflowMoreButton: document.getElementById("outflow-more-btn"),
    outflowCount: document.getElementById("outflow-count"),
    collectionFilterToggle: document.getElementById("collection-filter-toggle"),
    collectionFilterPanel: document.getElementById("collection-filter-panel"),
    collectionFilterSortAsc: document.getElementById("collection-filter-sort-asc"),
    collectionFilterSortDesc: document.getElementById("collection-filter-sort-desc"),
    collectionFilterPaidOnly: document.getElementById("collection-filter-paid-only"),
    outflowFilterToggle: document.getElementById("outflow-filter-toggle"),
    outflowFilterPanel: document.getElementById("outflow-filter-panel"),
    outflowFilterAll: document.getElementById("outflow-filter-all"),
    outflowFilterExpense: document.getElementById("outflow-filter-expense"),
    outflowFilterReimbursement: document.getElementById("outflow-filter-reimbursement"),
    viewButtons: document.querySelectorAll("[data-view][role='tab']"),
    viewPanels: document.querySelectorAll("[data-view-panel]")
  };

  var filterToggles = {
    collection: dom.collectionFilterToggle,
    outflow: dom.outflowFilterToggle
  };

  var filterPanels = {
    collection: dom.collectionFilterPanel,
    outflow: dom.outflowFilterPanel
  };

  var chartPalette = readChartPalette();

  attachEvents();
  switchView(state.currentView);
  updateFilterControlUI();

  refreshData({ source: "initial" });
  startPolling();

  function attachEvents() {
    if (dom.refreshButton) {
      dom.refreshButton.addEventListener("click", function () {
        refreshData({ source: "manual" });
      });
    }

    if (dom.collectionMoreButton) {
      dom.collectionMoreButton.addEventListener("click", function () {
        var totalRows = getVisibleCollectionRows((state.latestPayload && state.latestPayload.collection) || []).length;
        toggleListLimit("collection", totalRows);
        renderCollectionTable((state.latestPayload && state.latestPayload.collection) || [], getCollectionAmountPerMember());
      });
    }

    if (dom.outflowMoreButton) {
      dom.outflowMoreButton.addEventListener("click", function () {
        var totalRows = getVisibleOutflowRows(getOutflowRows()).length;
        toggleListLimit("outflow", totalRows);
        renderOutflowTable(getOutflowRows());
      });
    }

    bindFilterToggle("collection");
    bindFilterToggle("outflow");

    bindPressedClick(dom.collectionFilterSortAsc, function () {
      setSortDirection("collection", "asc");
    });
    bindPressedClick(dom.collectionFilterSortDesc, function () {
      setSortDirection("collection", "desc");
    });
    bindPressedClick(dom.collectionFilterPaidOnly, function () {
      state.filters.collectionPaidOnly = !state.filters.collectionPaidOnly;
      state.limits.collection = LIST_STEP;
      updateCollectionFilterUI();
      renderCollectionTable((state.latestPayload && state.latestPayload.collection) || [], getCollectionAmountPerMember());
    });

    bindPressedClick(dom.outflowFilterAll, function () {
      setOutflowType("all");
    });
    bindPressedClick(dom.outflowFilterExpense, function () {
      setOutflowType("expense");
    });
    bindPressedClick(dom.outflowFilterReimbursement, function () {
      setOutflowType("reimbursement");
    });

    Array.prototype.forEach.call(dom.viewButtons, function (button) {
      button.addEventListener("click", function () {
        switchView(button.getAttribute("data-view"));
      });

      button.addEventListener("keydown", function (event) {
        handleViewKeydown(event, button);
      });
    });

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function bindPressedClick(button, handler) {
    if (!button) {
      return;
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      handler();
    });
  }

  function bindFilterToggle(key) {
    var button = filterToggles[key];
    if (!button) {
      return;
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleFilterPanel(key);
    });
  }

  function handleDocumentClick(event) {
    if (!state.activeFilterPanel) {
      return;
    }

    var activeKey = state.activeFilterPanel;
    var panel = filterPanels[activeKey];
    var button = filterToggles[activeKey];

    if (!panel || !button) {
      closeFilterPanels();
      return;
    }

    if (panel.contains(event.target) || button.contains(event.target)) {
      return;
    }

    closeFilterPanels();
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      closeFilterPanels();
    }
  }

  function handleViewKeydown(event, currentButton) {
    var tabList = currentButton.closest("[role='tablist']");
    if (!tabList) {
      return;
    }

    var tabs = Array.prototype.slice.call(tabList.querySelectorAll("[role='tab']"));
    var currentIndex = tabs.indexOf(currentButton);
    var nextIndex = -1;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === -1) {
      return;
    }

    event.preventDefault();
    switchView(tabs[nextIndex].getAttribute("data-view"));
    tabs[nextIndex].focus();
  }

  function toggleFilterPanel(key) {
    if (state.activeFilterPanel === key) {
      closeFilterPanels();
      return;
    }

    closeFilterPanels();

    if (filterPanels[key]) {
      filterPanels[key].classList.remove("hidden");
    }

    if (filterToggles[key]) {
      filterToggles[key].setAttribute("aria-expanded", "true");
    }

    state.activeFilterPanel = key;
  }

  function closeFilterPanels() {
    Object.keys(filterPanels).forEach(function (key) {
      if (filterPanels[key]) {
        filterPanels[key].classList.add("hidden");
      }
      if (filterToggles[key]) {
        filterToggles[key].setAttribute("aria-expanded", "false");
      }
    });

    state.activeFilterPanel = null;
  }

  function setSortDirection(key, direction) {
    var normalized = direction === "desc" ? "desc" : "asc";
    if (key !== "collection") {
      return;
    }

    if (state.sort[key] === normalized) {
      return;
    }

    state.sort[key] = normalized;
    state.limits[key] = LIST_STEP;
    updateFilterControlUI();

    renderCollectionTable((state.latestPayload && state.latestPayload.collection) || [], getCollectionAmountPerMember());
  }

  function setOutflowType(type) {
    if (state.filters.outflowType === type) {
      return;
    }

    state.filters.outflowType = type;
    state.limits.outflow = LIST_STEP;
    updateOutflowFilterUI();
    renderOutflowTable(getOutflowRows());
  }

  function updateFilterControlUI() {
    updateCollectionFilterUI();
    updateOutflowFilterUI();
  }

  function updateCollectionFilterUI() {
    setPressedButtonState(dom.collectionFilterSortAsc, state.sort.collection === "asc");
    setPressedButtonState(dom.collectionFilterSortDesc, state.sort.collection === "desc");
    setPressedButtonState(dom.collectionFilterPaidOnly, state.filters.collectionPaidOnly);
  }

  function updateOutflowFilterUI() {
    setPressedButtonState(dom.outflowFilterAll, state.filters.outflowType === "all");
    setPressedButtonState(dom.outflowFilterExpense, state.filters.outflowType === "expense");
    setPressedButtonState(dom.outflowFilterReimbursement, state.filters.outflowType === "reimbursement");
  }

  function setPressedButtonState(button, isActive) {
    if (!button) {
      return;
    }

    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.classList.toggle("is-active", isActive);
  }

  function switchView(viewId) {
    if (VIEW_IDS.indexOf(viewId) === -1) {
      return;
    }

    state.currentView = viewId;
    closeFilterPanels();

    Array.prototype.forEach.call(dom.viewPanels, function (panel) {
      var panelId = panel.getAttribute("data-view-panel");
      var isActive = panelId === viewId;
      panel.classList.toggle("hidden", !isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      panel.tabIndex = isActive ? 0 : -1;
    });

    Array.prototype.forEach.call(dom.viewButtons, function (button) {
      var isActive = button.getAttribute("data-view") === viewId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });

    if (viewId === "summary" && state.summarySnapshot) {
      renderUsageChart(state.summarySnapshot);
    }
  }

  function startPolling() {
    if (state.pollingTimerId || document.visibilityState === "hidden") {
      return;
    }

    state.pollingTimerId = window.setInterval(function () {
      refreshData({ source: "polling" });
    }, POLLING_MS);
  }

  function stopPolling() {
    if (!state.pollingTimerId) {
      return;
    }

    window.clearInterval(state.pollingTimerId);
    state.pollingTimerId = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      stopPolling();
      return;
    }

    startPolling();
    refreshData({ source: "resume" });
  }

  async function refreshData(options) {
    var source = options && options.source ? options.source : "unknown";

    if (state.isRefreshing) {
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
      setSyncState("ok", source === "manual" ? "手動更新が完了しました。" : "");
    } catch (error) {
      if (state.latestPayload) {
        render(state.latestPayload);
        setSyncState("warn", "最新データを確認できなかったため、前回更新分を表示しています。");
      } else {
        renderEmpty();
        setSyncState("warn", "データを読み込めませんでした。時間をおいて再読み込みしてください。");
      }
      console.error(error);
    } finally {
      setLoading(false);
      state.isRefreshing = false;
    }
  }

  function render(payload) {
    var overview = calc.buildDashboardOverview ? calc.buildDashboardOverview(payload) : createDashboardOverviewFallback(payload);
    state.summarySnapshot = overview;

    renderUpdatedAt(payload.meta && payload.meta.generatedAt);
    renderSummary(overview, false);
    renderCollectionTable(payload.collection || [], overview.collectionAmountPerMember);
    renderOutflowTable(getOutflowRows());

    if (state.currentView === "summary") {
      renderUsageChart(overview);
    }
  }

  function renderEmpty() {
    var payload = {
      meta: {
        generatedAt: "",
        collectionAmountPerMember: 0,
        refundCapPerFreshman: DEFAULT_REFUND_CAP
      },
      collection: [],
      expenses: [],
      reimbursements: [],
      summary: {
        paidMembers: 0,
        unpaidMembers: 0,
        collectionTotal: 0,
        expensesTotal: 0,
        plannedReimbursementsTotal: 0,
        availableAfterExpenses: 0,
        currentBalance: 0
      }
    };

    var overview = calc.buildDashboardOverview ? calc.buildDashboardOverview(payload) : createDashboardOverviewFallback(payload);
    state.summarySnapshot = overview;

    renderUpdatedAt("");
    renderSummary(overview, true);
    renderCollectionTable([], 0);
    renderOutflowTable([]);
    renderUsageChart(null);
  }

  function renderSummary(overview, isEmpty) {
    var summary = overview.summary;

    dom.summaryCollectionAmount.textContent = formatYen(summary.collectionTotal);
    dom.summaryCollectionTarget.textContent = "目標 " + formatYen(overview.targetCollection);
    dom.summaryCollectionRate.textContent = formatPercent(overview.collectionRate);
    setProgress(dom.summaryCollectionBar, overview.collectionRate);

    dom.summaryExpensesAmount.textContent = formatYen(summary.expensesTotal);
    dom.summaryExpensesMeta.textContent = "内訳 " + String(overview.outflowTypeCount) + "種類";

    dom.summaryRefundsAmount.textContent = formatYen(overview.pendingRefundTotal);
    dom.summaryRefundsMeta.textContent = "未返金 " + String(overview.pendingRefundCount) + "件";

    dom.summaryPaymentMain.textContent =
      String(summary.paidMembers) + " / " + String(overview.totalMembers) + "名";
    dom.summaryPaymentMeta.textContent = "未納 " + String(summary.unpaidMembers) + "名";
    dom.summaryPaymentRate.textContent = formatPercent(overview.paymentRate);
    setProgress(dom.summaryPaymentBar, overview.paymentRate);

    dom.summaryBalanceCollection.textContent = formatYen(summary.collectionTotal);
    dom.summaryBalanceExpenses.textContent = formatYen(summary.expensesTotal);
    dom.summaryAvailableBalance.textContent = formatYen(overview.availableAfterExpenses);
    updateAvailableSurface(overview.availableAfterExpenses);

    dom.budgetExpensesAmount.textContent = formatYen(overview.spentInTarget);
    dom.budgetBalanceAmount.textContent = formatYen(Math.max(overview.availableAfterExpenses, 0));
    dom.budgetUnpaidAmount.textContent = formatYen(overview.unpaidTargetAmount);
    dom.budgetUsageRate.textContent = formatPercent(overview.usageRate);

  }

  function updateAvailableSurface(balance) {
    if (!dom.summaryAvailableSurface) {
      return;
    }

    dom.summaryAvailableSurface.classList.remove(
      "balance-surface-positive",
      "balance-surface-zero",
      "balance-surface-negative"
    );

    if (balance > 0) {
      dom.summaryAvailableSurface.classList.add("balance-surface-positive");
      return;
    }

    if (balance < 0) {
      dom.summaryAvailableSurface.classList.add("balance-surface-negative");
      return;
    }

    dom.summaryAvailableSurface.classList.add("balance-surface-zero");
  }

  function renderUsageChart(overview) {
    if (typeof Chart === "undefined" || !dom.usageChart) {
      return;
    }

    if (state.usageChart) {
      state.usageChart.destroy();
      state.usageChart = null;
    }

    if (!overview) {
      toggleUsageChartPlaceholder(true);
      return;
    }

    var values = [
      Math.max(overview.spentInTarget, 0),
      Math.max(overview.remainingTargetAmount, 0),
      Math.max(overview.unpaidTargetAmount, 0)
    ];

    if (values.reduce(function (sum, value) { return sum + value; }, 0) <= 0) {
      toggleUsageChartPlaceholder(true);
      return;
    }

    toggleUsageChartPlaceholder(false);

    state.usageChart = new Chart(dom.usageChart, {
      type: "doughnut",
      data: {
        labels: ["支出額", "残高", "未納分"],
        datasets: [
          {
            data: values,
            backgroundColor: [chartPalette.expenses, chartPalette.balance, chartPalette.unpaid],
            borderColor: "#ffffff",
            borderWidth: 6,
            hoverOffset: 2
          }
        ]
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        cutout: "64%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.label + ": " + formatYen(context.parsed);
              }
            }
          }
        }
      }
    });
  }

  function toggleUsageChartPlaceholder(showPlaceholder) {
    if (dom.usageChart) {
      dom.usageChart.classList.toggle("hidden", showPlaceholder);
    }

    if (dom.usageChartEmpty) {
      dom.usageChartEmpty.classList.toggle("hidden", !showPlaceholder);
    }
  }

  function renderCollectionTable(rows, amountPerMember) {
    var normalizedRows = getVisibleCollectionRows(rows);
    renderTableState({
      rows: normalizedRows,
      limitKey: "collection",
      container: dom.collectionTable,
      button: dom.collectionMoreButton,
      count: dom.collectionCount,
      emptyMessage: state.filters.collectionPaidOnly
        ? "納入済みの収入データはまだありません。"
        : "収入データはまだありません。",
      renderContent: function (visibleRows) {
        return (
          '<div class="collection-ledger">' +
          visibleRows.map(function (row) { return renderCollectionRow(row, amountPerMember); }).join("") +
          "</div>"
        );
      }
    });
  }

  function renderOutflowTable(rows) {
    var normalizedRows = getVisibleOutflowRows(rows);
    renderTableState({
      rows: normalizedRows,
      limitKey: "outflow",
      container: dom.outflowTable,
      button: dom.outflowMoreButton,
      count: dom.outflowCount,
      emptyMessage: "表示できる支出データはまだありません。",
      renderContent: function (visibleRows) {
        return (
          '<div class="table-wrapper">' +
          '<div class="table-scroll"><table class="data-table">' +
          "<thead><tr>" +
          "<th>氏名</th>" +
          "<th>種別</th>" +
          "<th>項目</th>" +
          '<th class="th-end">金額</th>' +
          "<th>日付</th>" +
          '<th class="th-end">返金状況</th>' +
          "</tr></thead>" +
          "<tbody>" +
          visibleRows.map(renderOutflowDesktopRow).join("") +
          "</tbody></table></div>" +
          '<div class="data-card-list">' +
          visibleRows.map(renderOutflowMobileCard).join("") +
          "</div></div>"
        );
      }
    });
  }

  function renderTableState(params) {
    var rows = Array.isArray(params.rows) ? params.rows : [];
    var limit = state.limits[params.limitKey];
    var visibleRows = rows.slice(0, limit);

    params.count.textContent = String(visibleRows.length) + "件 表示中 / 全" + String(rows.length) + "件";

    if (rows.length === 0) {
      params.container.innerHTML = createEmptyState(params.emptyMessage);
      params.button.classList.add("hidden");
      return;
    }

    params.container.innerHTML = params.renderContent(visibleRows);
    updateMoreButton(params.button, limit, rows.length);
  }

  function renderCollectionRow(row, amountPerMember) {
    var nickname = normalizeText(row && row.nickname) || "名前未設定";
    var confirmedDate = normalizeText(row && row.confirmedDate) || "--";
    var isPaid = normalizeText(row && row.paymentStatus) === "済";
    var statusClass = isPaid ? "status-pill status-pill-success" : "status-pill status-pill-warning";
    var statusLabel = isPaid ? "納入済" : "未納";
    var amountClass = isPaid ? "collection-row-amount" : "collection-row-amount collection-row-amount-pending";
    var rowClass = isPaid ? "collection-row collection-row-paid" : "collection-row collection-row-unpaid";

    return (
      '<article class="' + rowClass + '">' +
      '<div class="collection-row-main">' +
      '<span class="collection-avatar" aria-hidden="true">' + escapeHtml(getNicknameInitial(nickname)) + "</span>" +
      '<div class="collection-row-copy">' +
      '<p class="collection-row-name">' + escapeHtml(nickname) + "</p>" +
      '<div class="collection-row-meta">' +
      '<span class="collection-row-meta-label">納入日</span>' +
      '<span class="collection-row-meta-value">' + escapeHtml(confirmedDate) + "</span>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="collection-row-side">' +
      '<div class="collection-row-amount-wrap">' +
      '<span class="collection-row-amount-label">金額</span>' +
      '<strong class="' + amountClass + '">' + formatYen(amountPerMember) + "</strong>" +
      "</div>" +
      '<span class="' + statusClass + '">' + statusLabel + "</span>" +
      "</div>" +
      "</article>"
    );
  }

  function renderOutflowDesktopRow(row) {
    var nickname = normalizeText(row.nickname) || "--";
    var statusMarkup = row.kind === "expense"
      ? '<span class="data-table-muted">--</span>'
      : '<span class="' + getStatusPillClass(row.statusTone) + '">' + escapeHtml(row.statusLabel) + "</span>";
    var amountClass = row.kind === "reimbursement" && row.statusTone === "pending"
      ? "data-table-amount data-table-amount-pending"
      : "data-table-amount";
    var rowClass = row.kind === "reimbursement" ? "data-table-row data-table-row-reimbursement" : "data-table-row data-table-row-expense";

    return (
      '<tr class="' + rowClass + '">' +
      '<td class="' + (nickname === "--" ? "data-table-muted" : "data-table-name") + '">' + escapeHtml(nickname) + "</td>" +
      "<td>" + createTypePill(row.kind) + "</td>" +
      "<td>" + escapeHtml(row.description) + "</td>" +
      '<td class="text-right"><span class="' + amountClass + '">' + formatYen(row.amount) + "</span></td>" +
      "<td>" + escapeHtml(row.dateLabel) + "</td>" +
      '<td class="text-right">' + statusMarkup + "</td>" +
      "</tr>"
    );
  }

  function renderOutflowMobileCard(row) {
    var nickname = normalizeText(row.nickname) || "--";
    var statusLabel = row.kind === "expense" ? "--" : row.statusLabel;
    var amountClass = row.kind === "reimbursement" && row.statusTone === "pending"
      ? "data-card-field-value data-card-field-value-strong data-table-amount-pending"
      : "data-card-field-value data-card-field-value-strong";
    var cardClass = row.kind === "reimbursement"
      ? "data-card-item data-card-item-reimbursement"
      : "data-card-item data-card-item-expense";

    return (
      '<article class="' + cardClass + '">' +
      '<div class="data-card-header">' +
      '<div>' +
      '<p class="data-card-title">' + escapeHtml(row.description) + "</p>" +
      '<p class="mt-1 text-sm font-semibold text-[#8e97a8]">' + escapeHtml(nickname) + "</p>" +
      "</div>" +
      createTypePill(row.kind) +
      "</div>" +
      '<div class="data-card-grid">' +
      createMobileField("金額", formatYen(row.amount), amountClass) +
      createMobileField("日付", escapeHtml(row.dateLabel), "data-card-field-value") +
      createMobileField("返金状況", escapeHtml(statusLabel), "data-card-field-value") +
      "</div></article>"
    );
  }

  function createMobileField(label, value, valueClass) {
    return (
      '<div class="data-card-field">' +
      '<p class="data-card-field-label">' + label + "</p>" +
      '<p class="' + valueClass + '">' + value + "</p>" +
      "</div>"
    );
  }

  function getNicknameInitial(name) {
    var normalized = normalizeText(name);
    return normalized ? normalized.charAt(0) : "J";
  }

  function createTypePill(kind) {
    var typeClass = "type-pill type-pill-income";
    var label = "収入";

    if (kind === "expense") {
      typeClass = "type-pill type-pill-expense";
      label = "経費";
    } else if (kind === "reimbursement") {
      typeClass = "type-pill type-pill-refund";
      label = "立替";
    }

    return '<span class="' + typeClass + '">' + label + "</span>";
  }

  function getStatusPillClass(tone) {
    if (tone === "success") {
      return "status-pill status-pill-success";
    }

    if (tone === "pending") {
      return "status-pill status-pill-pending";
    }

    if (tone === "warning") {
      return "status-pill status-pill-warning";
    }

    return "status-pill status-pill-neutral";
  }

  function getVisibleCollectionRows(rows) {
    var normalizedRows = Array.isArray(rows) ? rows : [];

    if (state.filters.collectionPaidOnly) {
      normalizedRows = normalizedRows.filter(function (row) {
        return normalizeText(row && row.paymentStatus) === "済";
      });
    }

    return sortByNickname(normalizedRows, state.sort.collection);
  }

  function getVisibleOutflowRows(rows) {
    var normalizedRows = Array.isArray(rows) ? rows : [];

    if (state.filters.outflowType === "expense") {
      return normalizedRows.filter(function (row) {
        return row.kind === "expense";
      });
    }

    if (state.filters.outflowType === "reimbursement") {
      return normalizedRows.filter(function (row) {
        return row.kind === "reimbursement";
      });
    }

    return normalizedRows;
  }

  function sortByNickname(rows, direction) {
    if (calc.sortByNickname) {
      return calc.sortByNickname(rows, direction);
    }
    return rows.slice();
  }

  function getCollectionAmountPerMember() {
    if (!state.summarySnapshot) {
      return 0;
    }

    return state.summarySnapshot.collectionAmountPerMember;
  }

  function getOutflowRows() {
    if (!state.latestPayload) {
      return [];
    }

    return calc.createOutflowRows ? calc.createOutflowRows(state.latestPayload) : [];
  }

  function toggleListLimit(key, totalRows) {
    if (state.limits[key] < totalRows) {
      state.limits[key] = Math.min(totalRows, state.limits[key] + LIST_STEP);
      return;
    }

    state.limits[key] = LIST_STEP;
  }
  function updateMoreButton(button, visibleLimit, totalRows) {
    if (!button) {
      return;
    }

    if (totalRows <= LIST_STEP) {
      button.classList.add("hidden");
      return;
    }

    button.classList.remove("hidden");
    button.textContent = visibleLimit < totalRows ? "もっと見る" : "折りたたむ";
  }

  function setLoading(isLoading) {
    if (dom.refreshButton) {
      dom.refreshButton.disabled = isLoading;
      dom.refreshButton.dataset.loading = isLoading ? "true" : "false";
      dom.refreshButton.setAttribute("aria-busy", isLoading ? "true" : "false");
      dom.refreshButton.classList.toggle("hidden", isLoading);
    }

    if (dom.refreshLoading) {
      dom.refreshLoading.classList.toggle("hidden", !isLoading);
    }
  }

  function setSyncState(type, message) {
    if (type === "ok") {
      if (dom.syncBanner) {
        dom.syncBanner.classList.add("hidden");
        dom.syncBanner.textContent = "";
      }
      return;
    }

    if (dom.syncBanner) {
      dom.syncBanner.classList.remove("hidden");
      dom.syncBanner.textContent = message;
    }
  }

  function renderUpdatedAt(value) {
    var desktopLabel = formatDateLabel(value, false);
    var mobileLabel = formatDateLabel(value, true);

    if (dom.updatedAt) {
      dom.updatedAt.textContent = mobileLabel;
    }

    if (dom.updatedAtSidebar) {
      dom.updatedAtSidebar.textContent = desktopLabel;
    }
  }

  function readChartPalette() {
    var styles = window.getComputedStyle(document.documentElement);
    return {
      expenses: readCssVar(styles, "--chart-expenses", "#f53b3b"),
      balance: readCssVar(styles, "--chart-balance", "#13b26b"),
      unpaid: readCssVar(styles, "--chart-unpaid", "#d8dce4")
    };
  }

  function readCssVar(styles, key, fallback) {
    var value = styles.getPropertyValue(key);
    return value ? value.trim() : fallback;
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

  function createDashboardOverviewFallback(payload) {
    var data = payload && typeof payload === "object" ? payload : {};
    var summary = data.summary || calc.computeSummary(data);
    var totalMembers = Array.isArray(data.collection) ? data.collection.length : Math.max(0, summary.paidMembers + summary.unpaidMembers);
    var collectionAmountPerMember = summary.collectionAmountPerMember || 0;
    var targetCollection = totalMembers * collectionAmountPerMember;
    var collectedInTarget = Math.min(summary.collectionTotal, targetCollection);
    var unpaidTargetAmount = Math.max(targetCollection - collectedInTarget, 0);
    var spentInTarget = Math.min(summary.expensesTotal, collectedInTarget);
    return {
      summary: summary,
      collectionAmountPerMember: collectionAmountPerMember,
      totalMembers: totalMembers,
      targetCollection: targetCollection,
      collectionRate: targetCollection > 0 ? (summary.collectionTotal / targetCollection) * 100 : 0,
      paymentRate: totalMembers > 0 ? (summary.paidMembers / totalMembers) * 100 : 0,
      unpaidTargetAmount: unpaidTargetAmount,
      remainingTargetAmount: Math.max(collectedInTarget - spentInTarget, 0),
      spentInTarget: spentInTarget,
      usageRate: targetCollection > 0 ? (spentInTarget / targetCollection) * 100 : 0,
      availableAfterExpenses: summary.availableAfterExpenses,
      outflowTypeCount: 0,
      pendingRefundCount: 0,
      pendingRefundTotal: 0
    };
  }

  function createEmptyState(message) {
    return '<div class="empty-state">' + escapeHtml(message) + "</div>";
  }

  function formatYen(value) {
    var numeric = normalizeNumber(value, 0);
    return "¥" + numeric.toLocaleString("ja-JP");
  }

  function formatDateLabel(value, includeTime) {
    if (!value) {
      return "--";
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    var options = includeTime
      ? {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      : {
          year: "numeric",
          month: "numeric",
          day: "numeric"
        };

    return new Intl.DateTimeFormat("ja-JP", options).format(date);
  }

  function formatPercent(value) {
    var numeric = normalizeNumber(value, 0);
    var rounded = Math.round(numeric * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + "%";
  }

  function setProgress(element, value) {
    if (!element) {
      return;
    }

    element.style.width = String(clampPercent(value)) + "%";
  }

  function clampPercent(value) {
    var numeric = normalizeNumber(value, 0);
    return Math.max(0, Math.min(100, numeric));
  }

  function normalizeText(value) {
    return String(value || "").trim();
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
