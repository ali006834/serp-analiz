window.SeoRadarAnalyzer = (() => {
  const TURKISH_LOCALE = "tr-TR";

  function normalizeText(value) {
    return (value || "")
      .toLocaleLowerCase(TURKISH_LOCALE)
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function tokenize(input) {
    const stopWords = new Set(["ve", "ile", "icin", "the", "and", "for"]);
    return [...new Set(
      normalizeText(input)
        .split(/[^\p{L}0-9]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !stopWords.has(token))
    )];
  }

  function countOccurrences(text, token) {
    if (!text || !token) {
      return 0;
    }

    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalizeText(text).match(new RegExp(`\\b${escaped}\\b`, "g"));
    return matches ? matches.length : 0;
  }

  function coveragePercent(text, tokens) {
    if (!tokens.length) {
      return 100;
    }

    const normalized = normalizeText(text);
    const matched = tokens.filter((token) => normalized.includes(token)).length;
    return Math.round((matched / tokens.length) * 100);
  }

  function extractHiddenText(doc) {
    return Array.from(
      doc.querySelectorAll(
        "[hidden], [aria-hidden='true'], [style*='display:none'], [style*='display: none'], [style*='visibility:hidden'], [style*='visibility: hidden'], [style*='opacity:0'], [style*='opacity: 0']"
      )
    )
      .map((node) => safeText(node.textContent))
      .filter(Boolean)
      .slice(0, 6);
  }

  function buildTechnicalNotes({ canonical, robots, hiddenTexts, internalLinks }) {
    const notes = [];
    notes.push(canonical ? "Canonical var" : "Canonical yok");
    notes.push(robots ? `Robots: ${robots}` : "Robots meta yok");
    notes.push(hiddenTexts.length ? `Gizli metin sinyali: ${hiddenTexts.length}` : "Gizli metin sinyali yok");
    notes.push(`Iceriden link: ${internalLinks}`);
    return notes.join(" | ");
  }

  function getUrlParts(url) {
    try {
      const parsed = new URL(url);
      const pathTokens = parsed.pathname
        .split("/")
        .map((part) => normalizeText(part))
        .filter(Boolean);

      return {
        hostname: parsed.hostname,
        pathname: parsed.pathname,
        pathTokens
      };
    } catch (error) {
      return {
        hostname: "",
        pathname: "",
        pathTokens: []
      };
    }
  }

  function detectIntent({ url, title, metaDescription, h1s, bodyText }) {
    const { pathTokens, pathname } = getUrlParts(url);
    const text = normalizeText([title, metaDescription, h1s.join(" "), bodyText.slice(0, 1800)].join(" "));
    const pathText = normalizeText(pathname);

    const productSignals = [
      "sepete ekle",
      "satinal",
      "satin al",
      "stokta",
      "urun kodu",
      "beden",
      "renk",
      "adet"
    ];
    const categorySignals = [
      "collections",
      "collection",
      "kategori",
      "categories",
      "shop",
      "tum urunler",
      "koleksiyon"
    ];
    const infoSignals = [
      "blog",
      "rehber",
      "nedir",
      "nasil",
      "ipuclari",
      "guide",
      "tips",
      "how to"
    ];
    const compareSignals = [
      "en iyi",
      "karsilastirma",
      "inceleme",
      "review",
      "top 10",
      "oneriler"
    ];

    const hasProductSignal =
      productSignals.some((signal) => text.includes(signal)) ||
      pathTokens.some((token) => ["urun", "product", "p"].includes(token));
    const hasCategorySignal =
      categorySignals.some((signal) => text.includes(signal) || pathText.includes(signal)) ||
      pathTokens.length >= 2;
    const hasInfoSignal =
      infoSignals.some((signal) => text.includes(signal) || pathText.includes(signal));
    const hasCompareSignal = compareSignals.some((signal) => text.includes(signal));

    if (hasProductSignal) {
      return {
        intentLabel: "Urun Detay",
        pageType: "product",
        intentReason: "Fiyat, stok veya satin alma sinyalleri bulundu."
      };
    }

    if (hasCategorySignal) {
      return {
        intentLabel: "E-ticaret Kategori",
        pageType: "category",
        intentReason: "Kategori veya koleksiyon yapisi tespit edildi."
      };
    }

    if (hasCompareSignal) {
      return {
        intentLabel: "Karsilastirma/Liste",
        pageType: "comparison",
        intentReason: "Listeleme veya karsilastirma dili tespit edildi."
      };
    }

    if (hasInfoSignal) {
      return {
        intentLabel: "Bilgilendirici Icerik",
        pageType: "content",
        intentReason: "Blog veya rehber niyeti tespit edildi."
      };
    }

    return {
      intentLabel: "Marka/Kurumsal",
      pageType: "brand",
      intentReason: "Sayfa daha cok marka veya genel acilis yapisina benziyor."
    };
  }

  function extractRankingTerms({ title, metaDescription, h1s, h2s, bodyText, sourceQuery, focusKeyword }) {
    const baseTokens = new Set([...tokenize(sourceQuery), ...tokenize(focusKeyword)]);
    const text = [title, metaDescription, h1s.join(" "), h2s.join(" "), bodyText.slice(0, 1500)].join(" ");

    return tokenize(text)
      .filter((token) => !baseTokens.has(token))
      .slice(0, 40);
  }

  function computeAuthorityScore({
    title,
    metaDescription,
    h1s,
    h2s,
    canonical,
    robots,
    hiddenTexts,
    internalLinks,
    url,
    queryCoverage,
    focusCoverage
  }) {
    const { hostname, pathname } = getUrlParts(url);
    let score = 12;

    score += title ? 12 : 0;
    score += metaDescription ? 8 : 0;
    score += h1s.length ? 10 : 0;
    score += h2s.length ? Math.min(h2s.length * 2, 10) : 0;
    score += canonical ? 8 : 0;
    score += robots && !robots.includes("noindex") ? 7 : 0;
    score += Math.min(internalLinks, 30) / 2;
    score += queryCoverage * 0.15;
    score += focusCoverage * 0.08;
    score += pathname.length > 1 ? 4 : 0;
    score += hostname.startsWith("www.") ? 2 : 0;
    score -= hiddenTexts.length ? Math.min(hiddenTexts.length * 3, 12) : 0;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function computeScore({
    queryCoverage,
    focusCoverage,
    queryInTitle,
    focusInTitle,
    queryInHeadings,
    focusInHeadings,
    metaDescription,
    hiddenTexts,
    strictMode,
    focusTokens
  }) {
    let score = 0;

    score += Math.round(queryCoverage * 0.38);
    score += Math.round(focusCoverage * 0.24);
    score += queryInTitle ? 16 : 0;
    score += focusInTitle ? 10 : 0;
    score += queryInHeadings ? 10 : 0;
    score += focusInHeadings ? 8 : 0;
    score += metaDescription ? 6 : 0;
    score -= hiddenTexts.length ? Math.min(hiddenTexts.length * 3, 12) : 0;

    if (strictMode && focusTokens.length && focusCoverage < 50) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  function collectHighlights({ queryInTitle, focusInTitle, queryInHeadings, focusInHeadings, hiddenTexts, metaDescription, canonical }) {
    const highlights = [];
    if (queryInTitle) {
      highlights.push("Temel sorgu title icinde geciyor");
    }
    if (focusInTitle) {
      highlights.push("Ek filtre title icinde geciyor");
    }
    if (queryInHeadings) {
      highlights.push("Temel sorgu H1/H2 yapisinda geciyor");
    }
    if (focusInHeadings) {
      highlights.push("Ek filtre H1/H2 yapisinda geciyor");
    }
    if (metaDescription) {
      highlights.push("Meta description mevcut");
    }
    if (canonical) {
      highlights.push("Canonical etiketi mevcut");
    }
    if (hiddenTexts.length) {
      highlights.push("Gizli metin sinyali bulundu");
    }
    return highlights;
  }

  function createBaseAnalysis({
    serpEntry,
    sourceQuery,
    focusKeyword,
    title,
    metaDescription,
    h1s,
    h2s,
    bodyText,
    canonical,
    robots,
    hiddenTexts,
    internalLinks,
    fetchOk,
    fetchError,
    finalUrl
  }) {
    const queryTokens = tokenize(sourceQuery);
    const focusTokens = tokenize(focusKeyword);
    const coreText = [title, metaDescription, h1s.join(" "), h2s.join(" "), serpEntry.title, serpEntry.snippet].join(" ");
    const extendedText = [coreText, bodyText, finalUrl].join(" ");
    const queryCoverage = coveragePercent(extendedText, queryTokens);
    const focusCoverage = focusTokens.length ? coveragePercent(extendedText, focusTokens) : 100;
    const keywordHits = focusTokens.reduce((sum, token) => sum + countOccurrences(bodyText, token), 0);
    const wordCount = Math.max(tokenize(bodyText).length, 1);
    const keywordDensity = focusTokens.length ? ((keywordHits / wordCount) * 100).toFixed(2) : "0.00";

    const headingsText = `${h1s.join(" ")} ${h2s.join(" ")}`.trim();
    const queryInTitle = queryTokens.length ? coveragePercent(title, queryTokens) >= 60 : false;
    const focusInTitle = focusTokens.length ? coveragePercent(title, focusTokens) >= 60 : false;
    const queryInHeadings = queryTokens.length ? coveragePercent(headingsText, queryTokens) >= 60 : false;
    const focusInHeadings = focusTokens.length ? coveragePercent(headingsText, focusTokens) >= 60 : false;

    const score = computeScore({
      queryCoverage,
      focusCoverage,
      queryInTitle,
      focusInTitle,
      queryInHeadings,
      focusInHeadings,
      metaDescription,
      hiddenTexts,
      strictMode: false,
      focusTokens
    });
    const intent = detectIntent({
      url: finalUrl || serpEntry.url,
      title,
      metaDescription,
      h1s,
      bodyText
    });
    const authorityScore = computeAuthorityScore({
      title,
      metaDescription,
      h1s,
      h2s,
      canonical,
      robots,
      hiddenTexts,
      internalLinks,
      url: finalUrl || serpEntry.url,
      queryCoverage,
      focusCoverage
    });
    const rankingTerms = extractRankingTerms({
      title,
      metaDescription,
      h1s,
      h2s,
      bodyText,
      sourceQuery,
      focusKeyword
    });

    return {
      position: serpEntry.position,
      url: finalUrl || serpEntry.url,
      domain: (() => {
        try {
          return new URL(finalUrl || serpEntry.url).hostname;
        } catch (error) {
          return serpEntry.displayUrl || serpEntry.url;
        }
      })(),
      serpTitle: serpEntry.title,
      serpSnippet: serpEntry.snippet,
      title: safeText(title || serpEntry.title),
      metaDescription: safeText(metaDescription),
      h1Summary: safeText(h1s.slice(0, 2).join(" | ")),
      h2Summary: safeText(h2s.slice(0, 3).join(" | ")),
      technicalNotes: buildTechnicalNotes({ canonical, robots, hiddenTexts, internalLinks }),
      pageType: intent.pageType,
      intentLabel: intent.intentLabel,
      intentReason: intent.intentReason,
      queryCoverage,
      focusCoverage,
      keywordDensity,
      authorityScore,
      rankingTerms,
      score,
      fetchOk,
      fetchError,
      highlights: collectHighlights({
        queryInTitle,
        focusInTitle,
        queryInHeadings,
        focusInHeadings,
        hiddenTexts,
        metaDescription,
        canonical
      })
    };
  }

  function analyzeFetchedPage({ html, url, serpEntry, sourceQuery, focusKeyword, strictMode }) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const title = safeText(doc.querySelector("title")?.textContent);
    const metaDescription = safeText(doc.querySelector("meta[name='description']")?.getAttribute("content"));
    const h1s = Array.from(doc.querySelectorAll("h1")).map((node) => safeText(node.textContent)).filter(Boolean);
    const h2s = Array.from(doc.querySelectorAll("h2")).map((node) => safeText(node.textContent)).filter(Boolean);
    const bodyText = safeText(doc.body?.innerText || doc.body?.textContent || "");
    const canonical = safeText(doc.querySelector("link[rel='canonical']")?.getAttribute("href"));
    const robots = safeText(doc.querySelector("meta[name='robots']")?.getAttribute("content"));
    const hiddenTexts = extractHiddenText(doc);
    const currentHost = (() => {
      try {
        return new URL(url).hostname;
      } catch (error) {
        return "";
      }
    })();
    const internalLinks = Array.from(doc.querySelectorAll("a[href]")).filter((anchor) => {
      try {
        return new URL(anchor.href, url).hostname === currentHost;
      } catch (error) {
        return false;
      }
    }).length;

    const base = createBaseAnalysis({
      serpEntry,
      sourceQuery,
      focusKeyword,
      title,
      metaDescription,
      h1s,
      h2s,
      bodyText,
      canonical,
      robots,
      hiddenTexts,
      internalLinks,
      fetchOk: true,
      fetchError: "",
      finalUrl: url
    });

    const focusTokens = tokenize(focusKeyword);
    const requiresFocus = focusTokens.length > 0;
    const meetsQuery = base.queryCoverage >= 55;
    const meetsFocus = !requiresFocus || base.focusCoverage >= 55;
    const isCompetitorMatch = requiresFocus
      ? (strictMode ? meetsQuery && meetsFocus : meetsQuery || meetsFocus)
      : meetsQuery;

    return {
      ...base,
      score: computeScore({
        queryCoverage: base.queryCoverage,
        focusCoverage: base.focusCoverage,
        queryInTitle: base.highlights.includes("Temel sorgu title icinde geciyor"),
        focusInTitle: base.highlights.includes("Ek filtre title icinde geciyor"),
        queryInHeadings: base.highlights.includes("Temel sorgu H1/H2 yapisinda geciyor"),
        focusInHeadings: base.highlights.includes("Ek filtre H1/H2 yapisinda geciyor"),
        metaDescription: base.metaDescription,
        hiddenTexts,
        strictMode,
        focusTokens
      }),
      isCompetitorMatch
    };
  }

  function createFallbackAnalysis({ serpEntry, sourceQuery, focusKeyword, strictMode, errorMessage }) {
    const base = createBaseAnalysis({
      serpEntry,
      sourceQuery,
      focusKeyword,
      title: serpEntry.title,
      metaDescription: "",
      h1s: [],
      h2s: [],
      bodyText: `${serpEntry.title} ${serpEntry.snippet}`,
      canonical: "",
      robots: "",
      hiddenTexts: [],
      internalLinks: 0,
      fetchOk: false,
      fetchError: errorMessage,
      finalUrl: serpEntry.url
    });

    const focusTokens = tokenize(focusKeyword);
    const requiresFocus = focusTokens.length > 0;
    const meetsQuery = base.queryCoverage >= 55;
    const meetsFocus = !requiresFocus || base.focusCoverage >= 55;
    const isCompetitorMatch = requiresFocus
      ? (strictMode ? meetsQuery && meetsFocus : meetsQuery || meetsFocus)
      : meetsQuery;

    return {
      ...base,
      score: computeScore({
        queryCoverage: base.queryCoverage,
        focusCoverage: base.focusCoverage,
        queryInTitle: base.highlights.includes("Temel sorgu title icinde geciyor"),
        focusInTitle: base.highlights.includes("Ek filtre title icinde geciyor"),
        queryInHeadings: base.highlights.includes("Temel sorgu H1/H2 yapisinda geciyor"),
        focusInHeadings: base.highlights.includes("Ek filtre H1/H2 yapisinda geciyor"),
        metaDescription: base.metaDescription,
        hiddenTexts: [],
        strictMode,
        focusTokens
      }),
      highlights: [...base.highlights, "Fetch basarisiz, yalnizca SERP verisiyle skorlandi"],
      isCompetitorMatch
    };
  }

  return {
    analyzeFetchedPage,
    createFallbackAnalysis
  };
})();
