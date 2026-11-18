import { keywordsOf } from './search.js';

/* ------------------------------------------------------------------ *
 *  Configuration / transparency
 * ------------------------------------------------------------------ */
export const hasAiKey = () => Boolean(process.env.GEMINI_API_KEY);

// Tried in order. GEMINI_MODEL (if set) always goes first.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'];
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
let lastGoodModel = null;
let autoPicked = null;

function modelChain() {
  const list = [process.env.GEMINI_MODEL?.trim(), autoPicked, ...DEFAULT_MODELS].filter(Boolean);
  return [...new Set(list)];
}

/** Which AI model is active (the one that last answered successfully, else the first candidate). */
export function activeAiModel() {
  const chain = modelChain();
  return {
    provider: 'Google Gemini',
    model: lastGoodModel || chain[0],
    configured: process.env.GEMINI_MODEL?.trim() || null,
    fallbacks: chain.filter((m) => m !== (lastGoodModel || chain[0])),
    live: hasAiKey(),
    verified: Boolean(lastGoodModel),
  };
}

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.expose = true; // safe to show to the user
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 *  Gemini transport (REST, no SDK) with model fallback + retry
 * ------------------------------------------------------------------ */
export async function listGeminiModels() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: ctrl.signal });
    if (!res.ok) throw new AiError(`Gemini ListModels returned HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''));
  } finally {
    clearTimeout(timer);
  }
}

async function pickAvailableModel(exclude) {
  try {
    const names = (await listGeminiModels()).filter((m) => /flash/i.test(m) && !/lite|image|live|tts|audio|exp|embedding|thinking/i.test(m) && !exclude.includes(m));
    names.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
    return names[0] || null;
  } catch {
    return null;
  }
}

/** One attempt on one model. Returns { text, finishReason } or { next: AiError } or throws a fatal AiError. */
async function tryModel(model, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    let res;
    try {
      res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      return { next: new AiError(e.name === 'AbortError' ? 'Gemini took too long to answer.' : `Could not reach Gemini: ${e.message}`, 504) };
    }
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (!text.trim()) {
        const why = data.promptFeedback?.blockReason ? `blocked (${data.promptFeedback.blockReason})` : `finishReason ${cand?.finishReason || 'unknown'}`;
        return { next: new AiError(`Gemini returned an empty answer: ${why}.`) };
      }
      return { text, finishReason: cand?.finishReason };
    }

    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    console.error(`[gemini] ${model} -> HTTP ${res.status}: ${body}`);
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(body))) {
      throw new AiError('Gemini rejected the API key. Check GEMINI_API_KEY in your hosting variables.');
    }
    if (res.status === 404 || (res.status === 400 && /not found|not supported|invalid model/i.test(body))) {
      return { next: new AiError(`Model "${model}" is not available for this API key.`, 404), missing: true };
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(1500);
      continue;
    }
    return { next: new AiError(res.status === 429 ? 'Gemini quota / rate limit reached. Wait a minute and try again.' : `Gemini error ${res.status}.`) };
  }
  return { next: new AiError('Gemini did not answer.') };
}

export async function callGemini({ system, user, json = true, maxOutputTokens = 8192, temperature = 0.4 }) {
  if (!hasAiKey()) throw new AiError('GEMINI_API_KEY is not set.', 500);
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature, maxOutputTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };

  const chain = lastGoodModel ? [lastGoodModel, ...modelChain().filter((m) => m !== lastGoodModel)] : modelChain();
  const tried = [];
  let lastErr;
  let allMissing = true;

  for (const model of chain) {
    tried.push(model);
    const r = await tryModel(model, payload);
    if (r.text) {
      lastGoodModel = model;
      return { text: r.text, model, finishReason: r.finishReason };
    }
    lastErr = r.next;
    if (!r.missing) allMissing = false;
  }

  // Every candidate name was rejected as unknown: ask Google which flash model this key can really use.
  if (allMissing) {
    const picked = await pickAvailableModel(tried);
    if (picked) {
      console.warn(`[gemini] none of [${tried.join(', ')}] exist for this key; trying "${picked}" found via ListModels`);
      const r = await tryModel(picked, payload);
      if (r.text) {
        autoPicked = picked;
        lastGoodModel = picked;
        return { text: r.text, model: picked, finishReason: r.finishReason };
      }
      lastErr = r.next;
    }
    throw new AiError(`No usable Gemini model. Tried: ${tried.join(', ')}. Set GEMINI_MODEL to a model name from Google AI Studio (open /api/system?verify=1 to list the ones your key can use).`, 502);
  }
  throw lastErr || new AiError('Gemini did not answer.');
}

/* ------------------------------------------------------------------ *
 *  JSON recovery
 * ------------------------------------------------------------------ */
function closeBrackets(s) {
  const stack = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = s;
  if (inStr) out += esc ? '\\"' : '"'; // finish a dangling string
  out = out.replace(/[,:\s]+$/, '');
  return out + stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
}

function repairJson(s) {
  for (let i = 0; i < 6; i++) {
    const closed = closeBrackets(s);
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      const cut = Math.max(s.lastIndexOf('",'), s.lastIndexOf('],'), s.lastIndexOf('},'));
      if (cut <= 0) break;
      s = s.slice(0, cut + 1); // drop the last, incomplete element and retry
    }
  }
  return null;
}

export function parseJson(text) {
  const s = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(s);
  } catch {}
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {}
  }
  if (a >= 0) {
    const fixed = repairJson(s.slice(a));
    if (fixed) return JSON.parse(fixed);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 *  Output sanitising (this is what keeps the PDF layout clean)
 * ------------------------------------------------------------------ */
const AR_DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
const toAsciiDigits = (s) => s.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);

/** Strips markdown / code fences / zero-width characters and normalises whitespace. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/\r/g, '')
    .replace(/```[a-z]*\n?|```/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/gs, '$2')
    .replace(/(?<![\w*])\*(?![\s*])([^*\n]+?)\*(?![\w*])/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normalises citation styles to [n][m] and removes numbers that do not match a retrieved source. */
export function fixCitations(s, maxN, counter, allowed) {
  return toAsciiDigits(String(s ?? '')).replace(/[\[【]\s*(\d{1,3}(?:\s*[,،\-–]\s*\d{1,3})*)\s*[\]】]/g, (_m, list) => {
    const nums = [];
    for (const part of list.split(/\s*[,،]\s*/)) {
      const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
      if (range && +range[1] < +range[2] && +range[2] - +range[1] <= 10) for (let n = +range[1]; n <= +range[2]; n++) nums.push(n);
      else if (/^\d+$/.test(part)) nums.push(+part);
      else if (range) nums.push(+range[1], +range[2]);
    }
    const valid = [...new Set(nums)].filter((n) => (allowed ? allowed.has(n) : n >= 1 && n <= maxN));
    if (counter) counter.removed += nums.length - valid.length;
    return valid.map((n) => `[${n}]`).join('');
  });
}

// The PDF template adds its own numbering (أولا / I / 1-). If the AI (or the student) also typed one,
// headings came out as "أولا: المحور الأول: ..." or "1- 1- ...". Strip a leading enumerator.
const AR_ORD = 'الأول|الأولى|الثاني|الثانية|الثالث|الثالثة|الرابع|الرابعة|الخامس|الخامسة|السادس|السادسة|السابع|السابعة|الثامن|الثامنة|التاسع|العاشر';
const AR_ADV = 'أولا|أولاً|ثانيا|ثانياً|ثالثا|ثالثاً|رابعا|رابعاً|خامسا|خامساً|سادسا|سادساً|سابعا|سابعاً|ثامنا|ثامناً';
const ENUM_RE = new RegExp(
  `^\\s*(?:(?:${AR_ADV})|(?:(?:المحور|المبحث|المطلب|الفرع|الفصل|القسم|الباب)\\s+(?:${AR_ORD}|\\d+))|(?:section|part|chapter|partie|chapitre|titre)\\s+(?:\\d+|[ivx]+)|(?:\\d+|[IVX]+|[A-Za-z])(?=\\s*[-–.):]))\\s*[:\\-–.)]*\\s*`,
  'iu'
);
export function stripEnumerator(h) {
  const s = String(h ?? '').trim();
  let out = s;
  for (let i = 0; i < 3; i++) {
    // repeat: "أولا: المبحث الأول: ..." carries two prefixes
    const next = out.replace(ENUM_RE, '').trim();
    if (next === out || next.length < 3) break;
    out = next;
  }
  return out; // never emptied: a stripped result shorter than 3 chars is rejected
}

const asParas = (v) => {
  if (Array.isArray(v)) v = v.map((x) => (typeof x === 'string' ? x : x?.text ?? x?.content ?? '')).join('\n\n');
  return cleanText(v).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
};
const oneLine = (v) => cleanText(v).replace(/\s+/g, ' ');
const arr = (v) => (Array.isArray(v) ? v : []);

export const citedNumbers = (obj) => [...new Set([...JSON.stringify(obj).matchAll(/\[(\d{1,3})\]/g)].map((m) => +m[1]))].sort((a, b) => a - b);

const removedNote = (n, lang) =>
  lang === 'ar' ? `تمت إزالة ${n} استشهاد(ات) لا يطابق أي مصدر تم جلبه.` : `Removed ${n} citation(s) that did not match any retrieved source.`;

/** Coerces whatever the model returned into the exact shape the PDF template expects. */
export function sanitizeExpose(raw, { maxSource = 0, language = 'ar', maxSections = 12, allowedSources = null } = {}) {
  if (!raw || typeof raw !== 'object') throw new AiError('The AI returned an unreadable answer. Please try again.');
  const counter = { removed: 0 };
  const fix = (s) => fixCitations(s, maxSource, counter, allowedSources);
  const paras = (v) => asParas(v).map(fix);

  const sectionsIn = arr(raw.sections ?? raw.chapters ?? raw.parts);
  const sections = sectionsIn
    .map((s, i) => ({
      heading: fix(stripEnumerator(oneLine(s?.heading ?? s?.title ?? s?.name ?? ''))),
      paragraphs: paras(s?.paragraphs ?? s?.content ?? s?.text ?? s?.body),
      subsections: arr(s?.subsections ?? s?.subSections ?? s?.subsection)
        .map((x) => ({ heading: fix(stripEnumerator(oneLine(x?.heading ?? x?.title ?? ''))), paragraphs: paras(x?.paragraphs ?? x?.content ?? x?.text ?? x?.body) }))
        .filter((x) => x.heading || x.paragraphs.length)
        .slice(0, 10)
        .map((x, j) => ({ ...x, heading: x.heading || `${i + 1}.${j + 1}` })),
    }))
    .filter((s) => s.heading || s.paragraphs.length || s.subsections.length)
    .slice(0, maxSections)
    .map((s, i) => ({ ...s, heading: s.heading || (language === 'ar' ? `المحور ${i + 1}` : `Section ${i + 1}`) }));

  if (!sections.length) throw new AiError('The AI returned an exposé without any sections. Please try again.');

  const notes = arr(raw.verifyNotes).map((n) => fix(oneLine(n))).filter(Boolean);
  const out = {
    title: oneLine(raw.title) || (language === 'ar' ? 'عرض' : 'Exposé'),
    introduction: paras(raw.introduction ?? raw.intro).join('\n\n'),
    sections,
    conclusion: paras(raw.conclusion).join('\n\n'),
    verifyNotes: [...new Set(notes)].slice(0, 12),
  };
  if (counter.removed) out.verifyNotes.push(removedNote(counter.removed, language));
  return out;
}

function sanitizeExplain(raw, { maxSource = 0, language = 'ar' } = {}) {
  if (!raw || typeof raw !== 'object') throw new AiError('The AI returned an unreadable answer. Please try again.');
  const counter = { removed: 0 };
  const fix = (s) => fixCitations(oneLine(s), maxSource, counter);
  const fixP = (s) => fixCitations(cleanText(s), maxSource, counter);
  const pairs = (list, a, b, keys) =>
    arr(list)
      .map((x) => ({ [keys[0]]: fix(x?.[keys[0]] ?? x?.[a] ?? ''), [keys[1]]: fixP(x?.[keys[1]] ?? x?.[b] ?? '') }))
      .filter((x) => x[keys[0]] && x[keys[1]])
      .slice(0, 12);

  const out = {
    summary: fixP(raw.summary),
    requestType: fix(raw.requestType ?? raw.type ?? ''),
    explanation: asParas(raw.explanation).map(fixP),
    keyConcepts: pairs(raw.keyConcepts, 'name', 'explanation', ['term', 'definition']),
    breakdown: pairs(raw.breakdown, 'step', 'explanation', ['title', 'detail']),
    legalBasis: pairs(raw.legalBasis, 'item', 'explanation', ['reference', 'detail']),
    suggestedOutline: arr(raw.suggestedOutline).map(fix).filter(Boolean).slice(0, 10),
    verifyNotes: arr(raw.verifyNotes).map(fix).filter(Boolean).slice(0, 10),
  };
  if (!out.summary && !out.explanation.length) throw new AiError('The AI returned an empty explanation. Please try again.');
  if (counter.removed) out.verifyNotes.push(removedNote(counter.removed, language));
  return out;
}

/* ------------------------------------------------------------------ *
 *  Prompts
 * ------------------------------------------------------------------ */
const LANG_NAMES = { ar: 'Modern Standard Arabic (فصحى أكاديمية)', fr: 'academic French', en: 'academic English' };
const today = () => new Date().toISOString().slice(0, 10);

function sourceBlock(sources) {
  if (!sources.length) return '(no sources were retrieved — keep to general statements and list every legal detail in "verifyNotes")';
  return sources
    .map((s) => {
      const head = `[${s.n}] ${s.title} — ${s.sourceName} (${s.sourceTypeLabel?.en || 'Website'}, trust: ${s.trust}${s.pinned ? ', PINNED by the student' : ''}${s.date ? `, date: ${s.date}` : ''}) — ${s.url}`;
      const body = s.excerpt ? `Excerpt taken from the page:\n${s.excerpt}` : s.snippet ? `Search snippet: ${s.snippet}` : '(no text available)';
      return `${head}\n${body.split('\n').map((l) => `    ${l}`).join('\n')}`;
    })
    .join('\n\n');
}

const SOURCE_RULES = `SOURCE RULES
- Use ONLY the numbered SOURCES for specific details (article numbers, dates, institutions, figures, quotations). Cite inline as [n] at the end of the sentence it supports (at most 3 per sentence).
- Page excerpts are the most reliable text; search snippets are weaker.
- Prefer trust "high". Use "medium"/"unknown" sources for context only and flag them in "verifyNotes". Sources marked PINNED were chosen by the student: use them wherever relevant.
- NEVER invent sources, URLs, article numbers, case numbers, dates, statistics or quotations. If a detail is not supported by the SOURCES and you are not fully certain, speak in general terms and add it to "verifyNotes".
- If sources are thin or contradict each other, say so in "verifyNotes".
- Plain text only: no markdown (no **, no #, no "-" bullets), no HTML.`;

/* ---------- 1) search-query planning ---------- */
function heuristicQueries(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const first = clean.split(/[.!؟?\n]/)[0].slice(0, 120).trim();
  const kw = keywordsOf(clean, 7).join(' ');
  return [...new Set([first, kw].filter((q) => q.length >= 3))];
}

/** Turns a long free-text request into 2-3 short, focused web-search queries. */
export async function planQueries({ request, category, language }) {
  const fallback = heuristicQueries(request);
  if (!hasAiKey()) return { queries: fallback, usedAi: false, model: null };
  try {
    const { text, model } = await callGemini({
      system: `You turn a law student's request into web-search queries that retrieve AUTHORITATIVE legal/academic sources (official gazettes, ministries, courts, universities, international bodies). Today is ${today()}.
Return ONLY JSON: {"queries": ["...", "...", "..."]}
Rules: 2 to 3 queries, each 3-10 words, no quotes/operators unless essential. Use the legal terminology a source would actually contain. Make the first query in the request's own language, and add one in the other main legal language (Arabic or French) when the topic concerns Algerian law. Include law numbers / years only if the student mentioned them.`,
      user: `Field: ${category}\nUI language: ${language}\nRequest:\n${String(request).slice(0, 1500)}`,
      maxOutputTokens: 4096,
      temperature: 0.2,
    });
    const parsed = parseJson(text);
    const qs = arr(parsed?.queries).map((q) => String(q).replace(/\s+/g, ' ').trim().slice(0, 160)).filter((q) => q.length >= 3);
    const uniq = [...new Set(qs)].slice(0, 3);
    if (uniq.length) return { queries: uniq, usedAi: true, model };
  } catch (e) {
    console.warn('[plan] query planning failed, using keyword fallback:', e.message);
  }
  return { queries: fallback, usedAi: false, model: null };
}

/* ---------- 2) exposé generation ---------- */
function mockExpose({ description, sectionCount, subheadings, language, sources }) {
  const ar = language === 'ar';
  const cite = sources.length ? ` [${sources[0].n}]` : '';
  const topic = description.slice(0, 80);
  return {
    title: ar ? `عرض حول: ${topic}` : `Exposé on: ${topic}`,
    introduction: ar
      ? `مقدمة تجريبية للعرض.${cite} هذا المحتوى لا يمثل بحثاً حقيقياً وإنما يُستخدم لاختبار الواجهة وتصدير ملف PDF.`
      : `Demo introduction.${cite} This is not real research; it only lets you test the interface and PDF export.`,
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      heading: subheadings[i] || (ar ? `المحور ${i + 1}: عنوان تجريبي` : `Section ${i + 1}: placeholder heading`),
      paragraphs: [
        ar
          ? `هذا نص تجريبي (وضع العرض التوضيحي) للمحور ${i + 1} حول: ${topic}.${cite} عند ضبط مفتاح GEMINI_API_KEY سيتم توليد محتوى أكاديمي حقيقي.`
          : `Demo placeholder text for section ${i + 1} on: ${topic}.${cite} Set GEMINI_API_KEY to generate real academic content.`,
      ],
      subsections: [],
    })),
    conclusion: ar ? 'خاتمة تجريبية. أضف مفتاح الذكاء الاصطناعي للحصول على محتوى حقيقي.' : 'Demo conclusion. Add the AI key for real content.',
    verifyNotes: [ar ? 'وضع تجريبي: النص أعلاه مجرد عنصر نائب وليس محتوى قانونياً.' : 'Demo mode: the text above is placeholder content, not legal analysis.'],
  };
}

