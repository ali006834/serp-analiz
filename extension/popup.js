const STORAGE_KEY = "seoRadarScanSession";
const AUTH_STORAGE_KEY = "seoRadarAuthToken";
const API_BASE = "http://localhost:3000/api";

// DOM referansları
const scanForm        = document.getElementById("scanForm");
const focusKeywordInput = document.getElementById("focusKeyword");
const maxResultsInput = document.getElementById("maxResults");
const strictModeInput = document.getElementById("strictMode");
const statusEl        = document.getElementById("status");
const pageContextEl   = document.getElementById("pageContext");
const detectedQueryEl = document.getElementById("detectedQuery");

const authBar         = document.getElementById("authBar");
const authUserLabel   = document.getElementById("authUserLabel");
const logoutBtn       = document.getElementById("logoutBtn");
const authPanel       = document.getElementById("authPanel");
const authForm        = document.getElementById("authForm");
const authEmail       = document.getElementById("authEmail");
const authPassword    = document.getElementById("authPassword");
const authName        = document.getElementById("authName");
const nameField       = document.getElementById("nameField");
const authSubmitBtn   = document.getElementById("authSubmitBtn");
const authStatus      = document.getElementById("authStatus");
const tabLogin        = document.getElementById("tabLogin");
const tabRegister     = document.getElementById("tabRegister");

const historyPanel    = document.getElementById("historyPanel");
const historyList     = document.getElementById("historyList");
const refreshHistory  = document.getElementById("refreshHistory");

let authMode = "login";

// ─── Yardımcı ───────────────────────────────────────────────

function setStatus(msg, tone = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status status-${tone}`;
}

function setAuthStatus(msg, tone = "info") {
  authStatus.textContent = msg;
  authStatus.className = `status status-${tone}`;
  authStatus.classList.remove("hidden");
}

function clearAuthStatus() {
  authStatus.classList.add("hidden");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

// ─── Auth modu (login / register) ───────────────────────────

function switchAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle("is-active", mode === "login");
  tabRegister.classList.toggle("is-active", mode === "register");
  nameField.classList.toggle("hidden", mode === "login");
  authSubmitBtn.textContent = mode === "login" ? "Giriş Yap" : "Kayıt Ol";
  clearAuthStatus();
}

tabLogin.addEventListener("click", () => switchAuthMode("login"));
tabRegister.addEventListener("click", () => switchAuthMode("register"));

// ─── Oturum durumu yükle ─────────────────────────────────────

async function loadAuthState() {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  const token = stored[AUTH_STORAGE_KEY];

  if (!token) {
    showLoggedOut();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const { user } = await res.json();
      showLoggedIn(user.email, token);
    } else {
      await chrome.storage.local.remove(AUTH_STORAGE_KEY);
      showLoggedOut();
    }
  } catch {
    // sunucu kapalı ama token var — yine de giriş göster
    authBar.classList.remove("hidden");
    authUserLabel.textContent = "Oturum açık (sunucu kapalı)";
    authPanel.classList.add("hidden");
    historyPanel.classList.add("hidden");
  }
}

function showLoggedIn(email, token) {
  authPanel.classList.add("hidden");
  authBar.classList.remove("hidden");
  authUserLabel.textContent = `✓ ${email}`;
  historyPanel.classList.remove("hidden");
  loadHistory(token);
}

function showLoggedOut() {
  authBar.classList.add("hidden");
  authPanel.classList.remove("hidden");
  historyPanel.classList.add("hidden");
}

// ─── Çıkış ──────────────────────────────────────────────────

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
  showLoggedOut();
  setStatus("Çıkış yapıldı.", "warning");
});

// ─── Auth formu gönder ───────────────────────────────────────

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email    = authEmail.value.trim();
  const password = authPassword.value;
  const name     = authName.value.trim();

  if (!email || !password) {
    setAuthStatus("Email ve şifre zorunludur.", "error");
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = "Bekleniyor...";
  clearAuthStatus();

  try {
    const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
    const body = authMode === "login" ? { email, password } : { email, password, name };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      setAuthStatus(data.error || "İşlem başarısız.", "error");
      return;
    }

    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: data.token });
    showLoggedIn(data.user.email, data.token);
    setStatus(
      authMode === "login" ? "Giriş başarılı! Taramalar artık kaydedilecek." : "Kayıt başarılı! Hoş geldin.",
      "success"
    );
  } catch {
    setAuthStatus("Sunucuya bağlanılamadı. Backend çalışıyor mu?", "error");
  } finally {
    authSubmitBtn.disabled = false;
    switchAuthMode(authMode);
  }
});

// ─── Geçmiş taramalar ────────────────────────────────────────

async function loadHistory(token) {
  historyList.innerHTML = `<p class="muted-copy">Yükleniyor...</p>`;

  try {
    const res = await fetch(`${API_BASE}/scans?limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error();

    const { scans } = await res.json();

    if (!scans.length) {
      historyList.innerHTML = `<p class="muted-copy">Henüz tarama yok.</p>`;
      return;
    }

    historyList.innerHTML = scans.map((s) => `
      <div class="history-item">
        <div class="history-query">"${escapeHtml(s.sourceQuery)}"</div>
        <div class="history-meta">
          ${s.totalResults} sonuç · ${s.matchedResults} eşleşme · ort. skor ${s.avgScore}
        </div>
        <div class="history-date">${formatDate(s.createdAt)}</div>
      </div>
    `).join("");
  } catch {
    historyList.innerHTML = `<p class="muted-copy">Geçmiş yüklenemedi.</p>`;
  }
}

