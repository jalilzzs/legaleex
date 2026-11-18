import dns from 'node:dns/promises';
import net from 'node:net';
import { tokenize, termHits } from './search.js';

const UA = 'Mozilla/5.0 (compatible; LegalExxBot/1.0; academic research assistant)';

/* ---------- SSRF guard: only public http(s) hosts may be fetched ---------- */
function ipv4Private(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('::ffff:')) {
      const v4 = l.slice(7);
      return net.isIPv4(v4) ? ipv4Private(v4) : true;
    }
    return /^(fc|fd|fe[89ab])/.test(l);
  }
  return true;
}

/** Throws unless the URL is plain http(s) on a public host. (A DNS-rebinding race remains theoretically possible.) */
export async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('unsupported port');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$/i.test(host) || /\.(local|internal|localdomain)$/i.test(host)) throw new Error('non-public host');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('non-public host');
    return url;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('non-public host');
  return url;
}

/* ---------- download ---------- */
async function readLimited(res, max) {
  const reader = res.body?.getReader?.();
  if (!reader) return Buffer.from(await res.arrayBuffer()).subarray(0, max);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, max);
}

function decode(buf, type) {
  let cs = /charset=([\w-]+)/i.exec(type)?.[1];
  if (!cs) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1'))?.[1];
  try {
    return new TextDecoder(cs || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

/* ---------- HTML -> clean paragraphs ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENT[e.toLowerCase()] ?? ' ';
  });
}

export function extractText(html) {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim();
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header|aside|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(h);
  if (main && main[2].length > 800) h = main[2];
  h = h.replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const seen = new Set();
  const paragraphs = decodeEntities(h)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 40 && !seen.has(l) && seen.add(l)); // short lines are menus / buttons
  return { title, paragraphs };
}

/** Pick the paragraphs that actually talk about the query, keep their original order. */
export function selectExcerpt(paragraphs, terms, maxChars = 3000) {
  const scored = paragraphs.map((p, i) => ({ p, i, s: terms.length ? termHits(terms, p) : 0 }));
  let pick = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  // keep only paragraphs that are clearly on-topic relative to the best one (drops ads / side remarks)
  if (pick.length) pick = pick.filter((x) => x.s >= Math.max(1, pick[0].s * 0.5));
  else pick = scored.slice(0, 8);
  const chosen = [];
  let len = 0;
  for (const x of pick) {
    const t = x.p.slice(0, 700);
    if (len + t.length > maxChars) break;
    chosen.push({ ...x, p: t });
    len += t.length + 1;
  }
  return chosen.sort((a, b) => a.i - b.i).map((x) => x.p).join('\n');
}

export async function fetchPageText(rawUrl, { timeoutMs = 7000, maxBytes = 500_000 } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicUrl(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'manual', // every redirect target is re-validated
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8', 'Accept-Language': 'ar,fr;q=0.8,en;q=0.7' },
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (!/text\/html|application\/xhtml|text\/plain/.test(type)) throw new Error(`unsupported content type: ${type || 'unknown'}`);
      return extractText(decode(await readLimited(res, maxBytes), type));
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('page fetch timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('too many redirects');
}

/**
 * Reads the most promising pages and attaches a query-focused `excerpt`.
 * Mutates and returns `sources` (pinned first, then by score; low-trust and PDFs are skipped).
 */
export async function attachExcerpts(sources, query, { limit = 5, maxChars = 3000 } = {}) {
  const terms = [...new Set(tokenize(query))];
  const candidates = sources
    .filter((s) => s.trust !== 'low' && !/\.pdf(\?|$)/i.test(s.url))
    .sort((a, b) => (b.pinned === true) - (a.pinned === true) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  const settled = await Promise.allSettled(candidates.map((s) => fetchPageText(s.url)));
  let ok = 0;
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.paragraphs.length) return;
    const excerpt = selectExcerpt(r.value.paragraphs, terms, maxChars);
    if (excerpt.length < 120) return; // too thin to be useful
    candidates[i].excerpt = excerpt;
    ok++;
  });
  return { attempted: candidates.length, ok };
}
