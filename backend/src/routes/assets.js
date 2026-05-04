// backend/src/routes/assets.js
// Sirve assets estáticos de Fractal MX (iconos, etc.)

const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const ICONS_DIR = path.join(__dirname, '../../../frontend/public/icons');
const PUBLIC_DIR = path.join(__dirname, '../../../frontend/public');

// GET /api/assets/icon — descarga el .ico de Windows (o .png fallback)
router.get('/icon', (req, res) => {
  const icoPath = path.join(ICONS_DIR, 'fractal.ico');
  const pngPath = path.join(ICONS_DIR, 'icon-256.png');

  if (fs.existsSync(icoPath)) {
    res.download(icoPath, 'fractal-mx.ico');
  } else if (fs.existsSync(pngPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.download(pngPath, 'fractal-mx.png');
  } else {
    res.status(404).json({ error: 'Icon not generated yet. Run: node scripts/generate-icons.js' });
  }
});

// GET /api/assets/icon/:size — sirve un PNG específico
router.get('/icon/:size', (req, res) => {
  const size = parseInt(req.params.size) || 192;
  const allowed = [16, 32, 48, 64, 128, 192, 256, 512];
  const s = allowed.includes(size) ? size : 192;

  const pngPath = path.join(ICONS_DIR, `icon-${s}.png`);
  if (fs.existsSync(pngPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(pngPath);
  } else {
    res.status(404).json({ error: `Icon ${s}x${s} not found. Run: node scripts/generate-icons.js` });
  }
});

// GET /api/assets/favicon — favicon.png
router.get('/favicon', (req, res) => {
  const faviconPath = path.join(PUBLIC_DIR, 'favicon.png');
  if (fs.existsSync(faviconPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(faviconPath);
  } else {
    res.status(404).json({ error: 'Favicon not found' });
  }
});

module.exports = router;
