const USAGE_KEY = "__title_usage";

const state = {
  rows: [],
  headers: [],
  titleKey: "",
  idKey: "",
  summaryKey: "",
  filters: {},
  sortKey: "",
  sortDirection: "asc",
  page: 1,
  rowsPerPage: 100,
  groupByTitle: false,
  fileName: "",
};

const fileInput = document.querySelector("#csv-file");
const chooseFileButton = document.querySelector("#choose-file");
const sampleButton = document.querySelector("#load-sample");
const dropzone = document.querySelector("#dropzone");
const statusMessage = document.querySelector("#status-message");
const tableHead = document.querySelector("#table-head");
const tableBody = document.querySelector("#table-body");
const table = document.querySelector("#data-table");
const tableColumns = document.querySelector("#table-columns");
const stats = document.querySelector("#stats");
const clearFiltersButton = document.querySelector("#clear-filters");
const groupByTitleInput = document.querySelector("#group-by-title");
const rowsPerPageSelect = document.querySelector("#rows-per-page");
const exportGroupedButton = document.querySelector("#export-grouped");
const pagination = document.querySelector("#pagination");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const titleReport = document.querySelector("#title-report");
const titleReportBody = document.querySelector("#title-report-body");
const reportStats = document.querySelector("#report-stats");
const reportChartPanel = document.querySelector("#report-chart-panel");
const reportChart = document.querySelector("#report-chart");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeHeader(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeUniqueHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((header, index) => {
    const base = String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) || "";
  const options = [",", ";", "\t"];
  return options.reduce((best, candidate) =>
    countDelimiter(firstLine, candidate) > countDelimiter(firstLine, best) ? candidate : best,
  );
}

function parseCsv(text) {
  const cleanText = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleanText);
  const matrix = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];

    if (character === '"') {
      if (quoted && cleanText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && cleanText[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) matrix.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) matrix.push(row);

  if (matrix.length < 2) throw new Error("The file needs a header row and at least one data row.");

  const headers = makeUniqueHeaders(matrix[0]);
  const rows = matrix.slice(1).map((values, rowIndex) => {
    const output = { __row_index: rowIndex };
    headers.forEach((header, index) => {
      output[header] = String(values[index] ?? "").trim();
    });
    return output;
  });

  return { headers, rows, delimiter };
}

function findColumn(headers, candidates) {
  return headers.find((header) => candidates.includes(normalizeHeader(header))) || "";
}

function findLikelyColumn(headers, exactCandidates, includesCandidate) {
  return (
    findColumn(headers, exactCandidates) ||
    headers.find((header) => normalizeHeader(header).includes(includesCandidate)) ||
    ""
  );
}

function addTitleUsage(rows, titleKey) {
  const counts = new Map();
  rows.forEach((row) => {
    const title = String(row[titleKey] || "").trim().toLocaleLowerCase();
    if (title) counts.set(title, (counts.get(title) || 0) + 1);
  });
  rows.forEach((row) => {
    const title = String(row[titleKey] || "").trim().toLocaleLowerCase();
    row[USAGE_KEY] = title ? counts.get(title) : 0;
  });
}

function setStatus(message, kind = "neutral") {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
}

function getColumnLabel(key) {
  return key === USAGE_KEY ? "Title usage" : key;
}

function collectGroupedValues(rows, key) {
  const values = [];
  const seen = new Set();

  rows.forEach((row) => {
    const sourceValues = key === state.summaryKey ? String(row[key] || "").split("|") : [row[key]];
    sourceValues.forEach((value) => {
      const cleanValue = String(value ?? "").trim();
      const normalizedValue = cleanValue.toLocaleLowerCase();
      if (cleanValue && !seen.has(normalizedValue)) {
        seen.add(normalizedValue);
        values.push(cleanValue);
      }
    });
  });

  return values;
}

