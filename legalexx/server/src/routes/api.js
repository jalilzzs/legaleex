import express from 'express';
import { searchWeb, activeSearchEngine } from '../lib/search.js';
import { generateExpose, explainRequest, sanitizeExpose, citedNumbers, hasAiKey, activeAiModel } from '../lib/ai.js';
import { gatherSources } from '../lib/pipeline.js';
import { renderExposePdf } from '../lib/pdf.js';
import { buildCoverHtml, buildBodyHtml } from '../lib/template.js';
import { classify, isHttpUrl } from '../lib/classifier.js';
import { getSystemInfo, verifySystem } from '../lib/system.js';

const router = express.Router();

// Must match client/src/i18n.js CATEGORY_IDS
const CATEGORIES = ['political', 'economic', 'historical', 'constitutional', 'comparative', 'mixed'];
const LANGS = ['ar', 'fr', 'en'];
const COUNTRIES = ['global', 'dz', 'fr'];
const FRESHNESS = ['any', 'year', 'month'];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const flag = (v) => v === true || v === 'true' || v === '1' || v === 'on';
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** What the browser needs to know about a source (page excerpts stay on the server). */
const publicSource = (s) => ({
  n: s.n,
  title: s.title,
  snippet: s.snippet,
  url: s.url,
  date: s.date || null,
  sourceName: s.sourceName,
  sourceNameAr: s.sourceNameAr,
  sourceType: s.sourceType,
  sourceTypeLabel: s.sourceTypeLabel,
  trust: s.trust,
  group: s.group,
  pinned: Boolean(s.pinned),
  readPage: Boolean(s.excerpt), // the server read the page itself, not just the search snippet
});

/** Transparency block returned with every AI answer. */
const buildMeta = (g, model, totalMs) => ({
  ai: { ...activeAiModel(), usedModel: model },
  search: g.engine,
  planner: g.planner,
  queries: g.queries,
  counts: g.counts,
  pages: g.pages,
  mock: g.mock,
  tookMs: totalMs,
});

const logPipeline = (tag, m) =>
  console.log(
    `[${tag}] model=${m.ai.usedModel} | search=${m.search.id} | queries=${m.queries.length} | found=${m.counts.found} used=${m.counts.used} pinned=${m.counts.pinned} | pages read=${m.pages.ok}/${m.pages.attempted} | ${(m.tookMs / 1000).toFixed(1)}s`
  );

