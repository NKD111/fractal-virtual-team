// scripts/resize-layout.js
// Resize the huge LAYOUT.png to a web-friendly size while keeping aspect.
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'frontend', 'public', 'assets', 'sprites', 'LAYOUT.png');
const TARGET_WIDTH = 2200;

(async () => {
  const meta = await sharp(SRC).metadata();
  console.log(`source: ${meta.width}x${meta.height}, ${(meta.size / 1024 / 1024).toFixed(1)} MB`);
  await sharp(SRC)
    .resize(TARGET_WIDTH, null, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, palette: false })
    .toFile(SRC + '.tmp');
  // overwrite original with optimized
  require('fs').renameSync(SRC + '.tmp', SRC);
  const after = await sharp(SRC).metadata();
  console.log(`output: ${after.width}x${after.height}, ${(after.size / 1024 / 1024).toFixed(2)} MB`);
})();
