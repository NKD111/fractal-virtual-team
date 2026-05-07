// backend/src/routines/upsell-engine.js
// TAREA 6 — Auto-Propuesta de Upsell
// Cron: 0 10 15 * * (día 15 de cada mes, 10 AM CDMX)
// Modelo: Sonnet
//
// Analiza cada cliente activo y genera automáticamente una propuesta de upsell
// basada en lo que está pasando en su negocio y en el historial con Fractal MX.
//
// Flujo:
//   1. Analiza clientes activos
//   2. Genera propuesta de upsell con Claude
//   3. Envía a NKD por WhatsApp pidiendo confirmación ("SI")
//   4. Si NKD responde SI → Mariana prepara propuesta formal
//
// La detección de "SI" la maneja mariana.agent.js (command parser)

'use strict';

const { chat }        = require('../core/anthropic');
const { notifyNeiky } = require('../core/whatsapp');
const { supabase }    = require('../core/supabase');

const MODEL   = 'claude-sonnet-4-6';
const TZ_OPT  = { timezone: 'America/Mexico_City' };

// ── Catálogo de servicios de Fractal MX para upsell ──────────────────────────

const SERVICIOS_UPSELL = {
  parrilla_premium: { nombre: 'Parrilla Premium (30 piezas + Reels)', precio_usd: 1500, descripcion: 'upgrade desde parrilla básica' },
  video_institucional: { nombre: 'Video Institucional 60s', precio_usd: 800, descripcion: 'para clientes con 3+ meses' },
  landing_cinematografica: { nombre: 'Landing Page Cinematográfica', precio_usd: 2000, descripcion: 'para clientes sin web o con web anticuada' },
  auditoria_digital: { nombre: 'Auditoría Digital Completa', precio_usd: 500, descripcion: 'para clientes nuevos con 1 mes' },
  campana_evento: { nombre: 'Campaña Especial Evento/Temporada', precio_usd: 1200, descripcion: 'para fechas especiales próximas' },
  identidad_visual: { nombre: 'Rebranding / Identidad Visual', precio_usd: 2500, descripcion: 'para clientes con imagen desactualizada' },
  contenido_youtube: { nombre: 'Canal YouTube (4 videos/mes)', precio_usd: 1800, descripcion: 'para clientes con audiencia establecida' },
  kit_expositor: { nombre: 'Kit Expositor Completo (FIF/EFG)', precio_usd: 3000, descripcion: 'para clientes de franquicias' }
};

// ── Datos del cliente ─────────────────────────────────────────────────────────

async function getActiveClientsWithHistory() {
  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, tier, industry, created_at')
      .order('created_at', { ascending: true })
      .limit(20);

    if (!clients?.length) return [];

    // Para cada cliente, obtener resumen de actividad
    const enriched = await Promise.all(
      (clients || []).map(async (client) => {
        try {
          const mesActual = new Date().toISOString().substring(0, 7);

          // Contar meses activos (aproximado desde created_at)
          const creado = new Date(client.created_at);
          const ahora  = new Date();
          const mesesActivos = Math.round((ahora - creado) / (1000 * 60 * 60 * 24 * 30));

          // Briefs del mes
          const { data: briefs } = await supabase
            .from('parrilla_briefs')
            .select('status, tipo_pieza')
            .ilike('cliente', `%${client.name.split(' ')[0]}%`)
            .eq('mes', mesActual);

          // Revenue de facturas
          const { data: invoices } = await supabase
            .from('invoices')
            .select('total, status, currency')
            .eq('client_id', client.id)
            .in('status', ['paid', 'sent', 'confirmed'])
            .order('created_at', { ascending: false })
            .limit(3);

          const revenueTotal = (invoices || []).reduce((s, i) => s + (i.total || 0), 0);
          const serviciosActivos = [...new Set((briefs || []).map(b => b.tipo_pieza))];

          return {
            ...client,
            meses_activos: mesesActivos,
            briefs_mes: (briefs || []).length,
            servicios_activos: serviciosActivos,
            revenue_total_mxn: revenueTotal,
            tiene_parrilla: (briefs || []).length > 0,
            tiene_landing: false, // TODO: detectar de projects
          };
        } catch { return { ...client, meses_activos: 0, briefs_mes: 0, servicios_activos: [], revenue_total_mxn: 0 }; }
      })
    );

    return enriched;
  } catch (e) {
    console.warn('[UpsellEngine] getActiveClients error:', e.message);
    return [];
  }
}

// ── Análisis de upsell por cliente ───────────────────────────────────────────

