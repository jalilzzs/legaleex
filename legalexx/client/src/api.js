// Set VITE_API_URL at build time only if the API is hosted on a different origin.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const searchSources = (q) => fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`).then(json);

export const generateExpose = (payload) =>
  fetch(`${BASE}/api/expose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(json);

export async function downloadPdf(payload, filename = 'expose') {
  const res = await fetch(`${BASE}/api/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'PDF generation failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'expose'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
