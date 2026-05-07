// backend/src/routines/season-detector.js
// TAREA 5 — Detección de Temporadas y Oportunidades Comerciales
// Cron: 0 9 1 * * (día 1 de cada mes, 9 AM CDMX)
// Modelo: Sonnet
//
// Detecta eventos, fechas especiales y temporadas de los próximos 60 días
// y cómo monetizarlos para Fractal MX.
// Output directo a NKD por WhatsApp.

'use strict';

const { chat }        = require('../core/anthropic');
const { notifyNeiky } = require('../core/whatsapp');
const { supabase }    = require('../core/supabase');

const MODEL   = 'claude-sonnet-4-6';
const TZ_OPT  = { timezone: 'America/Mexico_City' };

// ── Contexto de negocio de Fractal MX ────────────────────────────────────────

const FRACTAL_CONTEXT = `
FRACTAL MX — Agencia creativa AI-powered en CDMX.
Servicios principales:
- Parrilla mensual de redes sociales ($800-1,200 USD/mes)
- Auditoría digital ($300-800 USD)
- Landing cinematográfica ($1,500-3,000 USD)
- Videos y reels para redes
- Identidad visual y branding

Clientes tipo:
- PyMEs CDMX (comercios, restaurantes, clínicas, despachos)
- Empresas de franquicias (FIF, EFG — clientes actuales)
- Emprendedores que buscan presencia digital profesional
- Negocios en crecimiento que quieren escalar con contenido

Canal de venta: WhatsApp + Instagram DM → Mariana
Cierre: Neiky directamente
`.trim();

// ── Calendarios de referencia ─────────────────────────────────────────────────

function getNextTwoMonthsContext() {
  const now = new Date();
  const mes1 = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const mes2 = next.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  return { mes1, mes2, fechaActual: now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) };
}

// ── Clientes activos para personalizar oportunidades ─────────────────────────

async function getActiveClients() {
  try {
    const { data } = await supabase
      .from('clients')
      .select('name, industry')
      .order('created_at', { ascending: false })
      .limit(10);
    return (data || []).map(c => `${c.name} (${c.industry || 'sin industria'})`).join(', ');
  } catch { return 'FIF (franquicias), clientes PyME CDMX'; }
}

// ── Generación del análisis ───────────────────────────────────────────────────

async function detectSeasons() {
  const { mes1, mes2, fechaActual } = getNextTwoMonthsContext();
  const clientesActivos = await getActiveClients();

  const prompt = `${FRACTAL_CONTEXT}

Clientes actuales: ${clientesActivos}
Fecha de hoy: ${fechaActual}

TAREA: Detecta TODAS las oportunidades comerciales de los próximos 60 días para Fractal MX.

Analiza:
1. Días festivos mexicanos (oficiales y comerciales)
2. Temporadas comerciales importantes (Buen Fin, San Valentín, regreso a clases, etc.)
3. Eventos del calendario empresarial mexicano (ferias, expos, congresos relevantes)
4. Fechas clave para PyMEs CDMX (quincenas, fin de mes, inicio de trimestre)
5. Tendencias de contenido en redes que se activan en estas fechas
6. Oportunidades específicas para los clientes actuales de Fractal MX

Para cada oportunidad importante, genera:
- Fecha exacta o rango
- Nombre del evento/temporada
- Cómo monetizarlo para Fractal MX (qué servicio ofrecer)
- Urgencia: cuántos días quedan para proponer
- Cliente objetivo: ¿aplica para FIF, PyME genérica, o ambos?

Selecciona las 5-7 MEJORES oportunidades (las más accionables y con mayor potencial de revenue).

Responde en este formato WhatsApp EXACTO (máximo 300 palabras):

📅 OPORTUNIDADES PRÓXIMOS 60 DÍAS:
(${mes1} — ${mes2})

→ [Fecha]: [Evento]
  Oportunidad: [cómo monetizarlo con servicio específico + precio estimado]
  Urgencia: X días para propuesta
  Cliente: [FIF/PyME/ambos]

[repetir para cada oportunidad]

─────────────────
ACCIÓN SUGERIDA:
[La oportunidad MÁS urgente con instrucción específica para NKD — qué escribir, a quién, hoy]`;

  try {
    const result = await chat({
      model: MODEL,
      system: `Eres el sistema de inteligencia comercial de Fractal MX.
Detectas oportunidades de negocio concretas y das instrucciones accionables.
Conoces el mercado de agencias creativas en CDMX y las PyMEs mexicanas.
Siempre basas tus recomendaciones en el contexto real del negocio.`,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.5
    });
    return result.content.trim();
  } catch (err) {
    // Fallback sin IA
    const { mes1: m } = getNextTwoMonthsContext();
    return `📅 OPORTUNIDADES PRÓXIMOS 60 DÍAS (${m}):\n\nNo se pudo generar análisis automático (${err.message.substring(0, 60)}).\nRevisa manualmente el calendario de fechas especiales para propuestas de contenido.\n\nACCIÓN SUGERIDA:\nRevisar el calendario del mes y enviar propuesta de parrilla estacional a clientes activos.`;
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

async function runSeasonDetector() {
  const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  console.log(`[SeasonDetector] Analizando temporadas — ${now}`);

  try {
    const analysis = await detectSeasons();

    const mensaje = `🤖 FRACTAL MX — Inteligencia Comercial\n${now}\n\n${analysis}`;
    await notifyNeiky(mensaje);
    console.log('[SeasonDetector] ✅ Análisis enviado a NKD');

    // Guardar en memoria para referencia futura
    try {
      const { saveMemory } = require('../core/memory-engine');
      await saveMemory({
        tipo: 'aprendizaje',
        contenido: JSON.stringify({
          tipo: 'season_detection',
          mes: new Date().toISOString().substring(0, 7),
          analysis: analysis.substring(0, 500)
        })
      });
    } catch { /* non-fatal */ }

    return { success: true, analysis };

  } catch (err) {
    console.error('[SeasonDetector] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Cron ──────────────────────────────────────────────────────────────────────

function startSeasonDetectorCron() {
  try {
    const cron = require('node-cron');
    // Día 1 de cada mes, 9 AM CDMX
    cron.schedule('0 9 1 * *', () => {
      runSeasonDetector().catch(e => console.error('[SeasonDetector] cron error:', e.message));
    }, TZ_OPT);
    console.log('✅ Season Detector: cron día 1 de cada mes (9 AM CDMX) activo');
  } catch (e) {
    console.warn('[SeasonDetector] No se pudo iniciar cron:', e.message);
  }
}

module.exports = { runSeasonDetector, startSeasonDetectorCron };
