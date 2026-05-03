const SESSION_KEY = "seoRadarScanSession";
const ANALYSIS_CACHE_KEY = "seoRadarLatestAnalysis";
const API_BASE = "http://localhost:3000/api";
const AUTH_STORAGE_KEY = "seoRadarAuthToken";

const sourceQueryPill = document.getElementById("sourceQueryPill");
const focusKeywordPill = document.getElementById("focusKeywordPill");
const scanSummary = document.getElementById("scanSummary");
const totalCount = document.getElementById("totalCount");
const matchCount = document.getElementById("matchCount");
const averageScore = document.getElementById("averageScore");
const fetchCount = document.getElementById("fetchCount");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const searchFilter = document.getElementById("searchFilter");
const onlyMatches = document.getElementById("onlyMatches");
const resultsGrid = document.getElementById("resultsGrid");
const emptyState = document.getElementById("emptyState");
const menuTabs = Array.from(document.querySelectorAll(".menu-tab"));
const panelSections = Array.from(document.querySelectorAll(".panel-section"));
const intentSummary = document.getElementById("intentSummary");
const authorityLeaders = document.getElementById("authorityLeaders");
const keywordGapList = document.getElementById("keywordGapList");
const clustersGrid = document.getElementById("clustersGrid");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportStatus = document.getElementById("exportStatus");
const exportSummary = document.getElementById("exportSummary");

const state = {
  session: null,
  analyses: [],
  filters: {
    text: "",
    onlyMatches: false
  },
  derived: {
    intents: [],
    leaders: [],
    keywordGaps: [],
    clusters: []
  }
};

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set([
    "ve",
    "ile",
    "icin",
    "gore",
    "kadin",
    "erkek",
    "the",
    "and",
    "for",
    "www",
    "com"
  ]);

  return [...new Set(
    normalizeText(value)
      .split(/[^\p{L}0-9]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !stopWords.has(token))
  )];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setProgress(completed, total, message) {
  const ratio = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressText.textContent = message;
  progressFill.style.width = `${ratio}%`;
}

function activatePanel(panelId) {
  menuTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.panel === panelId);
  });

  panelSections.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === panelId);
  });
}

function metricChip(label, value, tone = "neutral") {
  return `
    <span class="metric-chip metric-${tone}">
      <strong>${label}</strong>
      <span>${value}</span>
    </span>
  `;
}

function buildDerivedData(items, session) {
  const topItems = [...items]
    .filter((item) => item.isCompetitorMatch)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.authorityScore - left.authorityScore;
    })
    .slice(0, 10);

  const intentMap = new Map();
  const gapMap = new Map();
  const clusterMap = new Map();
  const blockedTokens = new Set([
    ...tokenize(session?.sourceQuery || ""),
    ...tokenize(session?.focusKeyword || "")
  ]);

  items.forEach((item) => {
    const intentEntry = intentMap.get(item.intentLabel) || {
      label: item.intentLabel,
      count: 0,
      avgScore: 0,
      totalScore: 0
    };
    intentEntry.count += 1;
    intentEntry.totalScore += item.score;
    intentEntry.avgScore = Math.round(intentEntry.totalScore / intentEntry.count);
    intentMap.set(item.intentLabel, intentEntry);

    const clusterKey = `${item.intentLabel}::${item.pageType}`;
    const clusterEntry = clusterMap.get(clusterKey) || {
      label: item.intentLabel,
      pageType: item.pageType,
      items: [],
      avgScore: 0,
      avgAuthority: 0
    };
    clusterEntry.items.push(item);
    clusterEntry.avgScore = Math.round(
      clusterEntry.items.reduce((sum, current) => sum + current.score, 0) / clusterEntry.items.length
    );
    clusterEntry.avgAuthority = Math.round(
      clusterEntry.items.reduce((sum, current) => sum + current.authorityScore, 0) / clusterEntry.items.length
    );
    clusterMap.set(clusterKey, clusterEntry);
  });

  topItems.forEach((item) => {
    const uniqueTerms = [...new Set(item.rankingTerms || [])].filter((term) => !blockedTokens.has(term));

    uniqueTerms.forEach((term) => {
      const entry = gapMap.get(term) || {
        term,
        domainSet: new Set(),
        totalScore: 0,
        totalAuthority: 0,
        count: 0
      };

      entry.domainSet.add(item.domain);
      entry.totalScore += item.score;
      entry.totalAuthority += item.authorityScore;
      entry.count += 1;
      gapMap.set(term, entry);
    });
  });

  const intents = [...intentMap.values()].sort((left, right) => right.count - left.count);
  const leaders = [...items]
    .sort((left, right) => right.authorityScore - left.authorityScore)
    .slice(0, 5);
  const keywordGaps = [...gapMap.values()]
    .map((entry) => ({
      term: entry.term,
      domainCount: entry.domainSet.size,
      avgScore: Math.round(entry.totalScore / entry.count),
      avgAuthority: Math.round(entry.totalAuthority / entry.count)
    }))
    .filter((entry) => entry.domainCount >= 2)
    .sort((left, right) => {
      if (right.domainCount !== left.domainCount) {
        return right.domainCount - left.domainCount;
      }

      return right.avgAuthority - left.avgAuthority;
    })
    .slice(0, 18);
  const clusters = [...clusterMap.values()]
    .map((cluster) => ({
      ...cluster,
      items: [...cluster.items].sort((left, right) => right.score - left.score)
    }))
    .sort((left, right) => right.items.length - left.items.length);

  return { intents, leaders, keywordGaps, clusters };
}

