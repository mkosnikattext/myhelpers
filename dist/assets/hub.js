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
  try {
    const response = await fetch("/api/helpers");
    if (!response.ok) throw new Error("API unavailable");
    renderHelpers(await response.json());
  } catch {
    try {
      const response = await fetch("./helpers/index.json");
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
      ]);
    }
  }
}

loadHelpers();
