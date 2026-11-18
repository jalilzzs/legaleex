import React, { useState } from 'react';
import { explainRequest } from '../api.js';
import { CATEGORY_IDS } from '../i18n.js';
import { Cited, MetaCard } from './shared.jsx';

const TRUST_STYLE = {
  high: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-sky-50 text-sky-700',
  unknown: 'bg-amber-50 text-amber-700',
  low: 'bg-red-50 text-red-700',
};

function Section({ title, children }) {
  return (
    <section className="card p-6">
      <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-gold-600">{title}</h3>
      {children}
    </section>
  );
}

export default function ExplainPage({ t, lang, basket, onUseInExpose }) {
  const [form, setForm] = useState({ request: '', category: 'mixed', country: 'global', language: lang === 'ar' ? 'ar' : 'en' });
  const [phase, setPhase] = useState('form'); // form | loading | done
  const [error, setError] = useState('');
  const [out, setOut] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPhase('loading');
    try {
      setOut(await explainRequest({ ...form, pinnedSources: basket }));
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('form');
    }
  }

  const ex = out?.explanation;
  const docLang = lang === 'ar' ? 'ar' : 'en';

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-ink-900 px-8 py-10 text-center shadow-soft">
        <h1 className="text-3xl font-extrabold text-white">{t.explainTitle}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-200">{t.explainSub}</p>
      </section>

      <form onSubmit={submit} className="card mx-auto max-w-3xl space-y-5 p-6">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <div>
          <span className="label">{t.field}</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_IDS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, category: c }))} className={`chip ${form.category === c ? 'chip-on' : ''}`}>
                {t.cat[c]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="label">{t.desc}</span>
          <textarea required minLength={5} rows={5} className="input" placeholder={t.explainPh} value={form.request} onChange={set('request')} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t.focus}</span>
            <select className="input" value={form.country} onChange={set('country')}>
              <option value="global">{t.focusGlobal}</option>
              <option value="dz">{t.focusDz}</option>
              <option value="fr">{t.focusFr}</option>
            </select>
          </label>
          <label className="block">
            <span className="label">{t.answerLang}</span>
            <select className="input" value={form.language} onChange={set('language')}>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        {basket.length > 0 && <p className="text-xs text-gold-600">{t.pinned}: {basket.length}</p>}

        <button className="btn-primary w-full !py-3.5 text-base" disabled={phase === 'loading'}>
          {phase === 'loading' ? t.explaining : `✦ ${t.explainBtn}`}
        </button>
      </form>

      {phase === 'done' && ex && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            {out.demoAi && <p className="rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoAi}</p>}
            {out.demoSearch && <p className="rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoSearch}</p>}
            {out.providerError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{out.providerError}</p>}

            <Section title={t.exSummary}>
              <p className="leading-relaxed text-ink-800"><Cited text={ex.summary} /></p>
              {ex.requestType && (
                <p className="mt-3 text-xs text-ink-400">
                  {t.exType}: <b className="text-ink-700">{ex.requestType}</b>
                </p>
              )}
            </Section>

            {ex.explanation.length > 0 && (
              <Section title={t.exExplanation}>
                <div className="space-y-3 leading-relaxed text-ink-800">
                  {ex.explanation.map((p, i) => (
                    <p key={i}><Cited text={p} /></p>
                  ))}
                </div>
              </Section>
            )}

            {ex.keyConcepts.length > 0 && (
              <Section title={t.exConcepts}>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {ex.keyConcepts.map((c, i) => (
                    <div key={i} className="rounded-xl bg-ink-50 p-3">
                      <dt className="text-sm font-bold text-ink-900">{c.term}</dt>
                      <dd className="mt-1 text-xs leading-relaxed text-ink-600"><Cited text={c.definition} /></dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}

            {ex.breakdown.length > 0 && (
              <Section title={t.exBreakdown}>
                <ol className="space-y-3">
                  {ex.breakdown.map((b, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-gold-400">{i + 1}</span>
                      <div>
                        <div className="text-sm font-bold text-ink-900">{b.title}</div>
                        <p className="text-sm leading-relaxed text-ink-600"><Cited text={b.detail} /></p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {ex.legalBasis.length > 0 && (
              <Section title={t.exLegal}>
                <ul className="space-y-3">
                  {ex.legalBasis.map((b, i) => (
                    <li key={i} className="border-gold-400 ps-3 text-sm [border-inline-start-width:3px]">
                      <b className="text-ink-900">{b.reference}</b>
                      <p className="leading-relaxed text-ink-600"><Cited text={b.detail} /></p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {ex.suggestedOutline.length > 0 && (
              <Section title={t.exOutline}>
                <ol className="list-decimal space-y-1.5 ps-6 text-sm text-ink-800">
                  {ex.suggestedOutline.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="btn-gold mt-4 text-xs"
                  onClick={() => onUseInExpose({ description: form.request, subheadings: ex.suggestedOutline, category: form.category })}
                >
                  {t.exUse}
                </button>
              </Section>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <MetaCard t={t} meta={out.meta} />

            {ex.verifyNotes.length > 0 && (
              <div className="rounded-2xl border border-gold-300 bg-gold-50 p-4">
                <h3 className="mb-2 text-sm font-bold text-gold-600">⚠ {t.verify}</h3>
                <ul className="list-disc space-y-1.5 ps-5 text-xs leading-relaxed text-ink-800">
                  {ex.verifyNotes.map((n, i) => (
                    <li key={i}><Cited text={n} /></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold">{t.exSources}</h3>
              {out.sources.length === 0 && <p className="text-xs text-ink-400">{t.noResults}</p>}
              <ul className="space-y-3">
                {out.sources.map((s) => (
                  <li key={s.n} className="text-xs">
                    <div className="font-semibold leading-snug">
                      [{s.n}] {s.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TRUST_STYLE[s.trust] || TRUST_STYLE.unknown}`}>{t.trust[s.trust]}</span>
                      <span className="text-ink-400">{docLang === 'ar' ? s.sourceNameAr || s.sourceName : s.sourceName}</span>
                      {s.readPage && <span className="text-emerald-700">· {t.pagesRead} ✓</span>}
                      {!out.citedNumbers.includes(s.n) && <span className="text-ink-400">· {t.notCited}</span>}
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate text-gold-600 hover:underline">
                      {s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
