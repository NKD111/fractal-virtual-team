// backend/src/services/landing-cinematografica.js
// BLOQUE O — Landing Page Cinematográfica
// Precio: $1,500 USD (estándar) / $3,000 USD (premium)
// Stack: Next.js + Framer Motion + Higgsfield

const higgsfield = require('../core/higgsfield-client');
const { chat } = require('../core/anthropic');
const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

const SECCIONES_BASE = [
  'hero', 'problema', 'solucion', 'diferenciadores',
  'prueba_social', 'proceso', 'precios', 'faq', 'cta_final', 'footer'
];

/**
 * Genera el copywriting completo de una landing cinematográfica.
 *
 * @param {object} cliente_data - datos del cliente
 * @param {string} tipo - 'estandar' | 'premium'
 * @returns {object} copy por sección + prompt para imagen hero
 */
async function generarCopy(cliente_data, tipo = 'estandar') {
  const prompt = `Eres ALEX de Fractal MX. Genera el copywriting completo para una landing page
cinematográfica de alto impacto.

CLIENTE: ${cliente_data.empresa}
PRODUCTO/SERVICIO: ${cliente_data.producto}
AUDIENCIA OBJETIVO: ${cliente_data.audiencia}
CTA PRINCIPAL: ${cliente_data.cta}
PROPUESTA DE VALOR ÚNICA: ${cliente_data.uvp || 'no especificada'}
TIPO: ${tipo.toUpperCase()} ($${tipo === 'estandar' ? '1,500' : '3,000'} USD)

Genera copy para estas secciones en JSON:
{
  "hero": { "headline": "...", "subheadline": "...", "cta_button": "..." },
  "problema": { "titulo": "...", "descripcion": "...", "pain_points": ["..."] },
  "solucion": { "titulo": "...", "descripcion": "...", "beneficios": ["..."] },
  "diferenciadores": { "titulo": "...", "items": [{ "titulo": "...", "descripcion": "..." }] },
  "prueba_social": { "titulo": "...", "testimonios_placeholder": ["..."] },
  "proceso": { "titulo": "...", "pasos": [{ "numero": 1, "titulo": "...", "descripcion": "..." }] },
  "precios": { "titulo": "...", "plan_principal": { "nombre": "...", "precio": "...", "beneficios": ["..."] } },
  "faq": { "titulo": "...", "preguntas": [{ "pregunta": "...", "respuesta": "..." }] },
  "cta_final": { "headline": "...", "subheadline": "...", "cta_button": "...", "garantia": "..." },
  "meta": {
    "titulo_seo": "...",
    "descripcion_seo": "...",
    "og_description": "...",
    "hero_prompt": "prompt en inglés para GPT Image 2, imagen cinematográfica hero, sin texto"
  }
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
    console.error('[Landing] generarCopy error:', err.message);
    throw new Error(`Copy generation failed: ${err.message}`);
  }
}

/**
 * Genera imagen hero cinematográfica con Higgsfield.
 *
 * @param {string} heroPrompt - prompt para la imagen
 * @param {string} industria - para contextualizar el estilo
 * @returns {string|null} URL de la imagen hero
 */
async function generarImagenHero(heroPrompt, industria = '') {
  const fullPrompt = `${heroPrompt}
Cinematic high-quality photography or render.
Premium aspirational feel. Ultra-wide 16:9 composition.
Clean areas on left side for text overlay.
No text, no logos, no distracting elements.
Professional lighting. Depth of field.
Suitable as website hero background image.
Industry: ${industria}.`;

  try {
    const result = await higgsfield.generateImage(fullPrompt, {
      model: 'gpt_image_2',
      aspectRatio: '16:9',
      quality: '2k'
    });
    return result.resultUrl;
  } catch (err) {
    console.warn('[Landing] hero gpt_image_2 falló, usando nano_banana_2:', err.message);
    try {
      const fb = await higgsfield.generateImage(fullPrompt, {
        model: 'nano_banana_2',
        aspectRatio: '16:9',
        quality: '2k'
      });
      return fb.resultUrl;
    } catch (_) { return null; }
  }
}

/**
 * Genera el componente Next.js base para la landing.
 * Produce código listo para copiar en el proyecto frontend.
 */
async function generarComponenteNextJS(copy, hero_url, cliente_data) {
  const prompt = `Genera el código de una landing page en Next.js + Tailwind CSS.

COPY: ${JSON.stringify({ hero: copy.hero, secciones_resumen: 'ver copy completo' })}
HERO URL: ${hero_url || 'https://placeholder.com/hero.jpg'}
EMPRESA: ${cliente_data.empresa}
COLOR PRIMARIO: ${cliente_data.color_primario || '#0B2A4A'}
COLOR ACENTO: ${cliente_data.color_acento || '#D7193F'}

Genera un componente React (Next.js 14 App Router) con:
- Sección hero con imagen de fondo + overlay + headline + CTA
- Animaciones con className (no Framer Motion para simplificar)
- Tailwind CSS para estilos
- Responsive mobile-first
- Scroll suave entre secciones
- Solo la sección Hero y Problema para este snippet

Código limpio y listo para usar. Solo JSX + Tailwind.`;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-sonnet-4-6',
      max_tokens: 3000
    });
    return response.content || '';
  } catch (err) {
    console.warn('[Landing] generarComponente error:', err.message);
    return '';
  }
}

/**
 * Pipeline completo de landing cinematográfica.
 * Copy + imagen hero + componente Next.js base.
 *
 * @param {object} cliente_data - { empresa, producto, audiencia, cta, uvp, industria, color_primario, color_acento }
 * @param {string} tipo - 'estandar' | 'premium'
 * @returns {object} resultados completos
 */
async function crearLanding(cliente_data, tipo = 'estandar') {
  console.log(`🎬 [Landing] Creando landing ${tipo}: ${cliente_data.empresa}`);

  // Generar copy primero (necesario para el resto)
  const copy = await generarCopy(cliente_data, tipo);

  // Luego imagen hero y componente en paralelo
  const heroPrompt = copy?.meta?.hero_prompt || `Cinematic ${cliente_data.industria || 'business'} scene. Premium quality.`;
  const [heroUrl, componente] = await Promise.allSettled([
    generarImagenHero(heroPrompt, cliente_data.industria),
    generarComponenteNextJS(copy, null, cliente_data)
  ]);

  const hero_url = heroUrl.status === 'fulfilled' ? heroUrl.value : null;
  const codigo_nextjs = componente.status === 'fulfilled' ? componente.value : '';

  // Guardar en Supabase
  let projectId = null;
  try {
    const { data } = await supabase.from('projects').insert({
      name: `Landing Cinematográfica — ${cliente_data.empresa}`,
      client_name: cliente_data.empresa,
      project_type: 'landing_cinematografica',
      status: 'en_produccion',
      budget_mxn: tipo === 'estandar' ? 28500 : 57000, // ~$1,500 y $3,000 USD aprox
      notes: `Tipo: ${tipo} | Hero: ${hero_url ? 'generado' : 'pendiente'}`
    }).select('id').single();
    projectId = data?.id;
  } catch (_) {}

  const resumen = `🎬 Landing Cinematográfica lista

Cliente: ${cliente_data.empresa}
Tipo: ${tipo.toUpperCase()} ($${tipo === 'estandar' ? '1,500' : '3,000'} USD)
Hero: ${hero_url ? '✅ imagen generada' : '❌ pendiente'}
Copy: ✅ ${SECCIONES_BASE.length} secciones

Headline: "${copy?.hero?.headline}"
CTA principal: "${copy?.hero?.cta_button}"

⏭️ PRÓXIMO PASO:
1. Revisar y ajustar el copy
2. Integrar en proyecto Next.js (ver código generado)
3. Deploy en Vercel con dominio del cliente`;

  try { await notifyNeiky(resumen); } catch (_) {}

  console.log(`✅ [Landing] "${cliente_data.empresa}" — hero=${!!hero_url}, copy_secciones=${Object.keys(copy || {}).length}`);

  return {
    success: true,
    tipo,
    empresa: cliente_data.empresa,
    copy,
    hero_url,
    codigo_nextjs,
    project_id: projectId,
    secciones: SECCIONES_BASE,
    precio_usd: tipo === 'estandar' ? 1500 : 3000
  };
}

module.exports = { crearLanding, generarCopy, generarImagenHero, SECCIONES_BASE };
