// backend/src/core/typography-spec.js
// TypographySpec — Motor de especificación tipográfica para artes FIF/EFG
//
// PROBLEMA que resuelve:
//   La IA generativa (GPT Image 2, Nano Banana) no puede garantizar
//   consistencia tipográfica. Gotham no existe en su espacio de generación.
//   El texto generado por IA cambia de fuente, tamaño y peso en cada render.
//
// SOLUCIÓN:
//   Paso 1 — Carlos genera SOLO el fondo/composición visual (sin texto, sin logos)
//   Paso 2 — TypographySpec genera el spec completo de texto para post-producción
//   Paso 3 — Valentina QC revisa ambos: imagen limpia + spec tipográfico
//   Entregable — imagen base + spec PDF/JSON para Claudia/Photoshop/Canva

'use strict';

const { FIF_BRAND_GUIDE } = require('../clients/fif-brand-guide');

// ─── Constantes de tipografía Gotham ──────────────────────────────────────────
const GOTHAM_SPEC = {
  familia:   'Gotham',
  fallbacks: ['Montserrat', 'Avenir Next', 'Proxima Nova'],
  pesos: {
    ultra:    { weight: 900, css: 'font-weight: 900; font-style: normal;', uso: 'números grandes, fechas de impacto' },
    black:    { weight: 800, css: 'font-weight: 800;', uso: 'headline principal cuando hay mucho texto' },
    bold:     { weight: 700, css: 'font-weight: 700;', uso: 'headlines, CTAs, datos importantes' },
    medium:   { weight: 500, css: 'font-weight: 500;', uso: 'subtítulos, segunda jerarquía' },
    book:     { weight: 400, css: 'font-weight: 400;', uso: 'cuerpo de texto, info auxiliar' },
    light:    { weight: 300, css: 'font-weight: 300;', uso: 'textos muy pequeños, disclaimers' },
  },
  // Tamaños mínimos por plataforma (accesibilidad + legibilidad en móvil)
  tamanos_minimos: {
    cuerpo_mobile: '16px',
    cuerpo_desktop: '14px',
    disclaimer: '11px',
    cta: '18px',
    headline_post: '28px',
    headline_banner: '36px',
    datos_destacados: '48px',
  },
  transformaciones: {
    headline:  'uppercase' , // Headlines siempre mayúsculas en FIF/EFG
    subtitulo: 'capitalize',
    cta:       'uppercase',
    datos:     'uppercase',
    cuerpo:    'none',
  },
  letter_spacing: {
    headline:  '0.02em',
    cta:       '0.06em',  // CTAs con más tracking
    datos:     '0.01em',
    cuerpo:    '0em',
  }
};