refreshHistory.addEventListener("click", async () => {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  if (stored[AUTH_STORAGE_KEY]) loadHistory(stored[AUTH_STORAGE_KEY]);
});

function escapeHtml(val) {
  return String(val || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Sayfa bağlamı ───────────────────────────────────────────

function parseGoogleQuery(urlString) {
  try { return new URL(urlString).searchParams.get("q")?.trim() || ""; }
  catch { return ""; }
}

function isGoogleSearchPage(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname.startsWith("www.google.") && url.pathname === "/search";
  } catch { return false; }
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
    setStatus("Aktif sekme okunamadı.", "error");
    return;
  }

  pageContextEl.textContent = isGoogleSearchPage(tab.url) ? "Google SERP" : "Desteklenmeyen sayfa";
  detectedQueryEl.textContent = query || "Algılanamadı";

  if (isGoogleSearchPage(tab.url)) {
    setStatus("Hazır. Google sonuç sayfasını tarayabilirim.", "success");
  } else {
    setStatus("Lütfen önce Google arama sonuçları sayfasını aç.", "warning");
  }
}

// ─── SERP çekme (sayfa içinde çalışır) ──────────────────────

function extractSerpResultsInPage(options) {
  const normalizeText = (v) => (v || "").replace(/\s+/g, " ").trim();
  const sourceQuery =
    new URL(window.location.href).searchParams.get("q") ||
    document.querySelector('textarea[name="q"], input[name="q"]')?.value || "";

  const skipHosts = new Set([
    "google.com","www.google.com","www.google.com.tr","webcache.googleusercontent.com"
  ]);
  const seen = new Set();
  const results = [];

  const pickSnippet = (container, fallbackTitle) => {
    if (!container) return "";
    return Array.from(container.querySelectorAll("div, span"))
      .map((n) => normalizeText(n.innerText || n.textContent))
      .filter((t) => t && t !== fallbackTitle && t.length >= 40 && t.length <= 320)
      .sort((a, b) => b.length - a.length)[0] || "";
  };

  for (const heading of document.querySelectorAll("h3")) {
    const title = normalizeText(heading.innerText || heading.textContent);
    if (!title) continue;

    const anchor = heading.closest("a") || heading.parentElement?.closest("a");
    const href = anchor?.href;
    if (!href) continue;

    let parsed;
    try { parsed = new URL(href); } catch { continue; }

    if (!/^https?:/.test(parsed.protocol)) continue;
    if (parsed.hostname.includes("google.") || skipHosts.has(parsed.hostname)) continue;

    const key = parsed.origin + parsed.pathname;
    if (seen.has(key)) continue;

    const container =
      heading.closest("div.g, div.MjjYud, div[data-hveid], div[jscontroller]") ||
      anchor.closest("div");

    seen.add(key);
    results.push({
      position: results.length + 1,
      title,
      url: href,
      displayUrl: normalizeText(container?.querySelector("cite")?.textContent) || parsed.hostname,
      snippet: pickSnippet(container, title)
    });

    if (results.length >= options.maxResults) break;
  }

  return {
    sourceUrl: window.location.href,
    sourceQuery: normalizeText(sourceQuery),
    capturedAt: new Date().toISOString(),
    results
  };
}

// ─── Tarama başlat ──────────────────────────────────────────

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !isGoogleSearchPage(tab.url)) {
    setStatus("Tarama yalnızca Google arama sonuç sayfasında başlatılabilir.", "error");
    return;
  }

  const maxResults  = Math.max(5, Math.min(20, Number(maxResultsInput.value) || 10));
  const focusKeyword = focusKeywordInput.value.trim();
  const strictMode  = strictModeInput.checked;

  setStatus("SERP verisi toplanıyor...", "loading");

  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSerpResultsInPage,
      args: [{ maxResults }]
    });

    const scan = execution?.result;
    if (!scan?.results?.length) {
      setStatus("Analiz edilebilir organik sonuç bulunamadı.", "error");
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

    await chrome.storage.local.set({ [STORAGE_KEY]: session, seoRadarLatestAnalysis: null });
    await chrome.runtime.sendMessage({ type: "open_results_page" });
    setStatus(`${scan.results.length} sonuç toplandı. Analiz başlatıldı...`, "success");
  } catch (error) {
    setStatus(`Tarama başarısız: ${error.message}`, "error");
  }
});

// ─── Başlat ─────────────────────────────────────────────────

loadAuthState();
hydrateContext();
