// backend/src/routines/axiom-prospector.js
// AXIOM Prospecting v2 — scraping real de negocios CDMX via Apify Google Maps
// Pipeline: Apify → auditoría web → score digital → mensaje WA personalizado → tabla prospects
//
// Cron sugerido: semanal (domingos 8 AM CDMX) o manual via POST /api/axiom/prospect-scan

'use strict';

const axios = require('axios');
const https = require('https');
const { supabase } = require('../core/supabase');
const Anthropic = require('@anthropic-ai/sdk');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR = 'compass~crawler-google-places';
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// ─── CONFIGURACIÓN DE BÚSQUEDA ────────────────────────────────────────────────

const SEARCH_CONFIG = {
  industries: [
    { key: 'restaurantes',  queries: ['restaurante', 'cafetería', 'café', 'bistro', 'taquería'] },
    { key: 'belleza',       queries: ['salón de belleza', 'spa', 'estética', 'barbería'] },
    { key: 'fitness',       queries: ['estudio pilates', 'yoga', 'gimnasio boutique', 'crossfit'] },
    { key: 'boutique',      queries: ['boutique ropa', 'tienda moda', 'ropa mujer'] },
    { key: 'contadores',    queries: ['despacho contable', 'contador', 'asesoría fiscal'] },
  ],
  zones: [
    'Polanco, Ciudad de México',
    'Condesa, Ciudad de México',
    'Roma Norte, Ciudad de México',
    'Del Valle, Ciudad de México',
    'Narvarte, Ciudad de México',
    'Coyoacán, Ciudad de México',
    'Naucalpan, Estado de México',
    'Tlalnepantla, Estado de México',
    'Atizapán de Zaragoza, Estado de México',
  ],
  maxPerSearch: 5,   // 5 resultados por búsqueda — ajustable
};

// ─── MÓDULO 1: APIFY — SCRAPING GOOGLE MAPS ──────────────────────────────────

async function scrapeGoogleMaps(searchQueries, locationQuery, maxResults = 20) {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_TOKEN no configurado en Railway env vars');

  console.log(`[AXIOM-P] Apify: "${searchQueries[0]}" en "${locationQuery}" (max ${maxResults})`);

  // Lanzar run del actor
  const runResp = await axios.post(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`,
    {
      searchStringsArray: searchQueries,
      locationQuery,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'es',
      scrapeSocialMediaProfiles: { facebooks: false, instagrams: false, youtubes: false, tiktoks: false, twitters: false },
      maximumLeadsEnrichmentRecords: 0,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  const runId = runResp.data?.data?.id;
  const datasetId = runResp.data?.data?.defaultDatasetId;
  if (!runId) throw new Error('Apify no retornó runId');

  // Polling hasta que termine (timeout: 3 minutos)
  let status = 'RUNNING';
  let attempts = 0;
  while (['RUNNING', 'READY'].includes(status) && attempts < 36) {
    await sleep(5000);
    const statusResp = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
      { timeout: 10000 }
    );
    status = statusResp.data?.data?.status;
    attempts++;
    console.log(`[AXIOM-P] Run ${runId}: ${status} (intento ${attempts})`);
  }

  if (status !== 'SUCCEEDED') throw new Error(`Apify run terminó con status: ${status}`);

  // Fetch resultados del dataset
  const dataResp = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json`,
    { timeout: 15000 }
  );

  const places = dataResp.data || [];
  console.log(`[AXIOM-P] Apify retornó ${places.length} lugares`);
  return places;
}

// ─── MÓDULO 2: AUDITORÍA WEB LIGERA ──────────────────────────────────────────