function fail(res, tag, e) {
  console.error(`[${tag}]`, e);
  if (e?.expose) return res.status(e.status === 504 ? 504 : 502).json({ error: e.message });
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

/* ---------------- health + system transparency ---------------- */
router.get('/health', (_req, res) => {
  const ai = activeAiModel();
  const search = activeSearchEngine();
  res.json({ ok: true, ai: ai.live, search: search.live, model: ai.model, searchEngine: search.label });
});

router.get('/system', async (req, res) => {
  const info = getSystemInfo();
  if (flag(req.query.verify)) info.checks = await verifySystem().catch((e) => ({ error: e.message }));
  res.json(info);
});

/* ---------------- search ---------------- */
router.get('/search', async (req, res) => {
  const q = str(req.query.q, 300);
  if (q.length < 2) return res.status(400).json({ error: 'Query too short.' });
  try {
    const out = await searchWeb(q, {
      country: pick(req.query.country, COUNTRIES, 'global'),
      booksOnly: flag(req.query.booksOnly),
      freshness: pick(req.query.freshness, FRESHNESS, 'any'),
    });
    console.log(`[search] engine=${out.engine.id} | "${q.slice(0, 60)}" | raw=${out.stats.raw} kept=${out.stats.kept} filtered=${out.stats.filtered} | ${out.tookMs}ms`);
    res.json(out);
  } catch (e) {
    fail(res, 'search', e);
  }
});

/* ---------------- exposé generation (search -> AI) ---------------- */
router.post('/expose', async (req, res) => {
  const b = req.body || {};
  const description = str(b.description, 4000);
  if (description.length < 10) return res.status(400).json({ error: 'Please describe the exposé (min 10 characters).' });

  const category = pick(b.category, CATEGORIES, 'mixed');
  const language = pick(b.language, LANGS, 'ar');
  const pages = num(b.pages, 2, 30, 6);
  const sectionCount = num(b.sectionCount, 1, 8, 3);
  const subheadings = (Array.isArray(b.subheadings) ? b.subheadings : []).map((s) => str(s, 150)).filter(Boolean).slice(0, 10);

  try {
    const t0 = Date.now();
    const g = await gatherSources({
      text: description,
      category,
      language,
      country: pick(b.country, COUNTRIES, 'global'),
      pinned: Array.isArray(b.pinnedSources) ? b.pinnedSources : [],
    });
    const { expose, model } = await generateExpose({ category, description, sectionCount, pages, subheadings, language, sources: g.sources });

    const meta = buildMeta(g.meta, model, Date.now() - t0);
    logPipeline('expose', meta);
    res.json({
      expose,
      sources: g.sources.map(publicSource),
      citedNumbers: citedNumbers(expose),
      meta,
      demoSearch: g.meta.mock,
      demoAi: !hasAiKey(),
      providerError: g.meta.providerError,
    });
  } catch (e) {
    fail(res, 'expose', e);
  }
});

/* ---------------- explanation / request breakdown (search + AI) ---------------- */
router.post('/explain', async (req, res) => {
  const b = req.body || {};
  const request = str(b.request, 4000);
  if (request.length < 5) return res.status(400).json({ error: 'Please write the request you want explained.' });

  const category = pick(b.category, CATEGORIES, 'mixed');
  const language = pick(b.language, LANGS, 'ar');

  try {
    const t0 = Date.now();
    const g = await gatherSources({
      text: request,
      category,
      language,
      country: pick(b.country, COUNTRIES, 'global'),
      pinned: Array.isArray(b.pinnedSources) ? b.pinnedSources : [],
    });
    const { explanation, model } = await explainRequest({ request, category, language, sources: g.sources });

    const meta = buildMeta(g.meta, model, Date.now() - t0);
    logPipeline('explain', meta);
    res.json({
      explanation,
      sources: g.sources.map(publicSource),
      citedNumbers: citedNumbers(explanation),
      meta,
      demoSearch: g.meta.mock,
      demoAi: !hasAiKey(),
      providerError: g.meta.providerError,
    });
  } catch (e) {
    fail(res, 'explain', e);
  }
});

/* ---------------- PDF export ---------------- */
router.post('/pdf', async (req, res) => {
  const b = req.body || {};
  if (!b.expose || typeof b.expose !== 'object' || !Array.isArray(b.expose.sections)) return res.status(400).json({ error: 'Invalid exposé payload.' });

  const language = pick(b.language, LANGS, 'ar');
  const category = pick(b.category, CATEGORIES, 'mixed');

  // Only http(s) URLs reach the references page (no javascript:, file:, etc.)
  const sources = (Array.isArray(b.sources) ? b.sources : [])
    .filter((s) => s && isHttpUrl(s.url))
    .slice(0, 60)
    .map((s) => {
      const c = classify(s.url);
      return {
        n: num(s.n, 1, 999, 1),
        title: str(s.title, 300) || s.url,
        url: s.url,
        sourceName: (language === 'ar' ? c.sourceNameAr : c.sourceName) || s.url,
        typeLabel: c.sourceTypeLabel[language === 'ar' ? 'ar' : 'en'],
      };
    });

  let expose;
  try {
    // Same sanitiser as generation: clean text, valid shape, no citations pointing at removed sources.
    expose = sanitizeExpose(b.expose, { language, maxSource: 999, allowedSources: new Set(sources.map((s) => s.n)) });
  } catch {
    return res.status(400).json({ error: 'The exposé is empty or invalid.' });
  }

  const m = b.meta || {};
  const meta = {
    preparedBy: str(m.preparedBy, 500),
    supervisedBy: str(m.supervisedBy, 200),
    university: str(m.university, 200),
    faculty: str(m.faculty, 200),
    academicYear: str(m.academicYear, 20),
  };

  try {
    const pdf = await renderExposePdf({
      coverHtml: buildCoverHtml({ meta, title: expose.title, category, language }),
      bodyHtml: buildBodyHtml({ expose, sources, language }),
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="expose.pdf"', 'Content-Length': pdf.length });
    res.send(pdf);
  } catch (err) {
    console.error('[pdf]', err);
    const chromeMissing = /could not find (chrome|chromium)|executable|ENOENT|failed to launch|no usable sandbox/i.test(String(err?.message));
    res.status(500).json({
      error: chromeMissing
        ? 'PDF engine unavailable: Chromium is not installed or cannot start on the server (check the Dockerfile and PUPPETEER_EXECUTABLE_PATH).'
        : 'PDF generation failed. Check the server logs for the exact error.',
    });
  }
});

// Unknown /api routes must return JSON 404 — never fall through to the web page (which hid the real errors before).
router.use((_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

export default router;
