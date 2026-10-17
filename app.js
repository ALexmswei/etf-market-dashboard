const COLORS = {
  red: "#cf2d1c",
  blue: "#2f80c7",
  yellow: "#d89024",
  green: "#2db579",
  purple: "#8b6fc7",
  black: "#343b45",
  gray: "#aeb5bf",
  orange: "#df7b2d",
  pink: "#efa4a5",
};

const ETF_PAGE_IDS = new Set(["csi300", "csi500", "a500", "sse50"]);
const MENU = [
  {
    group: "指数 ETF",
    items: [
      { id: "csi300", label: "沪深300 ETF", color: COLORS.red },
      { id: "csi500", label: "中证500 ETF", color: COLORS.blue },
      { id: "a500", label: "中证A500", color: "#4f9ecf" },
      { id: "sse50", label: "上证50", color: "#2aa3a3" },
    ],
  },
  {
    group: "融资融券",
    items: [{ id: "margin", label: "融资融券", color: "#3c94c8" }],
  },
  {
    group: "大宗商品",
    items: [
      { id: "coal", label: "煤炭价格", color: "#99a2b2" },
      { id: "alumina", label: "电解铝·氧化铝", color: "#df8d22" },
      { id: "aluminumInventory", label: "铝锭库存", color: "#cf7920" },
      { id: "copperPrice", label: "电解铜价格", color: "#c26028" },
      { id: "copperInventory", label: "电解铜库存", color: "#b66331" },
      { id: "lithiumSpot", label: "碳酸锂现货", color: "#27ac78" },
      { id: "lithiumWarrant", label: "碳酸锂仓单", color: "#209c6c" },
      { id: "goldReserve", label: "黄金储备", color: "#e1ac24" },
    ],
  },
  {
    group: "航运与水电",
    items: [
      { id: "scfi", label: "集运运价 SCFI", color: "#27a9b8" },
      { id: "hydropower", label: "长电来水发电", color: "#258ec1" },
      { id: "threeGorges", label: "三峡水库水位", color: "#1ba184" },
    ],
  },
];

const state = {
  data: null,
  catalog: null,
  commodities: null,
  activePage: "csi300",
  activeBoard: "csi300",
  visible: new Set(),
  hoverIndex: null,
  chartBox: null,
};

const els = {
  menu: document.querySelector("#menu"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  pageBadge: document.querySelector("#pageBadge"),
  sidebarDate: document.querySelector("#sidebarDate"),
  updateStatus: document.querySelector("#updateStatus"),
  dashboardPage: document.querySelector("#dashboardPage"),
  commodityPage: document.querySelector("#commodityPage"),
  sourcePage: document.querySelector("#sourcePage"),
  summaryCards: document.querySelector("#summaryCards"),
  chartHeading: document.querySelector("#chartHeading"),
  chartDescription: document.querySelector("#chartDescription"),
  primarySourceLink: document.querySelector("#primarySourceLink"),
  seriesLegend: document.querySelector("#seriesLegend"),
  chartWrap: document.querySelector("#chartWrap"),
  chart: document.querySelector("#shareChart"),
  tooltip: document.querySelector("#chartTooltip"),
  resetChart: document.querySelector("#resetChart"),
  sourceSummary: document.querySelector("#sourceSummary"),
  sourceRows: document.querySelector("#sourceRows"),
  sourceDescription: document.querySelector("#sourceDescription"),
  sourceCount: document.querySelector("#sourceCount"),
  methodList: document.querySelector("#methodList"),
};

const chartRegistry = new Map();
let observedCommodityPage = false;

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSigned(value, digits = 2) {
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

function setHeader(title, subtitle, badge) {
  els.pageTitle.textContent = title;
  els.pageSubtitle.textContent = subtitle;
  els.pageBadge.textContent = badge;
}

function setUpdateStatus(message, stateName = "") {
  if (!els.updateStatus) return;
  els.updateStatus.textContent = message;
  els.updateStatus.className = `update-status${stateName ? ` ${stateName}` : ""}`;
}

function renderMenu() {
  const fragment = document.createDocumentFragment();
  MENU.forEach((group) => {
    const title = document.createElement("div");
    title.className = "menu-group-title";
    title.textContent = group.group;
    fragment.appendChild(title);
    group.items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.dataset.page = item.id;
      button.style.setProperty("--dot", item.color);
      button.innerHTML = `<span class="menu-dot" aria-hidden="true"></span><span>${item.label}</span>`;
      if (item.id === state.activePage) button.classList.add("active");
      button.addEventListener("click", () => selectPage(item.id));
      fragment.appendChild(button);
    });
  });
  els.menu.replaceChildren(fragment);
}

