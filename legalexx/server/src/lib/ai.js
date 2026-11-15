import Anthropic from '@anthropic-ai/sdk';

let client;
const getClient = () => (client ??= new Anthropic());

export const hasAiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

const LANG_NAMES = { ar: 'Modern Standard Arabic (فصحى أكاديمية)', fr: 'academic French', en: 'academic English' };

const exposeTool = {
  name: 'submit_expose',
  description: 'Submit the finished academic exposé.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Formal exposé title' },
      introduction: { type: 'string', description: 'Introduction incl. problématique and plan announcement' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            paragraphs: { type: 'array', items: { type: 'string' } },
            subsections: {
              type: 'array',
              items: {
                type: 'object',
                properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } },
                required: ['heading', 'paragraphs'],
              },
            },
          },
          required: ['heading', 'paragraphs'],
        },
      },
      conclusion: { type: 'string' },
      verifyNotes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific claims (article numbers, dates, figures) the student must double-check against the cited source.',
      },
    },
    required: ['title', 'introduction', 'sections', 'conclusion', 'verifyNotes'],
  },
};

/** Placeholder exposé used when ANTHROPIC_API_KEY is not set (local testing). */
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
          ? `هذا نص تجريبي (وضع العرض التوضيحي) للمحور ${i + 1} حول: ${topic}.${cite} عند ضبط مفتاح ANTHROPIC_API_KEY سيتم توليد محتوى أكاديمي حقيقي بمصطلحات قانونية دقيقة.`
          : `Demo placeholder text for section ${i + 1} on: ${topic}.${cite} Set ANTHROPIC_API_KEY to generate real academic content.`,
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

  const system = `You are a senior legal academic assistant helping a law student write a formal university exposé (عرض).
Write in ${LANG_NAMES[language] || LANG_NAMES.ar}, using correct, precise legal terminology and a formal academic register.

Hard rules:
- Ground factual and legal claims in the numbered SOURCES provided. Cite them inline as [n], matching the source numbers exactly.
- Prefer sources with trust "high" (official, academic, international). Use "medium"/"unknown" sources only for context and flag them in "verifyNotes". Never rely on a source for a legal provision unless it is high trust.
- NEVER invent sources, URLs, article numbers, case numbers, dates, statistics or quotations. If a specific detail is not supported by a provided source and you are not fully certain, state it in general terms and add it to "verifyNotes".
- Never cite a number that does not appear in the SOURCES list.
- Where sources are thin, say so in "verifyNotes" instead of padding with unsupported detail.
- Structure: introduction (with problématique and announced plan), the requested sections, conclusion.
- Target length: about ${words} words in total.`;

  const user = `Field: ${category}
Topic / what to cover: ${description}
Number of main sections: ${sectionCount}
Requested subheadings (use or adapt): ${subheadings.length ? subheadings.join(' | ') : 'none — choose appropriate ones'}

SOURCES:
${sourceBlock}

Write the exposé and submit it with the submit_expose tool.`;

  const res = await getClient().messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    max_tokens: 8000,
    system,
    tools: [exposeTool],
    tool_choice: { type: 'tool', name: 'submit_expose' },
    messages: [{ role: 'user', content: user }],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('The AI did not return a structured exposé.');
  return block.input;
}