async function auditWebsite(url) {
  if (!url) return { score: 0, signals: { no_website: true } };

  const signals = {
    has_website: false,
    has_ssl: false,
    has_meta_description: false,
    has_whatsapp: false,
    has_analytics: false,
    has_mobile_viewport: false,
    has_social_links: false,
    has_contact_info: false,
    platform: 'unknown',
    load_time_ms: null,
  };

  try {
    const startTime = Date.now();
    const resp = await axios.get(url.startsWith('http') ? url : `https://${url}`, {
      timeout: 8000,
      maxRedirects: 3,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalAudit/1.0)' },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });
    signals.load_time_ms = Date.now() - startTime;
    signals.has_website = true;
    signals.has_ssl = resp.config?.url?.startsWith('https');

    const html = resp.data || '';

    signals.has_meta_description = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}/i.test(html);
    signals.has_whatsapp = /wa\.me|whatsapp\.com\/send|whatsapp/i.test(html);
    signals.has_analytics = /gtag\(|google-analytics|googletagmanager|fbq\(|_gaq/i.test(html);
    signals.has_mobile_viewport = /name=["']viewport["']/i.test(html);
    signals.has_social_links = /instagram\.com|facebook\.com|tiktok\.com|linkedin\.com/i.test(html);
    signals.has_contact_info = /tel:|mailto:|whatsapp|contacto|contact/i.test(html);

    // Detectar plataforma
    if (/wsimg\.com|godaddy/i.test(html)) signals.platform = 'GoDaddy';
    else if (/wixsite\.com|wix\.com/i.test(html)) signals.platform = 'Wix';
    else if (/squarespace/i.test(html)) signals.platform = 'Squarespace';
    else if (/shopify/i.test(html)) signals.platform = 'Shopify';
    else if (/wordpress|wp-content/i.test(html)) signals.platform = 'WordPress';
    else if (/webflow/i.test(html)) signals.platform = 'Webflow';
    else if (/<html/i.test(html)) signals.platform = 'custom';

  } catch (err) {
    signals.has_website = false;
    signals.error = err.code || err.message?.substring(0, 50);
  }

  // Score digital: qué tan buena es su presencia (0-100)
  let score = 0;
  if (signals.has_website)            score += 20;
  if (signals.has_ssl)                score += 10;
  if (signals.has_meta_description)   score += 15;
  if (signals.has_whatsapp)           score += 15;
  if (signals.has_analytics)          score += 20;
  if (signals.has_mobile_viewport)    score += 10;
  if (signals.has_social_links)       score +=  5;
  if (signals.has_contact_info)       score +=  5;
  if (signals.load_time_ms && signals.load_time_ms < 2000) score += 0; // bonus ya incluido en website

  // Penalizar builders básicos (oportunidad de upgrade)
  if (['GoDaddy', 'Wix', 'Squarespace'].includes(signals.platform)) score = Math.max(score - 10, 0);

  return { score: Math.min(score, 100), signals };
}

// ─── MÓDULO 3: SCORING DE PROSPECTO ──────────────────────────────────────────

function scoreProspect(place, auditResult) {
  // prospect_score: qué tan atractivo es para Fractal MX (0-100)
  // Invertir lógica: peor digital = mayor oportunidad
  let score = 100 - auditResult.score;

  // Bonificaciones
  if (place.phone) score = Math.min(score + 5, 100);   // tiene teléfono → contactable
  if (!place.website) score = Math.min(score + 10, 100); // sin web → urgente
  if (place.totalScore >= 4.0) score = Math.min(score + 5, 100); // bien valorado → tiene clientes

  return Math.round(score);
}

// ─── MÓDULO 4: GENERADOR DE MENSAJES WHATSAPP ────────────────────────────────

async function generateWhatsAppMessage(place, auditResult, industry) {
  if (!anthropic) return generarMensajeFallback(place, auditResult);

  const problems = [];
  const s = auditResult.signals;
  if (!s.has_website)          problems.push('no tienen sitio web');
  if (!s.has_whatsapp && s.has_website) problems.push('su sitio no tiene botón de WhatsApp');
  if (!s.has_analytics && s.has_website) problems.push('no están midiendo visitas ni conversiones');
  if (!s.has_meta_description && s.has_website) problems.push('no aparecen bien en Google');
  if (['GoDaddy', 'Wix'].includes(s.platform)) problems.push(`su sitio está en ${s.platform} (limitado para marketing)`);

  const mainProblem = problems[0] || 'su presencia digital tiene oportunidades de mejora';
  const serviceMap = {
    restaurantes: 'landing cinematográfica con menú y reservas',
    belleza: 'landing + galería de trabajos para captar citas',
    fitness: 'landing de alta conversión con clase de prueba gratis',
    boutique: 'tienda digital con catálogo y WhatsApp de ventas',
    contadores: 'landing profesional para captar clientes PyME',
  };
  const servicio = serviceMap[industry] || 'sitio web profesional';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Eres Mariana, ejecutiva de Fractal MX (agencia digital mexicana).
Escribe un mensaje de WhatsApp corto (máx 4 líneas) para contactar en frío a este negocio.

Negocio: ${place.title}
Industria: ${industry}
Zona: ${place.address?.split(',').slice(-2).join(',')}
Problema detectado: ${mainProblem}
Servicio que ofreces: ${servicio}
Rating Google: ${place.totalScore || 'N/A'} (${place.reviewsCount || 0} reseñas)

Reglas:
- Menciona el nombre del negocio
- Menciona algo específico que viste (el problema)
- CTA claro (una pregunta o propuesta concreta)
- Tono: profesional pero natural, NO robótico, NO genérico
- En español mexicano, sin emojis excesivos
- Máx 4 líneas

Solo el mensaje, sin explicaciones.`
      }]
    });
    return response.content[0]?.text?.trim() || generarMensajeFallback(place, auditResult);
  } catch {
    return generarMensajeFallback(place, auditResult);
  }
}

function generarMensajeFallback(place, auditResult) {
  if (!auditResult.signals.has_website) {
    return `Hola, vi ${place.title} en Google Maps y quería preguntarles algo rápido: ¿están pensando en crear un sitio web para su negocio? En Fractal MX hacemos landings que generan contactos desde el día 1. ¿Les interesaría ver un ejemplo de su industria?`;
  }
  return `Hola, soy Mariana de Fractal MX. Revisé el sitio de ${place.title} y vi que hay algunas cosas que podríamos mejorar para que les lleguen más clientes desde Google. ¿Tienen 10 minutos esta semana para platicar?`;
}

// ─── PIPELINE COMPLETO ────────────────────────────────────────────────────────

async function runProspectScan({ industries, zones, maxPerSearch, dryRun = false } = {}) {
  const cfg = {
    industries: industries || SEARCH_CONFIG.industries.map(i => i.key),
    zones: zones || SEARCH_CONFIG.zones,
    maxPerSearch: maxPerSearch || SEARCH_CONFIG.maxPerSearch,
  };

  console.log(`[AXIOM-P] Iniciando prospect scan | ${cfg.industries.length} industrias × ${cfg.zones.length} zonas`);

  const results = { inserted: 0, skipped: 0, errors: 0, prospects: [] };

  for (const industryDef of SEARCH_CONFIG.industries.filter(i => cfg.industries.includes(i.key))) {
    for (const zone of cfg.zones) {
      try {
        // Step 1: Scrape Google Maps via Apify
        const places = await scrapeGoogleMaps(industryDef.queries, zone, cfg.maxPerSearch);

        for (const place of places) {
          try {
            // Filtrar sin teléfono ni web (no contactables)
            if (!place.phone && !place.website) { results.skipped++; continue; }

            // Step 2: Auditar web
            const auditResult = await auditWebsite(place.website);
            await sleep(300); // throttle

            // Step 3: Score de prospecto
            const prospectScore = scoreProspect(place, auditResult);

            // Descartar si ya es muy buena digitalmente (score < 20 = no son prospecto)
            if (prospectScore < 20) { results.skipped++; continue; }

            // Step 4: Generar mensaje WA
            const mensajeWa = dryRun
              ? '[DRY RUN - mensaje no generado]'
              : await generateWhatsAppMessage(place, auditResult, industryDef.key);

            const servicio = getServicioSugerido(prospectScore, auditResult);
            const precioStr = getPrecioSugerido(prospectScore, auditResult);
            // precio_sugerido es INTEGER en el schema — extraer solo el número
            const precioNum = parseInt(precioStr.replace(/[^0-9]/g, '')) || 0;

            const prospectData = {
              nombre_empresa: place.title,
              industria: industryDef.key,
              ciudad: zone,          // columna existente
              zona: zone,            // columna nueva añadida
              contacto_whatsapp: place.phone || null,  // columna existente
              website: place.website || null,
              direccion: place.address || null,
              google_maps_url: place.url || null,
              rating_google: place.totalScore || null,
              reviews_count: place.reviewsCount || 0,
              score: prospectScore,
              digital_score: auditResult.score,
              digital_signals: auditResult.signals,
              servicio_sugerido: servicio,
              precio_sugerido: precioNum,
              mensaje_contacto: mensajeWa,  // columna existente
              status: 'pendiente_aprobacion',
              aprobado_nkd: false,
              enviado_mariana: false,
              updated_at: new Date().toISOString(),
            };

            if (!dryRun) {
              const { error } = await supabase.from('prospects').upsert(prospectData, {
                onConflict: 'nombre_empresa,telefono',
                ignoreDuplicates: true,
              });
              if (error) { console.error('[AXIOM-P] Insert error:', error.message); results.errors++; continue; }
            }

            results.inserted++;
            results.prospects.push({
              nombre: place.title,
              score: prospectScore,
              digital_score: auditResult.score,
              telefono: place.phone,
              website: place.website,
              servicio: prospectData.servicio_sugerido,
              precio: prospectData.precio_sugerido,
              mensaje: mensajeWa,
            });

          } catch (placeErr) {
            console.error(`[AXIOM-P] Error procesando ${place.title}:`, placeErr.message);
            results.errors++;
          }
        }

        await sleep(1000); // pausa entre zonas
      } catch (scanErr) {
        console.error(`[AXIOM-P] Error scraping ${industryDef.key}/${zone}:`, scanErr.message);
        results.errors++;
      }
    }
  }

  // Log en audit_log
  try {
    await supabase.from('audit_log').insert({
      actor: 'axiom',
      action: 'prospect_scan_completed',
      service: 'axiom_prospector',
      status: results.inserted > 0 ? 'success' : 'empty',
      details: { ...results, prospects: undefined },
    });
  } catch (_) {}

  console.log(`[AXIOM-P] Scan completo: ${results.inserted} insertados, ${results.skipped} descartados, ${results.errors} errores`);
  return results;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getServicioSugerido(prospectScore, auditResult) {
  const s = auditResult.signals;
  if (!s.has_website) return 'landing_cinematografica';
  if (['GoDaddy', 'Wix', 'Squarespace'].includes(s.platform)) return 'landing_cinematografica';
  if (!s.has_analytics) return 'auditoria_digital';
  if (!s.has_whatsapp) return 'auditoria_digital';
  return 'auditoria_digital';
}

function getPrecioSugerido(prospectScore, auditResult) {
  const servicio = getServicioSugerido(prospectScore, auditResult);
  if (servicio === 'landing_cinematografica') {
    return prospectScore >= 70 ? '$1,500 USD' : '$1,500 USD';
  }
  return prospectScore >= 60 ? '$800 USD (Completa)' : '$300 USD (Básica)';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

function status() {
  return {
    apify_configured: !!APIFY_TOKEN,
    claude_configured: !!anthropic,
    industries: SEARCH_CONFIG.industries.map(i => i.key),
    zones_count: SEARCH_CONFIG.zones.length,
    max_per_search: SEARCH_CONFIG.maxPerSearch,
    estimated_prospects_per_scan: SEARCH_CONFIG.industries.length * SEARCH_CONFIG.zones.length * SEARCH_CONFIG.maxPerSearch,
    apify_cost_usd_per_scan: ((SEARCH_CONFIG.industries.length * SEARCH_CONFIG.zones.length * SEARCH_CONFIG.maxPerSearch) / 1000 * 2.10).toFixed(3),
  };
}

module.exports = { runProspectScan, auditWebsite, status };
