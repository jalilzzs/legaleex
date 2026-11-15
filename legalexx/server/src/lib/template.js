// HTML templates for the PDF (cover + body). Supports ar (RTL), fr, en.

const LABELS = {
  ar: {
    republic: 'الجمهورية الجزائرية الديمقراطية الشعبية',
    ministry: 'وزارة التعليم العالي والبحث العلمي',
    preparedBy: 'من إعداد الطلبة',
    supervisedBy: 'تحت إشراف',
    plan: 'خطة البحث',
    intro: 'مقدمة',
    conclusion: 'خاتمة',
    references: 'قائمة المصادر والمراجع',
    accessed: 'تاريخ الاطلاع',
    year: 'السنة الجامعية',
    ordinals: ['أولا', 'ثانيا', 'ثالثا', 'رابعا', 'خامسا', 'سادسا', 'سابعا', 'ثامنا', 'تاسعا', 'عاشرا', 'حادي عشر', 'ثاني عشر'],
    categories: { political: 'القانون السياسي', economic: 'القانون الاقتصادي', historical: 'التاريخ القانوني', constitutional: 'القانون الدستوري', comparative: 'القانون المقارن', mixed: 'دراسة قانونية' },
    dir: 'rtl',
    font: "'Amiri', 'Cairo', 'Traditional Arabic', serif",
    head: "'Cairo', 'Amiri', sans-serif",
  },
  fr: {
    republic: 'République Algérienne Démocratique et Populaire',
    ministry: "Ministère de l'Enseignement Supérieur et de la Recherche Scientifique",
    preparedBy: 'Préparé par',
    supervisedBy: 'Sous la direction de',
    plan: 'Plan',
    intro: 'Introduction',
    conclusion: 'Conclusion',
    references: 'Références et sources',
    accessed: 'Consulté le',
    year: 'Année universitaire',
    ordinals: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
    categories: { political: 'Droit politique', economic: 'Droit économique', historical: 'Histoire du droit', constitutional: 'Droit constitutionnel', comparative: 'Droit comparé', mixed: 'Étude juridique' },
    dir: 'ltr',
    font: "'Libre Baskerville', 'Georgia', serif",
    head: "'Inter', sans-serif",
  },
  en: {
    republic: "People's Democratic Republic of Algeria",
    ministry: 'Ministry of Higher Education and Scientific Research',
    preparedBy: 'Prepared by',
    supervisedBy: 'Supervised by',
    plan: 'Outline',
    intro: 'Introduction',
    conclusion: 'Conclusion',
    references: 'References & Sources',
    accessed: 'Accessed',
    year: 'Academic year',
    ordinals: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
    categories: { political: 'Political Law', economic: 'Economic Law', historical: 'Legal History', constitutional: 'Constitutional Law', comparative: 'Comparative Law', mixed: 'Legal Study' },
    dir: 'ltr',
    font: "'Libre Baskerville', 'Georgia', serif",
    head: "'Inter', sans-serif",
  },
};

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Escape, then turn [n] markers into superscript citations. */
const rich = (s = '') => esc(s).replace(/\[(\d{1,3})\]/g, '<sup class="cite">[$1]</sup>');
const paras = (arr = []) => arr.map((p) => `<p>${rich(p)}</p>`).join('');

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700&family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet">';

const baseCss = (L) => `
  :root { --ink:#0b1f3a; --gold:#b8892f; --muted:#5b6678; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body { font-family:${L.font}; color:#1b2433; direction:${L.dir}; font-size:14pt; line-height:1.95; }
`;

