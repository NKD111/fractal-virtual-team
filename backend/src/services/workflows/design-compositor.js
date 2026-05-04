// backend/src/services/workflows/design-compositor.js
// Fractal Virtual Team v4.2 — Design Compositor
//
// PROBLEMA RESUELTO: DALL-E genera foto excelente pero sin texto.
// SOLUCIÓN: sharp + SVG overlay → composita texto, logo, copy y branding
//           encima de la foto generada por IA.
//
// Flujo:
//   DALL-E foto → fetchImage() → sharp + SVG text overlay → Buffer PNG completo
//   → Cloudinary upload → URL permanente con diseño completo

const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
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

  <!-- Logo / Marca superior izquierda -->
  <text
    x="52" y="82"
    font-family="'Arial Black', 'Helvetica Neue', sans-serif"
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
    font-family="'Arial', sans-serif" font-size="22" font-weight="700"
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

  <!-- ── TÍTULO PRINCIPAL ── -->
  <text
    x="52" y="${tituloY}"
    font-family="'Arial Black', 'Helvetica Neue', sans-serif"
    font-size="${titulo.length > 30 ? 52 : 62}" font-weight="900"
    fill="${palette.text}"
    filter="url(#textShadow)"
  >${titulo}</text>

  <!-- ── SUBTÍTULO ── -->
  ${subtitulo ? `
  <text
    x="52" y="${subtY}"
    font-family="'Arial', 'Helvetica Neue', sans-serif"
    font-size="32" font-weight="400" letter-spacing="0.5"
    fill="${palette.text}" opacity="0.85"
    filter="url(#textShadow)"
  >${truncate(subtitulo, 60)}</text>
  ` : ''}

  <!-- ── FECHA Y LUGAR ── -->
  ${fecha ? `
  <text
    x="52" y="${fechaY - (lugar ? 42 : 0)}"
    font-family="'Arial', sans-serif" font-size="26" font-weight="600"
    fill="${palette.accent}" letter-spacing="1"
    filter="url(#textShadow)"
  >${fecha}</text>
  ` : ''}

  ${lugar ? `
  <text
    x="52" y="${fechaY}"
    font-family="'Arial', sans-serif" font-size="24" font-weight="400"
    fill="${palette.text}" opacity="0.80"
    filter="url(#textShadow)"
  >📍 ${lugar}</text>
  ` : ''}

  <!-- ── CTA / HASHTAG ── -->
  ${cta ? `
  <rect x="52" y="${ctaY - 42}" width="${Math.min(cta.length * 18 + 48, w - 104)}" height="52"
    rx="26" fill="${palette.secondary}" opacity="0.95"/>
  <text
    x="${52 + Math.min(cta.length * 18 + 48, w - 104) / 2}" y="${ctaY - 8}"
    font-family="'Arial Black', sans-serif" font-size="22" font-weight="700"
    text-anchor="middle" fill="${palette.text}"
  >${cta}</text>
  ` : ''}

  ${hashtag && !cta ? `
  <text
    x="52" y="${ctaY}"
    font-family="'Arial', sans-serif" font-size="26" font-weight="600"
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
   * con texto, branding y copy superpuesto.
   *
   * @param {string} aiImageUrl - URL de la imagen generada por DALL-E/Higgsfield
   * @param {object} brief - {
   *   titulo, subtitulo, fecha, lugar, cta, logo_text, hashtag, badge,
   *   evento, marca, formato
   * }
   * @returns {Buffer} PNG final con diseño completo
   */
  async composite(aiImageUrl, brief) {
    console.log('[Compositor] Descargando imagen base...');
    const imageBuffer = await this.fetchImageBuffer(aiImageUrl);

    const layout = this.detectLayout(brief);
    const palette = this.detectPalette(brief);

    console.log(`[Compositor] Layout: ${JSON.stringify({ w: layout.w, h: layout.h })} | Paleta detectada`);

    // Redimensionar/recortar imagen al canvas deseado
    const resizedImage = await sharp(imageBuffer)
      .resize(layout.w, layout.h, {
        fit: 'cover',
        position: 'centre'
      })
      .toBuffer();

    // Generar SVG overlay
    const svgOverlay = buildSVGOverlay(brief, layout, palette, {
      showBadge: !!brief.badge,
      showGeometric: true,
      showDivider: true
    });

    const svgBuffer = Buffer.from(svgOverlay);

    // Compositar: imagen base + SVG overlay
    const composited = await sharp(resizedImage)
      .composite([{
        input: svgBuffer,
        top: 0,
        left: 0
      }])
      .png({ quality: 95 })
      .toBuffer();

    console.log(`[Compositor] ✅ Composición completa — ${(composited.length / 1024).toFixed(0)} KB`);
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
