// backend/src/pipelines/youtube-content.js
// BLOQUE N — Canal YouTube Fractal MX
// Nicho: IA para agencias creativas LATAM
// Frecuencia: 2 videos/semana
// Formato: faceless, educativo, directo

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const higgsfield = require('../core/higgsfield-client');
const { chat } = require('../core/anthropic');

const CHANNEL_CONFIG = {
  nombre: 'Fractal MX',
  nicho: 'IA para agencias creativas LATAM',
  frecuencia: '2 videos por semana',
  formato: 'faceless, educativo, directo, 5-8 min',
  idioma: 'español mexicano, accesible LATAM',
  audiencia: 'agencias creativas, diseñadores, marketers, dueños de negocio LATAM',
  estilo: 'directo sin relleno, CDMX pero accesible, sin intro larga',
  estructura: 'Gancho (0-15s) → Setup problema (15-60s) → Valor (1-8min) → CTA (30s)',
  monetizacion: ['tráfico a ebooks', 'tráfico a Fractal MX servicios', 'afiliados IA'],
  thumbnail_style: 'oscuro, texto impactante, brand Fractal MX navy + rojo'
};

// Temas recurrentes para el canal
const TEMAS_RECURRENTES = [
  'Cómo usé IA para hacer el trabajo de 5 personas en mi agencia',
  'El error que cometí al automatizar mi agencia (y cómo lo arreglé)',
  '3 prompts que uso todos los días en Fractal MX',
  'Cómo generé una parrilla de contenido completa en 2 horas con IA',
  'GPT Image 2 vs Midjourney para trabajo de agencia: mi veredicto',
  'Cómo cobra una agencia que usa IA (sin bajar precios)',
  'El sistema que hace que mi equipo IA trabaje mientras duermo',
  'Cómo hice una landing que convirtió 3x más usando IA',
  '5 herramientas IA que uso en Fractal MX (y cuánto cuestan)',
  'Cómo hacer propuestas ganadoras con IA en 30 minutos'
];

async function generateVideoScript({ tema, duracion = '5-8 min' }) {
  const prompt = `Eres ALEX, content creator de Fractal MX.
Escribe un script para YouTube sobre: "${tema}"

CANAL: ${CHANNEL_CONFIG.nombre}
AUDIENCIA: ${CHANNEL_CONFIG.audiencia}
FORMATO: ${CHANNEL_CONFIG.formato}
ESTRUCTURA: ${CHANNEL_CONFIG.estructura}
ESTILO: ${CHANNEL_CONFIG.estilo}
DURACIÓN: ${duracion}

Reglas:
- Gancho en los primeros 15 segundos (una promesa o pregunta impactante)
- Sin intro con música larga
- Hablar directo al grano desde el segundo 1
- Máximo 150 palabras por minuto
- CTA al final: mencionar Fractal MX + ebook relacionado si aplica

Responde en JSON:
{
  "titulo": "...",
  "titulo_corto": "...",
  "descripcion_youtube": "...",
  "tags": ["..."],
  "gancho": "...",
  "script_completo": "...",
  "duracion_estimada_min": 6,
  "cta": "...",
  "ebook_relacionado": "p1|p2|p3|p4|p5|null"
}`;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-sonnet-4-6',
      max_tokens: 4000
    });
    const raw = (response.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[YouTube] generateVideoScript error:', err.message);
    return null;
  }
}

