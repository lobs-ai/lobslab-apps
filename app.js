const API_ROOT = "/api";
const STORAGE_KEY = "less-crapuler-dashboard";
const POLL_INTERVAL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 220;
const MAX_RESULTS = 250;

const state = {
  terms: [],
  query: "",
  termCode: "",
  widgets: loadSavedWidgets(),
  widgetData: new Map(),
  pollingTimer: null,
  searchTimer: null,
  dragId: null,
};

const els = {
  searchInput: document.querySelector("#search-input"),
  termSelect: document.querySelector("#term-select"),
  searchResults: document.querySelector("#search-results"),
  dashboard: document.querySelector("#dashboard"),
  buildTime: document.querySelector("#build-time"),
  pollingStatus: document.querySelector("#polling-status"),
  widgetCount: document.querySelector("#widget-count"),
  lastCheck: document.querySelector("#last-check"),
  catalogCount: document.querySelector("#catalog-count"),
  refreshButton: document.querySelector("#refresh-button"),
  clearDashboard: document.querySelector("#clear-dashboard"),
};

boot().catch((error) => {
  console.error(error);
  els.pollingStatus.textContent = "Failed";
  els.searchResults.innerHTML =
    '<div class="empty-state">Local server failed to load. Run <code>npm start</code> and open the local URL.</div>';
});

async function boot() {
  wireEvents();
  const terms = await fetchJson(`${API_ROOT}/terms`);
  state.terms = terms;
  state.termCode = String(terms[0]?.termCode ?? "");
  hydrateTerms();
  els.buildTime.textContent = "Live";
  els.catalogCount.textContent = "Live search";
  await Promise.all(state.widgets.map((widget) => refreshWidgetData(widget, false)));
  renderDashboard();
  await runSearch();
  startPolling();
}

function wireEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      runSearch().catch(console.error);
    }, SEARCH_DEBOUNCE_MS);
  });

  els.termSelect.addEventListener("change", (event) => {
    state.termCode = event.target.value;
    runSearch().catch(console.error);
  });

  els.refreshButton.addEventListener("click", () => refreshNow());
  els.clearDashboard.addEventListener("click", () => {
    state.widgets = [];
    state.widgetData.clear();
    persistWidgets();
    renderDashboard();
  });
}

function hydrateTerms() {
  els.termSelect.innerHTML = state.terms
    .map(
      (term) =>
        `<option value="${term.termCode}" ${String(term.termCode) === state.termCode ? "selected" : ""}>${term.termDescr}</option>`,
    )
    .join("");
}

async function runSearch() {
  if (!state.termCode) {
    return;
  }
  if (!state.query) {
    els.searchResults.innerHTML =
      '<div class="empty-state">Type a subject, number, or title fragment. Search hits Crapuler through your local server.</div>';
    return;
  }
  els.searchResults.innerHTML = '<div class="empty-state">Searching Crapuler…</div>';
  const params = new URLSearchParams({
    q: state.query,
    termCode: state.termCode,
    limit: String(MAX_RESULTS),
  });
  const response = await fetchJson(`${API_ROOT}/search?${params.toString()}`);
  renderSearchResults(response.results ?? [], response.total ?? response.results?.length ?? 0);
}

function renderSearchResults(results, total = results.length) {
  if (!results.length) {
    els.searchResults.innerHTML =
      '<div class="empty-state">No classes matched. Broad title search may need the local cache to warm on the first query.</div>';
    return;
  }

  const template = document.querySelector("#result-template");
  const fragment = document.createDocumentFragment();

  for (const course of results) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".result-title").textContent = `${course.courseId} ${course.courseDescr}`;
    node.querySelector(".result-meta").textContent = `${course.termDescr} • ${course.schoolDescr}`;
    node.addEventListener("click", async () => addWidget(course));
    fragment.append(node);
  }

  els.searchResults.innerHTML = "";
  if (total > results.length) {
    const notice = document.createElement("div");
    notice.className = "empty-state";
    notice.textContent = `Showing ${results.length} of ${total} matches. Narrow the query if needed.`;
    els.searchResults.append(notice);
  } else {
    const notice = document.createElement("div");
    notice.className = "empty-state";
    notice.textContent = `${total} match${total === 1 ? "" : "es"}`;
    els.searchResults.append(notice);
  }
  els.searchResults.append(fragment);
}

async function addWidget(course) {
  if (state.widgets.some((widget) => widget.key === course.key)) {
    return;
  }
  const widget = {
    id: crypto.randomUUID(),
    key: course.key,
    termCode: String(course.termCode),
    termShort: course.termShort,
    termDescr: course.termDescr,
    schoolCode: course.schoolCode,
    schoolDescr: course.schoolDescr,
    subjectCode: course.subjectCode,
    catalogNumber: String(course.catalogNumber),
    courseId: course.courseId,
    courseDescr: course.courseDescr,
    sectionFilters: [],
  };
  state.widgets.unshift(widget);
  persistWidgets();
  await refreshWidgetData(widget, true);
  renderDashboard();
}

