import { activeAiModel, verifyAi } from './ai.js';
import { activeSearchEngine, searchWeb } from './search.js';

export const APP_VERSION = '1.1.0';

/** Which AI model + which search engine this deployment is using (no secrets, only booleans). */
export function getSystemInfo() {
  return {
    app: 'LegalExx',
    version: APP_VERSION,
    ai: activeAiModel(),
    search: activeSearchEngine(),
    pdf: { engine: 'Puppeteer (Chromium)', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'puppeteer default' },
    env: {
      GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
      GEMINI_MODEL: process.env.GEMINI_MODEL || null,
      SERPER_API_KEY: Boolean(process.env.SERPER_API_KEY),
      LANGSEARCH_API_KEY: Boolean(process.env.LANGSEARCH_API_KEY),
      BRAVE_API_KEY: Boolean(process.env.BRAVE_API_KEY),
      SEARCH_PROVIDER: process.env.SEARCH_PROVIDER || null,
    },
    node: process.version,
    time: new Date().toISOString(),
  };
}

export function logSystemInfo(tag = 'system') {
  const s = getSystemInfo();
  const ai = s.ai.live ? `${s.ai.provider} / ${s.ai.model}${s.ai.configured ? ' (GEMINI_MODEL)' : ' (default)'}` : 'DEMO — GEMINI_API_KEY is missing';
  const search = s.search.live ? s.search.label : 'DEMO — no search API key (SERPER_API_KEY / LANGSEARCH_API_KEY / BRAVE_API_KEY)';
  console.log(`[${tag}] LegalExx v${s.version} | AI: ${ai} | Search: ${search} | PDF: ${s.pdf.engine}`);
}

async function verifySearch() {
  const e = activeSearchEngine();
  if (!e.live) return { ok: false, engine: e.label, reason: 'no search API key configured' };
  const r = await searchWeb('constitution', { limit: 3 });
  return { ok: !r.providerError, engine: e.label, results: r.results.length, error: r.providerError, tookMs: r.tookMs };
}

/** Live check of both services (costs one search request). */
export async function verifySystem() {
  const [ai, search] = await Promise.all([verifyAi(), verifySearch()]);
  return { ai, search };
}
