// backend/src/pipelines/kdp.js
//
// KDP PIPELINE — Amazon KDP-ready low-content book (journal/planner).
//
//   input:  { niche, title?, days?, pages? }
//   output: { ok, pdfPath, title, pages, niche }
//
// Specs:
//   • Trim size: 6×9 in (Amazon KDP standard for paperback)
//   • Margins: KDP minimums for ≤150 pages → inside 0.375", outside/top/bottom 0.25"
//     We use generous margins for readability: inside 0.5", outside 0.5", top/bottom 0.75"
//   • 60–80 pages, mostly blank lined space (90% writing, 10% prompts)
//   • B&W interior (cheaper KDP per-page royalty)
//   • Avatar: Synaptic Monk (biohacking / productividad masculina)
//
// Default first book: "21-Day Dopamine Reset Journal"

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const OUT_DIR = path.join(__dirname, '..', '..', 'output', 'kdp');
fs.mkdirSync(OUT_DIR, { recursive: true });

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// ── Step 1: Generate journal content (prompts, daily themes) ──────────────────
async function generateContent({ niche, title, days }) {
  const fallback = {
    title: title || '21-Day Dopamine Reset Journal',
    subtitle: 'Reclaim your focus. Rebuild your edge.',
    intro:
      'This journal is built for men who feel scattered, overstimulated, and pulled in too many directions. ' +
      'Twenty-one days of structured reflection to reset your dopamine baseline, sharpen attention, and reclaim deep work. ' +
      'No fluff. One page in the morning. One page at night. Just you and the work.',
    closing:
      'Day 21 is not the finish line. It is the floor — the new baseline you operate from. ' +
      'Keep what worked. Drop what did not. Repeat the cycle when you feel the drift creeping back.',
    days: Array.from({ length: days || 21 }, (_, i) => ({
      number: i + 1,
      theme: ['Notice', 'Subtract', 'Replace', 'Anchor', 'Compound'][i % 5],
      morning_prompt: 'What is the one thing I refuse to outsource to a screen today?',
      evening_prompt: 'Where did dopamine win? Where did discipline win?',
    })),
  };

  if (!anthropic) return fallback;

  try {
    const userPrompt = `You are writing daily reflection prompts for an Amazon KDP low-content journal.
Niche: ${niche}
Title: ${title || '21-Day Dopamine Reset Journal'}
Avatar: men 22-40, biohacker mindset, productivity-driven, Synaptic Monk audience.

Generate ${days || 21} day entries. Each entry:
- "theme": one word or short phrase (e.g. "Notice", "Subtract", "Anchor")
- "morning_prompt": one sentence reflection question (under 18 words)
- "evening_prompt": one sentence review question (under 18 words)

Also write:
- "subtitle": 4-7 words, masculine, sharp
- "intro": 80-120 words. Direct. No fluff. Address the reader as "you".
- "closing": 60-100 words. End on action, not motivation.

Return STRICT JSON only:
{ "subtitle": "...", "intro": "...", "closing": "...", "days": [ { "number": 1, "theme": "...", "morning_prompt": "...", "evening_prompt": "..." }, ... ] }`;

    const res = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return fallback;
    const parsed = JSON.parse(json);
    return {
      title: title || '21-Day Dopamine Reset Journal',
      subtitle: parsed.subtitle || fallback.subtitle,
      intro: parsed.intro || fallback.intro,
      closing: parsed.closing || fallback.closing,
      days: Array.isArray(parsed.days) && parsed.days.length ? parsed.days : fallback.days,
    };
  } catch (err) {
    console.warn('[kdp] content gen failed, using fallback:', err.message);
    return fallback;
  }
}