async function refreshWidgetData(widget, renderAfter) {
  const params = new URLSearchParams({
    termCode: widget.termCode,
    termShort: widget.termShort,
    schoolCode: widget.schoolCode,
    subjectCode: widget.subjectCode,
    catalogNumber: widget.catalogNumber,
  });
  const payload = await fetchJson(`${API_ROOT}/course?${params.toString()}`);
  state.widgetData.set(widget.key, payload);
  if (renderAfter) {
    renderDashboard();
  }
}

function renderDashboard() {
  els.widgetCount.textContent = String(state.widgets.length);
  if (!state.widgets.length) {
    els.dashboard.innerHTML =
      '<div class="empty-state">Search live Crapuler data and add classes to the board. Widgets persist in this browser.</div>';
    return;
  }

  const template = document.querySelector("#widget-template");
  const fragment = document.createDocumentFragment();

  for (const widget of state.widgets) {
    const course = state.widgetData.get(widget.key);
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.widgetId = widget.id;
    node.querySelector(".widget-kicker").textContent = widget.termShort;
    node.querySelector(".widget-title").textContent = `${widget.courseId} ${widget.courseDescr}`;
    node.querySelector(".widget-description").textContent =
      course?.description || "No course description was published by Crapuler for this class.";
    node.querySelector(".widget-link").href = course?.courseUrl || "https://www.crapuler.com/";
    node.querySelector(".widget-meta").innerHTML = buildWidgetMeta(widget, course);
    node.querySelector(".widget-section-groups").innerHTML = buildSectionGroups(widget, course);
    node.querySelector(".widget-sync").textContent = course?.syncedAt
      ? `Refreshed ${formatDateTime(course.syncedAt)}`
      : "Loading live course data";

    node.querySelector(".widget-remove").addEventListener("click", () => removeWidget(widget.id));
    wireSectionFilterEvents(node, widget, course);
    wireDragEvents(node);
    fragment.append(node);
  }

  els.dashboard.innerHTML = "";
  els.dashboard.append(fragment);
}

function buildWidgetMeta(widget, course) {
  const sectionCount = course?.sectionGroups?.reduce((sum, group) => sum + group.sections.length, 0) ?? 0;
  const filteredCount = widget.sectionFilters?.length ?? 0;
  return [
    `<span>${widget.schoolDescr}</span>`,
    `<span>${widget.termDescr}</span>`,
    `<span>${sectionCount} sections</span>`,
    filteredCount ? `<span>${filteredCount} selected</span>` : `<span>showing all</span>`,
  ].join("");
}

function buildSectionGroups(widget, course) {
  if (!course) {
    return '<div class="empty-state">Loading section groups…</div>';
  }
  const activeFilters = new Set(widget.sectionFilters ?? []);
  const hasActiveFilters = activeFilters.size > 0;
  const relatedMap = buildRelatedSectionMap(course);
  const filterToolbar = `
    <div class="filter-toolbar">
      <span class="filter-summary">
        ${hasActiveFilters ? `${activeFilters.size} section${activeFilters.size === 1 ? "" : "s"} selected` : "Showing all sections"}
      </span>
      <button class="button button-secondary filter-reset" type="button" ${hasActiveFilters ? "" : "disabled"}>
        Show all
      </button>
    </div>
  `;
  const groupsMarkup = course.sectionGroups
    .map((group) => {
      const optionChips = group.sections
        .map((section) => {
          const filterKey = getSectionFilterKey(group, section);
          const filterKeys = getExpandedFilterKeys(group, section, relatedMap);
          const selected = !hasActiveFilters || activeFilters.has(filterKey);
          return `
            <button
              class="section-toggle ${selected ? "selected" : ""}"
              type="button"
              data-filter-key="${escapeHtml(filterKey)}"
              data-filter-keys="${escapeHtml(filterKeys.join(","))}"
            >
              ${group.shortLabel || group.name} ${section.sectionNumber}
            </button>
          `;
        })
        .join("");

      const visibleSections = group.sections
        .filter((section) => !hasActiveFilters || activeFilters.has(getSectionFilterKey(group, section)))
        .slice(0, group.sections.length);
      const rows = visibleSections.map((section) => {
        const availabilityClass =
          section.available > 0 ? "good" : section.waitlist > 0 ? "warn" : "bad";
        const topic = section.topic ? `• ${section.topic}` : "";
        const meetings = [section.times, section.locations].filter(Boolean).join(" • ");
        const relatedSections = relatedMap.get(getTopicKey(section.topic)) ?? [];
        const relatedMarkup =
          group.name === "Lectures" && relatedSections.length
            ? `<div class="section-subline"><span>Pairs with ${relatedSections
                .map((entry) => `${entry.group.shortLabel || entry.group.name} ${entry.section.sectionNumber}`)
                .join(" • ")}</span></div>`
            : "";
        return `
          <div class="section-row">
            <div class="section-topline">
              <span>${group.shortLabel || group.name} ${section.sectionNumber}${topic}</span>
              <span class="section-chip ${availabilityClass}">
                ${section.available} open
              </span>
            </div>
            <div class="section-subline">
              <span>${section.instructors.join(", ") || "Staff"}</span>
              <span>${meetings || "Meeting details unavailable"}</span>
            </div>
            <div class="section-subline">
              <span>${section.enrolled}/${section.capacity} enrolled</span>
              <span>waitlist ${section.waitlist}</span>
              <span>${section.credits} credits</span>
            </div>
            ${relatedMarkup}
          </div>
        `;
      });

      const summaryClass =
        group.summary.available > 0 ? "good" : group.summary.waitlist > 0 ? "warn" : "bad";
      return `
        <section class="section-group">
          <header>
            <h4>${group.name}</h4>
            <span class="summary-chip ${summaryClass}">
              ${group.summary.available} seats across ${group.sections.length}
            </span>
          </header>
          <div class="section-toggle-row">${optionChips}</div>
          <div class="section-list">
            ${rows.length ? rows.join("") : '<div class="section-empty">No sections from this group are selected.</div>'}
          </div>
        </section>
      `;
    })
    .join("");
  return `${filterToolbar}${groupsMarkup}`;
}

