import { classify, TRUST_RANK } from './classifier.js';

/* ------------------------------------------------------------------ *
 *  Search engine registry + active-engine reporting
 * ------------------------------------------------------------------ */
const PROVIDERS = {
  serper: { label: 'Serper (Google Search API)', env: 'SERPER_API_KEY' },
  langsearch: { label: 'LangSearch Web Search API', env: 'LANGSEARCH_API_KEY' },
  brave: { label: 'Brave Search API', env: 'BRAVE_API_KEY' },
};
const AUTO_ORDER = ['serper', 'langsearch', 'brave'];
const TIMEOUT_MS = 10_000;

/** Which search engine is active right now (SEARCH_PROVIDER wins if its key exists). */
export function activeSearchEngine() {
  const has = (id) => Boolean(process.env[PROVIDERS[id].env]);
  const pref = (process.env.SEARCH_PROVIDER || '').trim().toLowerCase();
  const id = PROVIDERS[pref] && has(pref) ? pref : AUTO_ORDER.find(has);
  if (!id) return { id: 'mock', label: 'Demo mode (no search API key configured)', live: false };
  return { id, label: PROVIDERS[id].label, live: true };
}

/* ------------------------------------------------------------------ *
 *  Text helpers (Arabic / French / English aware)
 * ------------------------------------------------------------------ */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics + tatweel
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const STOP = new Set(
  ('the and for with that this from are was were what how why about into between of in on to a an is as by or not be it its their ' +
    'le la les des du de et en un une pour dans sur par au aux que qui est sont ou ce ces son sa ses ' +
    'في من على الى إلى عن مع هذا هذه ذلك تلك التي الذي الذين ما هو هي أن ان أو او لا كما بين حول ثم قد كل عند وفق حسب لدى بعد قبل ' +
    'اكتب اشرح عرض بحث حول موضوع').split(/\s+/).map(normalizeText)
);

export function tokenize(s) {
  return normalizeText(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w));
}

/** Keywords in their ORIGINAL spelling (for building search queries). */
export function keywordsOf(text, n = 8) {
  const seen = new Set();
  const out = [];
  for (const w of String(text ?? '').split(/[^\p{L}\p{N}]+/u)) {
    const k = normalizeText(w);
    if (w.length < 3 || STOP.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

export function detectLang(s) {
  if (/[؀-ۿ]/.test(s)) return 'ar';
  if (/[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|du|et|une|loi|droit|constitution|juridique)\b/i.test(s)) return 'fr';
  return 'en';
}

function tokenSet(s) {
  return new Set(tokenize(s));
}
// prefix matching tolerates Arabic/French inflection (الجرائم ~ الجريمة is NOT matched, but قانون ~ قانونية is)
function setHas(set, w) {
  if (set.has(w)) return true;
  if (w.length < 4) return false;
  for (const x of set) if (x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) return true;
  return false;
}
/** How many of `terms` (already tokenized) appear in `text`. */
export function termHits(terms, text) {
  const set = tokenSet(text);
  let n = 0;
  for (const w of terms) if (setHas(set, w)) n++;
  return n;
}

/** Same link, minus tracking parameters and #fragment (kept as shown to the student and printed in the references). */
export function cleanUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return String(u);
  }
}

export function canonicalUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/\/$/, '').replace('://www.', '://');
  } catch {
    return String(u);
  }
}

/* ------------------------------------------------------------------ *
 *  Provider calls
 * ------------------------------------------------------------------ */
async function fetchJson(url, init, name) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180);
      const err = new Error(`${name} error ${res.status}${body ? `: ${body}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${name} timed out after ${TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callSerper(q, o) {
  const body = { q, num: o.num };
  if (o.gl) body.gl = o.gl;
  if (o.hl) body.hl = o.hl;
  const tbs = { year: 'qdr:y', month: 'qdr:m' }[o.freshness];
  if (tbs) body.tbs = tbs;
  const data = await fetchJson(
    'https://google.serper.dev/search',
    { method: 'POST', headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'Serper'
  );
  return (data.organic || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || '', date: r.date || null }));
}

async function callBrave(q, o) {
  const params = new URLSearchParams({ q, count: String(Math.min(o.num, 20)) });
  if (o.hl) params.set('search_lang', o.hl);
  const fr = { year: 'py', month: 'pm' }[o.freshness];
  if (fr) params.set('freshness', fr);
  const data = await fetchJson(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY } },
    'Brave'
  );
  return (data.web?.results || []).map((r) => ({
    title: (r.title || '').replace(/<[^>]+>/g, ''),
    url: r.url,
    snippet: (r.description || '').replace(/<[^>]+>/g, ''),
    date: r.age || r.page_age || null,
  }));
}

