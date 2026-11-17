import React from 'react';

const TRUST_STYLE = {
  high: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-sky-50 text-sky-700',
  unknown: 'bg-amber-50 text-amber-700',
  low: 'bg-red-50 text-red-700',
};

export default function SourceCard({ s, t, lang, inBasket, onToggle }) {
  const org = lang === 'ar' ? s.sourceNameAr || s.sourceName : s.sourceName;
  const typeLabel = s.sourceTypeLabel?.[lang === 'ar' ? 'ar' : 'en'] || (lang === 'ar' ? 'مورد' : 'Source');
  
  // Safe trust label fallback
  const trustKey = s.trust || 'unknown';
  const trustLabel = t.trust?.[trustKey] || (lang === 'ar' ? 'موثوقية غير متأكد منها' : 'Unknown trust');

  return (
    <article className="card p-5 transition hover:-translate-y-0.5">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className={`rounded-full px-2.5 py-1 ${TRUST_STYLE[trustKey] || TRUST_STYLE.unknown}`}>
          {trustKey === 'high' ? '✓ ' : ''}{trustLabel}
        </span>
        <span className="rounded-full bg-ink-900 px-2.5 py-1 text-white">{typeLabel}</span>
        <span className="rounded-full bg-ink-50 px-2.5 py-1 text-ink-600">{org}</span>
      </div>
      <h3 className="text-base font-bold leading-snug text-ink-900">{s.title}</h3>
      {s.snippet && <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.snippet}</p>}
      {trustKey === 'low' && <p className="mt-2 text-xs text-red-600">{t.lowWarn || 'تنبيه: هذا المصدر مجتمعي أو ضعيف الموثوقية.'}</p>}
      <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="mt-2 block truncate text-xs text-ink-400 underline decoration-dotted hover:text-gold-600">
        {s.url}
      </a>
      <div className="mt-4 flex gap-2">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 text-xs">{t.openSource || 'فتح'} ↗</a>
        <button onClick={() => onToggle(s)} className={`${inBasket ? 'btn-gold' : 'btn-primary'} !py-1.5 text-xs`}>
          {inBasket ? (t.added || 'مضاف للسلة ✓') : (t.addToExpose || '+ أضف للعرض')}
        </button>
      </div>
    </article>
  );
}