function wireSectionFilterEvents(node, widget, course) {
  if (!course) {
    return;
  }
  node.querySelector(".filter-reset")?.addEventListener("click", () => {
    updateWidget(widget.id, (draft) => {
      draft.sectionFilters = [];
    });
  });

  for (const button of node.querySelectorAll(".section-toggle")) {
    button.addEventListener("click", () => {
      const filterKey = button.dataset.filterKey;
      const filterKeys = (button.dataset.filterKeys ?? filterKey).split(",").filter(Boolean);
      updateWidget(widget.id, (draft) => {
        const current = new Set(draft.sectionFilters ?? []);
        if (current.has(filterKey)) {
          for (const key of filterKeys) {
            current.delete(key);
          }
        } else {
          for (const key of filterKeys) {
            current.add(key);
          }
        }
        draft.sectionFilters = [...current];
      });
    });
  }
}

function wireDragEvents(node) {
  node.addEventListener("dragstart", () => {
    state.dragId = node.dataset.widgetId;
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => {
    state.dragId = null;
    node.classList.remove("dragging");
  });
  node.addEventListener("dragover", (event) => event.preventDefault());
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    const targetId = node.dataset.widgetId;
    if (!state.dragId || state.dragId === targetId) {
      return;
    }
    const sourceIndex = state.widgets.findIndex((widget) => widget.id === state.dragId);
    const targetIndex = state.widgets.findIndex((widget) => widget.id === targetId);
    const [moved] = state.widgets.splice(sourceIndex, 1);
    state.widgets.splice(targetIndex, 0, moved);
    persistWidgets();
    renderDashboard();
  });
}

function removeWidget(widgetId) {
  state.widgets = state.widgets.filter((widget) => widget.id !== widgetId);
  persistWidgets();
  renderDashboard();
}

function updateWidget(widgetId, updater) {
  const widget = state.widgets.find((entry) => entry.id === widgetId);
  if (!widget) {
    return;
  }
  updater(widget);
  persistWidgets();
  renderDashboard();
}

async function refreshNow() {
  els.pollingStatus.textContent = "Checking";
  els.lastCheck.textContent = formatDateTime(new Date().toISOString());
  await Promise.all(state.widgets.map((widget) => refreshWidgetData(widget, false)));
  els.pollingStatus.textContent = "Active";
  renderDashboard();
}

function startPolling() {
  clearInterval(state.pollingTimer);
  state.pollingTimer = setInterval(() => {
    refreshNow().catch((error) => {
      console.error(error);
      els.pollingStatus.textContent = "Retrying";
    });
  }, POLL_INTERVAL_MS);
}

function persistWidgets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.widgets));
}

function loadSavedWidgets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSectionFilterKey(group, section) {
  return `${group.name}:${section.sectionNumber}`;
}

function buildRelatedSectionMap(course) {
  const map = new Map();
  for (const group of course.sectionGroups) {
    if (group.name === "Lectures") {
      continue;
    }
    for (const section of group.sections) {
      const topicKey = getTopicKey(section.topic);
      if (!topicKey) {
        continue;
      }
      const list = map.get(topicKey) ?? [];
      list.push({ group, section });
      map.set(topicKey, list);
    }
  }
  return map;
}

function getExpandedFilterKeys(group, section, relatedMap) {
  const keys = [getSectionFilterKey(group, section)];
  if (group.name !== "Lectures") {
    return keys;
  }
  const related = relatedMap.get(getTopicKey(section.topic)) ?? [];
  for (const entry of related) {
    keys.push(getSectionFilterKey(entry.group, entry.section));
  }
  return [...new Set(keys)];
}

function getTopicKey(topic) {
  return (topic ?? "").trim().toLowerCase();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
