const STORAGE_KEY = "seoRadarScanSession";
const scanForm = document.getElementById("scanForm");
const focusKeywordInput = document.getElementById("focusKeyword");
const maxResultsInput = document.getElementById("maxResults");
const strictModeInput = document.getElementById("strictMode");
const statusEl = document.getElementById("status");
const pageContextEl = document.getElementById("pageContext");
const detectedQueryEl = document.getElementById("detectedQuery");

function setStatus(message, tone = "info") {
  statusEl.textContent = message;
  statusEl.className = `status status-${tone}`;
}

function parseGoogleQuery(urlString) {
  try {
    const url = new URL(urlString);
    return url.searchParams.get("q")?.trim() || "";
  } catch (error) {
    return "";
  }
}

function isGoogleSearchPage(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname.startsWith("www.google.") && url.pathname === "/search";
  } catch (error) {
    return false;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function hydrateContext() {
  const tab = await getActiveTab();
  const query = parseGoogleQuery(tab?.url || "");

  if (!tab?.url) {
    pageContextEl.textContent = "Bilinmiyor";
    detectedQueryEl.textContent = "Yok";
    setStatus("Aktif sekme okunamadi.", "error");
    return;
  }

  pageContextEl.textContent = isGoogleSearchPage(tab.url) ? "Google SERP" : "Desteklenmeyen sayfa";
  detectedQueryEl.textContent = query || "Algilanamadi";

  if (isGoogleSearchPage(tab.url)) {
    setStatus("Hazir. Mevcut Google sonuc sayfasini tarayabilirim.", "success");
  } else {
    setStatus("Lutfen once Google arama sonuclari sayfasini ac.", "warning");
  }
}

function extractSerpResultsInPage(options) {
  const normalizeText = (value) => (value || "").replace(/\s+/g, " ").trim();
  const currentUrl = new URL(window.location.href);
  const sourceQuery =
    currentUrl.searchParams.get("q") ||
    document.querySelector('textarea[name="q"], input[name="q"]')?.value ||
    "";

  const skipHosts = new Set([
    "google.com",
    "www.google.com",
    "www.google.com.tr",
    "webcache.googleusercontent.com"
  ]);
  const seen = new Set();
  const headings = Array.from(document.querySelectorAll("h3"));
  const results = [];

  const pickSnippet = (container, fallbackTitle) => {
    if (!container) {
      return "";
    }

    const candidates = Array.from(container.querySelectorAll("div, span"))
      .map((node) => normalizeText(node.innerText || node.textContent))
      .filter((text) => text && text !== fallbackTitle && text.length >= 40 && text.length <= 320);

    return candidates.sort((left, right) => right.length - left.length)[0] || "";
  };

  for (const heading of headings) {
    const title = normalizeText(heading.innerText || heading.textContent);
    if (!title) {
      continue;
    }

    const anchor = heading.closest("a") || heading.parentElement?.closest("a");
    const href = anchor?.href;
    if (!href) {
      continue;
    }

    let parsedHref;
    try {
      parsedHref = new URL(href);
    } catch (error) {
      continue;
    }

    if (!/^https?:/.test(parsedHref.protocol)) {
      continue;
    }

    if (parsedHref.hostname.includes("google.") || skipHosts.has(parsedHref.hostname)) {
      continue;
    }

    const uniqueKey = parsedHref.origin + parsedHref.pathname;
    if (seen.has(uniqueKey)) {
      continue;
    }

    const container =
      heading.closest("div.g, div.MjjYud, div[data-hveid], div[jscontroller]") ||
      anchor.closest("div");
    const displayUrl =
      normalizeText(container?.querySelector("cite")?.textContent) || parsedHref.hostname;
    const snippet = pickSnippet(container, title);

    seen.add(uniqueKey);
    results.push({
      position: results.length + 1,
      title,
      url: href,
      displayUrl,
      snippet
    });

    if (results.length >= options.maxResults) {
      break;
    }
  }

  return {
    sourceUrl: window.location.href,
    sourceQuery: normalizeText(sourceQuery),
    capturedAt: new Date().toISOString(),
    results
  };
}

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !isGoogleSearchPage(tab.url)) {
    setStatus("Tarama yalnizca Google arama sonuc sayfasinda baslatilabilir.", "error");
    return;
  }

  const maxResults = Math.max(5, Math.min(20, Number(maxResultsInput.value) || 10));
  const focusKeyword = focusKeywordInput.value.trim();
  const strictMode = strictModeInput.checked;

  setStatus("SERP verisi toplaniyor...", "loading");

  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSerpResultsInPage,
      args: [{ maxResults }]
    });

    const scan = execution?.result;
    if (!scan?.results?.length) {
      setStatus("Google sonuc listesinde analiz edilebilir organik sonuc bulunamadi.", "error");
      return;
    }

    const session = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceQuery: scan.sourceQuery || parseGoogleQuery(tab.url),
      focusKeyword,
      strictMode,
      maxResults,
      sourceUrl: scan.sourceUrl,
      serpResults: scan.results
    };

    await chrome.storage.local.set({
      [STORAGE_KEY]: session,
      seoRadarLatestAnalysis: null
    });

    await chrome.runtime.sendMessage({ type: "open_results_page" });
    setStatus("Tarama baslatildi. Sonuc sayfasi aciliyor...", "success");
  } catch (error) {
    setStatus(`Tarama basarisiz: ${error.message}`, "error");
  }
});

hydrateContext();