// NOTE: LangSearch's response schema is parsed defensively (several known shapes).
async function callLangSearch(q, o) {
  const call = (freshness) =>
    fetchJson(
      'https://api.langsearch.com/v1/web-search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.LANGSEARCH_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, freshness, summary: true, count: Math.min(o.num, 20) }),
      },
      'LangSearch'
    );
  const wanted = { year: 'oneYear', month: 'oneMonth' }[o.freshness] || 'noLimit';
  let data;
  try {
    data = await call(wanted);
  } catch (e) {
    if (e.status === 400 && wanted !== 'noLimit') data = await call('noLimit');
    else throw e;
  }
  const list = data?.data?.webPages?.value || data?.webPages?.value || data?.data?.results || data?.results || [];
  if (!list.length && data) console.warn('[search] LangSearch returned no parsable results; top-level keys:', Object.keys(data));
  return list.map((r) => ({
    title: r.name || r.title,
    url: r.url,
    snippet: r.summary || r.snippet || '',
    date: r.datePublished || r.dateLastCrawled || null,
  }));
}

const CALLS = { serper: callSerper, langsearch: callLangSearch, brave: callBrave };

/* ------------------------------------------------------------------ *
 *  Query building
 * ------------------------------------------------------------------ */
function buildVariants(q, { country, booksOnly }, engineId) {
  const ops = engineId !== 'langsearch'; // site:/filetype: operators are not reliable there
  const hl = country === 'fr' ? 'fr' : detectLang(q);
  const gl = country === 'dz' ? 'dz' : country === 'fr' ? 'fr' : undefined;
  const tld = country === 'dz' ? '.dz' : country === 'fr' ? '.fr' : null;
  const place = country === 'dz' ? (hl === 'ar' ? 'الجزائر' : 'Algérie') : country === 'fr' ? 'France' : '';

  // Geo-targeting by parameter + one extra variant restricted to the national TLD.
  // (Never a *hard* site: filter on its own — that is what made results disappear before.)
  let bases = [{ q, gl, hl }];
  if (tld && ops) bases.push({ q: `${q} site:${tld}`, gl, hl });
  if (tld && !ops && !q.includes(place)) bases = [{ q: `${q} ${place}`, gl, hl }];

  if (!booksOnly) return bases;
  const books = bases.map((b) => ({ ...b, q: ops ? `${b.q} filetype:pdf` : `${b.q} pdf` }));
  books.push({ q: `${q} (كتاب OR مرجع OR livre OR manuel OR book)`, gl, hl });
  return ops ? books : [books[0]];
}

/* ------------------------------------------------------------------ *
 *  Noise filtering + ranking
 * ------------------------------------------------------------------ */
const NOISE_SNIPPET = [
  /\bdc\.(subject|title|creator|identifier|description|date|type)\b/i,
  /tuhh\.opus/i,
  /^\s*(?:[a-z]+\.){2,}[a-z]+\s*[:=]/i, // metadata dumps like "dc.xxx.yyy: value"
];
const NOISE_URL = /\/(search|tag|tags|login|signin|sign-in|register|cart|checkout|feed|print)(\/|\?|$)|wp-login\.php|[?&](s|search)=|\.(jpe?g|png|gif|webp|svg|mp3|mp4|zip|rar|exe|apk)(\?|$)/i;

function isNoise(it, url) {
  const title = (it.title || '').trim();
  if (title.length < 3 || !/\p{L}/u.test(title)) return true;
  if (NOISE_URL.test(url)) return true;
  return NOISE_SNIPPET.some((re) => re.test(it.snippet || ''));
}

const TRUST_SCORE = { high: 1, medium: 0.6, unknown: 0.4, low: 0.1 };
const round2 = (n) => Math.round(n * 100) / 100;

