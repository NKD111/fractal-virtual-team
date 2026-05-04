// scripts/generate-icons.js
// Genera todos los iconos necesarios para la PWA de Fractal MX
// Ejecutar desde la raíz del proyecto: node scripts/generate-icons.js

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '../frontend/public/fractal-icon.svg');
const OUTPUT_DIR = path.join(__dirname, '../frontend/public/icons');
const PUBLIC_DIR = path.join(__dirname, '../frontend/public');

async function generateIcons() {
  if (!fs.existsSync(SVG_PATH)) {
    console.error('❌ SVG not found:', SVG_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);
  const sizes = [16, 32, 48, 64, 128, 192, 256, 512];

  console.log('🎨 Generando iconos Fractal MX...\n');

  for (const size of sizes) {
    const outPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png({ quality: 95 })
      .toFile(outPath);
    console.log(`  ✅ icon-${size}.png`);
  }

  // Apple touch icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 95 })
    .toFile(path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
  console.log('  ✅ apple-touch-icon.png');

  // favicon.png en public raíz (32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png({ quality: 95 })
    .toFile(path.join(PUBLIC_DIR, 'favicon.png'));
  console.log('  ✅ favicon.png (raíz public)');

  // Intentar generar .ico si png-to-ico está disponible
  try {
    const pngToIco = require('png-to-ico');
    const icoBuffer = await pngToIco([
      path.join(OUTPUT_DIR, 'icon-16.png'),
      path.join(OUTPUT_DIR, 'icon-32.png'),
      path.join(OUTPUT_DIR, 'icon-48.png'),
      path.join(OUTPUT_DIR, 'icon-256.png')
    ]);
    const icoPath = path.join(OUTPUT_DIR, 'fractal.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('  ✅ fractal.ico (Windows)');

    // Copiar también a public raíz como favicon.ico
    fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
    console.log('  ✅ favicon.ico (raíz public)');
  } catch (err) {
    console.warn('  ⚠️  png-to-ico no disponible — instalar con: npm install png-to-ico');
    console.warn('     Usando favicon.png como fallback. Los navegadores modernos lo soportan.');
  }

  console.log('\n🌸 Todos los iconos generados exitosamente.');
  console.log(`📁 Iconos PNG: ${OUTPUT_DIR}`);
  console.log(`📁 Favicon: ${PUBLIC_DIR}/favicon.png`);
  console.log('\nPróximos pasos:');
  console.log('  1. Los iconos PNG están listos para la PWA');
  console.log('  2. Para .ico en Windows: npm install png-to-ico && node scripts/generate-icons.js');
  console.log('  3. Deploy a Vercel → los iconos se sirven automáticamente');
}

generateIcons().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