function getGroupedRows(forceGroup = state.groupByTitle) {
  if (!forceGroup) return state.rows;

  const groups = new Map();
  state.rows.forEach((row) => {
    const title = String(row[state.titleKey] || "").trim();
    const groupKey = title ? title.toLocaleLowerCase() : `__untitled_${row.__row_index}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  });

  return [...groups.values()].map((groupRows) => {
    const groupedRow = {
      __row_index: groupRows[0].__row_index,
      __group_size: groupRows.length,
      __group_values: {},
    };
    state.headers.forEach((key) => {
      if (key === state.titleKey) {
        groupedRow[key] = groupRows[0][key];
        return;
      }
      const values = collectGroupedValues(groupRows, key);
      groupedRow.__group_values[key] = values;
      groupedRow[key] = values.join(key === state.idKey ? ", " : " | ");
    });
    groupedRow[USAGE_KEY] = groupRows.length;
    return groupedRow;
  });
}

function getFilteredRows(rows = getGroupedRows()) {
  return rows.filter((row) =>
    [...state.headers, USAGE_KEY].every((key) => {
      const filter = String(state.filters[key] || "").trim().toLocaleLowerCase();
      if (!filter) return true;
      const value = row[key];

      if (key === USAGE_KEY) {
        const numericMatch = filter.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
        if (numericMatch) {
          const operator = numericMatch[1] || "=";
          const target = Number(numericMatch[2]);
          if (operator === ">=") return value >= target;
          if (operator === "<=") return value <= target;
          if (operator === ">") return value > target;
          if (operator === "<") return value < target;
          return value === target;
        }
      }

      return String(value ?? "").toLocaleLowerCase().includes(filter);
    }),
  );
}

function getSortedRows(rows) {
  if (!state.sortKey) return [...rows];
  const direction = state.sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((first, second) => {
    const a = first[state.sortKey];
    const b = second[state.sortKey];
    if (state.sortKey === USAGE_KEY) return (Number(a) - Number(b)) * direction;
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * direction;
  });
}

function getTitleFrequencyReport() {
  const titleCounts = new Map();

  state.rows.forEach((row) => {
    const title = String(row[state.titleKey] || "").trim();
    const normalizedTitle = title.toLocaleLowerCase();
    if (!normalizedTitle) return;

    if (!titleCounts.has(normalizedTitle)) {
      titleCounts.set(normalizedTitle, { title, count: 0 });
    }
    titleCounts.get(normalizedTitle).count += 1;
  });

  return [...titleCounts.values()]
    .filter((item) => item.count > 1)
    .sort((first, second) => second.count - first.count || first.title.localeCompare(second.title, undefined, { sensitivity: "base" }));
}

function renderTitleReport() {
  if (!state.rows.length) {
    titleReport.hidden = true;
    return;
  }

  const report = getTitleFrequencyReport();
  const repeatedRows = report.reduce((total, item) => total + item.count, 0);
  const highestUsage = report.length ? report[0].count : 0;

  titleReport.hidden = false;
  reportStats.innerHTML = `
    <span class="stat-chip"><strong>${report.length.toLocaleString()}</strong> repeated titles</span>
    <span class="stat-chip"><strong>${repeatedRows.toLocaleString()}</strong> matching rows</span>
    <span class="stat-chip"><strong>${highestUsage.toLocaleString()}</strong> highest usage</span>`;

  if (!report.length) {
    reportChartPanel.hidden = true;
    reportChart.innerHTML = "";
    titleReportBody.innerHTML = '<tr><td class="report-empty" colspan="3">No titles are repeated in this CSV.</td></tr>';
    return;
  }

  const chartItems = report.slice(0, 10);
  reportChartPanel.hidden = false;
  reportChart.classList.remove("is-visible");
  reportChart.innerHTML = chartItems
    .map((item, index) => {
      const width = highestUsage ? (item.count / highestUsage) * 100 : 0;
      return `<div class="chart-row" title="${escapeHtml(item.title)}: ${item.count.toLocaleString()} uses">
        <span class="chart-label">${escapeHtml(item.title)}</span>
        <span class="chart-track" aria-hidden="true"><span class="chart-bar" style="--bar-width: ${width.toFixed(2)}%; --bar-index: ${index}"></span></span>
        <span class="chart-value">${item.count.toLocaleString()}</span>
      </div>`;
    })
    .join("");

  const showChart = () => reportChart.classList.add("is-visible");
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(showChart));
  } else {
    showChart();
  }

  titleReportBody.innerHTML = report
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.title)}</td>
        <td><span class="usage-count">${item.count.toLocaleString()}</span></td>
        <td>${(item.count - 1).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
}

function renderSummaryCell(value) {
  const bullets = String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (bullets.length <= 1) return escapeHtml(value);
  return `<ul class="bullet-list">${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderCell(row, key) {
  const value = row[key];
  if (key === USAGE_KEY) return `<span class="usage-count">${escapeHtml(value)}</span>`;
  if (state.groupByTitle && row.__group_values && (key === state.idKey || key === state.summaryKey)) {
    const values = row.__group_values[key] || [];
    if (!values.length) return "—";
    const label = key === state.idKey
      ? `${values.length.toLocaleString()} ID${values.length === 1 ? "" : "s"}`
      : `${values.length.toLocaleString()} unique bullet${values.length === 1 ? "" : "s"}`;
    const content = key === state.idKey
      ? `<div class="folded-id-list">${values.map((item) => `<span class="id-value">${escapeHtml(item)}</span>`).join("")}</div>`
      : `<ul class="bullet-list">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    return `<details class="folded-cell"><summary>${label}</summary><div class="folded-content">${content}</div></details>`;
  }
  if (key === state.idKey) return `<span class="id-value">${escapeHtml(value)}</span>`;
  if (key === state.summaryKey) return renderSummaryCell(value);
  return escapeHtml(value);
}

function renderHeader() {
  const keys = [...state.headers, USAGE_KEY];
  const widths = keys.map((key) => {
    if (key === USAGE_KEY) return 140;
    if (key === state.idKey) return 210;
    if (key === state.titleKey) return 280;
    if (key === state.summaryKey) return 520;
    return 240;
  });
  tableColumns.innerHTML = widths.map((width) => `<col style="width: ${width}px" />`).join("");
  table.style.minWidth = `${widths.reduce((total, width) => total + width, 0)}px`;
  tableHead.innerHTML = `
    <tr class="header-row">
      ${keys
        .map((key) => {
          const active = state.sortKey === key;
          const ariaSort = active ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none";
          const icon = active ? (state.sortDirection === "asc" ? "↑" : "↓") : "↕";
          return `<th scope="col">
            <button class="sort-button" type="button" data-sort-key="${escapeHtml(key)}" aria-sort="${ariaSort}">
              <span>${escapeHtml(getColumnLabel(key))}</span><span class="sort-icon" aria-hidden="true">${icon}</span>
            </button>
          </th>`;
        })
        .join("")}
    </tr>
    <tr class="filter-row">
      ${keys
        .map((key) => {
          const placeholder = key === USAGE_KEY ? "e.g. >= 3" : `Filter ${getColumnLabel(key)}`;
          return `<th><input class="column-filter" type="search" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(state.filters[key] || "")}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" /></th>`;
        })
        .join("")}
    </tr>`;

  tableHead.querySelectorAll("[data-sort-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDirection = "asc";
      }
      state.page = 1;
      render();
    });
  });

  tableHead.querySelectorAll("[data-filter-key]").forEach((input) => {
    input.addEventListener("input", () => {
      state.filters[input.dataset.filterKey] = input.value;
      state.page = 1;
      renderBody();
    });
  });
}

function renderBody() {
  const filteredRows = getFilteredRows();
  const sortedRows = getSortedRows(filteredRows);
  const pageCount = state.rowsPerPage === 0 ? 1 : Math.max(1, Math.ceil(sortedRows.length / state.rowsPerPage));
  state.page = Math.min(state.page, pageCount);
  const start = state.rowsPerPage === 0 ? 0 : (state.page - 1) * state.rowsPerPage;
  const pageRows = state.rowsPerPage === 0 ? sortedRows : sortedRows.slice(start, start + state.rowsPerPage);
  const keys = [...state.headers, USAGE_KEY];

  if (!pageRows.length) {
    tableBody.innerHTML = `<tr><td class="empty-table" colspan="${keys.length}">No rows match the current filters.</td></tr>`;
  } else {
    tableBody.innerHTML = pageRows
      .map(
        (row) => `<tr>${keys
          .map((key) => `<td data-column="${key === state.titleKey ? "title" : "value"}">${renderCell(row, key)}</td>`)
          .join("")}</tr>`,
      )
      .join("");
  }

  const uniqueTitles = new Set(
    state.rows.map((row) => String(row[state.titleKey] || "").trim().toLocaleLowerCase()).filter(Boolean),
  ).size;
  stats.innerHTML = `
    <span class="stat-chip"><strong>${state.rows.length.toLocaleString()}</strong> rows</span>
    <span class="stat-chip"><strong>${uniqueTitles.toLocaleString()}</strong> unique titles</span>
    <span class="stat-chip"><strong>${filteredRows.length.toLocaleString()}</strong> ${state.groupByTitle ? "groups" : "rows"} shown</span>`;

  pagination.hidden = pageCount <= 1;
  pageLabel.textContent = `Page ${state.page} of ${pageCount}`;
  previousPageButton.disabled = state.page <= 1;
  nextPageButton.disabled = state.page >= pageCount;
  exportGroupedButton.disabled = !state.groupByTitle || !state.rows.length;
  exportGroupedButton.title = exportGroupedButton.disabled ? "Turn on Group by title to export" : "Download grouped rows as CSV";
}

function escapeCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildGroupedCsv() {
  const headers = [...state.headers, "title_usage"];
  const rows = getGroupedRows(true);
  const lines = [headers.map(escapeCsvValue).join(",")];

  rows.forEach((row) => {
    const values = [...state.headers.map((key) => row[key]), row[USAGE_KEY]];
    lines.push(values.map(escapeCsvValue).join(","));
  });

  return `\uFEFF${lines.join("\r\n")}`;
}

function downloadGroupedCsv() {
  if (!state.groupByTitle || !state.rows.length) return;
  const csv = buildGroupedCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = state.fileName.replace(/\.csv$/i, "") || "grouped-titles";
  link.href = url;
  link.download = `${baseName}-grouped.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  renderHeader();
  renderBody();
  renderTitleReport();
}

function loadCsvText(text, fileName = "CSV") {
  try {
    const parsed = parseCsv(text);
    const titleKey = findLikelyColumn(parsed.headers, ["title", "chatTitle", "conversationtitle"].map(normalizeHeader), "title");

    if (!titleKey) {
      throw new Error(`A title column was not found. Detected columns: ${parsed.headers.join(", ")}.`);
    }

    state.headers = parsed.headers;
    state.rows = parsed.rows;
    state.titleKey = titleKey;
    state.idKey = findLikelyColumn(parsed.headers, ["id", "chatid", "conversationid"].map(normalizeHeader), "id");
    state.summaryKey = findLikelyColumn(
      parsed.headers,
      ["summarybullets", "summary", "bullets"].map(normalizeHeader),
      "summary",
    );
    state.filters = {};
    state.sortKey = USAGE_KEY;
    state.sortDirection = "desc";
    state.page = 1;
    state.fileName = fileName;
    addTitleUsage(state.rows, state.titleKey);
    render();
    const delimiterName = parsed.delimiter === "\t" ? "tab" : parsed.delimiter === ";" ? "semicolon" : "comma";
    setStatus(`${fileName}: ${state.rows.length.toLocaleString()} rows loaded. ${delimiterName}-separated CSV detected.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The CSV could not be read.", "error");
  }
}

async function loadFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv") && file.type !== "text/plain") {
    setStatus("Choose a CSV file.", "error");
    return;
  }

  try {
    loadCsvText(await file.text(), file.name);
  } catch {
    setStatus("The selected file could not be read.", "error");
  }
}

chooseFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadFile(fileInput.files?.[0]));

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  });
});

dropzone.addEventListener("drop", (event) => loadFile(event.dataTransfer?.files?.[0]));

sampleButton.addEventListener("click", async () => {
  try {
    const response = await fetch("./sample.csv");
    if (!response.ok) throw new Error();
    loadCsvText(await response.text(), "sample.csv");
  } catch {
    const sample = `id,title,summary_bullets\nTLMMM0O29K,Access Unlocking,"Customer requests access to Text | Support team to assist and migrate | Chat transferred to support team"\nTLMMM0O30A,Billing question,"Customer asks about an invoice | Billing details explained"\nTLMMM0O31B,Access Unlocking,"Customer cannot sign in | Account access restored"`;
    loadCsvText(sample, "sample.csv");
  }
});

clearFiltersButton.addEventListener("click", () => {
  state.filters = {};
  state.page = 1;
  render();
});

groupByTitleInput.addEventListener("change", () => {
  state.groupByTitle = groupByTitleInput.checked;
  state.page = 1;
  renderBody();
});

exportGroupedButton.addEventListener("click", downloadGroupedCsv);

rowsPerPageSelect.addEventListener("change", () => {
  state.rowsPerPage = Number(rowsPerPageSelect.value);
  state.page = 1;
  renderBody();
});

previousPageButton.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    renderBody();
    table.scrollIntoView({ block: "start", behavior: "smooth" });
  }
});

nextPageButton.addEventListener("click", () => {
  state.page += 1;
  renderBody();
  table.scrollIntoView({ block: "start", behavior: "smooth" });
});

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;

  const reportError = () => {};
  try {
    void Promise.resolve(
      context.registerTool({
        name: "filter_csv_rows",
        title: "Filter CSV rows",
        description: "Apply text filters to loaded CSV columns and update the visible table.",
        inputSchema: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["filters"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          if (!state.rows.length) throw new Error("Load a CSV before filtering rows.");
          const requestedFilters = input && typeof input === "object" ? input.filters : null;
          if (!requestedFilters || typeof requestedFilters !== "object" || Array.isArray(requestedFilters)) {
            throw new Error("filters must be an object of column names and search values.");
          }
          const validKeys = new Set([...state.headers, USAGE_KEY]);
          for (const [key, value] of Object.entries(requestedFilters)) {
            if (!validKeys.has(key)) throw new Error(`Unknown column: ${key}`);
            if (typeof value !== "string") throw new Error(`Filter for ${key} must be text.`);
          }
          state.filters = { ...requestedFilters };
          state.page = 1;
          render();
          return { matchingRows: getFilteredRows().length, filters: state.filters };
        },
      }),
    ).catch(reportError);
  } catch {
    reportError();
  }
}

registerWebMcpTools();
