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

export default function SearchPage({ t, lang, basket, onToggle }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [state, setState] = useState({ loading: false, error: '', data: null });

  async function submit(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setState({ loading: true, error: '', data: null });
    try {
      setState({ loading: false, error: '', data: await searchSources(q.trim()) });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  const all = state.data?.results || [];
  const shown = group === 'all' ? all : all.filter((r) => r.group === group);
  const count = (g) => (g === 'all' ? all.length : all.filter((r) => r.group === g).length);

  return (
    <div>
      <section className="mb-10 overflow-hidden rounded-3xl bg-ink-900 px-8 py-12 text-center shadow-soft">
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{t.heroTitle}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-200">{t.heroSub}</p>

        <form onSubmit={submit} className="mx-auto mt-8 flex max-w-2xl gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} className="input !rounded-2xl !py-3.5 text-base" />
          <button className="btn-gold !rounded-2xl px-7" disabled={state.loading}>{state.loading ? t.searching : t.searchBtn}</button>
        </form>
      </section>

      {state.error && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p>}

      {state.data && (
        <>
          {state.data.mock && <p className="mb-6 rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoSearch}</p>}
          {state.data.providerError && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.data.providerError}</p>}

          <div className="mb-6 flex flex-wrap gap-2">
            {GROUPS.map(([g, key]) => (
              <button key={g} onClick={() => setGroup(g)} className={`chip ${group === g ? 'chip-on' : ''}`}>
                {t[key]} ({count(g)})
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