function renderSummary() {
  const items = state.analyses;
  const total = items.length;
  const matched = items.filter((item) => item.isCompetitorMatch).length;
  const fetched = items.filter((item) => item.fetchOk).length;
  const average = total
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / total)
    : 0;

  totalCount.textContent = `${total}`;
  matchCount.textContent = `${matched}`;
  averageScore.textContent = `${average}/100`;
  fetchCount.textContent = `${fetched}/${total}`;

  if (state.session) {
    const filterLabel = state.session.focusKeyword
      ? `"${state.session.focusKeyword}"`
      : "ek filtre yok";
    scanSummary.textContent =
      `"${state.session.sourceQuery}" sorgusundan toplanan rakipler analiz edildi. ` +
      `Ek filtre: ${filterLabel}. Siki mod: ${state.session.strictMode ? "acik" : "kapali"}.`;
  }
}

function renderResults() {
  const queryText = state.filters.text.trim().toLocaleLowerCase("tr-TR");
  const filtered = state.analyses.filter((item) => {
    if (state.filters.onlyMatches && !item.isCompetitorMatch) {
      return false;
    }

    if (!queryText) {
      return true;
    }

    const haystack = [
      item.domain,
      item.url,
      item.title,
      item.metaDescription,
      item.serpTitle,
      item.serpSnippet,
      item.intentLabel
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");

    return haystack.includes(queryText);
  });

  if (!filtered.length) {
    resultsGrid.innerHTML = `
      <article class="empty-state">
        Mevcut filtrelerle goruntulenecek rakip bulunamadi.
      </article>
    `;
    return;
  }

  resultsGrid.innerHTML = filtered
    .map((item) => {
      const matchTone = item.isCompetitorMatch ? "success" : "warning";
      const fetchTone = item.fetchOk ? "info" : "danger";
      const summary = item.highlights.length
        ? item.highlights.map(escapeHtml).join(" | ")
        : "Belirgin SEO sinyali yakalanmadi.";

      return `
        <article class="result-card">
          <div class="result-top">
            <div>
              <span class="position-badge">#${item.position}</span>
              <h2>${escapeHtml(item.title || item.serpTitle || item.domain)}</h2>
              <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
                ${escapeHtml(item.domain)}
              </a>
            </div>
            <div class="score-stack">
              <div class="score-badge">${item.score}</div>
              <div class="mini-score">Authority ${item.authorityScore}</div>
            </div>
          </div>

          <p class="result-snippet">${escapeHtml(item.metaDescription || item.serpSnippet || "Snippet bulunamadi.")}</p>

          <div class="chip-row">
            ${metricChip("Rakip uygunlugu", item.isCompetitorMatch ? "Evet" : "Hayir", matchTone)}
            ${metricChip("Intent", item.intentLabel, "info")}
            ${metricChip("Fetch", item.fetchOk ? "Basarili" : "Hatali", fetchTone)}
            ${metricChip("Temel kapsama", `${item.queryCoverage}%`)}
            ${metricChip("Ek filtre kapsama", `${item.focusCoverage}%`)}
            ${metricChip("Kelime yogunlugu", `${item.keywordDensity}%`)}
          </div>

          <div class="detail-grid">
            <div>
              <span class="detail-label">SERP basligi</span>
              <p>${escapeHtml(item.serpTitle || "-")}</p>
            </div>
            <div>
              <span class="detail-label">Meta description</span>
              <p>${escapeHtml(item.metaDescription || "-")}</p>
            </div>
            <div>
              <span class="detail-label">H1 / H2</span>
              <p>${escapeHtml(item.h1Summary || "-")} / ${escapeHtml(item.h2Summary || "-")}</p>
            </div>
            <div>
              <span class="detail-label">Intent nedeni</span>
              <p>${escapeHtml(item.intentReason || "-")}</p>
            </div>
            <div>
              <span class="detail-label">Teknik sinyal</span>
              <p>${escapeHtml(item.technicalNotes || "-")}</p>
            </div>
            <div>
              <span class="detail-label">Firsat terimleri</span>
              <p>${escapeHtml((item.rankingTerms || []).slice(0, 8).join(", ") || "-")}</p>
            </div>
          </div>

          <p class="result-summary">${summary}</p>

          ${
            item.fetchError
              ? `<p class="error-note">Fetch hatasi: ${escapeHtml(item.fetchError)}</p>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderIntentSummary() {
  if (!state.derived.intents.length) {
    intentSummary.innerHTML = `<p class="helper-copy">Intent ozeti icin yeterli veri yok.</p>`;
    return;
  }

  intentSummary.innerHTML = state.derived.intents
    .map((intent) => `
      <article class="stack-item">
        <div>
          <strong>${escapeHtml(intent.label)}</strong>
          <p>${intent.count} rakip | ortalama skor ${intent.avgScore}</p>
        </div>
        <span class="stack-badge">${intent.count}</span>
      </article>
    `)
    .join("");
}

function renderAuthorityLeaders() {
  if (!state.derived.leaders.length) {
    authorityLeaders.innerHTML = `<p class="helper-copy">Otorite lideri bulunamadi.</p>`;
    return;
  }

  authorityLeaders.innerHTML = state.derived.leaders
    .map((item) => `
      <article class="stack-item">
        <div>
          <strong>${escapeHtml(item.domain)}</strong>
          <p>${escapeHtml(item.intentLabel)} | skor ${item.score}</p>
        </div>
        <span class="stack-badge">${item.authorityScore}</span>
      </article>
    `)
    .join("");
}

function renderKeywordGaps() {
  if (!state.derived.keywordGaps.length) {
    keywordGapList.innerHTML = `<p class="helper-copy">Kelime boslugu icin yeterli ortak modifier bulunamadi.</p>`;
    return;
  }

  keywordGapList.innerHTML = state.derived.keywordGaps
    .map((entry) => `
      <article class="gap-pill">
        <strong>${escapeHtml(entry.term)}</strong>
        <span>${entry.domainCount} domain</span>
        <span>Authority ${entry.avgAuthority}</span>
      </article>
    `)
    .join("");
}

function renderClusters() {
  if (!state.derived.clusters.length) {
    clustersGrid.innerHTML = `<p class="helper-copy">Kume verisi olusmadi.</p>`;
    return;
  }

  clustersGrid.innerHTML = state.derived.clusters
    .map((cluster) => `
      <article class="cluster-card">
        <div class="cluster-head">
          <div>
            <h3>${escapeHtml(cluster.label)}</h3>
            <p>${escapeHtml(cluster.pageType)} | ${cluster.items.length} rakip</p>
          </div>
          <span class="cluster-score">Skor ${cluster.avgScore}</span>
        </div>
        <div class="cluster-list">
          ${cluster.items.slice(0, 5).map((item) => `
            <a class="cluster-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
              <span>${escapeHtml(item.domain)}</span>
              <strong>${item.score}</strong>
            </a>
          `).join("")}
        </div>
      </article>
    `)
    .join("");
}

function renderExportSummary() {
  const matched = state.analyses.filter((item) => item.isCompetitorMatch).length;
  const topAuthority = [...state.analyses]
    .sort((left, right) => right.authorityScore - left.authorityScore)[0];

  const lines = [
    `${state.analyses.length} toplam sonuc hazir.`,
    `${matched} sonuc rakip filtresine uyuyor.`,
    `${state.derived.keywordGaps.length} adet kelime firsati uretildi.`,
    topAuthority
      ? `En yuksek authority: ${topAuthority.domain} (${topAuthority.authorityScore})`
      : "Authority lideri henuz yok."
  ];

  exportSummary.innerHTML = lines
    .map((line) => `<article class="stack-item simple-item"><p>${escapeHtml(line)}</p></article>`)
    .join("");
}

function recomputeInsights() {
  state.derived = buildDerivedData(state.analyses, state.session);
  renderIntentSummary();
  renderAuthorityLeaders();
  renderKeywordGaps();
  renderClusters();
  renderExportSummary();
}

async function analyzeResult(serpEntry, session) {
  try {
    const response = await fetch(serpEntry.url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return window.SeoRadarAnalyzer.analyzeFetchedPage({
      html,
      url: response.url || serpEntry.url,
      serpEntry,
      sourceQuery: session.sourceQuery,
      focusKeyword: session.focusKeyword,
      strictMode: session.strictMode
    });
  } catch (error) {
    return window.SeoRadarAnalyzer.createFallbackAnalysis({
      serpEntry,
      sourceQuery: session.sourceQuery,
      focusKeyword: session.focusKeyword,
      strictMode: session.strictMode,
      errorMessage: error.message
    });
  }
}

async function runAnalysis(session) {
  const queue = [...session.serpResults];
  const output = [];
  const workerCount = Math.min(3, queue.length);
  let completed = 0;

  setProgress(0, queue.length, `0/${queue.length} rakip analiz ediliyor...`);

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const analyzed = await analyzeResult(item, session);
      output.push(analyzed);
      completed += 1;
      setProgress(completed, session.serpResults.length, `${completed}/${session.serpResults.length} rakip analiz edildi`);
      state.analyses = [...output].sort((left, right) => left.position - right.position);
      renderSummary();
      recomputeInsights();
      renderResults();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  state.analyses = output.sort((left, right) => left.position - right.position);

  await chrome.storage.local.set({
    [ANALYSIS_CACHE_KEY]: {
      sessionId: session.id,
      createdAt: new Date().toISOString(),
      items: state.analyses
    }
  });

  setProgress(session.serpResults.length, session.serpResults.length, "Analiz tamamlandi.");
  await trySaveToBackend(session, state.analyses);
}

async function trySaveToBackend(session, analyses) {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  const token = stored[AUTH_STORAGE_KEY];
  if (!token) {
    setProgress(session.serpResults.length, session.serpResults.length,
      "Analiz tamamlandı. (Kaydetmek için giriş yapın)");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/scans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sourceQuery: session.sourceQuery,
        focusKeyword: session.focusKeyword || "",
        strictMode: session.strictMode,
        sourceUrl: session.sourceUrl,
        results: analyses
      })
    });

    if (response.ok) {
      setProgress(session.serpResults.length, session.serpResults.length,
        "✓ Analiz tamamlandı ve hesabına kaydedildi.");
    } else {
      setProgress(session.serpResults.length, session.serpResults.length,
        "Analiz tamamlandı. (Kaydetme başarısız)");
    }
  } catch {
    setProgress(session.serpResults.length, session.serpResults.length,
      "Analiz tamamlandı. (Sunucuya ulaşılamadı)");
  }
}

function toCsvValue(value) {
  const clean = String(value ?? "").replace(/"/g, "\"\"");
  return `"${clean}"`;
}

function buildCsvContent() {
  const headers = [
    "position",
    "domain",
    "url",
    "score",
    "authorityScore",
    "isCompetitorMatch",
    "intentLabel",
    "queryCoverage",
    "focusCoverage",
    "keywordDensity",
    "title",
    "metaDescription",
    "h1Summary",
    "h2Summary",
    "technicalNotes",
    "rankingTerms"
  ];

  const rows = state.analyses.map((item) => [
    item.position,
    item.domain,
    item.url,
    item.score,
    item.authorityScore,
    item.isCompetitorMatch ? "yes" : "no",
    item.intentLabel,
    item.queryCoverage,
    item.focusCoverage,
    item.keywordDensity,
    item.title,
    item.metaDescription,
    item.h1Summary,
    item.h2Summary,
    item.technicalNotes,
    (item.rankingTerms || []).join(" | ")
  ]);

  return [headers, ...rows]
    .map((row) => row.map(toCsvValue).join(","))
    .join("\n");
}

function downloadCsv() {
  if (!state.analyses.length) {
    exportStatus.textContent = "Indirilecek veri yok.";
    return;
  }

  const csvContent = buildCsvContent();
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `seo-radar-${normalizeText(state.session?.sourceQuery || "scan")}-${datePart}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  exportStatus.textContent = "CSV dosyasi indirildi.";
}

async function init() {
  const stored = await chrome.storage.local.get([SESSION_KEY, ANALYSIS_CACHE_KEY]);
  const session = stored[SESSION_KEY];

  if (!session?.serpResults?.length) {
    emptyState.classList.remove("hidden");
    setProgress(0, 0, "Tarama verisi bekleniyor.");
    return;
  }

  state.session = session;
  sourceQueryPill.textContent = `Sorgu: ${session.sourceQuery || "-"}`;
  focusKeywordPill.textContent = `Filtre: ${session.focusKeyword || "-"}`;
  renderSummary();

  const cached = stored[ANALYSIS_CACHE_KEY];
  const cacheIsCompatible =
    cached?.sessionId === session.id &&
    Array.isArray(cached.items) &&
    cached.items.length &&
    cached.items.every((item) => typeof item.authorityScore === "number" && item.intentLabel);

  if (cacheIsCompatible) {
    state.analyses = cached.items;
    setProgress(session.serpResults.length, session.serpResults.length, "Analiz onbellekten yuklendi.");
    renderSummary();
    recomputeInsights();
    renderResults();
    return;
  }

  await runAnalysis(session);
}

menuTabs.forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
});

searchFilter.addEventListener("input", (event) => {
  state.filters.text = event.target.value;
  renderResults();
});

onlyMatches.addEventListener("change", (event) => {
  state.filters.onlyMatches = event.target.checked;
  renderResults();
});

exportCsvBtn.addEventListener("click", downloadCsv);

activatePanel("overviewPanel");
init();
