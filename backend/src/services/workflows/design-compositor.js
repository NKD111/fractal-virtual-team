// backend/src/services/workflows/design-compositor.js
// Fractal Virtual Team v4.2 — Design Compositor
//
// PASO 3 del pipeline de Carlos:
//   Background (Higgsfield) → overlay texto Gotham + logos → arte final
//
// Flujo:
//   URL imagen base → fetchImage() → sharp + SVG overlay (Gotham, logos) → PNG completo
//   → Cloudinary upload → URL permanente con diseño completo
//
// Gotham Font Family:
//   Para Railway/Linux: colocar archivos OTF en backend/vendor/fonts/
//     Gotham-Black.otf, Gotham-Bold.otf, Gotham-Medium.otf, Gotham-Book.otf
//   Si no están disponibles, usa Montserrat como fallback visual más cercano.
//   Los archivos se leen una vez al inicio y se embeben en SVG @font-face (base64).

const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs   = require('fs');

// ─── Gotham / Montserrat font embedding ───────────────────────────────────────
// Intentar cargar Gotham desde vendor/fonts/. Si no existe, usar Montserrat
// desde Google Fonts vía HTTP en build time (no en tiempo de request).
// Para SVG/librsvg en Railway: los fonts deben estar como base64 @font-face.

const FONTS_DIR = path.join(__dirname, '..', '..', '..', 'vendor', 'fonts');

function loadFontBase64(filename) {
  try {
    const fullPath = path.join(FONTS_DIR, filename);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath).toString('base64');
    }
  } catch {}
  return null;
}

// Intentar cargar Gotham; si no, intentar Montserrat
const _gothamBlack  = loadFontBase64('Gotham-Black.otf')  || loadFontBase64('Gotham-Black.ttf');
const _gothamBold   = loadFontBase64('Gotham-Bold.otf')   || loadFontBase64('Gotham-Bold.ttf');
const _gothamMedium = loadFontBase64('Gotham-Medium.otf') || loadFontBase64('Gotham-Medium.ttf');
const _gothamBook   = loadFontBase64('Gotham-Book.otf')   || loadFontBase64('Gotham-Book.ttf');
const _montB64      = loadFontBase64('Montserrat-Bold.ttf');
const _montRegB64   = loadFontBase64('Montserrat-Regular.ttf');

// Si tenemos Gotham, usarlo; si no, Montserrat; si no, Arial
const PRIMARY_FONT = _gothamBlack ? 'Gotham' : (_montB64 ? 'Montserrat' : 'Arial');
const FONT_FAMILY  = `'${PRIMARY_FONT}', 'Gotham', 'Montserrat', 'Arial Black', 'Liberation Sans Bold', sans-serif`;
const FONT_FAMILY_BOOK = `'${PRIMARY_FONT}', 'Gotham', 'Montserrat', 'Arial', 'Liberation Sans', sans-serif`;

/**
 * Genera el bloque @font-face SVG para embeber los fonts disponibles.
 * librsvg (usado por Sharp) soporta @font-face con data: URIs.
 */
