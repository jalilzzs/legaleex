import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

let browserPromise;
function getBrowser() {
  browserPromise ??= puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browserPromise;
}

async function toPdf(html, options) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({ format: 'A4', printBackground: true, ...options });
  } finally {
    await page.close();
  }
}

/**
 * Renders the cover (no footer) and the body (page numbers) separately,
 * then merges them so the cover page stays clean and numbering starts at 1.
 */
export async function renderExposePdf({ coverHtml, bodyHtml }) {
  const footer = `<div style="width:100%;font-size:10px;font-family:Arial,sans-serif;color:#5b6678;text-align:center;">
      <span class="pageNumber"></span>
    </div>`;

  const [cover, body] = await Promise.all([
    toPdf(coverHtml, { preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }),
    toPdf(bodyHtml, {
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      margin: { top: '24mm', bottom: '22mm', left: '22mm', right: '22mm' },
    }),
  ]);

  const merged = await PDFDocument.create();
  for (const buf of [cover, body]) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close();
}
