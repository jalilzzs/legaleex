
export const hasAiKey = () => Boolean(process.env.GEMINI_API_KEY);

const LANG_NAMES = { ar: 'Modern Standard Arabic (فصحى أكاديمية)', fr: 'academic French', en: 'academic English' };

/** Placeholder exposé used when GEMINI_API_KEY is not set (local testing). */
function mockExpose({ description, sectionCount, subheadings, language, sources }) {
  const ar = language === 'ar';
  const cite = sources.length ? ` [${sources[0].n}]` : '';
  const topic = description.slice(0, 80);
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const h = subheadings[i] || (ar ? `المحور ${i + 1}: عنوان تجريبي` : `Section ${i + 1}: placeholder heading`);
    return {
      heading: h,
      paragraphs: [
        ar
          ? `هذا نص تجريبي (وضع العرض التوضيحي) للمحور ${i + 1} حول: ${topic}.${cite} عند ضبط مفتاح GEMINI_API_KEY سيتم توليد محتوى أكاديمي حقيقي بمصطلحات قانونية دقيقة.`
          : `Demo placeholder text for section ${i + 1} on: ${topic}.${cite} Set GEMINI_API_KEY to generate real academic content.`,
      ],
      subsections: [],
    };
  });
  return {
    title: ar ? `عرض حول: ${topic}` : `Exposé on: ${topic}`,
    introduction: ar
      ? `مقدمة تجريبية للعرض.${cite} هذا المحتوى لا يمثل بحثاً حقيقياً وإنما يُستخدم لاختبار الواجهة وتصدير ملف PDF.`
      : `Demo introduction.${cite} This is not real research; it only lets you test the interface and PDF export.`,
    sections,
    conclusion: ar ? 'خاتمة تجريبية. أضف مفتاح الذكاء الاصطناعي للحصول على محتوى حقيقي.' : 'Demo conclusion. Add the AI key for real content.',
    verifyNotes: [ar ? 'وضع تجريبي: النص أعلاه مجرد عنصر نائب وليس محتوى قانونياً.' : 'Demo mode: the text above is placeholder content, not legal analysis.'],
  };
}

export async function generateExpose(opts) {
  if (!hasAiKey()) return mockExpose(opts);

  const { category, description, sectionCount, pages, subheadings, language, sources } = opts;
  const words = Math.round(pages * 280);
  const sourceBlock = sources.length
    ? sources.map((s) => `[${s.n}] ${s.title} — ${s.sourceName} (${s.sourceTypeLabel.en}, trust: ${s.trust}) — ${s.url}\n    ${s.snippet}`).join('\n')
    : '(no sources were retrieved)';

  const systemPrompt = `You are a senior legal academic assistant helping a law student write a formal university exposé (عرض).
Write in ${LANG_NAMES[language] || LANG_NAMES.ar}, using correct, precise legal terminology and a formal academic register.

Hard rules:
- Ground factual and legal claims in the numbered SOURCES provided. Cite them inline as [n], matching the source numbers exactly.
- Prefer sources with trust "high" (official, academic, international). Use "medium"/"unknown" sources only for context and flag them in "verifyNotes". Never rely on a source for a legal provision unless it is high trust.
- NEVER invent sources, URLs, article numbers, case numbers, dates, statistics or quotations. If a specific detail is not supported by a provided source and you are not fully certain, state it in general terms and add it to "verifyNotes".
- Never cite a number that does not appear in the SOURCES list.
- Where sources are thin, say so in "verifyNotes" instead of padding with unsupported detail.
- Structure: introduction (with problématique and announced plan), the requested sections, conclusion.
- Target length: about ${words} words in total.

You MUST respond strictly in valid JSON format matching this structure:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "heading": "string",
      "paragraphs": ["string"],
      "subsections": [{"heading": "string", "paragraphs": ["string"]}]
    }
  ],
  "conclusion": "string",
  "verifyNotes": ["string"]
}`;

  const userPrompt = `Field: ${category}
Topic / what to cover: ${description}
Number of main sections: ${sectionCount}
Requested subheadings (use or adapt): ${subheadings.length ? subheadings.join(' | ') : 'none — choose appropriate ones'}

SOURCES:
${sourceBlock}

Write the exposé and return ONLY the valid JSON object. No markdown formatting blocks if possible, or just standard JSON.`;

  // Direct REST call (no SDK). Set GEMINI_MODEL in the host's variables to switch models.
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 8000 },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    console.error(`Gemini error ${res.status} (model ${model}): ${body}`);
    throw new Error(`Gemini error ${res.status}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('Gemini returned no JSON:', text.slice(0, 300));
    throw new Error('The AI did not return valid JSON.');
  }
  const out = JSON.parse(match[0]);
  if (!Array.isArray(out.sections)) throw new Error('The AI response had no sections.');
  out.verifyNotes ??= [];
  return out;
}