function buildFontFaceBlock() {
  const faces = [];

  if (_gothamBlack) {
    const fmt = 'Gotham-Black.otf'.endsWith('.otf') ? 'opentype' : 'truetype';
    faces.push(`@font-face { font-family: 'Gotham'; font-weight: 900; src: url('data:font/${fmt};base64,${_gothamBlack}') format('${fmt}'); }`);
  }
  if (_gothamBold) {
    const fmt = 'Gotham-Bold.otf'.endsWith('.otf') ? 'opentype' : 'truetype';
    faces.push(`@font-face { font-family: 'Gotham'; font-weight: 700; src: url('data:font/${fmt};base64,${_gothamBold}') format('${fmt}'); }`);
  }
  if (_gothamMedium) {
    const fmt = 'Gotham-Medium.otf'.endsWith('.otf') ? 'opentype' : 'truetype';
    faces.push(`@font-face { font-family: 'Gotham'; font-weight: 500; src: url('data:font/${fmt};base64,${_gothamMedium}') format('${fmt}'); }`);
  }
  if (_gothamBook) {
    const fmt = 'Gotham-Book.otf'.endsWith('.otf') ? 'opentype' : 'truetype';
    faces.push(`@font-face { font-family: 'Gotham'; font-weight: 400; src: url('data:font/${fmt};base64,${_gothamBook}') format('${fmt}'); }`);
  }
  if (_montB64 && !_gothamBold) {
    faces.push(`@font-face { font-family: 'Montserrat'; font-weight: 700; src: url('data:font/truetype;base64,${_montB64}') format('truetype'); }`);
  }
  if (_montRegB64 && !_gothamBook) {
    faces.push(`@font-face { font-family: 'Montserrat'; font-weight: 400; src: url('data:font/truetype;base64,${_montRegB64}') format('truetype'); }`);
  }

  return faces.length ? `<style>${faces.join('\n')}</style>` : '';
}

if (PRIMARY_FONT === 'Arial') {
  console.warn('[Compositor] ⚠️  Gotham y Montserrat NO encontrados en vendor/fonts/. Usando Arial como fallback.');
  console.warn('[Compositor] Para activar Gotham: coloca Gotham-Black.otf, Gotham-Bold.otf, Gotham-Medium.otf, Gotham-Book.otf en backend/vendor/fonts/');
} else {
  console.log(`[Compositor] ✅ Font activo: ${PRIMARY_FONT}`);
}

// ─── Logo config por cliente/evento ──────────────────────────────────────────
// Los logos PNG deben estar en backend/vendor/logos/<cliente>.png
// Si no existe el archivo, se usa el logo_text como fallback tipográfico.
const LOGOS_DIR = path.join(__dirname, '..', '..', '..', 'vendor', 'logos');