// ── Step 2: Render HTML (KDP 6×9 with proper margins) ────────────────────────
function renderHtml(book) {
  const lineRow = `<div class="line"></div>`;
  const linesBlock = (n) => Array.from({ length: n }, () => lineRow).join('');

  const dayPages = book.days
    .map(
      (d) => `
<section class="page day">
  <div class="day-header">
    <span class="day-num">DAY ${String(d.number).padStart(2, '0')}</span>
    <span class="day-theme">${d.theme}</span>
  </div>
  <div class="prompt-label">Morning intention</div>
  <div class="prompt">${escapeHtml(d.morning_prompt)}</div>
  ${linesBlock(11)}
</section>
<section class="page day">
  <div class="day-header">
    <span class="day-num">DAY ${String(d.number).padStart(2, '0')}</span>
    <span class="day-theme">${d.theme}</span>
  </div>
  <div class="prompt-label">Evening review</div>
  <div class="prompt">${escapeHtml(d.evening_prompt)}</div>
  ${linesBlock(11)}
</section>`
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 6in 9in; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff; }
  .page {
    width: 6in; height: 9in;
    box-sizing: border-box;
    padding: 0.75in 0.5in 0.75in 0.5in;
    page-break-after: always;
    position: relative;
  }
  .page.cover {
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center;
    padding: 1.5in 0.75in;
  }
  .page.cover .title { font-size: 32pt; font-weight: 700; letter-spacing: -0.5pt; line-height: 1.1; }
  .page.cover .subtitle { font-size: 13pt; margin-top: 0.4in; letter-spacing: 0.5pt; text-transform: uppercase; color: #222; }
  .page.cover .rule { width: 1.5in; height: 1px; background: #000; margin: 0.6in auto; }
  .page.cover .footer { position: absolute; bottom: 0.6in; left: 0; right: 0; font-size: 10pt; letter-spacing: 1pt; text-transform: uppercase; }
  .page.intro { padding-top: 1in; }
  .page.intro h2 { font-size: 18pt; margin: 0 0 0.3in 0; letter-spacing: -0.3pt; }
  .page.intro p { font-size: 11pt; line-height: 1.6; margin: 0 0 0.18in 0; text-align: justify; }
  .day-header {
    border-bottom: 1px solid #000;
    padding-bottom: 0.08in;
    margin-bottom: 0.3in;
    display: flex; justify-content: space-between; align-items: baseline;
  }
  .day-num { font-size: 14pt; font-weight: 700; letter-spacing: 1pt; }
  .day-theme { font-size: 10pt; text-transform: uppercase; letter-spacing: 1.2pt; color: #333; }
  .prompt-label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1pt; color: #555; margin-bottom: 0.05in; }
  .prompt { font-size: 11.5pt; font-style: italic; margin-bottom: 0.25in; line-height: 1.4; }
  .line { border-bottom: 0.5pt solid #888; height: 0.42in; }
  .page.closing h2 { font-size: 18pt; margin: 0 0 0.3in 0; }
  .page.closing p { font-size: 11pt; line-height: 1.6; text-align: justify; }
</style>
</head><body>

<section class="page cover">
  <div class="title">${escapeHtml(book.title)}</div>
  <div class="rule"></div>
  <div class="subtitle">${escapeHtml(book.subtitle)}</div>
  <div class="footer">Synaptic Monk Press</div>
</section>

<section class="page intro">
  <h2>How to use this journal</h2>
  <p>${escapeHtml(book.intro)}</p>
  <p style="margin-top:0.3in;font-size:10pt;letter-spacing:0.5pt;text-transform:uppercase;color:#444;">One page each morning. One page each night. ${book.days.length} days.</p>
</section>

${dayPages}

<section class="page closing">
  <h2>Day ${book.days.length + 1}: the new baseline</h2>
  <p>${escapeHtml(book.closing)}</p>
</section>

</body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Step 3: HTML → PDF via puppeteer ─────────────────────────────────────────
async function htmlToPdf(html) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch { throw new Error('puppeteer not installed — run `npm i puppeteer` in /backend'); }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buf = await page.pdf({
      width: '6in',
      height: '9in',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
    return buf;
  } finally {
    await browser.close();
  }
}

// ── Cloudinary upload (resource_type=raw for PDFs) ────────────────────────────
async function uploadToCloudinary(buffer, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || cloudName === 'PENDING' || !apiKey || !apiSecret) {
    console.warn('[kdp] Cloudinary not configured — skipping upload');
    return null;
  }

  let axios, FormData;
  try {
    axios = require('axios');
    FormData = require('form-data');
  } catch (e) {
    console.warn('[kdp] axios/form-data missing — skipping upload:', e.message);
    return null;
  }

  // Signed upload: timestamp + signature (SHA1 of params + secret)
  const crypto = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'fractal-mx/kdp';
  // Signature params must be sorted alphabetically, key=value joined by &,
  // then append secret (NO ampersand) and SHA1
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

  const form = new FormData();
  form.append('file', buffer, { filename: `${publicId}.pdf`, contentType: 'application/pdf' });
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('public_id', publicId);
  form.append('folder', folder);
  form.append('signature', signature);

  try {
    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
      }
    );
    console.log(`[kdp] ✅ Cloudinary: ${res.data.secure_url}`);
    return {
      url: res.data.secure_url,
      public_id: res.data.public_id,
      bytes: res.data.bytes,
      format: res.data.format,
    };
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[kdp] Cloudinary upload failed:', detail);
    return null;
  }
}

// ── Main: orchestrator ───────────────────────────────────────────────────────
async function runKdp({ niche, title, days, pages } = {}) {
  if (!niche) throw new Error('niche is required');
  console.log(`[kdp] start niche="${niche}" title="${title || 'default'}"`);

  const dayCount = days || (pages ? Math.max(15, Math.floor((pages - 4) / 2)) : 21);
  const book = await generateContent({ niche, title, days: dayCount });

  const html = renderHtml(book);
  const pdfBuf = await htmlToPdf(html);

  // Pages = cover(1) + intro(1) + days(2 each) + closing(1)
  const totalPages = 1 + 1 + (book.days.length * 2) + 1;

  const fname = `${slug(book.title)}-${Date.now()}.pdf`;
  const pdfPath = path.join(OUT_DIR, fname);
  fs.writeFileSync(pdfPath, pdfBuf);
  fs.writeFileSync(path.join(OUT_DIR, fname.replace(/\.pdf$/, '.html')), html);

  // Upload to Cloudinary for a permanent URL (container is ephemeral)
  const publicId = fname.replace(/\.pdf$/, '');
  const cloudinary = await uploadToCloudinary(pdfBuf, publicId);

  console.log(`[kdp] done → ${pdfPath} (${totalPages} pages)`);
  return {
    ok: true,
    pdfPath,
    cloudinaryUrl: cloudinary?.url || null,
    cloudinaryPublicId: cloudinary?.public_id || null,
    cloudinaryBytes: cloudinary?.bytes || null,
    title: book.title,
    pages: totalPages,
    niche,
    days: book.days.length,
  };
}

module.exports = { runKdp, uploadToCloudinary, generateContent, renderHtml, htmlToPdf };
