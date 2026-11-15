import { classify, TRUST_RANK } from './classifier.js';

async function callLangSearch(q) {
  const res = await fetch('https://api.langsearch.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LANGSEARCH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: q,
      count: 20,
      contents: { text: true },
      freshness: 'noLimit',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`LangSearch error ${res.status}`);
  const data = await res.json();
  const pages = data.data?.webPages?.value || [];
  return pages.map((r) => ({
    title: r.name,
    url: r.url,
    snippet: r.text || r.snippet || '',
  }));
}

async function callSerper(q) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: 20, ...(hasArabic(q) ? { hl: 'ar' } : {}) }),
  });
  if (!res.ok) throw new Error(`Serper error ${res.status}`);
  const data = await res.json();
  return (data.organic || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || '' }));
}

async function callBrave(q) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
  });
  if (!res.ok) throw new Error(`Brave error ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: (r.description || '').replace(/<[^>]+>/g, '') }));
}

const hasArabic = (s) => /[؀-ۿ]/.test(s);

function provider() {
  const pref = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  const hasLang = Boolean(process.env.LANGSEARCH_API_KEY);
  const hasSerper = Boolean(process.env.SERPER_API_KEY);
  const hasBrave = Boolean(process.env.BRAVE_API_KEY);

  if (pref === 'langsearch' && hasLang) return callLangSearch;
  if (pref === 'brave' && hasBrave) return callBrave;
  if (pref === 'serper' && hasSerper) return callSerper;
  if (hasLang) return callLangSearch;
  if (hasSerper) return callSerper;
  if (hasBrave) return callBrave;
  return null;
}

// Demo results used when no search API key is configured (local testing).
const MOCK = [
  { title: '[DEMO] Official Journal of the Algerian Republic — portal', url: 'https://www.joradp.dz', snippet: 'Demo result. Official gazette portal: laws, ordinances and decrees. Add a search API key to get live results for your query.' },
  { title: '[DEMO] Algerian Ministry of Justice — portal', url: 'https://www.mjustice.dz', snippet: 'Demo result. Official ministry website with legislation and judicial information.' },
  { title: '[DEMO] Algerian Scientific Journal Platform (ASJP)', url: 'https://www.asjp.cerist.dz', snippet: 'Demo result. Peer-reviewed Algerian journals, including law and political science.' },
  { title: '[DEMO] United Nations — official site', url: 'https://www.un.org', snippet: 'Demo result. Treaties, resolutions and reports of the UN system.' },
  { title: '[DEMO] Library of Congress — Global Legal Monitor', url: 'https://www.loc.gov', snippet: 'Demo result. Comparative legal research from the U.S. Library of Congress.' },
  { title: '[DEMO] Wikipedia — general reference', url: 'https://www.wikipedia.org', snippet: 'Demo result showing how community sources are flagged as low-trust.' },
];

function enrich(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it?.url || seen.has(it.url)) continue;
    const c = classify(it.url);
    if (!c) continue;
    seen.add(it.url);
    out.push({ title: (it.title || it.url).trim(), snippet: (it.snippet || '').trim(), url: it.url, ...c });
  }
  // Stable sort: higher trust first, original (search-engine) order within a level
  return out.map((r, i) => [r, i]).sort((a, b) => TRUST_RANK[a[0].trust] - TRUST_RANK[b[0].trust] || a[1] - b[1]).map(([r]) => r);
}

/** Open-web search + on-the-fly classification. */
export async function searchWeb(query) {
  const fn = provider();
  if (!fn) return { results: enrich(MOCK), mock: true, providerError: null };
  try {
    return { results: enrich(await fn(query)), mock: false, providerError: null };
  } catch (e) {
    return { results: [], mock: false, providerError: e.message || 'Search failed' };
  }
}
