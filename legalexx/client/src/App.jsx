import React, { useEffect, useState } from 'react';
import { T } from './i18n.js';
import SearchPage from './components/SearchPage.jsx';
import ExposePage from './components/ExposePage.jsx';

export default function App() {
  const [lang, setLang] = useState('ar');
  const [tab, setTab] = useState('search');
  const [basket, setBasket] = useState([]); // pinned sources
  const t = T[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const toggleSource = (s) =>
    setBasket((b) => (b.some((x) => x.url === s.url) ? b.filter((x) => x.url !== s.url) : [...b, s]));

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-50 via-white to-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-lg font-extrabold text-gold-400 shadow-soft">§</div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight text-ink-900">Legal<span className="text-gold-500">Exx</span></div>
              <div className="hidden text-[11px] text-ink-400 sm:block">{t.tagline}</div>
            </div>
          </div>

          <nav className="flex items-center gap-1 rounded-xl bg-ink-50 p-1">
            {[['search', t.navSearch], ['expose', t.navExpose]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === id ? 'bg-white text-ink-900 shadow' : 'text-ink-600 hover:text-ink-900'}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {basket.length > 0 && (
              <button onClick={() => setTab('expose')} className="rounded-full bg-gold-50 px-3 py-1 text-xs font-bold text-gold-600">
                {t.basket}: {basket.length}
              </button>
            )}
            <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="btn-ghost !px-3 !py-1.5 text-xs">
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        {tab === 'search' ? (
          <SearchPage t={t} lang={lang} basket={basket} onToggle={toggleSource} />
        ) : (
          <ExposePage t={t} lang={lang} basket={basket} onToggle={toggleSource} />
        )}
      </main>

      <footer className="pb-8 text-center text-xs text-ink-400">LegalExx · {t.disclaimer}</footer>
    </div>
  );
}
