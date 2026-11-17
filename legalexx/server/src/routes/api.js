// ---- PDF export ----
router.post('/pdf', async (req, res) => {
  const b = req.body || {};
  const e = b.expose;
  if (!e || typeof e.title !== 'string' || !Array.isArray(e.sections)) return res.status(400).json({ error: 'Invalid exposé payload.' });

  const language = LANGS.includes(b.language) ? b.language : 'ar';
  const category = CATEGORIES.includes(b.category) ? b.category : 'mixed';
  const clean = (arr) => (Array.isArray(arr) ? arr.map((p) => str(p, 6000)).filter(Boolean) : []);

  const expose = {
    title: str(e.title, 300),
    introduction: str(e.introduction, 8000),
    conclusion: str(e.conclusion, 8000),
    sections: e.sections.slice(0, 12).map((s) => ({
      heading: str(s.heading, 300),
      paragraphs: clean(s.paragraphs),
      subsections: (Array.isArray(s.subsections) ? s.subsections : []).slice(0, 10).map((x) => ({ heading: str(x.heading, 300), paragraphs: clean(x.paragraphs) })),
    })),
  };

  // Only http(s) URLs reach the references page (no javascript:, file:, etc.)
  const sources = (Array.isArray(b.sources) ? b.sources : [])
    .filter((s) => s && isHttpUrl(s.url))
    .slice(0, 60)
    .map((s) => {
      const c = classify(s.url) || { 
        sourceName: s.url, 
        sourceNameAr: s.url, 
        sourceTypeLabel: { ar: 'موقع إلكتروني', en: 'Website' } 
      };
      return {
        n: clamp(s.n, 1, 999, 1),
        title: str(s.title, 300) || s.url,
        url: s.url,
        sourceName: language === 'ar' ? (c.sourceNameAr || s.url) : (c.sourceName || s.url),
        typeLabel: (c.sourceTypeLabel && c.sourceTypeLabel[language === 'ar' ? 'ar' : 'en']) || (language === 'ar' ? 'موقع إلكتروني' : 'Website'),
      };
    });

  const m = b.meta || {};
  const meta = { preparedBy: str(m.preparedBy, 500), supervisedBy: str(m.supervisedBy, 200), university: str(m.university, 200), faculty: str(m.faculty, 200), academicYear: str(m.academicYear, 20) };

  try {
    const pdf = await renderExposePdf({
      coverHtml: buildCoverHtml({ meta, title: expose.title, category, language }),
      bodyHtml: buildBodyHtml({ expose, sources, language }),
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="expose.pdf"', 'Content-Length': pdf.length });
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed.' });
  }
});
