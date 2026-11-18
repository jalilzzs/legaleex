import React, { useEffect, useState } from 'react';
import { generateExpose, downloadPdf } from '../api.js';
import { CATEGORY_IDS } from '../i18n.js';
import { MetaCard } from './shared.jsx';

const toText = (arr = []) => arr.join('\n\n');
const toParas = (s = '') => s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

const toEditable = (e) => ({
  title: e.title,
  introduction: e.introduction,
  conclusion: e.conclusion,
  sections: e.sections.map((s) => ({
    heading: s.heading,
    text: toText(s.paragraphs),
    subsections: (s.subsections || []).map((x) => ({ heading: x.heading, text: toText(x.paragraphs) })),
  })),
});

const fromEditable = (e) => ({
  title: e.title,
  introduction: e.introduction,
  conclusion: e.conclusion,
  sections: e.sections.map((s) => ({
    heading: s.heading,
    paragraphs: toParas(s.text),
    subsections: s.subsections.map((x) => ({ heading: x.heading, paragraphs: toParas(x.text) })),
  })),
});

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export default function ExposePage({ t, lang, basket, onToggle, prefill }) {
  const [form, setForm] = useState({
    category: 'constitutional', description: '', sectionCount: 3, pages: 6, subheadings: '', language: 'ar',
    preparedBy: '', supervisedBy: '', university: '', faculty: '', academicYear: '',
  });
  const [phase, setPhase] = useState('form'); // form | loading | review
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [sources, setSources] = useState([]);
  const [cited, setCited] = useState([]);
  const [notes, setNotes] = useState([]);
  const [keep, setKeep] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [demo, setDemo] = useState({ ai: false, search: false, providerError: null });
  const [meta, setMeta] = useState(null); // which AI model + search engine produced this draft

  // Coming from the Explain page: start the form with its request and suggested outline.
  useEffect(() => {
    if (!prefill) return;
    setPhase('form');
    setForm((f) => ({
      ...f,
      description: prefill.description,
      subheadings: (prefill.subheadings || []).join('\n'),
      category: prefill.category || f.category,
      sectionCount: Math.min(8, Math.max(1, (prefill.subheadings || []).length || f.sectionCount)),
    }));
  }, [prefill]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function generate(e) {
    e.preventDefault();
    setError('');
    setPhase('loading');
    try {
      const out = await generateExpose({
        category: form.category,
        description: form.description,
        sectionCount: +form.sectionCount,
        pages: +form.pages,
        language: form.language,
        subheadings: form.subheadings.split('\n').map((s) => s.trim()).filter(Boolean),
        pinnedSources: basket,
      });
      setDraft(toEditable(out.expose));
      setNotes(out.expose.verifyNotes || []);
      setSources(out.sources);
      setCited(out.citedNumbers);
      setDemo({ ai: out.demoAi, search: out.demoSearch, providerError: out.providerError });
      setMeta(out.meta);
      setKeep(new Set(out.sources.filter((s) => out.citedNumbers.includes(s.n)).map((s) => s.n)));
      setPhase('review');
    } catch (err) {
      setError(err.message);
      setPhase('form');
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      await downloadPdf(
        {
          expose: fromEditable(draft),
          sources: sources.filter((s) => keep.has(s.n)),
          language: form.language,
          category: form.category,
          meta: { preparedBy: form.preparedBy, supervisedBy: form.supervisedBy, university: form.university, faculty: form.faculty, academicYear: form.academicYear },
        },
        draft.title
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const upd = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updSection = (i, patch) => setDraft((d) => ({ ...d, sections: d.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const updSub = (i, j, patch) =>
    updSection(i, { subsections: draft.sections[i].subsections.map((x, k) => (k === j ? { ...x, ...patch } : x)) });

  /* ---------------- Review / editor ---------------- */
  if (phase === 'review' && draft) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">{t.review || 'مراجعة العرض'}</h2>
            <button onClick={() => setPhase('form')} className="btn-ghost !py-1.5 text-xs">← {t.back || 'رجوع'}</button>
          </div>
          {demo.ai && <p className="rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoAi}</p>}
          {demo.search && <p className="rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoSearch}</p>}
          {demo.providerError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{demo.providerError}</p>}

          <div className="card space-y-4 p-6">
            <Field label={t.heading || 'العنوان'}><input className="input !text-lg !font-bold" value={draft.title} onChange={(e) => upd({ title: e.target.value })} /></Field>
            <Field label={t.intro || 'المقدمة'}><textarea rows={6} className="input" value={draft.introduction} onChange={(e) => upd({ introduction: e.target.value })} /></Field>
          </div>

          {draft.sections.map((s, i) => (
            <div key={i} className="card space-y-4 p-6">
              <Field label={`${t.heading || 'المبحث'} ${i + 1}`}><input className="input !font-bold" value={s.heading} onChange={(e) => updSection(i, { heading: e.target.value })} /></Field>
              <Field label={t.sectionIntro || 'محتوى المبحث'}><textarea rows={8} className="input" value={s.text} onChange={(e) => updSection(i, { text: e.target.value })} /></Field>
              {s.subsections.map((x, j) => (
                <div key={j} className="space-y-3 rounded-xl bg-ink-50 p-4">
                  <input className="input !font-semibold" value={x.heading} onChange={(e) => updSub(i, j, { heading: e.target.value })} />
                  <textarea rows={6} className="input" value={x.text} onChange={(e) => updSub(i, j, { text: e.target.value })} />
                </div>
              ))}
            </div>
          ))}

          <div className="card p-6">
            <Field label={t.conclusion || 'الخاتمة'}><textarea rows={5} className="input" value={draft.conclusion} onChange={(e) => upd({ conclusion: e.target.value })} /></Field>
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <button onClick={exportPdf} disabled={exporting} className="btn-gold w-full !py-3.5 text-base">
            {exporting ? (t.downloading || 'جاري التحميل...') : `⬇ ${t.download || 'تحميل PDF'}`}
          </button>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <MetaCard t={t} meta={meta} />

          {notes.length > 0 && (
            <div className="rounded-2xl border border-gold-300 bg-gold-50 p-4">
              <h3 className="mb-2 text-sm font-bold text-gold-600">⚠ {t.verify || 'ملاحظات التحقق'}</h3>
              <ul className="list-disc space-y-1.5 ps-5 text-xs leading-relaxed text-ink-800">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold">{t.sourcesUsed || 'المصادر المستخدمة'}</h3>
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.n} className="flex gap-2.5 text-xs">
                  <input type="checkbox" className="mt-1 accent-[#b8892f]" checked={keep.has(s.n)}
                    onChange={() => setKeep((k) => { const n = new Set(k); n.has(s.n) ? n.delete(s.n) : n.add(s.n); return n; })} />
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">[{s.n}] {s.title}</div>
                    <div className="text-ink-400">{s.sourceName} · {cited.includes(s.n) ? (t.cited || 'مستشهد به') : (t.notCited || 'غير مستشهد به')}</div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate text-gold-600 hover:underline">{s.url}</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    );
  }

  /* ---------------- Form ---------------- */
  return (
    <form onSubmit={generate} className="mx-auto max-w-3xl space-y-6">
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <div className="card space-y-5 p-6">
        <div>
          <span className="label">{t.field || 'التخصص القانوني'}</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_IDS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, category: c }))} className={`chip ${form.category === c ? 'chip-on' : ''}`}>{t.cat[c]}</button>
            ))}
          </div>
        </div>

        <Field label={t.desc || 'وصف العرض / الموضوع'}>
          <textarea required minLength={10} rows={5} className="input" placeholder={t.descPh || 'اكتب وصفاً مفصلاً للموضوع أو السؤال القانوني...'} value={form.description} onChange={set('description')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.sections || 'عدد المباحث'}><input type="number" min={1} max={8} className="input" value={form.sectionCount} onChange={set('sectionCount')} /></Field>
          <Field label={t.pages || 'عدد الصفحات المستهدف'}><input type="number" min={2} max={30} className="input" value={form.pages} onChange={set('pages')} /></Field>
          <Field label={t.language || 'لغة العرض'}>
            <select className="input" value={form.language} onChange={set('language')}>
              <option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option>
            </select>
          </Field>
        </div>

        <Field label={t.subheadings || 'العناوين الفرعية (اختياري)'}>
          <textarea rows={3} className="input" placeholder={t.subheadingsPh || 'كل عنوان في سطر...'} value={form.subheadings} onChange={set('subheadings')} />
        </Field>

        {basket.length > 0 && (
          <div className="rounded-xl bg-gold-50 p-4 border border-gold-200">
            <div className="mb-2 text-xs font-bold text-gold-600">📚 المصادر المضافة المعتمدة (Pinned Sources): ({basket.length})</div>
            <ul className="space-y-1.5 text-xs">
              {basket.map((s) => (
                <li key={s.url} className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-lg">
                  <span className="truncate font-medium">{s.title}</span>
                  <button type="button" onClick={() => onToggle(s)} className="shrink-0 text-red-600 hover:underline font-bold px-2">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card space-y-4 p-6">
        <h3 className="text-sm font-bold">{t.coverData || 'بيانات صفحة الغلاف الأكاديمية'}</h3>
        <Field label={t.prepBy || 'إعداد الطالب / الطلبة'}><textarea rows={2} className="input" value={form.preparedBy} onChange={set('preparedBy')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.supBy || 'تحت إراف الأستاذ'}><input className="input" value={form.supervisedBy} onChange={set('supervisedBy')} /></Field>
          <Field label={t.year || 'السنة الجامعية'}><input className="input" placeholder="2026/2027" value={form.academicYear} onChange={set('academicYear')} /></Field>
          <Field label={t.uni || 'الجامعة'}><input className="input" value={form.university} onChange={set('university')} /></Field>
          <Field label={t.fac || 'الكلية / القسم'}><input className="input" value={form.faculty} onChange={set('faculty')} /></Field>
        </div>
      </div>

      <button className="btn-primary w-full !py-4 text-base" disabled={phase === 'loading'}>
        {phase === 'loading' ? (t.generating || 'جاري توليد العرض والأبحاث...') : `✦ ${t.generate || 'توليد العرض القانوني'}`}
      </button>
    </form>
  );
}