function getLogoBuffer(cliente) {
  const candidates = [
    `${(cliente || '').toUpperCase()}.png`,
    `${(cliente || '').toLowerCase()}.png`,
    `${(cliente || '')}.png`,
  ];
  for (const name of candidates) {
    try {
      const p = path.join(LOGOS_DIR, name);
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}

// ─── Paletas y estilos de marca ───────────────────────────────────────────────
const BRAND_PALETTES = {
  FIF: {
    primary: '#1A1A2E',      // Azul marino corporativo
    secondary: '#E94560',    // Rojo dinámico
    accent: '#F5A623',       // Dorado/naranja
    text: '#FFFFFF',
    textDark: '#1A1A2E',
    overlay: 'rgba(26,26,46,0.72)'
  },
  FRACTAL: {
    primary: '#0F0F0F',
    secondary: '#7C3AED',   // Violeta Fractal
    accent: '#06D6A0',
    text: '#FFFFFF',
    textDark: '#0F0F0F',
    overlay: 'rgba(15,15,15,0.68)'
  },
  VANEXPO: {
    primary: '#003087',
    secondary: '#FF6B00',
    accent: '#FFFFFF',
    text: '#FFFFFF',
    textDark: '#003087',
    overlay: 'rgba(0,48,135,0.70)'
  },
  DEFAULT: {
    primary: '#111827',
    secondary: '#6366F1',
    accent: '#F59E0B',
    text: '#FFFFFF',
    textDark: '#111827',
    overlay: 'rgba(17,24,39,0.70)'
  }
};

// ─── Layouts disponibles ──────────────────────────────────────────────────────
const LAYOUTS = {
  // Story/vertical 9:16 con banda inferior
  story_bottom_band: { w: 1080, h: 1920, bandY: 1200, bandH: 720 },
  // Post cuadrado 1:1 con overlay inferior 40%
  post_square: { w: 1080, h: 1080, bandY: 620, bandH: 460 },
  // Banner horizontal 16:9
  banner_horizontal: { w: 1920, h: 1080, bandY: 600, bandH: 480 },
  // Portrait corporativo 4:5
  portrait: { w: 1080, h: 1350, bandY: 800, bandH: 550 },
};

// ─── Helpers de SVG ──────────────────────────────────────────────────────────

/** Escapa caracteres especiales para SVG */
function svgEscape(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trunca texto al ancho en caracteres aproximados */
function truncate(str, maxChars) {
  if (!str) return '';
  return str.length > maxChars ? str.substring(0, maxChars - 3) + '...' : str;
}

// ─── Generador de SVG overlay ─────────────────────────────────────────────────

/**
 * Genera el SVG overlay completo con todos los elementos de diseño.
 *
 * @param {object} brief - { titulo, subtitulo, fecha, lugar, cta, logo_text, hashtag }
 * @param {object} layout - dimensiones del canvas
 * @param {object} palette - colores de marca
 * @param {object} opts - { showBadge, showGeometric, showDivider }
 */
function buildSVGOverlay(brief, layout, palette, opts = {}) {
  const { w, h, bandY, bandH } = layout;
  const { showBadge = true, showGeometric = true, showDivider = true } = opts;

  const titulo    = svgEscape(truncate(brief.titulo || '', 50));
  const subtitulo = svgEscape(truncate(brief.subtitulo || '', 80));
  const fecha     = svgEscape(brief.fecha || '');
  const lugar     = svgEscape(brief.lugar || '');
  const cta       = svgEscape(brief.cta || '');
  const logoText  = svgEscape(brief.logo_text || 'FRACTAL MX');
  const hashtag   = svgEscape(brief.hashtag || '');
  const badge     = svgEscape(brief.badge || '');

  // Posiciones dentro de la banda
  const mid = bandY + bandH / 2;
  const tituloY = bandY + 90;
  const subtY   = tituloY + 90;
  const fechaY  = h - 160;
  const ctaY    = h - 80;

  const fontFaceBlock = buildFontFaceBlock();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${fontFaceBlock}

    <!-- Gradiente overlay banda inferior -->
    <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.0"/>
      <stop offset="30%" stop-color="${palette.primary}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${palette.primary}" stop-opacity="0.97"/>
    </linearGradient>

    <!-- Gradiente superior sutil para logo -->
    <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="${palette.primary}" stop-opacity="0.0"/>
    </linearGradient>

    <!-- Drop shadow para texto -->
    <filter id="textShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.6"/>
    </filter>

    <!-- Glow para acento -->
    <filter id="accentGlow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- ── BANDA SUPERIOR (logo area) ── -->
  <rect x="0" y="0" width="${w}" height="140" fill="url(#topGrad)"/>

  <!-- Logo / Marca superior izquierda — Gotham Black -->
  <text
    x="52" y="82"
    font-family="${FONT_FAMILY}"
    font-size="32" font-weight="900" letter-spacing="4"
    fill="${palette.text}" opacity="0.95"
    filter="url(#textShadow)"
  >${logoText}</text>

  <!-- Línea decorativa acento (bajo el logo) -->
  <rect x="52" y="92" width="80" height="3" fill="${palette.secondary}" rx="2" opacity="0.9"/>

  ${badge ? `
  <!-- Badge evento -->
  <rect x="${w - 220}" y="30" width="180" height="60" rx="6" fill="${palette.secondary}" opacity="0.92"/>
  <text
    x="${w - 130}" y="68"
    font-family="${FONT_FAMILY}"
    font-size="22" font-weight="700"
    text-anchor="middle" fill="${palette.text}"
  >${badge}</text>
  ` : ''}

  <!-- ── OVERLAY INFERIOR ── -->
  <rect x="0" y="${bandY - 80}" width="${w}" height="${bandH + 80}" fill="url(#bandGrad)"/>

  ${showGeometric ? `
  <!-- Elemento geométrico decorativo — línea accent izquierda -->
  <rect x="0" y="${bandY + 20}" width="6" height="${bandH - 40}" fill="${palette.secondary}" rx="3"/>
  <!-- Punto de acento -->
  <circle cx="3" cy="${bandY + 20}" r="6" fill="${palette.accent}"/>
  ` : ''}

  ${showDivider ? `
  <!-- Divider línea fina -->
  <line x1="52" y1="${tituloY - 24}" x2="${w - 52}" y2="${tituloY - 24}"
    stroke="${palette.secondary}" stroke-width="2" opacity="0.5"/>
  ` : ''}

  <!-- ── TÍTULO PRINCIPAL — Gotham Black UPPERCASE ── -->
  <text
    x="52" y="${tituloY}"
    font-family="${FONT_FAMILY}"
    font-size="${titulo.length > 30 ? 52 : 62}" font-weight="900"
    letter-spacing="0.02em"
    fill="${palette.text}"
    filter="url(#textShadow)"
  >${titulo}</text>

  <!-- ── SUBTÍTULO — Gotham Book ── -->
  ${subtitulo ? `
  <text
    x="52" y="${subtY}"
    font-family="${FONT_FAMILY_BOOK}"
    font-size="32" font-weight="400" letter-spacing="0"
    fill="${palette.text}" opacity="0.85"
    filter="url(#textShadow)"
  >${truncate(subtitulo, 60)}</text>
  ` : ''}

  <!-- ── FECHA Y LUGAR — Gotham Bold ── -->
  ${fecha ? `
  <text
    x="52" y="${fechaY - (lugar ? 42 : 0)}"
    font-family="${FONT_FAMILY}"
    font-size="26" font-weight="700" letter-spacing="0.06em"
    fill="${palette.accent}"
    filter="url(#textShadow)"
  >${fecha}</text>
  ` : ''}

  ${lugar ? `
  <text
    x="52" y="${fechaY}"
    font-family="${FONT_FAMILY_BOOK}"
    font-size="24" font-weight="400"
    fill="${palette.text}" opacity="0.80"
    filter="url(#textShadow)"
  >${lugar}</text>
  ` : ''}

  <!-- ── CTA BUTTON — Gotham Bold UPPERCASE ── -->
  ${cta ? `
  <rect x="52" y="${ctaY - 42}" width="${Math.min(cta.length * 18 + 48, w - 104)}" height="52"
    rx="26" fill="${palette.secondary}" opacity="0.95"/>
  <text
    x="${52 + Math.min(cta.length * 18 + 48, w - 104) / 2}" y="${ctaY - 8}"
    font-family="${FONT_FAMILY}"
    font-size="22" font-weight="700" letter-spacing="0.06em"
    text-anchor="middle" fill="${palette.text}"
  >${cta}</text>
  ` : ''}

  <!-- ── HASHTAG — Gotham Medium ── -->
  ${hashtag && !cta ? `
  <text
    x="52" y="${ctaY}"
    font-family="${FONT_FAMILY}"
    font-size="26" font-weight="500" letter-spacing="0.01em"
    fill="${palette.secondary}" opacity="0.90"
  >${hashtag}</text>
  ` : ''}

</svg>`;
}

// ─── Compositor principal ─────────────────────────────────────────────────────

class DesignCompositor {

  /**
   * Descarga imagen desde URL a Buffer
   */
  async fetchImageBuffer(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'FractalMX-Compositor/4.2' }
    });
    return Buffer.from(response.data);
  }

  /**
   * Detecta la paleta a usar según el brief
   */
  detectPalette(brief) {
    const text = (brief.evento + ' ' + (brief.marca || '')).toLowerCase();
    if (text.includes('fif') || text.includes('franquicias')) return BRAND_PALETTES.FIF;
    if (text.includes('vanexpo') || text.includes('expo')) return BRAND_PALETTES.VANEXPO;
    if (text.includes('fractal')) return BRAND_PALETTES.FRACTAL;
    return BRAND_PALETTES.DEFAULT;
  }

  /**
   * Detecta el layout según el formato del brief
   */
  detectLayout(brief) {
    const fmt = (brief.formato || '').toLowerCase();
    if (fmt.includes('story') || fmt.includes('vertical') || fmt.includes('9:16')) return LAYOUTS.story_bottom_band;
    if (fmt.includes('banner') || fmt.includes('horizontal') || fmt.includes('16:9')) return LAYOUTS.banner_horizontal;
    if (fmt.includes('portrait') || fmt.includes('4:5')) return LAYOUTS.portrait;
    return LAYOUTS.post_square; // default: post 1:1
  }

  /**
   * COMPOSITA: toma la URL de imagen IA + brief y devuelve PNG Buffer completo
   * con texto Gotham, logo del cliente y copy superpuesto.
   *
   * @param {string} aiImageUrl - URL de la imagen generada por Higgsfield
   * @param {object} brief - {
   *   titulo, subtitulo, fecha, lugar, cta, logo_text, hashtag, badge,
   *   evento, marca, formato,
   *   typo_spec  (opcional, del typography-spec.js — usa textos exactos del brief)
   * }
   * @returns {Buffer} PNG final con diseño completo
   */
  async composite(aiImageUrl, brief) {
    console.log('[Compositor] Descargando imagen base...');
    const imageBuffer = await this.fetchImageBuffer(aiImageUrl);

    const layout  = this.detectLayout(brief);
    const palette = this.detectPalette(brief);

    console.log(`[Compositor] Layout: ${layout.w}x${layout.h} | Paleta: ${brief.evento || brief.marca || 'DEFAULT'} | Font: ${PRIMARY_FONT}`);

    // Si hay typo_spec, usar los textos exactos del spec en lugar del brief directo
    // El typo_spec viene de carlos.agent.js (generateTypographySpecForBrief)
    const spec = brief.typo_spec || null;
    const getCapaTexto = (id) => {
      if (!spec) return null;
      const capa = (spec.capas || []).find(c => c.id === id);
      return capa?.texto_a_montar || null;
    };

    const enrichedBrief = {
      ...brief,
      titulo:    getCapaTexto('headline') || getCapaTexto('titulo') || brief.titulo || '',
      subtitulo: getCapaTexto('subheadline') || getCapaTexto('subtitulo') || brief.subtitulo || '',
      cta:       getCapaTexto('cta') || getCapaTexto('cta_badge') || brief.cta || '',
      fecha:     getCapaTexto('fecha_badge') || getCapaTexto('fecha') || getCapaTexto('fecha_evento') || brief.fecha || '',
      lugar:     brief.lugar || '',
    };

    // Redimensionar/recortar imagen al canvas deseado
    const resizedImage = await sharp(imageBuffer)
      .resize(layout.w, layout.h, { fit: 'cover', position: 'centre' })
      .toBuffer();

    // Generar SVG overlay con Gotham
    const svgOverlay = buildSVGOverlay(enrichedBrief, layout, palette, {
      showBadge:     !!enrichedBrief.badge,
      showGeometric: true,
      showDivider:   true
    });

    // ── Compositar capas: resized base + SVG overlay + logo PNG (si existe) ──
    const layers = [{ input: Buffer.from(svgOverlay), top: 0, left: 0 }];

    // Logo del cliente: PNG desde vendor/logos/<CLIENTE>.png
    const cliente = (brief.evento || brief.marca || '').toUpperCase();
    const logoBuffer = getLogoBuffer(cliente);

    if (logoBuffer) {
      try {
        // Redimensionar logo a 160px de ancho, mantener aspecto
        const resizedLogo = await sharp(logoBuffer)
          .resize(160, null, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();

        // Posición: esquina superior derecha con margen
        const logoPadding = 40;
        const logoMeta = await sharp(resizedLogo).metadata();
        const logoTop  = logoPadding;
        const logoLeft = layout.w - (logoMeta.width || 160) - logoPadding;

        layers.push({ input: resizedLogo, top: logoTop, left: logoLeft });
        console.log(`[Compositor] ✅ Logo ${cliente} cargado (${logoMeta.width}x${logoMeta.height})`);
      } catch (logoErr) {
        console.warn(`[Compositor] Logo ${cliente} error (skip): ${logoErr.message}`);
      }
    } else {
      console.log(`[Compositor] Logo ${cliente}: no encontrado en vendor/logos/ — usando texto como fallback`);
    }

    const composited = await sharp(resizedImage)
      .composite(layers)
      .png({ quality: 95 })
      .toBuffer();

    console.log(`[Compositor] ✅ Composición completa (${PRIMARY_FONT}) — ${(composited.length / 1024).toFixed(0)} KB | Logo: ${logoBuffer ? cliente : 'texto'}`);
    return composited;
  }

  /**
   * Sube el PNG compuesto a Cloudinary y devuelve URL permanente.
   * Si no hay Cloudinary, sube como Data URL o guarda tmp.
   */
  async compositeAndUpload(aiImageUrl, brief, tags = []) {
    const pngBuffer = await this.composite(aiImageUrl, brief);

    // Intentar subir a Cloudinary
    try {
      const cloudinary = require('../integrations/creative/cloudinary.service');
      const base64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      const result = await cloudinary.uploadFromBase64(base64, {
        folder: 'fractal-mx/composed',
        tags: ['composed', 'with-text', ...tags],
        public_id: `composed_${Date.now()}`
      });
      console.log('[Compositor] ✅ Subido a Cloudinary:', result.secure_url);
      return { url: result.secure_url, buffer: pngBuffer, source: 'cloudinary' };
    } catch (err) {
      console.warn('[Compositor] Cloudinary no disponible, devolviendo buffer:', err.message);
    }

    // Fallback: convertir a base64 data URL (funciona directo en email HTML)
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    return { url: dataUrl, buffer: pngBuffer, source: 'buffer' };
  }

  /**
   * Extrae el brief de composición de la propuesta de Diego/GPT-4o.
   * Diego debe incluir un bloque JSON con el copy en su proposal.
   */
  extractCompositionBrief(proposal, originalBrief) {
    // Intentar parsear JSON si Diego lo incluyó
    const jsonMatch = proposal.match(/```(?:json)?\s*(\{[\s\S]*?"titulo"[\s\S]*?\})\s*```/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return { ...originalBrief, ...parsed };
      } catch {}
    }

    // Extraer campos con regex como fallback
    const extract = (pattern) => {
      const m = proposal.match(pattern);
      return m ? m[1].trim() : null;
    };

    return {
      ...originalBrief,
      titulo: extract(/[Tt]ítulo[:\s]+["»]?([^"\n»]+)["»]?/) ||
              extract(/TÍTULO[:\s]+([^\n]+)/) ||
              originalBrief.titulo ||
              originalBrief.evento || 'FIF 2025',
      subtitulo: extract(/[Ss]ubtítulo[:\s]+["»]?([^"\n»]+)["»]?/) ||
                 extract(/[Ss]ubheadline[:\s]+([^\n]+)/) ||
                 originalBrief.subtitulo || '',
      fecha: extract(/[Ff]echa[:\s]+([^\n]+)/) || originalBrief.fecha || '',
      lugar: extract(/[Ll]ugar[:\s]+([^\n]+)/) || originalBrief.lugar || '',
      cta: extract(/[Cc][Tt][Aa][:\s]+["»]?([^"\n»]+)["»]?/) ||
           extract(/[Ll]lamada a la acción[:\s]+([^\n]+)/) || '',
      hashtag: extract(/#[\w]+/) || '',
      badge: extract(/[Bb]adge[:\s]+["»]?([^"\n»]+)["»]?/) || '',
      logo_text: originalBrief.logo_text || 'FRACTAL MX'
    };
  }
}

module.exports = new DesignCompositor();