function currentBoard() {
  return state.data.boards[state.activeBoard];
}

function getObservationValues(index) {
  const board = currentBoard();
  return board.series.map((series) => ({
    series,
    value: board.observations[index][series.code],
  }));
}

function renderSummaryCards() {
  const board = currentBoard();
  const observations = board.observations;
  const latest = observations.at(-1);
  const previous = observations.at(-2);
  const fragment = document.createDocumentFragment();
  board.series.forEach((series, index) => {
    const value = latest[series.code];
    const delta = value - previous[series.code];
    const pct = previous[series.code] ? (delta / previous[series.code]) * 100 : 0;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const card = document.createElement("article");
    card.className = `summary-card${index === 0 ? " selected" : ""}`;
    card.style.setProperty("--card-color", series.color);
    card.innerHTML = `
      <p class="summary-name"><strong>${series.name}</strong> · ${series.code}</p>
      <div class="summary-row">
        <span class="summary-value">${formatNumber(value)}</span>
        <span class="summary-unit">亿份</span>
      </div>
      <div class="summary-change ${direction}">
        ${formatSigned(delta)}亿 (${formatSigned(pct)}%)
      </div>
    `;
    fragment.appendChild(card);
  });
  els.summaryCards.replaceChildren(fragment);
}

function renderSeriesLegend() {
  const board = currentBoard();
  const fragment = document.createDocumentFragment();
  board.series.forEach((series) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "series-button";
    button.style.setProperty("--series-color", series.color);
    button.setAttribute("aria-pressed", String(state.visible.has(series.code)));
    button.title = `${series.name} · ${series.code}`;
    button.innerHTML = `
      <span class="series-swatch" aria-hidden="true"></span>
      <span>${series.name} ${series.code}</span>
    `;
    button.addEventListener("click", () => {
      if (state.visible.has(series.code)) {
        if (state.visible.size > 1) state.visible.delete(series.code);
      } else {
        state.visible.add(series.code);
      }
      renderSeriesLegend();
      renderChart();
    });
    fragment.appendChild(button);
  });
  els.seriesLegend.replaceChildren(fragment);
}

