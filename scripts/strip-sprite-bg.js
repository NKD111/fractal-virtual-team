// scripts/strip-sprite-bg.js
// Pre-process all sprites in frontend/public/assets/sprites/
// Removes near-white background pixels → fully transparent.
// Saves *_t.png alongside the original (non-destructive) and writes report.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SPRITES_DIR = path.join(__dirname, '..', 'frontend', 'public', 'assets', 'sprites');
const THRESHOLD = 235; // pixels with R,G,B all >= threshold → transparent
const OVERWRITE = process.argv.includes('--overwrite');

async function strip(file) {
  const inputPath = path.join(SPRITES_DIR, file);
  const outName = OVERWRITE ? file : file.replace(/\.png$/i, '_t.png');
  const outputPath = path.join(SPRITES_DIR, outName);

  const img = sharp(inputPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let stripped = 0;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
      data[i + 3] = 0;
      stripped++;
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  const total = width * height;
  const pct = ((stripped / total) * 100).toFixed(1);
  console.log(`  ${file.padEnd(20)} ${width}x${height}  stripped ${pct}% → ${outName}`);
  return { file, width, height, stripped, total };
}

(async () => {
  const files = fs.readdirSync(SPRITES_DIR).filter(f => /\.png$/i.test(f) && !f.endsWith('_t.png'));
  console.log(`\nProcessing ${files.length} sprites (threshold ${THRESHOLD}, ${OVERWRITE ? 'OVERWRITE' : 'side-by-side'})\n`);
  for (const f of files) {
    try { await strip(f); } catch (e) { console.error(`  ${f} FAILED: ${e.message}`); }
  }
  console.log('\nDone.\n');
})();
