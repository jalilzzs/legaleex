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

export default function SearchPage({ t, lang, basket, onToggle }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('global');
  const [group, setGroup] = useState('all');
  const [state, setState] = useState({ loading: false, error: '', data: null });

  // States for manual custom/pinned source addition
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setState({ loading: true, error: '', data: null });
    
    // Append country specifier or query modifiers if selected
    let queryToSearch = q.trim();
    if (country === 'dz') queryToSearch += ' site:.dz';
    if (country === 'fr') queryToSearch += ' site:.fr';

    try {
      setState({ loading: false, error: '', data: await searchSources(queryToSearch) });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  // Handle manual source injection to basket/pinned sources
  function handleAddCustomSource(e) {
    e.preventDefault();
    if (!customUrl.trim()) return;
    const newSource = {
      url: customUrl.trim(),
      title: customTitle.trim() || customUrl.trim(),
      snippet: 'مصدر مضاف يدوياً بواسطة المستخدم / Custom user-added source',
      trust: 'high',
      sourceName: 'مصدري الخاص',
      sourceNameAr: 'مصدري الخاص',
      sourceTypeLabel: { ar: 'مورد مخصص', en: 'Custom Source' },
      group: 'other'
    };

    // Check if it already exists to avoid duplicates
    if (!basket.some((b) => b.url === newSource.url)) {
      onToggle(newSource);
    }
    setCustomUrl('');
    setCustomTitle('');
  }

  const all = state.data?.results || [];
  const shown = group === 'all' ? all : all.filter((r) => r.group === group);
  const count = (g) => (g === 'all' ? all.length : all.filter((r) => r.group === g).length);

  return (
    <div>
      <section className="mb-10 overflow-hidden rounded-3xl bg-ink-900 px-8 py-12 text-center shadow-soft">
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{t.heroTitle}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-200">{t.heroSub}</p>

        {/* Search Form with Country Filter */}
        <form onSubmit={submit} className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <select 
            value={country} 
            onChange={(e) => setCountry(e.target.value)} 
            className="input !rounded-2xl !py-3.5 text-sm sm:w-48 bg-ink-800 text-white border-ink-700"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <input 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            placeholder={t.searchPlaceholder || "ابحث عن قانون، مرجع، أو كتاب..."} 
            className="input !rounded-2xl !py-3.5 text-base flex-1" 
          />
          <button className="btn-gold !rounded-2xl px-7" disabled={state.loading}>
            {state.loading ? (t.searching || 'جاري البحث...') : (t.searchBtn || 'بحث')}
          </button>
        </form>

        {/* Manual Source Addition Form */}
        <details className="mx-auto mt-6 max-w-2xl text-left bg-ink-800/60 p-4 rounded-2xl border border-ink-700/50">
          <summary className="cursor-pointer text-xs font-medium text-gold-400 select-none">
            + إضافة مصدر أو كتاب يدوياً (Pinned Source)
          </summary>
          <form onSubmit={handleAddCustomSource} className="mt-3 flex flex-col gap-2.5">
            <input 
              type="text" 
              value={customTitle} 
              onChange={(e) => setCustomTitle(e.target.value)} 
              placeholder="عنوان المصدر أو الكتاب (اختياري)" 
              className="input !rounded-xl !py-2.5 text-xs bg-ink-900 text-white border-ink-700" 
            />
            <div className="flex gap-2">
              <input 
                type="url" 
                value={customUrl} 
                onChange={(e) => setCustomUrl(e.target.value)} 
                placeholder="رابط المصدر (https://...)" 
                className="input !rounded-xl !py-2.5 text-xs bg-ink-900 text-white border-ink-700 flex-1" 
                required 
              />
              <button type="submit" className="btn-gold !rounded-xl px-4 text-xs py-2">
                إضافة للسلة
              </button>
            </div>
          </form>
        </details>
      </section>

      {state.error && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p>}

      {state.data && (
        <>
          {state.data.mock && <p className="mb-6 rounded-xl bg-gold-50 p-4 text-sm text-gold-600">{t.demoSearch}</p>}
          {state.data.providerError && <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.data.providerError}</p>}

          <div className="mb-6 flex flex-wrap gap-2">
            {GROUPS.map(([g, key]) => (
              <button key={g} onClick={() => setGroup(g)} className={`chip ${group === g ? 'chip-on' : ''}`}>
                {t[key] || g} ({count(g)})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-center text-ink-400">{t.noResults || 'لا توجد نتائج مطابقة.'}</p>
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