async function analyzeUpsellOpportunity(client) {
  const contextoCliente = `
Cliente: ${client.name}
Industria: ${client.industry || 'no especificada'}
Tier: ${client.tier || 'standard'}
Meses activo con Fractal MX: ${client.meses_activos}
Piezas este mes: ${client.briefs_mes}
Servicios actuales: ${client.servicios_activos.join(', ') || 'ninguno registrado'}
Revenue histórico: $${client.revenue_total_mxn.toLocaleString()} MXN
Tiene parrilla mensual: ${client.tiene_parrilla ? 'sí' : 'no'}
`.trim();

  const catalogo = Object.entries(SERVICIOS_UPSELL)
    .map(([k, v]) => `- ${v.nombre}: $${v.precio_usd} USD (${v.descripcion})`)
    .join('\n');

  const prompt = `Eres el sistema de upsell de Fractal MX.
Analiza este cliente y determina si existe una oportunidad real de upsell AHORA.

${contextoCliente}

Catálogo de servicios disponibles:
${catalogo}

Mes actual: ${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' })}

REGLAS:
- Solo sugiere upsell si hay una razón ESPECÍFICA y CONCRETA ahora mismo
- Considera el momento del mes (día 15 — a mitad de mes es buen momento para proponer para el siguiente)
- Considera los meses de relación (cliente nuevo vs cliente maduro)
- No sugieras algo que ya tiene el cliente
- El precio debe ser realista para su nivel actual
- Si NO hay oportunidad clara, di "sin oportunidad" y explica por qué

Responde SOLO con JSON válido:
{
  "tiene_oportunidad": true/false,
  "servicio_sugerido": "nombre del servicio del catálogo",
  "precio_usd": 0,
  "situacion": "contexto del cliente que justifica el upsell (1-2 oraciones)",
  "por_que_ahora": "razón específica de timing (1 oración)",
  "revenue_potencial": 0,
  "mensaje_wa": "mensaje completo en formato WhatsApp (máximo 120 palabras) para NKD con el upsell detectado"
}`;

  try {
    const result = await chat({
      model: MODEL,
      system: 'Analizas oportunidades de upsell con criterio comercial. Solo propones cuando hay razón sólida.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.3
    });

    const raw = (result.content || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw);
  } catch {
    return { tiene_oportunidad: false };
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

async function runUpsellEngine() {
  const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  console.log(`[UpsellEngine] Analizando oportunidades — ${now}`);

  try {
    const clients = await getActiveClientsWithHistory();
    if (!clients.length) {
      console.log('[UpsellEngine] Sin clientes activos');
      return { success: true, opportunities: 0 };
    }

    const opportunities = [];

    for (const client of clients) {
      const analysis = await analyzeUpsellOpportunity(client);
      if (analysis.tiene_oportunidad) {
        opportunities.push({ client, analysis });
        console.log(`[UpsellEngine] Oportunidad detectada: ${client.name} → ${analysis.servicio_sugerido} ($${analysis.precio_usd} USD)`);
      }
    }

    if (!opportunities.length) {
      console.log('[UpsellEngine] Sin oportunidades de upsell este mes');
      return { success: true, opportunities: 0 };
    }

    // Enviar cada oportunidad como mensaje separado a NKD
    for (const { client, analysis } of opportunities) {
      const mensaje =
        `💰 UPSELL DETECTADO: ${client.name}\n` +
        `${now}\n\n` +
        `${analysis.mensaje_wa || ''}\n\n` +
        `Revenue potencial: $${analysis.revenue_potencial || analysis.precio_usd} USD\n\n` +
        `¿Quieres que Mariana prepare la propuesta?\n*Responde SI para activar.*\n\n` +
        `[upsell:${client.id}:${analysis.servicio_sugerido}]`;  // tag para parser de Mariana

      await notifyNeiky(mensaje);
      console.log(`[UpsellEngine] Upsell enviado para ${client.name}`);

      // Pausa entre mensajes para no saturar WhatsApp
      await new Promise(r => setTimeout(r, 2000));
    }

    // Guardar en oracle_memory
    try {
      const { saveMemory } = require('../core/memory-engine');
      for (const { client, analysis } of opportunities) {
        await saveMemory({
          tipo: 'aprendizaje',
          contenido: JSON.stringify({
            tipo: 'upsell_detectado',
            cliente: client.name,
            servicio: analysis.servicio_sugerido,
            precio_usd: analysis.precio_usd,
            mes: new Date().toISOString().substring(0, 7)
          })
        });
      }
    } catch { /* non-fatal */ }

    return { success: true, opportunities: opportunities.length, clients: opportunities.map(o => o.client.name) };

  } catch (err) {
    console.error('[UpsellEngine] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Cron ──────────────────────────────────────────────────────────────────────

function startUpsellEngineCron() {
  try {
    const cron = require('node-cron');
    // Día 15 de cada mes, 10 AM CDMX
    cron.schedule('0 10 15 * *', () => {
      runUpsellEngine().catch(e => console.error('[UpsellEngine] cron error:', e.message));
    }, TZ_OPT);
    console.log('✅ Upsell Engine: cron día 15 de cada mes (10 AM CDMX) activo');
  } catch (e) {
    console.warn('[UpsellEngine] No se pudo iniciar cron:', e.message);
  }
}

module.exports = { runUpsellEngine, startUpsellEngineCron, SERVICIOS_UPSELL };
