import React from 'react';

/** Renders text with [n] citation markers as small gold superscripts. */
export function Cited({ text }) {
  return String(text ?? '')
    .split(/(\[\d{1,3}\])/g)
    .map((part, i) =>
      /^\[\d{1,3}\]$/.test(part) ? (
        <sup key={i} className="mx-px text-[10px] font-bold text-gold-600">{part}</sup>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
}

/** System transparency: which AI model and which search engine produced this answer. */
export function MetaCard({ t, meta }) {
  if (!meta) return null;
  const demoAi = /^demo/i.test(meta.ai?.usedModel || '');
  return (
    <div className="card space-y-2 p-4 text-xs">
      <div className="flex items-start justify-between gap-3">
        <span className="text-ink-400">{t.sysAi}</span>
        <b className="text-end text-ink-800" dir="ltr">
          {meta.ai?.provider} · {meta.ai?.usedModel}
          {demoAi && ` (${t.sysDemo})`}
        </b>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="text-ink-400">{t.sysSearch}</span>
        <b className="text-end text-ink-800" dir="ltr">
          {meta.search?.label}
          {meta.mock && ` (${t.sysDemo})`}
        </b>
      </div>
      {meta.planner && (
        <div className="flex items-start justify-between gap-3">
          <span className="text-ink-400">{t.sysPlanner}</span>
          <span className="text-end text-ink-600" dir="ltr">{meta.planner}</span>
        </div>
      )}
      {meta.pages && (
        <div className="flex items-start justify-between gap-3">
          <span className="text-ink-400">{t.sysPages}</span>
          <span className="text-ink-600">{meta.pages.ok}/{meta.pages.attempted}</span>
        </div>
      )}
      {meta.queries?.length > 0 && (
        <details>
          <summary className="cursor-pointer text-ink-400">{t.sysQueries} ({meta.queries.length})</summary>
          <ul className="mt-1.5 list-disc space-y-1 ps-5 text-ink-600">
            {meta.queries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
