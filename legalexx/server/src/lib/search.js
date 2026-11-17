import { classify, TRUST_RANK } from './classifier.js';

async function callSerper(q, country) {
  // تحديد إعدادات البحث لجوجل سيربر
  const bodyData = { 
    q, 
    num: 20, 
    hl: 'ar' // فرض اللغة العربية لضمان نتائج نظيفة ومرتبطة
  };

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 
      'X-API-KEY': process.env.SERPER_API_KEY, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(bodyData),
  });
  
  if (!res.ok) throw new Error(`Serper error ${res.status}`);
  const data = await res.json();
  
  return (data.organic || []).map((r) => ({ 
    title: r.title, 
    url: r.link, 
    snippet: r.snippet || '' 
  }));
}

// دالة احتياطية في حال لم يتم ضبط المفتاح
const MOCK = [
  { title: '[DEMO] الجريدة الرسمية للجمهورية الجزائرية', url: 'https://www.joradp.dz', snippet: 'بوابة القوانين والمراسيم التنفيذية الرسمية في الجزائر.' },
  { title: '[DEMO] منصة المجلات العلمية الجزائرية ASJP', url: 'https://www.asjp.cerist.dz', snippet: 'أبحاث ومقالات أكاديمية محكمة.' },
];

function enrich(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it?.url || seen.has(it.url)) continue;
    
    // فلترة تنقية لمنع أي روابط مشبوهة أو غير مفيدة
    const lowerSnippet = (it.snippet || '').toLowerCase();
    if (lowerSnippet.includes('tuhh.opus.id') || lowerSnippet.includes('dc.subject')) {
      continue;
    }

    const c = classify(it.url);
    if (!c) continue;
    seen.add(it.url);
    out.push({ title: (it.title || it.url).trim(), snippet: (it.snippet || '').trim(), url: it.url, ...c });
  }
  return out.map((r, i) => [r, i]).sort((a, b) => TRUST_RANK[a[0].trust] - TRUST_RANK[b[0].trust] || a[1] - b[1]).map(([r]) => r);
}

/** Open-web search using Google Serper API */
export async function searchWeb(query, options = {}) {
  let finalQuery = query;

  // إذا تم تفعيل وضع الكتب والمراجع الأكاديمية
  if (options.booksOnly) {
    finalQuery = `${query} (filetype:pdf OR كتاب OR مرجع OR مطبوعة)`;
  }

  // تعديل ذكي لفلترة الجزائر: لا نجبرها بصيغة site الصارمة التي تقتل النتائج، بل نضيف الكلمات المفتاحية والدولة بلطف
  if (options.country === 'dz') {
    finalQuery = `${finalQuery} الجزائر (site:.dz OR asjp.cerist.dz OR joradp.dz OR university)`;
  } else if (options.country === 'fr') {
    finalQuery += ` site:.fr`;
  }

  if (!process.env.SERPER_API_KEY) {
    return { results: enrich(MOCK), mock: true, providerError: 'SERPER_API_KEY is missing' };
  }

  try {
    const rawResults = await callSerper(finalQuery, options.country);
    return { results: enrich(rawResults), mock: false, providerError: null };
  } catch (e) {
    return { results: [], mock: false, providerError: e.message || 'Search failed' };
  }
}
