// Smart source classifier: evaluates any URL on the fly and returns an
// organisation tag, a type, a trust level and a short reason.
// It is a heuristic aid, NOT a guarantee: students must still verify sources.

export const TYPES = {
  official_gazette: { en: 'Official Gazette', ar: 'جريدة رسمية', trust: 'high', group: 'official' },
  government: { en: 'Government / Official', ar: 'جهة حكومية رسمية', trust: 'high', group: 'official' },
  parliament: { en: 'Parliament', ar: 'برلمان', trust: 'high', group: 'official' },
  court: { en: 'Court', ar: 'محكمة', trust: 'high', group: 'official' },
  academic: { en: 'Academic / University', ar: 'أكاديمي / جامعي', trust: 'high', group: 'academic' },
  international_org: { en: 'International Body', ar: 'هيئة دولية', trust: 'high', group: 'international' },
  library: { en: 'Library / Archive', ar: 'مكتبة / أرشيف', trust: 'high', group: 'international' },
  media: { en: 'News Media', ar: 'وسائل إعلام', trust: 'medium', group: 'other' },
  community: { en: 'Community / Unverified', ar: 'محتوى مجتمعي غير موثّق', trust: 'low', group: 'other' },
  general: { en: 'Unclassified Website', ar: 'موقع غير مصنّف', trust: 'unknown', group: 'other' },
};

export const TRUST_RANK = { high: 0, medium: 1, unknown: 2, low: 3 };

// [domain, type, English name, Arabic name]
const KNOWN = [
  // Algeria
  ['joradp.dz', 'official_gazette', 'Official Journal of the Algerian Republic (JORADP)', 'الجريدة الرسمية للجمهورية الجزائرية'],
  ['mjustice.dz', 'government', 'Algerian Ministry of Justice', 'وزارة العدل الجزائرية'],
  ['mesrs.dz', 'government', 'Algerian Ministry of Higher Education', 'وزارة التعليم العالي والبحث العلمي'],
  ['cour-constitutionnelle.dz', 'court', 'Algerian Constitutional Court', 'المحكمة الدستورية الجزائرية'],
  ['conseil-constitutionnel.dz', 'court', 'Algerian Constitutional Council', 'المجلس الدستوري الجزائري'],
  ['apn.dz', 'parliament', "People's National Assembly (APN)", 'المجلس الشعبي الوطني'],
  ['majliselouma.dz', 'parliament', 'Council of the Nation', 'مجلس الأمة'],
  ['el-mouradia.dz', 'government', 'Presidency of the Algerian Republic', 'رئاسة الجمهورية الجزائرية'],
  ['asjp.cerist.dz', 'academic', 'Algerian Scientific Journal Platform (ASJP)', 'المنصة الجزائرية للمجلات العلمية'],
  // International bodies & libraries
  ['un.org', 'international_org', 'United Nations', 'الأمم المتحدة'],
  ['ohchr.org', 'international_org', 'UN Human Rights Office (OHCHR)', 'مفوضية الأمم المتحدة لحقوق الإنسان'],
  ['unodc.org', 'international_org', 'UN Office on Drugs and Crime', 'مكتب الأمم المتحدة المعني بالمخدرات والجريمة'],
  ['unesco.org', 'international_org', 'UNESCO', 'اليونسكو'],
  ['ilo.org', 'international_org', 'International Labour Organization', 'منظمة العمل الدولية'],
  ['icj-cij.org', 'court', 'International Court of Justice', 'محكمة العدل الدولية'],
  ['icc-cpi.int', 'court', 'International Criminal Court', 'المحكمة الجنائية الدولية'],
  ['worldbank.org', 'international_org', 'World Bank', 'البنك الدولي'],
  ['imf.org', 'international_org', 'International Monetary Fund', 'صندوق النقد الدولي'],
  ['oecd.org', 'international_org', 'OECD', 'منظمة التعاون والتنمية الاقتصادية'],
  ['wto.org', 'international_org', 'World Trade Organization', 'منظمة التجارة العالمية'],
  ['wipo.int', 'international_org', 'World Intellectual Property Organization', 'المنظمة العالمية للملكية الفكرية'],
  ['coe.int', 'international_org', 'Council of Europe', 'مجلس أوروبا'],
  ['europa.eu', 'international_org', 'European Union', 'الاتحاد الأوروبي'],
  ['au.int', 'international_org', 'African Union', 'الاتحاد الأفريقي'],
  ['lasportal.org', 'international_org', 'League of Arab States', 'جامعة الدول العربية'],
  ['loc.gov', 'library', 'Library of Congress', 'مكتبة الكونغرس'],
  ['constituteproject.org', 'academic', 'Constitute Project', 'مشروع الدساتير المقارنة'],
  ['legifrance.gouv.fr', 'official_gazette', 'Légifrance (French official law)', 'الموقع الرسمي للقانون الفرنسي'],
  ['legislation.gov.uk', 'official_gazette', 'UK Legislation (National Archives)', 'التشريعات الرسمية للمملكة المتحدة'],
  // Academic publishers & repositories
  ['jstor.org', 'academic', 'JSTOR', 'JSTOR'],
  ['ssrn.com', 'academic', 'SSRN', 'SSRN'],
  ['hal.science', 'academic', 'HAL Open Science', 'HAL'],
  ['cairn.info', 'academic', 'Cairn.info', 'Cairn.info'],
  ['persee.fr', 'academic', 'Persée', 'Persée'],
  ['openedition.org', 'academic', 'OpenEdition', 'OpenEdition'],
  ['sciencedirect.com', 'academic', 'ScienceDirect', 'ScienceDirect'],
  ['springer.com', 'academic', 'Springer', 'Springer'],
  ['tandfonline.com', 'academic', 'Taylor & Francis Online', 'Taylor & Francis'],
  ['cambridge.org', 'academic', 'Cambridge University Press', 'مطبعة جامعة كامبريدج'],
  ['oup.com', 'academic', 'Oxford University Press', 'مطبعة جامعة أكسفورد'],
  ['arxiv.org', 'academic', 'arXiv', 'arXiv'],
  ['semanticscholar.org', 'academic', 'Semantic Scholar', 'Semantic Scholar'],
  ['researchgate.net', 'academic', 'ResearchGate', 'ResearchGate'],
  // Media
  ['reuters.com', 'media', 'Reuters', 'رويترز'],
  ['apnews.com', 'media', 'Associated Press', 'أسوشيتد برس'],
  ['bbc.com', 'media', 'BBC', 'بي بي سي'],
  ['bbc.co.uk', 'media', 'BBC', 'بي بي سي'],
  ['aljazeera.com', 'media', 'Al Jazeera', 'الجزيرة'],
  ['aljazeera.net', 'media', 'Al Jazeera', 'الجزيرة'],
  ['lemonde.fr', 'media', 'Le Monde', 'لوموند'],
  ['theguardian.com', 'media', 'The Guardian', 'ذا غارديان'],
  ['nytimes.com', 'media', 'The New York Times', 'نيويورك تايمز'],
  ['aps.dz', 'media', 'Algeria Press Service (APS)', 'وكالة الأنباء الجزائرية'],
  // Community / user-generated (low trust)
  ['wikipedia.org', 'community', 'Wikipedia', 'ويكيبيديا'],
  ['wikihow.com', 'community', 'wikiHow', 'wikiHow'],
  ['reddit.com', 'community', 'Reddit', 'Reddit'],
  ['quora.com', 'community', 'Quora', 'Quora'],
  ['facebook.com', 'community', 'Facebook', 'Facebook'],
  ['x.com', 'community', 'X (Twitter)', 'X'],
  ['twitter.com', 'community', 'X (Twitter)', 'X'],
  ['youtube.com', 'community', 'YouTube', 'YouTube'],
  ['tiktok.com', 'community', 'TikTok', 'TikTok'],
  ['linkedin.com', 'community', 'LinkedIn', 'LinkedIn'],
  ['pinterest.com', 'community', 'Pinterest', 'Pinterest'],
  ['scribd.com', 'community', 'Scribd', 'Scribd'],
  ['medium.com', 'community', 'Medium', 'Medium'],
  ['blogspot.com', 'community', 'Blogspot blog', 'مدونة'],
  ['wordpress.com', 'community', 'WordPress blog', 'مدونة'],
];

