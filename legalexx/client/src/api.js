// Set VITE_API_URL at build time only if the API is hosted on a different origin.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Always expects JSON. An HTML answer means the API route is missing / the server is outdated
// (before, that was silently treated as "no results" or "PDF failed").
async function json(res) {
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error(res.ok ? 'The server answered with a web page instead of data — the API is missing or outdated. Redeploy the server.' : `Request failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const send = (path, payload) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(json);

/** params: { q, country: 'global'|'dz'|'fr', booksOnly, freshness: 'any'|'year'|'month' } */
export function searchSources(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) sp.set(k, String(v));
  return fetch(`${BASE}/api/search?${sp}`).then(json);
}

export const generateExpose = (payload) => send('/api/expose', payload);
export const explainRequest = (payload) => send('/api/explain', payload);
export const getSystem = () => fetch(`${BASE}/api/system`).then(json);

export async function downloadPdf(payload, filename = 'expose') {
  const res = await fetch(`${BASE}/api/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};
    throw new Error(data.error || `PDF generation failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'expose'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
