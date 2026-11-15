import { Router } from 'express';
import { searchWeb } from '../lib/search.js';
import { generateExpose, hasAiKey } from '../lib/ai.js';
import { renderExposePdf } from '../lib/pdf.js';
import { buildCoverHtml, buildBodyHtml } from '../lib/template.js';
import { classify, isHttpUrl } from '../lib/classifier.js';

const router = Router();
const CATEGORIES = ['political', 'economic', 'historical', 'constitutional', 'comparative', 'mixed'];
const LANGS = ['ar', 'fr', 'en'];
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : d);

router.get('/health', (_req, res) => res.json({ ok: true, ai: hasAiKey(), search: Boolean(process.env.SERPER_API_KEY || process.env.BRAVE_API_KEY) }));

// ---- Open-web search with smart classification ----
router.get('/search', async (req, res) => {
  const q = str(req.query.q, 200);
  if (q.length < 2) return res.status(400).json({ error: 'Query too short.' });
  try {
    res.json(await searchWeb(q));
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Search failed.' });
  }
});

// ---- Exposé generation ----
router.post('/expose', async (req, res) => {
  const b = req.body || {};
  const description = str(b.description, 4000);
  if (description.length < 10) return res.status(400).json({ error: 'Please describe the exposé (min 10 characters).' });

  const category = CATEGORIES.includes(b.category) ? b.category : 'mixed';
  const language = LANGS.includes(b.language) ? b.language : 'ar';
  const pages = clamp(b.pages, 2, 30, 6);
  const sectionCount = clamp(b.sectionCount, 1, 8, 3);
  const subheadings = (Array.isArray(b.subheadings) ? b.subheadings : []).map((s) => str(s, 150)).filter(Boolean).slice(0, 10);

  try {
    // Pinned sources are re-classified server-side (client data is never trusted)
    const pinned = (Array.isArray(b.pinnedSources) ? b.pinnedSources : [])
      .filter((s) => s && isHttpUrl(s.url))
      .slice(0, 10)
      .map((s) => ({ title: str(s.title, 300), snippet: str(s.snippet, 500), url: s.url, ...classify(s.url) }));

    const found = await searchWeb(description.slice(0, 200));
    const seen = new Set(pinned.map((p) => p.url));
    // The AI only gets high/medium/unknown-trust results; community content is excluded
    const fresh = found.results.filter((r) => r.trust !== 'low' && !seen.has(r.url));
    const merged = [...pinned, ...fresh].slice(0, 14).map((s, i) => ({ ...s, n: i + 1 }));

    const expose = await generateExpose({ category, description, sectionCount, pages, subheadings, language, sources: merged });

    const text = JSON.stringify(expose);
    const cited = new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((m) => +m[1]));
    res.json({
      expose,
      sources: merged,
      citedNumbers: [...cited],
      demoSearch: found.mock,
      demoAi: !hasAiKey(),
      providerError: found.providerError,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Generation failed. Please try again.' });
  }
});

// ---- PDF export ----
router.post('/pdf', async (req, res) => {
  const b = req.body || {};
  const e = b.expose;
  if (!e || typeof e.title !== 'string' || !Array.isArray(e.sections)) return res.status(400).json({ error: 'Invalid exposé payload.' });

  const language = LANGS.includes(b.language) ? b.language : 'ar';
  const category = CATEGORIES.includes(b.category) ? b.category : 'mixed';
  const clean = (arr) => (Array.isArray(arr) ? arr.map((p) => str(p, 6000)).filter(Boolean) : []);

  const expose = {
    title: str(e.title, 300),
    introduction: str(e.introduction, 8000),
    conclusion: str(e.conclusion, 8000),
    sections: e.sections.slice(0, 12).map((s) => ({
      heading: str(s.heading, 300),
      paragraphs: clean(s.paragraphs),
      subsections: (Array.isArray(s.subsections) ? s.subsections : []).slice(0, 10).map((x) => ({ heading: str(x.heading, 300), paragraphs: clean(x.paragraphs) })),
    })),
  };

  // Only http(s) URLs reach the references page (no javascript:, file:, etc.)
  const sources = (Array.isArray(b.sources) ? b.sources : [])
    .filter((s) => s && isHttpUrl(s.url))
    .slice(0, 60)
    .map((s) => {
      const c = classify(s.url);
      return {
        n: clamp(s.n, 1, 999, 1),
        title: str(s.title, 300) || s.url,
        url: s.url,
        sourceName: language === 'ar' ? c.sourceNameAr : c.sourceName,
        typeLabel: c.sourceTypeLabel[language === 'ar' ? 'ar' : 'en'],
      };
    });

  const m = b.meta || {};
  const meta = { preparedBy: str(m.preparedBy, 500), supervisedBy: str(m.supervisedBy, 200), university: str(m.university, 200), faculty: str(m.faculty, 200), academicYear: str(m.academicYear, 20) };

  try {
    const pdf = await renderExposePdf({
      coverHtml: buildCoverHtml({ meta, title: expose.title, category, language }),
      bodyHtml: buildBodyHtml({ expose, sources, language }),
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="expose.pdf"', 'Content-Length': pdf.length });
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed.' });
  }
});

export default router;
