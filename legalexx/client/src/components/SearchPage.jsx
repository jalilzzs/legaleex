import React, { useState } from 'react';
import { searchSources } from '../api.js';
import SourceCard from './SourceCard.jsx';

const GROUPS = [
  ['all', 'groupAll'],
  ['official', 'groupOfficial'],
  ['academic', 'groupAcademic'],
  ['international', 'groupInternational'],
  ['other', 'groupOther'],
];

const COUNTRIES = [
  { code: 'global', label: 'عالمي / Global' },
  { code: 'dz', label: 'الجزائر (DZ)' },
  { code: 'fr', label: 'فرنسا (FR)' },
];

const FRESHNESS = [
  ['any', 'freshAny'],
  ['year', 'freshYear'],
  ['month', 'freshMonth'],
];

export default function SearchPage({ t, lang, basket, onToggle }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('global');
  const [freshness, setFreshness] = useState('any');
  const [booksOnly, setBooksOnly] = useState(false);
  const [group, setGroup] = useState('all');
  const [state, setState] = useState({ loading: false, error: '', data: null });

  // Manual custom/pinned source addition
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setState({ loading: true, error: '', data: null });
    setGroup('all');
    try {
      // The server builds the real queries (geo-targeting, .dz/.fr variants, PDF/book variants, freshness).
      // Nothing is glued onto the text here any more: that is what made results poor or empty.
      const data = await searchSources({ q: q.trim(), country, booksOnly, freshness });
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  function handleAddCustomSource(e) {
    e.preventDefault();
    if (!customUrl.trim()) return;
    const newSource = {
      url: customUrl.trim(),
      title: customTitle.trim() || customUrl.trim(),
      snippet: 'كتاب أو مصدر مضاف يدوياً / Custom user-added book or source',
      trust: 'high',
      sourceName: 'مكتبتي الخاصة',
      sourceNameAr: 'مكتبتي الخاصة',
      sourceTypeLabel: { ar: 'كتاب / مرجع', en: 'Book / Source' },
      group: 'academic',
    };
    if (!basket.some((b) => b.url === newSource.url)) onToggle(newSource);
    setCustomUrl('');
    setCustomTitle('');
  }

  const d = state.data;
  const all = d?.results || [];
  const shown = group === 'all' ? all : all.filter((r) => r.group === group);
  const count = (g) => (g === 'all' ? all.length : all.filter((r) => r.group === g).length);

  return (
    <div>
      <section className="mb-10 overflow-hidden rounded-3xl bg-ink-900 px-8 py-12 text-center shadow-soft">
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{t.heroTitle}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-200">{t.heroSub}</p>

        <form onSubmit={submit} className="mx-auto mt-8 flex max-w-2xl flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="input !rounded-2xl !py-3.5 border-ink-700 bg-ink-800 text-sm text-white sm:w-40">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} className="input flex-1 !rounded-2xl !py-3.5 text-base" />
            <button className="btn-gold !rounded-2xl px-7" disabled={state.loading}>
              {state.loading ? t.searching : t.searchBtn}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-1">
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-gold-400">
              <input type="checkbox" checked={booksOnly} onChange={(e) => setBooksOnly(e.target.checked)} className="h-4 w-4 rounded accent-[#b8892f]" />
              {t.booksMode}
            </label>
            <select value={freshness} onChange={(e) => setFreshness(e.target.value)} className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-white outline-none">
              {FRESHNESS.map(([v, key]) => (
                <option key={v} value={v}>{t[key]}</option>
              ))}
            </select>
          </div>
        </form>

        <details className="mx-auto mt-5 max-w-2xl rounded-2xl border border-ink-700/50 bg-ink-800/60 p-4 text-start">
          <summary className="cursor-pointer select-none text-xs font-medium text-gold-400">{t.addPinnedBook}</summary>
          <form onSubmit={handleAddCustomSource} className="mt-3 flex flex-col gap-2.5">
            <input type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="عنوان الكتاب أو المرجع" className="input !rounded-xl border-ink-700 bg-ink-900 !py-2.5 text-xs text-white" />
            <div className="flex gap-2">
              <input type="url" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://..." className="input flex-1 !rounded-xl border-ink-700 bg-ink-900 !py-2.5 text-xs text-white" required />
              <button type="submit" className="btn-gold !rounded-xl px-4 py-2 text-xs">+</button>
            </div>
          </form>
        </details>
      </section>

      {state.error && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p>}

      {d && (
        <>
          {d.mock && <p className="mb-6 rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoSearch}</p>}
          {d.providerError && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{d.providerError}</p>}

          {/* Transparency: which engine produced this list and what was filtered */}
          <p className="mb-4 text-xs text-ink-400">
            {t.sysSearch}: <b className="text-ink-600">{d.engine?.label}</b>
            {d.stats && <> · {d.stats.kept}/{d.stats.raw}</>}
            {d.stats?.filtered > 0 && <> · {t.sysFiltered}: {d.stats.filtered}</>}
            {d.tookMs != null && <> · {d.tookMs} ms</>}
          </p>

          <div className="mb-6 flex flex-wrap gap-2">
            {GROUPS.map(([g, key]) => (
              <button key={g} onClick={() => setGroup(g)} className={`chip ${group === g ? 'chip-on' : ''}`}>
                {t[key] || g} ({count(g)})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-center text-ink-400">{t.noResults}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((s) => (
                <SourceCard key={s.url} s={s} t={t} lang={lang} inBasket={basket.some((b) => b.url === s.url)} onToggle={onToggle} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