function rankAndFilter(raw, q, limit) {
  const terms = [...new Set(tokenize(q))];
  const byUrl = new Map();
  let filtered = 0;

  for (const it of raw) {
    const url = cleanUrl((it?.url || '').trim());
    const c = url ? classify(url) : null;
    if (!c || isNoise(it, url)) {
      filtered++;
      continue;
    }
    const key = canonicalUrl(url);
    const title = it.title.trim();
    const snippet = (it.snippet || '').replace(/\s+/g, ' ').trim();

    // relevance: title hits count fully, snippet/url hits 60%
    let rel = 0.5;
    if (terms.length) {
      const tHits = termHits(terms, title);
      const rest = termHits(terms, `${snippet} ${url}`);
      rel = Math.min(1, (tHits + Math.max(0, rest - tHits) * 0.6) / terms.length);
    }
    const posScore = 1 / (1 + it._pos / 4); // the engine's own ranking is a useful semantic signal
    const score = 0.45 * rel + 0.35 * (TRUST_SCORE[c.trust] ?? 0.4) + 0.2 * posScore;

    const prev = byUrl.get(key);
    if (prev) {
      prev.score = Math.min(1, Math.max(prev.score, score) + 0.04); // found by several query variants
      prev._pos = Math.min(prev._pos, it._pos);
      continue;
    }
    byUrl.set(key, { title, snippet, url, date: it.date || null, ...c, relevance: round2(rel), score, _pos: it._pos });
  }

  let list = [...byUrl.values()];
  if (terms.length >= 2) {
    const before = list.length;
    // drop results with zero overlap with the query that the engine itself ranked low
    list = list.filter((r) => r.relevance > 0 || r._pos < 3);
    filtered += before - list.length;
  }
  list.sort((a, b) => b.score - a.score || TRUST_RANK[a.trust] - TRUST_RANK[b.trust]);
  return {
    results: list.slice(0, limit).map(({ _pos, ...r }) => ({ ...r, score: round2(r.score) })),
    filtered,
  };
}

const MOCK = [
  { title: '[DEMO] الجريدة الرسمية للجمهورية الجزائرية', url: 'https://www.joradp.dz', snippet: 'بوابة القوانين والمراسيم التنفيذية الرسمية في الجزائر.' },
  { title: '[DEMO] المنصة الجزائرية للمجلات العلمية ASJP', url: 'https://www.asjp.cerist.dz', snippet: 'أبحاث ومقالات أكاديمية محكمة.' },
  { title: '[DEMO] United Nations — official site', url: 'https://www.un.org', snippet: 'Treaties, resolutions and reports of the UN system.' },
  { title: '[DEMO] Wikipedia — general reference', url: 'https://www.wikipedia.org', snippet: 'Shows how community sources are flagged as low-trust.' },
];

/* ------------------------------------------------------------------ *
 *  Public API
 * ------------------------------------------------------------------ */
/**
 * Open-web search with query variants, noise filtering, relevance ranking and
 * source classification.
 * options: { country: 'global'|'dz'|'fr', booksOnly, freshness: 'any'|'year'|'month', limit }
 */
export async function searchWeb(query, options = {}) {
  const t0 = Date.now();
  const { country = 'global', booksOnly = false, freshness = 'any', limit = 20 } = options;
  const q = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const engine = activeSearchEngine();
  const base = { engine, mock: !engine.live, providerError: null, warnings: [], queries: [q] };

  if (!engine.live) {
    const results = MOCK.map((m) => ({ ...m, snippet: m.snippet, ...classify(m.url), relevance: 0.5, score: 0.5, date: null }));
    return { ...base, results, stats: { raw: MOCK.length, kept: results.length, filtered: 0 }, tookMs: Date.now() - t0 };
  }

  const variants = buildVariants(q, { country, booksOnly }, engine.id);
  const settled = await Promise.allSettled(
    variants.map((v) => CALLS[engine.id](v.q, { num: 15, gl: v.gl, hl: v.hl, freshness }))
  );

  const raw = [];
  const errors = [];
  settled.forEach((s) => {
    if (s.status === 'fulfilled') s.value.forEach((r, i) => raw.push({ ...r, _pos: i }));
    else errors.push(s.reason?.message || 'search failed');
  });

  const { results, filtered } = rankAndFilter(raw, q, limit);
  if (errors.length) console.warn(`[search] ${engine.id}: ${errors.length}/${variants.length} variant(s) failed — ${errors[0]}`);
  return {
    ...base,
    results,
    providerError: !results.length && errors.length ? errors[0] : null,
    warnings: results.length ? errors : [],
    queries: variants.map((v) => v.q),
    stats: { raw: raw.length, kept: results.length, filtered },
    tookMs: Date.now() - t0,
  };
}