const on = (host, domain) => host === domain || host.endsWith('.' + domain);

export function parseHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}
export const isHttpUrl = (url) => parseHttpUrl(url) !== null;

function heuristic(host) {
  const h = '.' + host;
  if (/\.gov(\.[a-z]{2,3})?$/.test(h) || /\.gouv\.[a-z]{2,3}$/.test(h) || /\.gob\.[a-z]{2,3}$/.test(h) || /\.go\.[a-z]{2}$/.test(h))
    return { type: 'government', reason: 'Government domain (.gov / .gouv)' };
  if (/\.edu(\.[a-z]{2,3})?$/.test(h) || /\.ac\.[a-z]{2,3}$/.test(h) || /(^|\.)univ-[a-z0-9-]+\.dz$/.test(host))
    return { type: 'academic', reason: 'University / academic domain' };
  if (/\.int$/.test(h)) return { type: 'international_org', reason: 'Intergovernmental (.int) domain' };
  return null;
}

/** Classify a URL. Returns null for non-http(s) URLs. */
export function classify(url) {
  const u = parseHttpUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  let type, name, nameAr, reason;
  const known = KNOWN.find(([d]) => on(host, d));
  if (known) {
    [, type, name, nameAr] = known;
    reason = 'Recognised organisation';
  } else {
    const h = heuristic(host);
    if (h) {
      type = h.type;
      reason = h.reason;
    } else {
      type = 'general';
      reason = 'Unrecognised site — verify its authority manually';
    }
    name = nameAr = host;
  }

  const meta = TYPES[type];
  return {
    domain: host,
    sourceName: name,
    sourceNameAr: nameAr,
    sourceType: type,
    sourceTypeLabel: { en: meta.en, ar: meta.ar },
    trust: meta.trust,
    group: meta.group,
    reason,
  };
}