export async function generateExpose(opts) {
  const { category, description, sectionCount, pages, subheadings, language, sources } = opts;
  const maxSource = sources.length;
  if (!hasAiKey()) return { expose: sanitizeExpose(mockExpose(opts), { maxSource, language }), model: 'demo (no GEMINI_API_KEY)', truncated: false };

  const words = Math.round(pages * 280);
  const system = `You are a senior legal academic assistant helping a law student write a formal university exposé (عرض). Today is ${today()}.
Write in ${LANG_NAMES[language] || LANG_NAMES.ar}, with precise legal terminology and a formal academic register.

${SOURCE_RULES}

STRUCTURE
- An introduction (context, problématique, announced plan), exactly ${sectionCount} main section(s), and a conclusion.
- If custom subheadings are given, use them in order as the headings of the main sections; any extra ones become subsections.
- Put each paragraph in its own array item. Target length: about ${words} words in total.

Return ONLY valid JSON of this shape:
{"title":"","introduction":"","sections":[{"heading":"","paragraphs":[""],"subsections":[{"heading":"","paragraphs":[""]}]}],"conclusion":"","verifyNotes":[""]}`;

  const user = `Field: ${category}
Topic / what to cover: ${description}
Number of main sections: ${sectionCount}
Requested subheadings: ${subheadings.length ? subheadings.join(' | ') : 'none — choose appropriate ones'}

SOURCES:
${sourceBlock(sources)}`;

  const budget = Math.min(60000, 6000 + words * 4);
  let obj = null;
  let truncated = false;
  let model;
  for (let attempt = 0; attempt < 2 && !obj; attempt++) {
    const r = await callGemini({ system, user: attempt ? `${user}\n\nIMPORTANT: your previous answer was not valid JSON. Return ONLY the JSON object.` : user, maxOutputTokens: budget, temperature: attempt ? 0.2 : 0.4 });
    model = r.model;
    truncated = r.finishReason === 'MAX_TOKENS';
    const parsed = parseJson(r.text);
    if (parsed && arr(parsed.sections ?? parsed.chapters ?? parsed.parts).length) obj = parsed;
    else console.error(`[expose] attempt ${attempt + 1}: unusable JSON from ${r.model} (finishReason ${r.finishReason}): ${r.text.slice(0, 200)}`);
  }
  if (!obj) throw new AiError('The AI returned an unreadable answer. Please try again.');

  const expose = sanitizeExpose(obj, { maxSource, language });
  if (truncated) expose.verifyNotes.push(language === 'ar' ? 'تنبيه: قد يكون النص مقتطعاً لبلوغ حدّ الطول؛ راجع الخاتمة.' : 'Warning: the output hit the length limit and may be cut off; check the conclusion.');
  return { expose, model, truncated };
}

