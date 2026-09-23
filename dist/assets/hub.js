const helpersGrid = document.querySelector("#helpers-grid");
const helperCount = document.querySelector("#helper-count");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHelpers(helpers) {
  helperCount.textContent = helpers.length;

  if (!helpers.length) {
    helpersGrid.innerHTML = '<div class="empty-hub">No helper manifests were found in the helpers folder.</div>';
    return;
  }

  helpersGrid.innerHTML = helpers
    .map(
      (helper) => `
        <a class="helper-card" href="${escapeHtml(helper.href)}">
          <span class="helper-tooltip" aria-hidden="true">Open helper</span>
          <span class="folder-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 17 17 7M9 7h8v8"/>
            </svg>
          </span>
          <h2>${escapeHtml(helper.name)}</h2>
          <p>${escapeHtml(helper.description)}</p>
          <span class="card-meta">
            <span class="category-pill">${escapeHtml(helper.category || "Helper")}</span>
            <span class="open-label">
              Open
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M7 17 17 7M9 7h8v8"/>
              </svg>
            </span>
          </span>
        </a>
      `,
    )
    .join("");
}

async function loadHelpers() {
  const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname.split('/').slice(0, -1).join('/') + '/';

  try {
    const response = await fetch("/api/helpers");
    if (!response.ok) throw new Error("API unavailable");
    renderHelpers(await response.json());
  } catch {
    try {
      const jsonPath = new URL("helpers/index.json", window.location.origin + basePath).href;
      const response = await fetch(jsonPath);
      if (!response.ok) throw new Error("Fallback unavailable");
      renderHelpers(await response.json());
    } catch {
      renderHelpers([
        {
          name: "CSV Title Usage",
          description: "Upload a CSV, inspect its rows, filter every column, and count repeated titles.",
          category: "Data",
          href: "./helpers/csv-title-usage/",
        },
        {
          name: "List → Regex",
          description: "Convert any list of strings into a regex pattern with automatic escaping and deduplication.",
          category: "Text",
          href: "./helpers/list-to-regex/",
        },
        {
          name: "Keyword Highlighter",
          description: "Search text and highlight matching keywords with automatic case-insensitive matching.",
          category: "Text",
          href: "./helpers/keyword-highlighter/",
        },
        {
          name: "Workflow Editor",
          description: "Visual canvas editor for workflow manifests with drag-and-drop block rewiring.",
          category: "Developer",
          href: "./helpers/workflow-editor/",
        },
      ]);
    }
  }
}

loadHelpers();