async function generateThumbnail({ titulo_corto, tema }) {
  const prompt = `Professional YouTube thumbnail for educational AI content.
Dark navy background (#1B263B). Bold impactful text placeholder area (top).
Fractal MX brand red accent (#C8102E) elements.
Clean, high contrast, readable at small size.
Abstract tech/AI visual elements — geometric, minimal.
No human faces. Professional modern design.
Style: similar to popular tech education channels.
Topic concept: "${titulo_corto || tema}"
1280x720px YouTube thumbnail format.`;

  try {
    const result = await higgsfield.generateImage(prompt, {
      model: 'gpt_image_2',
      aspectRatio: '16:9',
      quality: '2k'
    });
    return result.resultUrl;
  } catch (err) {
    console.warn('[YouTube] thumbnail generation error:', err.message);
    try {
      const fb = await higgsfield.generateImage(prompt, {
        model: 'nano_banana_2',
        aspectRatio: '16:9',
        quality: '2k'
      });
      return fb.resultUrl;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Genera un video completo: script + thumbnail + metadata.
 * El video en sí (faceless + voz) requiere herramienta externa o Higgsfield Seedance.
 *
 * @param {string|object} temaOrConfig - tema del video o config completa
 * @returns {object} contenido listo para revisión de NKD
 */
async function generateYouTubeVideo(temaOrConfig) {
  const tema = typeof temaOrConfig === 'string' ? temaOrConfig : temaOrConfig.tema;
  console.log(`🎬 [YouTube] Generando video: "${tema}"`);

  // Generar script y thumbnail en paralelo
  const [script, thumbnail] = await Promise.allSettled([
    generateVideoScript({ tema }),
    generateThumbnail({ tema })
  ]);

  const scriptData = script.status === 'fulfilled' ? script.value : null;
  const thumbnailUrl = thumbnail.status === 'fulfilled' ? thumbnail.value : null;

  if (!scriptData) {
    console.error('[YouTube] Script generation failed');
    return { success: false, error: 'Script generation failed' };
  }

  // Guardar en Supabase si tabla existe
  let savedId = null;
  try {
    const { data } = await supabase.from('youtube_content').insert({
      titulo: scriptData.titulo,
      titulo_corto: scriptData.titulo_corto,
      tema,
      script: scriptData.script_completo,
      descripcion: scriptData.descripcion_youtube,
      tags: scriptData.tags,
      thumbnail_url: thumbnailUrl,
      duracion_estimada: scriptData.duracion_estimada_min,
      cta: scriptData.cta,
      ebook_relacionado: scriptData.ebook_relacionado,
      status: 'pendiente_aprobacion_nkd',
      creado_por: 'alex'
    }).select('id').single();
    savedId = data?.id;
  } catch (_) { /* tabla puede no existir aún */ }

  const mensaje = `🎬 Video YouTube listo

Título: "${scriptData.titulo}"
Duración: ~${scriptData.duracion_estimada_min} min
Thumbnail: ${thumbnailUrl ? '✅' : '❌'}

Gancho: "${(scriptData.gancho || '').substring(0, 80)}..."

⏭️ Próximo paso: grabar narración con ElevenLabs o app de voz.
El script está completo y aprobado por ALEX.

Responde APROBADO para publicar.`;

  try { await notifyNeiky(mensaje); } catch (_) {}

  console.log(`✅ [YouTube] "${scriptData.titulo}" generado — thumbnail=${!!thumbnailUrl}, id=${savedId}`);

  return {
    success: true,
    titulo: scriptData.titulo,
    script: scriptData,
    thumbnail_url: thumbnailUrl,
    supabase_id: savedId
  };
}

/**
 * Genera 2 videos semanales basados en temas del banco.
 * Diseñado para correr automáticamente (ej: lunes y jueves).
 */
async function generateWeeklyVideos() {
  const temas = TEMAS_RECURRENTES.sort(() => Math.random() - 0.5).slice(0, 2);
  const [v1, v2] = await Promise.allSettled(temas.map(generateYouTubeVideo));

  return {
    video1: v1.status === 'fulfilled' ? v1.value : { error: v1.reason?.message },
    video2: v2.status === 'fulfilled' ? v2.value : { error: v2.reason?.message }
  };
}

module.exports = { generateYouTubeVideo, generateWeeklyVideos, CHANNEL_CONFIG, TEMAS_RECURRENTES };
