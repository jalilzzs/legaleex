import { searchWeb, canonicalUrl, activeSearchEngine } from './search.js';
import { classify, isHttpUrl } from './classifier.js';
import { planQueries } from './ai.js';
import { attachExcerpts, assertPublicUrl } from './context.js';

/**
 * The shared search -> AI bridge used by both /api/expose and /api/explain:
 *   1. the AI turns the (long) request into 2-3 focused search queries
 *   2. each query is searched (noise-filtered, relevance-ranked, classified)
 *   3. results are merged, de-duplicated, low-trust ones dropped
 *   4. the best pages are actually read, and a query-focused excerpt is attached
 *   5. sources are numbered [1..n] - these numbers are the citations in the output
 */
export async function gatherSources({ text, category = 'mixed', language = 'ar', country = 'global', pinned = [], maxSources = 10, pageLimit = 5 }) {
  const t0 = Date.now();
  const plan = await planQueries({ request: text, category, language });
  const engine = activeSearchEngine();
  const searches = await Promise.all(plan.queries.map((q) => searchWeb(q, { country, limit: 12 })));

  // Student-pinned sources always make it in, and are re-classified server-side (client data is never trusted).
  // Non-public hosts (localhost, private IPs...) are not sources: drop them before anything touches them.
  const publicPins = (
    await Promise.all(
      pinned.slice(0, 15).map(async (p) => {
        if (!p || !isHttpUrl(p.url)) return null;
        try {
          await assertPublicUrl(p.url);
          return p;
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);

  const pinnedList = [];
  const pinnedKeys = new Set();
  for (const p of publicPins) {
    const key = canonicalUrl(p.url);
    if (pinnedKeys.has(key)) continue;
    pinnedKeys.add(key);
    pinnedList.push({ title: String(p.title || p.url).slice(0, 300), snippet: String(p.snippet || '').slice(0, 500), url: p.url, date: null, ...classify(p.url), pinned: true, score: 1 });
    if (pinnedList.length >= 10) break;
  }

  // In demo mode (no search key) the placeholder results must NOT be handed to the AI as if they were sources.
  const merged = new Map();
  let found = 0;
  if (engine.live) {
    for (const s of searches) {
      for (const r of s.results) {
        found++;
        const key = canonicalUrl(r.url);
        if (pinnedKeys.has(key)) continue;
        const prev = merged.get(key);
        if (prev) prev.score = Math.min(1, Math.max(prev.score, r.score) + 0.05); // hit by several queries
        else merged.set(key, { ...r });
      }
    }
  }
  const all = [...merged.values()];
  const usable = all.filter((r) => r.trust !== 'low');
  usable.sort((a, b) => b.score - a.score);
  const picked = usable.slice(0, Math.max(0, maxSources - pinnedList.length));

  const sources = [...pinnedList, ...picked].map((s, i) => ({ ...s, n: i + 1 }));
  const pages = engine.live || pinnedList.length ? await attachExcerpts(sources, `${plan.queries.join(' ')} ${text.slice(0, 300)}`, { limit: pageLimit }) : { attempted: 0, ok: 0 };

  const failed = searches.filter((s) => s.providerError);
  return {
    sources,
    meta: {
      engine,
      queries: plan.queries,
      planner: plan.usedAi ? plan.model : 'keyword heuristic (AI planning unavailable)',
      mock: !engine.live,
      providerError: failed.length === searches.length && failed.length ? failed[0].providerError : null,
      counts: { found, droppedLowTrust: all.length - usable.length, used: sources.length, pinned: pinnedList.length },
      pages,
      searchMs: Date.now() - t0,
    },
  };
}