function makeSvgElement(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function dateTickIndices(length, count) {
  if (length <= count) return Array.from({ length }, (_, index) => index);
  return [
    ...new Set(
      Array.from({ length: count }, (_, index) =>
        Math.round((index * (length - 1)) / (count - 1)),
      ),
    ),
  ];
}

function nearestIndexFromPointer(clientX, box) {
  const rect = box.svg.getBoundingClientRect();
  const viewX = ((clientX - rect.left) / rect.width) * box.width;
  if (viewX < box.margin.left || viewX > box.margin.left + box.plotWidth) return null;
  const ratio =
    (viewX - box.margin.left) / Math.max(1, box.plotWidth);
  return Math.max(
    0,
    Math.min(box.length - 1, Math.round(ratio * (box.length - 1))),
  );
}

function showEtfTooltip(index, x, y) {
  const board = currentBoard();
  const values = getObservationValues(index).filter((item) =>
    state.visible.has(item.series.code),
  );
  els.tooltip.innerHTML = `
    <strong>${board.observations[index].date}</strong>
    ${values
      .map(
        (item) => `
          <div class="tooltip-row">
            <span class="tooltip-swatch" style="background:${item.series.color}"></span>
            <span>${item.series.short} ${item.series.code}</span>
            <strong>${formatNumber(item.value)}亿</strong>
          </div>
        `,
      )
      .join("")}
  `;
  els.tooltip.hidden = false;
  const wrapWidth = els.chartWrap.clientWidth;
  let left = x + 14;
  const tooltipWidth = els.tooltip.offsetWidth || 230;
  if (left + tooltipWidth > wrapWidth - 8) left = x - tooltipWidth - 14;
  left = Math.max(8, left);
  let top = y - (els.tooltip.offsetHeight || 150) - 18;
  if (top < 8) top = y + 18;
  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

function renderChart() {
  if (!state.data || !ETF_PAGE_IDS.has(state.activePage)) return;
  const board = currentBoard();
  const observations = board.observations;
  const width = Math.max(360, els.chartWrap.clientWidth || 1000);
  const height = window.innerWidth <= 620 ? 430 : 450;
  const mobile = width < 640;
  const margin = {
    top: 40,
    right: mobile ? 16 : 28,
    bottom: 48,
    left: mobile ? 58 : 74,
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = observations.flatMap((observation) =>
    board.series
      .filter((series) => state.visible.has(series.code))
      .map((series) => observation[series.code]),
  );
  const yMax = Math.max(50, Math.ceil(Math.max(...values, 0) / 50) * 50);
  const xForIndex = (index) =>
    margin.left + (index / Math.max(1, observations.length - 1)) * plotWidth;
  const yForValue = (value) =>
    margin.top + plotHeight - (value / yMax) * plotHeight;
  const box = {
    svg: els.chart,
    width,
    plotWidth,
    margin,
    length: observations.length,
    xForIndex,
    yForValue,
  };
  state.chartBox = box;
  els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.chart.setAttribute("height", String(height));
  els.chart.replaceChildren();

  for (let value = 0; value <= yMax; value += 50) {
    const y = yForValue(value);
    els.chart.appendChild(
      makeSvgElement("line", {
        x1: margin.left,
        x2: margin.left + plotWidth,
        y1: y,
        y2: y,
        class: "chart-grid-line",
      }),
    );
    const label = makeSvgElement("text", {
      x: margin.left - 12,
      y: y + 4,
      "text-anchor": "end",
      class: "chart-axis",
    });
    label.textContent = `${formatNumber(value, 1)}亿`;
    els.chart.appendChild(label);
  }

  dateTickIndices(observations.length, mobile ? 4 : 9).forEach((index) => {
    const x = xForIndex(index);
    const label = makeSvgElement("text", {
      x,
      y: margin.top + plotHeight + 31,
      "text-anchor": "middle",
      class: "chart-axis",
    });
    label.textContent = observations[index].date;
    els.chart.appendChild(label);
  });

  board.series
    .filter((series) => state.visible.has(series.code))
    .forEach((series) => {
      const group = makeSvgElement("g", {
        style: `--series-color:${series.color}`,
      });
      group.appendChild(
        makeSvgElement("path", {
          class: "chart-path",
          d: observations
            .map(
              (item, index) =>
                `${index ? "L" : "M"}${xForIndex(index).toFixed(2)},${yForValue(
                  item[series.code],
                ).toFixed(2)}`,
            )
            .join(" "),
        }),
      );
      observations.forEach((item, index) => {
        group.appendChild(
          makeSvgElement("circle", {
            cx: xForIndex(index),
            cy: yForValue(item[series.code]),
            r: mobile ? 2.2 : 3,
            class: "chart-point",
          }),
        );
      });
      els.chart.appendChild(group);
    });

  if (state.hoverIndex != null) {
    const index = state.hoverIndex;
    const x = xForIndex(index);
    els.chart.appendChild(
      makeSvgElement("line", {
        x1: x,
        x2: x,
        y1: margin.top,
        y2: margin.top + plotHeight,
        class: "chart-guide",
      }),
    );
    getObservationValues(index)
      .filter((item) => state.visible.has(item.series.code))
      .forEach((item) => {
        els.chart.appendChild(
          makeSvgElement("circle", {
            cx: x,
            cy: yForValue(item.value),
            r: 5,
            fill: "#ffffff",
            stroke: item.series.color,
            "stroke-width": 2.5,
            "vector-effect": "non-scaling-stroke",
          }),
        );
      });
  }
}

function bindEtfChart() {
  els.chart.addEventListener("pointermove", (event) => {
    const index = nearestIndexFromPointer(event.clientX, state.chartBox);
    if (index == null) return;
    state.hoverIndex = index;
    renderChart();
    const box = state.chartBox;
    const first = currentBoard().series[0].code;
    const x = box.xForIndex(index);
    const y = box.yForValue(currentBoard().observations[index][first]);
    showEtfTooltip(index, x, y);
  });
  els.chart.addEventListener("pointerleave", () => {
    state.hoverIndex = null;
    els.tooltip.hidden = true;
    renderChart();
  });
  els.resetChart.addEventListener("click", () => {
    const board = currentBoard();
    state.visible = new Set(board.series.map((series) => series.code));
    state.hoverIndex = null;
    els.tooltip.hidden = true;
    renderSeriesLegend();
    renderChart();
  });
}

function renderEtfBoard(boardId) {
  state.activeBoard = boardId;
  const board = state.data.boards[boardId];
  setHeader(board.title, board.subtitle, board.badge);
  els.chartHeading.textContent = "总份额变化曲线（全部）";
  els.chartDescription.textContent = `${board.observations[0].date} 至 ${
    board.observations.at(-1).date
  }，${board.series.length} 只基金日终总份额。`;
  els.primarySourceLink.textContent = board.source.name;
  els.primarySourceLink.href = board.source.url;
  state.visible = new Set(board.series.map((series) => series.code));
  state.hoverIndex = null;
  renderSummaryCards();
  renderSeriesLegend();
  requestAnimationFrame(renderChart);
}

function seriesPointRows(observations, series) {
  return observations.map((item) => ({
    date: item.date,
    values: series.map((line) => ({
      key: line.key,
      label: line.label,
      color: line.color,
      value: item[line.key],
    })),
  }));
}

function drawCartesianChart(options) {
  const svg = document.querySelector(`#${options.svgId}`);
  const wrap = svg?.closest(".mini-chart-wrap, .coal-chart-wrap");
  if (!svg || !wrap) return;
  const rows = options.rows;
  const width = Math.max(320, wrap.clientWidth || 600);
  const height = options.height || 300;
  const mobile = width < 520;
  const dualAxis = Boolean(options.secondaryAxisKey);
  const margin = {
    top: 34,
    right: dualAxis ? 58 : 22,
    bottom: 44,
    left: mobile ? 52 : 68,
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const primaryLines = options.lines;
  const values = rows.flatMap((row) =>
    primaryLines.map((line) => row[line.key]).filter((value) => Number.isFinite(value)),
  );
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const pad = Math.max(1, (maxRaw - minRaw) * 0.08);
  const yMin = options.yMin ?? minRaw - pad;
  const yMax = options.yMax ?? maxRaw + pad;
  const yFor = (value) =>
    margin.top + plotHeight - ((value - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
  const xFor = (index) =>
    margin.left + (index / Math.max(1, rows.length - 1)) * plotWidth;
  const formatY = options.formatY || ((value) => formatNumber(value, 0));

  let secondary = null;
  if (dualAxis) {
    const secondaryValues = rows
      .map((row) => row[options.secondaryAxisKey])
      .filter(Number.isFinite);
    const secondaryPad = Math.max(
      0.5,
      (Math.max(...secondaryValues) - Math.min(...secondaryValues)) * 0.12,
    );
    const secondaryMin = Math.min(...secondaryValues) - secondaryPad;
    const secondaryMax = Math.max(...secondaryValues) + secondaryPad;
    secondary = {
      min: secondaryMin,
      max: secondaryMax,
      yFor: (value) =>
        margin.top +
        plotHeight -
        ((value - secondaryMin) / Math.max(0.01, secondaryMax - secondaryMin)) *
          plotHeight,
    };
  }

  const box = {
    svg,
    wrap,
    width,
    height,
    rows,
    lines: options.lines,
    margin,
    plotWidth,
    plotHeight,
    xFor,
    yFor,
    secondary,
    secondaryAxisKey: options.secondaryAxisKey,
    tooltipId: options.tooltipId,
    formatY,
    formatValue: options.formatValue || ((value) => formatNumber(value, 0)),
    activeIndex: null,
  };
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("height", String(height));
  svg.replaceChildren();

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const value = yMax - ratio * (yMax - yMin);
    const y = margin.top + ratio * plotHeight;
    svg.appendChild(
      makeSvgElement("line", {
        x1: margin.left,
        x2: margin.left + plotWidth,
        y1: y,
        y2: y,
        class: "chart-grid-line",
      }),
    );
    const label = makeSvgElement("text", {
      x: margin.left - 9,
      y: y + 4,
      "text-anchor": "end",
      class: "chart-axis mini",
    });
    label.textContent = formatY(value);
    svg.appendChild(label);
    if (secondary) {
      const secondaryValue =
        secondary.max - ratio * (secondary.max - secondary.min);
      const rightLabel = makeSvgElement("text", {
        x: margin.left + plotWidth + 9,
        y: y + 4,
        "text-anchor": "start",
        class: "chart-axis mini",
      });
      rightLabel.textContent = formatNumber(secondaryValue, 0);
      svg.appendChild(rightLabel);
    }
  }

  dateTickIndices(rows.length, mobile ? 4 : 6).forEach((index) => {
    const label = makeSvgElement("text", {
      x: xFor(index),
      y: margin.top + plotHeight + 28,
      "text-anchor": "middle",
      class: "chart-axis mini",
    });
    label.textContent = rows[index].date;
    svg.appendChild(label);
  });

  options.lines.forEach((line) => {
    if (line.type === "bar") {
      const barWidth = Math.max(2, (plotWidth / rows.length) * 0.62);
      rows.forEach((row, index) => {
        const value = row[line.key];
        if (!Number.isFinite(value)) return;
        const y = yFor(value);
        svg.appendChild(
          makeSvgElement("rect", {
            x: xFor(index) - barWidth / 2,
            y,
            width: barWidth,
            height: Math.max(1, margin.top + plotHeight - y),
            rx: Math.min(2, barWidth / 3),
            fill: line.color,
          }),
        );
      });
      return;
    }
    const axisY = line.secondary && secondary ? secondary.yFor : yFor;
    if (options.colorByChange) {
      rows.forEach((row, index) => {
        if (index === 0) return;
        const previous = row[line.key];
        const current = rows[index][line.key];
        const before = rows[index - 1][line.key];
        const color = current >= before ? COLORS.red : COLORS.green;
        svg.appendChild(
          makeSvgElement("line", {
            x1: xFor(index - 1),
            y1: axisY(before),
            x2: xFor(index),
            y2: axisY(current),
            stroke: color,
            "stroke-width": 2.2,
            "vector-effect": "non-scaling-stroke",
          }),
        );
        if (index === 1 && previous && false) return;
      });
      return;
    }
    svg.appendChild(
      makeSvgElement("path", {
        d: rows
          .map(
            (row, index) =>
              `${index ? "L" : "M"}${xFor(index).toFixed(2)},${axisY(
                row[line.key],
              ).toFixed(2)}`,
          )
          .join(" "),
        fill: "none",
        stroke: line.color,
        "stroke-width": line.width || 2,
        "stroke-dasharray": line.dash || "",
        "vector-effect": "non-scaling-stroke",
      }),
    );
    if (line.markers !== false) {
      rows.forEach((row, index) => {
        svg.appendChild(
          makeSvgElement("circle", {
            cx: xFor(index),
            cy: axisY(row[line.key]),
            r: mobile ? 1.9 : 2.6,
            fill: line.color,
            stroke: "#ffffff",
            "stroke-width": 0.8,
            "vector-effect": "non-scaling-stroke",
          }),
        );
      });
    }
  });

  const guide = makeSvgElement("line", {
    class: "chart-guide",
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: margin.top + plotHeight,
    visibility: "hidden",
  });
  svg.appendChild(guide);
  const overlay = makeSvgElement("rect", {
    x: margin.left,
    y: margin.top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
  });
  svg.appendChild(overlay);

  const updateTooltip = (index) => {
    const tooltip = document.querySelector(`#${options.tooltipId}`);
    if (!tooltip) return;
    tooltip.hidden = false;
    tooltip.innerHTML = `
      <strong>${rows[index].date}</strong>
      ${options.lines
        .filter((line) => line.type !== "bar")
        .map(
          (line) => `
            <div class="tooltip-row">
              <span class="tooltip-swatch" style="background:${line.color}"></span>
              <span>${line.label}</span>
              <strong>${options.formatValue(rows[index][line.key])}</strong>
            </div>
          `,
        )
        .join("")}
    `;
    const scaleX = width / wrap.getBoundingClientRect().width;
    const leftPosition = xFor(index) / scaleX;
    let left = leftPosition + 12;
    const tooltipWidth = tooltip.offsetWidth || 190;
    if (left + tooltipWidth > wrap.clientWidth - 4) {
      left = leftPosition - tooltipWidth - 12;
    }
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${Math.max(4, margin.top + 12)}px`;
  };

  overlay.addEventListener("pointermove", (event) => {
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(
      0,
      Math.min(
        rows.length - 1,
        Math.round(
          ((viewX - margin.left) / Math.max(1, plotWidth)) * (rows.length - 1),
        ),
      ),
    );
    guide.setAttribute("x1", xFor(index));
    guide.setAttribute("x2", xFor(index));
    guide.setAttribute("visibility", "visible");
    updateTooltip(index);
  });
  overlay.addEventListener("pointerleave", () => {
    guide.setAttribute("visibility", "hidden");
    const tooltip = document.querySelector(`#${options.tooltipId}`);
    if (tooltip) tooltip.hidden = true;
  });

  const key = options.svgId;
  chartRegistry.set(key, () => drawCartesianChart(options));
}

function attachCommodityResizeObserver() {
  if (observedCommodityPage) return;
  observedCommodityPage = true;
  const observer = new ResizeObserver(() => {
    if (!els.commodityPage.hidden) {
      chartRegistry.forEach((redraw) => redraw());
    }
  });
  observer.observe(els.commodityPage);
}

function coalSummary(observations) {
  const latest = observations.at(-1);
  const previous = observations.at(-2);
  return [
    ["Q5500K 动力煤", latest.q5500, latest.q5500 - previous.q5500, COLORS.red],
    ["Q5000K 动力煤", latest.q5000, latest.q5000 - previous.q5000, COLORS.yellow],
    ["Q4500K 动力煤", latest.q4500, latest.q4500 - previous.q4500, COLORS.green],
  ];
}

function renderCoalPage() {
  const data = state.commodities.coal;
  const observations = data.observations;
  const summary = coalSummary(observations);
  els.commodityPage.innerHTML = `
    <div class="summary-grid summary-grid-3">
      ${summary
        .map(
          ([label, value, delta, color], index) => `
            <article class="summary-card${index === 0 ? " selected" : ""}"
              style="--card-color:${color}">
              <p class="summary-name"><strong>${label}</strong></p>
              <div class="summary-row">
                <span class="summary-value">${value}</span>
                <span class="summary-unit">元/吨</span>
              </div>
              <div class="summary-change ${delta >= 0 ? "up" : "down"}">
                ${formatSigned(delta, 0)}元/吨
                (${formatSigned((delta / (value - delta)) * 100)}%)
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
    <section class="chart-card">
      <div class="chart-head">
        <div>
          <h3>动力煤现货参考价走势（元/吨）</h3>
          <div class="updown-legend">
            <span><i class="legend-dot up"></i>价格上涨</span>
            <span><i class="legend-dot down"></i>价格下跌</span>
          </div>
        </div>
        <span class="data-source">数据来源：CCTD中国煤炭市场网</span>
      </div>
      <div class="series-legend static">
        <span><i class="series-swatch" style="--series-color:${COLORS.red}"></i>Q5500K (5500大卡)</span>
        <span><i class="series-swatch" style="--series-color:${COLORS.yellow}"></i>Q5000K (5000大卡)</span>
        <span><i class="series-swatch" style="--series-color:${COLORS.green}"></i>Q4500K (4500大卡)</span>
      </div>
      <div class="coal-chart-wrap">
        <svg id="coalChart" role="img" aria-label="环渤海动力煤现货参考价走势"></svg>
        <div class="chart-tooltip" id="coalTooltip" hidden></div>
      </div>
      <div class="range-panel">
        <span>时间区间</span>
        <input type="range" id="coalRange" min="0" max="${Math.max(
          0,
          observations.length - 60,
        )}" value="0" aria-label="煤炭价格时间区间">
        <span id="coalRangeLabel">共 ${observations.length} 个交易日 · ${
          observations[0].date
        } ~ ${observations.at(-1).date}</span>
      </div>
    </section>
  `;
  const draw = (start = 0) => {
    const rows = observations.slice(start);
    drawCartesianChart({
      svgId: "coalChart",
      tooltipId: "coalTooltip",
      rows,
      height: window.innerWidth <= 620 ? 420 : 520,
      yMin: 400,
      yMax: 1100,
      colorByChange: true,
      formatY: (value) => `${Math.round(value)}元`,
      formatValue: (value) => `${formatNumber(value, 0)}元/吨`,
      lines: [
        { key: "q5500", label: "Q5500K", color: COLORS.red },
        { key: "q5000", label: "Q5000K", color: COLORS.yellow },
        { key: "q4500", label: "Q4500K", color: COLORS.green },
      ],
    });
  };
  draw(0);
  const range = document.querySelector("#coalRange");
  const label = document.querySelector("#coalRangeLabel");
  range.addEventListener("input", () => {
    const start = Number(range.value);
    draw(start);
    label.textContent = `共 ${observations.length - start} 个交易日 · ${
      observations[start].date
    } ~ ${observations.at(-1).date}`;
  });
}

function aluminaSummary(rows) {
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  return [
    ["A00铝均价", latest.a00Average, latest.a00Change, "+205", COLORS.red],
    ["A00铝涨跌", latest.a00Change, latest.a00Change, "", COLORS.red],
    ["氧化铝均价", latest.aluminaAverage, latest.aluminaChange, "-6", COLORS.orange],
    ["氧化铝涨跌", latest.aluminaChange, latest.aluminaChange, "-5", COLORS.orange],
    [
      "铝-氧化铝价差",
      latest.spread,
      latest.spread - previous.spread,
      "+210",
      COLORS.orange,
    ],
  ];
}

function renderAluminaPage() {
  const data = state.commodities.alumina;
  const rows = data.observations;
  const summary = aluminaSummary(rows);
  els.commodityPage.innerHTML = `
    <div class="summary-grid summary-grid-5">
      ${summary
        .map(
          ([label, value, delta, context, color], index) => `
            <article class="summary-card${index === 0 ? " selected" : ""}"
              style="--card-color:${color}">
              <p class="summary-name"><strong>${label}</strong></p>
              <div class="summary-row">
                <span class="summary-value">${formatNumber(value, 0)}</span>
                <span class="summary-unit">元/吨</span>
                <span class="inline-change ${delta >= 0 ? "up" : "down"}">
                  ${context || formatSigned(delta, 0)}
                </span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="alumina-grid">
      <section class="mini-chart-card">
        <h3>A00铝 价格走势（元/吨）</h3>
        <div class="mini-legend">
          <span><i style="background:${COLORS.orange}"></i>均价</span>
          <span><i style="background:${COLORS.black}"></i>最低价</span>
          <span><i style="background:${COLORS.gray}"></i>最高价</span>
        </div>
        <div class="mini-chart-wrap">
          <svg id="a00Chart" role="img" aria-label="A00铝价格走势"></svg>
          <div class="chart-tooltip" id="a00Tooltip" hidden></div>
        </div>
      </section>
      <section class="mini-chart-card">
        <h3>氧化铝(山西) 价格走势（元/吨）</h3>
        <div class="mini-legend">
          <span><i style="background:${COLORS.blue}"></i>均价</span>
          <span><i style="background:${COLORS.black}"></i>最低价</span>
          <span><i style="background:${COLORS.gray}"></i>最高价</span>
        </div>
        <div class="mini-chart-wrap">
          <svg id="aluminaChart" role="img" aria-label="山西氧化铝价格走势"></svg>
          <div class="chart-tooltip" id="aluminaTooltip" hidden></div>
        </div>
      </section>
      <section class="mini-chart-card">
        <h3>电解铝 vs 氧化铝价差</h3>
        <div class="mini-chart-wrap">
          <svg id="spreadChart" role="img" aria-label="电解铝与氧化铝价差"></svg>
          <div class="chart-tooltip" id="spreadTooltip" hidden></div>
        </div>
      </section>
      <section class="mini-chart-card">
        <h3>价格对比（近20日）</h3>
        <div class="mini-legend">
          <span><i style="background:${COLORS.orange}"></i>A00铝</span>
          <span><i style="background:${COLORS.blue}"></i>氧化铝</span>
        </div>
        <div class="mini-chart-wrap">
          <svg id="compareChart" role="img" aria-label="A00铝与氧化铝近20日价格对比"></svg>
          <div class="chart-tooltip" id="compareTooltip" hidden></div>
        </div>
      </section>
    </div>
  `;
  const chartHeight = window.innerWidth <= 620 ? 300 : 285;
  drawCartesianChart({
    svgId: "a00Chart",
    tooltipId: "a00Tooltip",
    rows,
    height: chartHeight,
    lines: [
      { key: "a00Average", label: "均价", color: COLORS.orange },
      { key: "a00Low", label: "最低价", color: COLORS.black, markers: false },
      { key: "a00High", label: "最高价", color: COLORS.gray, markers: false },
    ],
    formatValue: (value) => `${formatNumber(value, 0)}元/吨`,
  });
  drawCartesianChart({
    svgId: "aluminaChart",
    tooltipId: "aluminaTooltip",
    rows,
    height: chartHeight,
    lines: [
      { key: "aluminaAverage", label: "均价", color: COLORS.blue },
      { key: "aluminaLow", label: "最低价", color: COLORS.black, markers: false },
      { key: "aluminaHigh", label: "最高价", color: COLORS.gray, markers: false },
    ],
    formatValue: (value) => `${formatNumber(value, 0)}元/吨`,
  });
  drawCartesianChart({
    svgId: "spreadChart",
    tooltipId: "spreadTooltip",
    rows,
    height: chartHeight,
    yMin: 0,
    lines: [
      { key: "spread", label: "价差", color: COLORS.pink, type: "bar" },
    ],
    formatValue: (value) => `${formatNumber(value, 0)}元/吨`,
  });
  drawCartesianChart({
    svgId: "compareChart",
    tooltipId: "compareTooltip",
    rows: rows.slice(-20),
    height: chartHeight,
    secondaryAxisKey: "aluminaAverage",
    lines: [
      { key: "a00Average", label: "A00铝", color: COLORS.orange },
      {
        key: "aluminaAverage",
        label: "氧化铝",
        color: COLORS.blue,
        secondary: true,
      },
    ],
    formatValue: (value) => `${formatNumber(value, 0)}元/吨`,
  });
}

function renderCommodityPage(pageId) {
  attachCommodityResizeObserver();
  if (pageId === "coal") {
    const data = state.commodities.coal;
    setHeader(
      data.meta.title,
      "中国煤炭市场网 · 日度现货参考价",
      `${data.meta.historyCount}个交易日 · ${data.meta.startDate} ~ ${data.meta.latestDate}`,
    );
    renderCoalPage();
  } else {
    const data = state.commodities.alumina;
    setHeader(
      data.meta.title,
      "上海有色网 · 现货价格",
      `${data.meta.windowDays}个交易日 · ${data.observations[0].date} ~ ${data.meta.latestDate}`,
    );
    renderAluminaPage();
  }
}

function renderCatalog(pageId) {
  const item = state.catalog[pageId];
  if (!item) return;
  [
    ["核心指标", item.metric],
    ["更新频率", item.frequency],
    ["首选来源", item.primaryAuthority],
  ].forEach(([label, value]) => {
    const stat = document.createElement("article");
    stat.className = "source-stat";
    stat.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    els.sourceSummary.appendChild(stat);
  });
  els.sourceDescription.textContent = item.description;
  els.sourceCount.textContent = `${item.sources.length} 个来源`;
  els.sourceRows.replaceChildren();
  item.sources.forEach((source) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${source.name}</td>
      <td>${source.fields}</td>
      <td>${source.frequency}</td>
      <td><a href="${source.url}" target="_blank" rel="noreferrer">打开来源</a></td>
    `;
    els.sourceRows.appendChild(row);
  });
  els.methodList.replaceChildren();
  item.methods.forEach((method) => {
    const li = document.createElement("li");
    li.textContent = method;
    els.methodList.appendChild(li);
  });
}

function selectPage(pageId, updateUrl = true) {
  state.activePage = pageId;
  document.querySelectorAll(".menu-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (pageId === "csi300") url.searchParams.delete("page");
    else url.searchParams.set("page", pageId);
    history.replaceState({}, "", url);
  }

  els.dashboardPage.hidden = true;
  els.commodityPage.hidden = true;
  els.sourcePage.hidden = true;
  els.dashboardPage.classList.remove("active");
  els.commodityPage.classList.remove("active");
  els.sourcePage.classList.remove("active");

  if (ETF_PAGE_IDS.has(pageId)) {
    els.dashboardPage.hidden = false;
    els.dashboardPage.classList.add("active");
    renderEtfBoard(pageId);
  } else if (pageId === "coal" || pageId === "alumina") {
    els.commodityPage.hidden = false;
    els.commodityPage.classList.add("active");
    renderCommodityPage(pageId);
  } else {
    els.sourcePage.hidden = false;
    els.sourcePage.classList.add("active");
    const item = state.catalog[pageId];
    setHeader(item.title, item.subtitle || "公开数据源目录", `${item.sources.length}个数据源`);
    els.sourceSummary.replaceChildren();
    renderCatalog(pageId);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadData({ preservePage = false } = {}) {
  const [boardResponse, catalogResponse, commodityResponse] = await Promise.all([
    fetch("./data/etf-boards.json"),
    fetch("./data/data-sources.json"),
    fetch("./data/commodity-data.json"),
  ]);
  if (!boardResponse.ok || !catalogResponse.ok || !commodityResponse.ok) {
    throw new Error("数据文件载入失败");
  }
  state.data = await boardResponse.json();
  state.catalog = await catalogResponse.json();
  state.commodities = await commodityResponse.json();
  els.sidebarDate.textContent = state.data.meta.latestDate;
  if (preservePage) {
    selectPage(state.activePage, false);
    return;
  }
  renderEtfBoard("csi300");
  const requested = new URLSearchParams(window.location.search).get("page");
  if (requested) {
    if (ETF_PAGE_IDS.has(requested) || requested === "coal" || requested === "alumina") {
      selectPage(requested, false);
    } else if (state.catalog[requested]) {
      selectPage(requested, false);
    }
  }
}

async function autoRefreshData() {
  if (!["127.0.0.1", "localhost"].includes(window.location.hostname)) {
    setUpdateStatus("公网版按计划自动更新", "");
    return;
  }
  setUpdateStatus("正在检查最新数据…", "updating");
  try {
    const response = await fetch("/api/refresh", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.updated) {
      await loadData({ preservePage: true });
      setUpdateStatus(`已更新至 ${result.latestDate}`, "updated");
    } else if (result.running) {
      setUpdateStatus("数据更新进行中，稍后重新打开即可", "updating");
    } else {
      setUpdateStatus(`已是最新数据 ${result.latestDate || ""}`.trim(), "updated");
    }
  } catch (error) {
    setUpdateStatus("自动更新服务不可用，当前显示已保存数据", "error");
  }
}

function init() {
  renderMenu();
  bindEtfChart();
  const observer = new ResizeObserver(() => {
    if (!els.dashboardPage.hidden) renderChart();
  });
  observer.observe(els.chartWrap);
  loadData()
    .then(autoRefreshData)
    .catch((error) => {
      els.summaryCards.innerHTML = `<div class="source-stat"><span>载入失败</span><strong>${error.message}</strong></div>`;
    });
}

init();