// ─── Jerarquía por tipo de pieza ──────────────────────────────────────────────
const HIERARCHY_BY_PIECE = {
  post_comercial: {
    capas: [
      // fecha_badge: Gotham Bold sobre fondo rojo — alta visibilidad, badge redondeado
      { id: 'fecha_badge',   peso: 'bold',  tamano: '14px', color: '#FFFFFF', bg: '#C8102E', transform: 'uppercase', tracking: '0.08em', zona: 'superior izquierda, badge redondeado con fondo rojo #C8102E' },
      // headline: Gotham Black UPPERCASE — máximo impacto, jerarquía dominante
      { id: 'headline',      peso: 'black', tamano: '32px', color: '#1B263B', transform: 'uppercase', tracking: '0.02em', zona: 'bloque central superior' },
      // subheadline: Gotham Book — subordinado, complementa headline
      { id: 'subheadline',   peso: 'book',  tamano: '18px', color: '#2E7DBD', transform: 'none', tracking: '0em',    zona: 'bajo headline, texto explicativo' },
      // dato_clave: Gotham Black extra-grande — urgencia numérica dominante
      { id: 'dato_clave',    peso: 'black', tamano: '56px', color: '#C8102E', transform: 'uppercase', tracking: '0em', zona: 'número/dato destacado central' },
      // cta: Gotham Bold sobre fondo rojo — acción clara y visible
      { id: 'cta',           peso: 'bold',  tamano: '16px', color: '#FFFFFF', bg: '#C8102E', transform: 'uppercase', tracking: '0.06em', zona: 'botón CTA inferior central con fondo rojo #C8102E' },
      // dato_secundario: Gotham Book — info auxiliar discreta
      { id: 'dato_secundario', peso: 'book', tamano: '14px', color: '#6B7280', transform: 'none', tracking: '0em', zona: 'módulo info inferior' },
      // url: Gotham Book lowercase — institucional, pie de página
      { id: 'url',           peso: 'book',  tamano: '13px', color: '#1B263B', transform: 'lowercase', tracking: '0em', zona: 'pie de página' },
    ]
  },
  post_informativo: {
    capas: [
      { id: 'eyebrow',       peso: 'bold',   tamano: '13px', color: '#C8102E', transform: 'uppercase', tracking: '0.10em', zona: 'encima del headline, pequeño descriptor' },
      { id: 'headline',      peso: 'bold',   tamano: '28px', color: '#1B263B', transform: 'uppercase', tracking: '0.02em', zona: 'bloque central' },
      { id: 'subheadline',   peso: 'book',   tamano: '16px', color: '#6B7280', transform: 'none',      tracking: '0em',    zona: 'bajo headline' },
      { id: 'bullets',       peso: 'medium', tamano: '15px', color: '#1B263B', transform: 'none',      tracking: '0em',    zona: 'lista de beneficios con iconos' },
      { id: 'cta',           peso: 'bold',   tamano: '15px', color: '#FFFFFF', bg: '#C8102E', transform: 'uppercase', tracking: '0.06em', zona: 'botón CTA' },
      { id: 'fecha_sede',    peso: 'book',   tamano: '13px', color: '#6B7280', transform: 'none',      tracking: '0em',    zona: 'pie de página' },
    ]
  },
  post_editorial: {
    capas: [
      { id: 'headline',      peso: 'ultra',  tamano: '40px', color: '#FFFFFF', transform: 'uppercase', tracking: '0.01em', zona: 'superpuesto sobre imagen, zona oscura' },
      { id: 'subheadline',   peso: 'light',  tamano: '18px', color: '#FFFFFF', transform: 'capitalize', tracking: '0.02em', zona: 'bajo headline, espacio amplio' },
      { id: 'fecha',         peso: 'bold',   tamano: '14px', color: '#C8102E', transform: 'uppercase', tracking: '0.06em', zona: 'badge superior derecha o inferior' },
    ]
  },
  banner_web: {
    capas: [
      { id: 'eyebrow',       peso: 'bold',   tamano: '13px', color: '#C8102E', transform: 'uppercase', tracking: '0.10em', zona: 'izquierda, sobre el headline' },
      { id: 'headline',      peso: 'black',  tamano: '36px', color: '#1B263B', transform: 'uppercase', tracking: '0.01em', zona: 'bloque texto izquierdo, zona blanca' },
      { id: 'subheadline',   peso: 'medium', tamano: '16px', color: '#1B263B', transform: 'none',      tracking: '0em',    zona: 'bajo headline' },
      { id: 'cta',           peso: 'bold',   tamano: '14px', color: '#FFFFFF', bg: '#C8102E', transform: 'uppercase', tracking: '0.06em', zona: 'botón CTA izquierda' },
      { id: 'fecha_evento',  peso: 'bold',   tamano: '13px', color: '#C8102E', transform: 'uppercase', tracking: '0.08em', zona: 'bajo CTA, info de evento' },
    ]
  },
  story: {
    capas: [
      { id: 'titulo',        peso: 'black',  tamano: '42px', color: '#1B263B', transform: 'uppercase', tracking: '0.01em', zona: 'centro-superior' },
      { id: 'subtitulo',     peso: 'medium', tamano: '20px', color: '#2E7DBD', transform: 'capitalize', tracking: '0em',    zona: 'bajo título' },
      { id: 'cta_badge',     peso: 'bold',   tamano: '16px', color: '#FFFFFF', bg: '#C8102E', transform: 'uppercase', tracking: '0.06em', zona: 'inferior central' },
    ]
  }
};