/* ---------- 3) request explanation ---------- */
function mockExplain({ request, language }) {
  const ar = language === 'ar';
  const topic = request.slice(0, 80);
  return {
    summary: ar ? `وضع تجريبي: شرح مبسّط للطلب «${topic}».` : `Demo mode: a placeholder explanation of "${topic}".`,
    requestType: ar ? 'غير محدد (وضع تجريبي)' : 'Unspecified (demo mode)',
    explanation: [ar ? 'أضف GEMINI_API_KEY (وفعّل مفتاح البحث) للحصول على شرح حقيقي مبني على مصادر محدّثة.' : 'Add GEMINI_API_KEY (and a search key) to get a real, source-based explanation.'],
    keyConcepts: [],
    breakdown: [{ title: ar ? 'الخطوة 1' : 'Step 1', detail: ar ? 'محتوى تجريبي.' : 'Placeholder content.' }],
    legalBasis: [],
    suggestedOutline: [],
    verifyNotes: [ar ? 'وضع تجريبي.' : 'Demo mode.'],
  };
}

export async function explainRequest({ request, category, language, sources }) {
  const maxSource = sources.length;
  if (!hasAiKey()) return { explanation: sanitizeExplain(mockExplain({ request, language }), { maxSource, language }), model: 'demo (no GEMINI_API_KEY)', truncated: false };

  const system = `You are a legal research assistant who explains and breaks down a law student's request or assignment requirement. Today is ${today()}.
Reply in ${LANG_NAMES[language] || LANG_NAMES.ar}. Ground everything in the retrieved SOURCES below.

${SOURCE_RULES}

WHAT TO PRODUCE
- summary: 2-3 sentences saying in plain words what is being asked.
- requestType: the kind of task (definition, comparison, legal analysis, case commentary, historical overview, etc.).
- explanation: 3-6 paragraphs giving a comprehensive, accurate explanation of the subject of the request, with [n] citations.
- keyConcepts: the legal terms/concepts the answer must use, each defined.
- breakdown: the parts or steps the request demands, in the order a student should handle them.
- legalBasis: laws, articles, treaties, rulings that appear in the SOURCES (with [n]). Leave empty if the sources do not contain any.
- suggestedOutline: a possible plan for an exposé answering the request.
- verifyNotes: what the student must double-check, and where the sources were insufficient.

Return ONLY valid JSON of this shape:
{"summary":"","requestType":"","explanation":[""],"keyConcepts":[{"term":"","definition":""}],"breakdown":[{"title":"","detail":""}],"legalBasis":[{"reference":"","detail":""}],"suggestedOutline":[""],"verifyNotes":[""]}`;

  const user = `Field: ${category}\nStudent's request:\n${request}\n\nSOURCES:\n${sourceBlock(sources)}`;

  let obj = null;
  let truncated = false;
  let model;
  for (let attempt = 0; attempt < 2 && !obj; attempt++) {
    const r = await callGemini({ system, user: attempt ? `${user}\n\nIMPORTANT: your previous answer was not valid JSON. Return ONLY the JSON object.` : user, maxOutputTokens: 16000, temperature: attempt ? 0.2 : 0.3 });
    model = r.model;
    truncated = r.finishReason === 'MAX_TOKENS';
    const parsed = parseJson(r.text);
    if (parsed && (parsed.summary || parsed.explanation)) obj = parsed;
    else console.error(`[explain] attempt ${attempt + 1}: unusable JSON from ${r.model}: ${r.text.slice(0, 200)}`);
  }
  if (!obj) throw new AiError('The AI returned an unreadable answer. Please try again.');
  return { explanation: sanitizeExplain(obj, { maxSource, language }), model, truncated };
}

/* ---------- health check used by /api/system?verify=1 ---------- */
export async function verifyAi() {
  if (!hasAiKey()) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  try {
    const available = await listGeminiModels();
    const chain = modelChain();
    const usable = chain.filter((m) => available.includes(m));
    return {
      ok: usable.length > 0,
      usable,
      notAvailable: chain.filter((m) => !available.includes(m)),
      suggestions: available.filter((m) => /flash/i.test(m) && !/lite|image|live|tts|audio|embedding/i.test(m)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).slice(0, 8),
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
