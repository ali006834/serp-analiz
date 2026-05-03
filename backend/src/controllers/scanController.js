const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function saveScan(req, res) {
  const { sourceQuery, focusKeyword, strictMode, sourceUrl, results } = req.body;

  if (!sourceQuery || !sourceUrl || !Array.isArray(results) || !results.length) {
    return res.status(400).json({ error: "sourceQuery, sourceUrl ve results zorunludur." });
  }

  const scan = await prisma.scan.create({
    data: {
      userId: req.userId,
      sourceQuery,
      focusKeyword: focusKeyword || null,
      strictMode: !!strictMode,
      sourceUrl,
      results: {
        create: results.map((r) => ({
          position: r.position,
          url: r.url,
          domain: r.domain,
          title: r.title || null,
          metaDescription: r.metaDescription || null,
          intentLabel: r.intentLabel || null,
          pageType: r.pageType || null,
          score: r.score ?? 0,
          authorityScore: r.authorityScore ?? 0,
          queryCoverage: r.queryCoverage ?? 0,
          focusCoverage: r.focusCoverage ?? 0,
          keywordDensity: r.keywordDensity || null,
          isCompetitorMatch: !!r.isCompetitorMatch,
          fetchOk: !!r.fetchOk,
          rankingTerms: Array.isArray(r.rankingTerms) ? r.rankingTerms.join("|") : null,
          highlights: Array.isArray(r.highlights) ? r.highlights.join("|") : null
        }))
      }
    },
    include: { results: true }
  });

  return res.status(201).json({ scan });
}

async function getScans(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const [scans, total] = await Promise.all([
    prisma.scan.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { results: true } },
        results: {
          select: { isCompetitorMatch: true, score: true },
        }
      }
    }),
    prisma.scan.count({ where: { userId: req.userId } })
  ]);

  const formatted = scans.map((scan) => {
    const matched = scan.results.filter((r) => r.isCompetitorMatch).length;
    const avgScore = scan.results.length
      ? Math.round(scan.results.reduce((s, r) => s + r.score, 0) / scan.results.length)
      : 0;

    return {
      id: scan.id,
      sourceQuery: scan.sourceQuery,
      focusKeyword: scan.focusKeyword,
      strictMode: scan.strictMode,
      sourceUrl: scan.sourceUrl,
      createdAt: scan.createdAt,
      totalResults: scan._count.results,
      matchedResults: matched,
      avgScore
    };
  });

  return res.json({
    scans: formatted,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  });
}

async function getScanById(req, res) {
  const scan = await prisma.scan.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { results: { orderBy: { position: "asc" } } }
  });

  if (!scan) {
    return res.status(404).json({ error: "Tarama bulunamadı." });
  }

  const formatted = {
    ...scan,
    results: scan.results.map((r) => ({
      ...r,
      rankingTerms: r.rankingTerms ? r.rankingTerms.split("|") : [],
      highlights: r.highlights ? r.highlights.split("|") : []
    }))
  };

  return res.json({ scan: formatted });
}

async function deleteScan(req, res) {
  const existing = await prisma.scan.findFirst({
    where: { id: req.params.id, userId: req.userId }
  });

  if (!existing) {
    return res.status(404).json({ error: "Tarama bulunamadı." });
  }

  await prisma.scan.delete({ where: { id: req.params.id } });
  return res.json({ message: "Tarama silindi." });
}

module.exports = { saveScan, getScans, getScanById, deleteScan };