// ─── generateTypographySpec ───────────────────────────────────────────────────
/**
 * Genera el spec tipográfico completo para una pieza.
 * Este spec es lo que Claudia/producción monta en Photoshop/Canva/Figma.
 *
 * @param {object} brief - brief de parrilla
 * @param {object} content - contenido textual { headline, subheadline, cta, datos, fecha, url, bullets }
 * @returns {object} spec completo con capas, colores, instrucciones de montaje
 */
function generateTypographySpec(brief, content = {}) {
  const tipo = (brief.tipo_pieza || 'post_informativo').toLowerCase().replace(' ', '_');
  const hierarchy = HIERARCHY_BY_PIECE[tipo] || HIERARCHY_BY_PIECE.post_informativo;
  const evento = brief.cliente || 'EFG';
  const colores = FIF_BRAND_GUIDE.colores;

  const capas_con_texto = hierarchy.capas.map(capa => {
    let texto = '';
    switch (capa.id) {
      case 'headline':      texto = content.headline     || brief.headline     || ''; break;
      case 'subheadline':   texto = content.subheadline  || brief.subheadline  || ''; break;
      case 'eyebrow':       texto = content.eyebrow      || evento.toUpperCase(); break;
      case 'cta':           texto = content.cta          || brief.cta          || 'REGÍSTRATE AHORA'; break;
      case 'dato_clave':    texto = content.dato_clave   || brief.dato_clave   || ''; break;
      case 'dato_secundario': texto = content.dato_secundario || ''; break;
      case 'fecha_badge':
      case 'fecha':
      case 'fecha_evento':  texto = content.fecha        || brief.fecha        || ''; break;
      case 'fecha_sede':    texto = `${content.fecha || ''} · ${content.sede || ''}`; break;
      case 'url':           texto = content.url || 'www.' + evento.toLowerCase() + '.com.mx'; break;
      case 'titulo':        texto = content.headline     || brief.headline     || ''; break;
      case 'subtitulo':     texto = content.subheadline  || brief.subheadline  || ''; break;
      case 'cta_badge':     texto = content.cta          || 'VER MÁS'; break;
      case 'bullets':
        if (content.bullets && Array.isArray(content.bullets)) {
          texto = content.bullets.join(' | '); // representación flat para el spec
        } else {
          texto = content.bullets || '';
        }
        break;
    }
    return { ...capa, texto_a_montar: texto.toString() };
  }).filter(c => c.texto_a_montar); // omitir capas sin texto asignado

  return {
    version:   '2.0',
    generado:  new Date().toISOString(),
    evento,
    tipo_pieza: tipo,
    familia_tipografica: GOTHAM_SPEC.familia,
    fallback_fonts: GOTHAM_SPEC.fallbacks,
    nota_produccion: [
      `USAR GOTHAM FONT FAMILY en todas las capas. Sin excepciones.`,
      `Si no tienes Gotham instalado: usar Montserrat como fallback exacto.`,
      `Colores exactos: rojo #C8102E, navy #1B263B, azul #2E7DBD.`,
      `NO modificar pesos ni tamaños — están calibrados para jerarquía visual.`,
      `Montar sobre la imagen base EXACTAMENTE en las zonas indicadas.`,
      `Revisar kerning en headlines antes de entregar.`,
    ],
    paleta: {
      rojo:   colores.rojo,
      navy:   colores.navy,
      azul:   colores.azul_medio,
      blanco: colores.blanco,
      gris:   colores.gris_texto,
    },
    capas: capas_con_texto,
    zonas_limpias: getCleanZones(tipo),
    checklist_produccion: [
      '☐ Headline en Gotham Black/Bold UPPERCASE',
      '☐ Espaciado entre letras correcto (ver tracking por capa)',
      '☐ CTA con background rojo #C8102E, texto blanco',
      '☐ Fecha/Sede en tipografía Book, color gris #6B7280',
      '☐ Contraste mínimo 4.5:1 (WCAG AA)',
      '☐ Ningún texto sobre rostros',
      '☐ Logo en zona superior derecha reservada',
      '☐ URL en pie de página, Gotham Book lowercase',
    ]
  };
}