export function academicYear(date = new Date()) {
  const y = date.getFullYear();
  return date.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

export function buildCoverHtml({ meta = {}, title, category, language }) {
  const L = LABELS[language] || LABELS.ar;
  const names = String(meta.preparedBy || '').split(/\n|،|;/).map((s) => s.trim()).filter(Boolean);
  const year = meta.academicYear || academicYear();
  return `<!doctype html><html lang="${language}" dir="${L.dir}"><head><meta charset="utf-8">${FONTS}
<style>
  @page { size: A4; margin: 0; }
  ${baseCss(L)}
  .page { width:210mm; height:297mm; padding:14mm; position:relative; }
  .frame { height:100%; border:2.2pt solid var(--ink); padding:3mm; }
  .frame-inner { height:100%; border:0.8pt solid var(--gold); padding:12mm 14mm; display:flex; flex-direction:column; align-items:center; text-align:center; }
  .republic { font-family:${L.head}; font-weight:700; font-size:13pt; color:var(--ink); line-height:1.6; }
  .ministry { font-family:${L.head}; font-size:11.5pt; color:var(--muted); margin-top:2mm; }
  .uni { margin-top:10mm; font-family:${L.head}; font-weight:700; font-size:15pt; color:var(--ink); }
  .fac { font-family:${L.head}; font-size:12.5pt; color:var(--muted); }
  .rule { width:60mm; height:2pt; background:var(--gold); margin:12mm auto 8mm; }
  .badge { font-family:${L.head}; font-size:11pt; letter-spacing:.05em; color:var(--gold); font-weight:700; border:1pt solid var(--gold); padding:1.5mm 7mm; border-radius:20mm; }
  .title { margin:10mm 0 0; font-family:${L.head}; font-weight:800; font-size:26pt; line-height:1.5; color:var(--ink); }
  .spacer { flex:1; }
  .meta { width:100%; display:flex; justify-content:space-between; gap:10mm; font-family:${L.head}; font-size:12pt; line-height:1.9; text-align:${L.dir === 'rtl' ? 'right' : 'left'}; }
  .meta h4 { margin:0 0 1mm; color:var(--gold); font-size:11pt; border-bottom:1pt solid #e4d6b4; padding-bottom:1mm; }
  .year { margin-top:10mm; font-family:${L.head}; font-size:12pt; color:var(--ink); font-weight:700; }
</style></head><body>
<div class="page"><div class="frame"><div class="frame-inner">
  <div class="republic">${esc(L.republic)}</div>
  <div class="ministry">${esc(L.ministry)}</div>
  ${meta.university ? `<div class="uni">${esc(meta.university)}</div>` : ''}
  ${meta.faculty ? `<div class="fac">${esc(meta.faculty)}</div>` : ''}
  <div class="rule"></div>
  <div class="badge">${esc(L.categories[category] || L.categories.mixed)}</div>
  <h1 class="title">${esc(title)}</h1>
  <div class="spacer"></div>
  <div class="meta">
    <div><h4>${esc(L.preparedBy)}</h4>${names.map((n) => `<div>${esc(n)}</div>`).join('') || '&nbsp;'}</div>
    ${meta.supervisedBy ? `<div><h4>${esc(L.supervisedBy)}</h4><div>${esc(meta.supervisedBy)}</div></div>` : ''}
  </div>
  <div class="year">${esc(L.year)}: ${esc(year)}</div>
</div></div></div></body></html>`;
}

export function buildBodyHtml({ expose, sources = [], language }) {
  const L = LABELS[language] || LABELS.ar;
  const today = new Date().toISOString().slice(0, 10);

  const planItems = expose.sections
    .map(
      (s, i) =>
        `<li><b>${esc(L.ordinals[i] || i + 1)}:</b> ${esc(s.heading)}${
          s.subsections?.length ? `<ul>${s.subsections.map((x, j) => `<li>${j + 1}- ${esc(x.heading)}</li>`).join('')}</ul>` : ''
        }</li>`
    )
    .join('');

  const sectionsHtml = expose.sections
    .map(
      (s, i) => `<section>
  <h2>${esc(L.ordinals[i] || i + 1)}: ${esc(s.heading)}</h2>
  ${paras(s.paragraphs)}
  ${(s.subsections || []).map((x, j) => `<h3>${j + 1}- ${esc(x.heading)}</h3>${paras(x.paragraphs)}`).join('')}
</section>`
    )
    .join('');

  const refs = [...sources]
    .sort((a, b) => a.n - b.n)
    .map(
      (s) => `<li value="${s.n}">
  <div class="rt">${esc(s.title)}</div>
  <div class="rs">${esc([s.sourceName, s.typeLabel].filter(Boolean).join(' · '))}</div>
  <div class="ru"><a href="${esc(s.url)}">${esc(s.url)}</a></div>
  <div class="ra">${esc(L.accessed)}: ${today}</div>
</li>`
    )
    .join('');

  return `<!doctype html><html lang="${language}" dir="${L.dir}"><head><meta charset="utf-8">${FONTS}
<style>
  ${baseCss(L)}
  h1.plan, h2, h3, .rt { font-family:${L.head}; color:var(--ink); }
  h1.plan, h2.ref { font-size:20pt; text-align:center; margin:0 0 8mm; padding-bottom:3mm; border-bottom:2.5pt solid var(--gold); }
  h2 { font-size:17pt; margin:9mm 0 4mm; padding-bottom:2mm; text-decoration:underline; text-decoration-color:var(--gold); text-decoration-thickness:2pt; text-underline-offset:6pt; page-break-after:avoid; }
  h3 { font-size:14.5pt; margin:6mm 0 2mm; page-break-after:avoid; }
  p { margin:0 0 4mm; text-align:justify; orphans:3; widows:3; }
  sup.cite { font-family:${L.head}; font-size:8pt; color:var(--gold); font-weight:700; }
  .pagebreak { page-break-before:always; }
  ul.plan, ul.plan ul { list-style:none; padding:0; margin:0; }
  ul.plan > li { font-size:14pt; margin-bottom:3mm; }
  ul.plan ul { padding-${L.dir === 'rtl' ? 'right' : 'left'}:10mm; font-size:12.5pt; color:var(--muted); }
  .intro-title { font-family:${L.head}; font-size:17pt; color:var(--ink); text-decoration:underline; text-decoration-color:var(--gold); text-decoration-thickness:2pt; text-underline-offset:6pt; margin:0 0 4mm; }
  ol.refs { padding:0; margin:0; list-style:none; }
  ol.refs li { margin-bottom:5mm; padding:3mm 4mm; border-${L.dir === 'rtl' ? 'right' : 'left'}:3pt solid var(--gold); background:#faf6ec; page-break-inside:avoid; font-size:11.5pt; line-height:1.6; }
  ol.refs li::before { content:"[" attr(value) "]"; font-family:${L.head}; font-weight:700; color:var(--gold); }
  .rt { font-weight:700; font-size:11.5pt; display:inline; }
  .rs { color:var(--muted); font-family:${L.head}; font-size:10.5pt; }
  .ru { direction:ltr; text-align:${L.dir === 'rtl' ? 'right' : 'left'}; font-family:'Inter',monospace; font-size:9.5pt; word-break:break-all; }
  .ru a { color:#1a4fa3; text-decoration:none; }
  .ra { color:var(--muted); font-size:9.5pt; font-family:${L.head}; }
</style></head><body>
<h1 class="plan">${esc(L.plan)}</h1>
<ul class="plan"><li><b>${esc(L.intro)}</b></li>${planItems}<li><b>${esc(L.conclusion)}</b></li></ul>

<div class="pagebreak"></div>
<div class="intro-title">${esc(L.intro)}</div>
${paras([expose.introduction])}
${sectionsHtml}
<h2>${esc(L.conclusion)}</h2>
${paras([expose.conclusion])}

<div class="pagebreak"></div>
<h2 class="ref">${esc(L.references)}</h2>
<ol class="refs">${refs}</ol>
</body></html>`;
}