function getCleanZones(tipo) {
  const zones = {
    post_comercial:  ['izquierda 40%: bloque headline + subheadline + dato', 'inferior: CTA + URL + fecha'],
    post_informativo: ['superior 30%: eyebrow + headline', 'central: bullets', 'inferior: CTA + fecha'],
    post_editorial:  ['zona inferior 35%: headline sobre fade oscuro'],
    banner_web:      ['izquierda 45% COMPLETA: toda la información de texto — imagen NO invade esta zona'],
    story:           ['central superior 50%: headline + subtítulo', 'inferior 15%: CTA badge'],
  };
  return zones[tipo] || zones.post_informativo;
}

// ─── generateNoTextImagePrompt ────────────────────────────────────────────────
/**
 * Transforma cualquier prompt de imagen para que NUNCA incluya texto.
 * Agrega instrucciones explícitas de "no text" y deja zonas limpias.
 */
function generateNoTextImagePrompt(basePrompt, tipo_pieza, content = {}) {
  const noTextInstructions = [
    'ABSOLUTELY NO TEXT IN IMAGE.',
    'NO typography, NO letters, NO words, NO numbers, NO characters of any kind.',
    'NO logos, NO brand marks, NO watermarks, NO inscriptions.',
    'Text and typography will be added separately in post-production.',
    'Leave intentional CLEAN EMPTY ZONES as specified in composition.',
  ];

  const cleanZoneInstructions = {
    post_comercial:   'Left 40% of image: completely clean, minimal background texture only. Right 60%: main visual.',
    post_informativo: 'Upper 30% of image: clean background zone for text overlay. Lower portion: main visual.',
    post_editorial:   'Lower 35% of image: darkened zone or gradient fade for text overlay.',
    banner_web:       'LEFT 45% of full width: COMPLETELY WHITE OR VERY LIGHT GRAY. Absolutely clean. Zero visual elements. Right 55%: main photography.',
    story:            'Center top 50%: clean background. Lower 15%: clean zone for CTA.',
  };

  const tipo = (tipo_pieza || 'post_informativo').toLowerCase().replace(' ', '_');
  const cleanZone = cleanZoneInstructions[tipo] || cleanZoneInstructions.post_informativo;

  return [
    basePrompt,
    '',
    '─── TEXT-FREE GENERATION RULES (MANDATORY) ───',
    noTextInstructions.join(' '),
    '',
    '─── CLEAN ZONE FOR POST-PRODUCTION TEXT MOUNTING ───',
    cleanZone,
  ].join('\n');
}

// ─── validateBriefForTypography ───────────────────────────────────────────────
/**
 * Valida que un brief tiene todos los campos de texto necesarios.
 * Retorna errores y sugerencias para completar el brief antes de diseñar.
 */
function validateBriefForTypography(brief) {
  const required = ['headline', 'cta'];
  const recommended = ['subheadline', 'fecha', 'url', 'sede'];
  const errors = [];
  const warnings = [];

  required.forEach(f => {
    if (!brief[f] || !brief[f].toString().trim()) {
      errors.push(`FALTANTE CRÍTICO: "${f}" es obligatorio para el spec tipográfico`);
    }
  });

  recommended.forEach(f => {
    if (!brief[f]) {
      warnings.push(`Recomendado: añadir "${f}" al brief para completar el spec`);
    }
  });

  // Validar longitud de headline (display)
  if (brief.headline && brief.headline.length > 60) {
    warnings.push(`Headline muy largo (${brief.headline.length} chars). Máximo recomendado: 60 chars para display.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  GOTHAM_SPEC,
  HIERARCHY_BY_PIECE,
  generateTypographySpec,
  generateNoTextImagePrompt,
  validateBriefForTypography,
};
