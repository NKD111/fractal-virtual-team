// backend/src/routines/axiom-scanner.js
// AXIOM — scanner de oportunidades de negocio para Fractal MX.
// Genera oportunidades usando Claude, las puntúa y las persiste en axiom_opportunities.
// Cron: cada 6 horas (00, 06, 12, 18 CDMX). También disparable vía POST /api/axiom/scan

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Contexto del negocio que AXIOM conoce
const BUSINESS_CONTEXT = `
Fractal MX es una agencia de diseño creativo y desarrollo digital en México.
Servicios principales: branding, identidad visual, diseño social media, videos animados,
sitios web, apps, contenido para redes, campañas digitales.
Clientes objetivo: PYMEs mexicanas, startups, restaurantes, tiendas, negocios locales.
Rango de precios: $5,000 - $80,000 MXN por proyecto.
Agentes internos: Mariana (ventas/WA), Diana (coordinación), Carlos/Diego/Alex (diseño),
Max/Valentina (video/animación), Lucas (análisis), Roberto (finanzas), Sofia (content).
Stack tecnológico: Railway, Supabase, Twilio, Stripe, Claude AI, ElevenLabs.
`.trim();

async function scoreOpportunity(opportunity) {
  // Scoring basado en 5 dimensiones (0-10 cada una, total max 50)
  const {
    implementation_days = 30,
    estimated_revenue_mxn = 0,
    category = '',
    description = ''
  } = opportunity;

  // Velocidad (qué tan rápido se puede implementar)
  const speed = implementation_days <= 3 ? 10
    : implementation_days <= 7 ? 8
    : implementation_days <= 14 ? 6
    : implementation_days <= 30 ? 4 : 2;

  // Inversión requerida (menos inversión = mayor score)
  const catLow = category.toLowerCase();
  const investment = catLow.includes('digital') || catLow.includes('content') ? 9
    : catLow.includes('template') || catLow.includes('producto') ? 7
    : catLow.includes('servicio') ? 6 : 5;

  // Revenue potencial
  const revenue = estimated_revenue_mxn >= 50000 ? 10
    : estimated_revenue_mxn >= 20000 ? 8
    : estimated_revenue_mxn >= 10000 ? 6
    : estimated_revenue_mxn >= 5000 ? 4 : 2;

  // Alineación con el negocio (heurística sobre descripción)
  const desc = (description || '').toLowerCase();
  const alignment = ['diseño', 'branding', 'social', 'contenido', 'agencia', 'cliente', 'video', 'web'].filter(k => desc.includes(k)).length >= 2 ? 9
    : ['digital', 'marketing', 'mexico', 'pyme'].filter(k => desc.includes(k)).length >= 1 ? 7 : 5;

  // Legal (default conservador)
  const legal = 8;

  const total = speed + investment + revenue + alignment + legal;

  return {
    score_speed: speed,
    score_investment: investment,
    score_revenue: revenue,
    score_alignment: alignment,
    score_legal: legal,
    score_total: total,
    score: Number((total / 50 * 10).toFixed(2)) // 0-10
  };
}

async function generateOpportunities(scanRunId) {
  if (!anthropic) {
    console.warn('[AXIOM] No ANTHROPIC_API_KEY — usando oportunidades heurísticas');
    return getHeuristicOpportunities();
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const timeContext = hour < 12 ? 'mañana de trabajo' : hour < 18 ? 'tarde productiva' : 'noche de análisis';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `Eres AXIOM, el sistema de inteligencia de oportunidades de Fractal MX.
Tu tarea es identificar oportunidades de negocio REALES y ACCIONABLES que Fractal MX puede aprovechar HOY o esta semana.

Contexto del negocio:
${BUSINESS_CONTEXT}

Devuelve EXACTAMENTE un JSON array con 3-5 oportunidades. Cada oportunidad:
{
  "title": "título corto y directo (max 60 chars)",
  "description": "descripción clara de la oportunidad y por qué es relevante ahora (2-3 frases)",
  "category": "upsell|nuevo_cliente|producto_digital|proceso|alianza|temporada",
  "source": "market_analysis",
  "urgency": "alta|media|baja",
  "estimated_revenue_mxn": número entero en MXN,
  "implementation_days": días para implementar,
  "suggested_action": { "immediate": "acción específica de hoy", "owner": "agente responsable" },
  "notes": "insight adicional"
}

Reglas:
- Oportunidades CONCRETAS para una agencia creativa mexicana
- Mezcla: 1 de alta urgencia, 2 de media, 1-2 de baja
- Revenue realista para PYMEs mexicanas ($5k-$80k MXN)
- NO markdown, solo JSON puro`,
      messages: [{
        role: 'user',
        content: `Es ${dateStr} (${timeContext}). Genera oportunidades de negocio para Fractal MX para las próximas 24-48 horas. Considera el día de la semana y la hora.`
      }]
    });

    const raw = response.content[0]?.text || '[]';
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error('[AXIOM] Claude error:', err.message, '— fallback heurístico');
    return getHeuristicOpportunities();
  }
}

function getHeuristicOpportunities() {
  const day = new Date().getDay(); // 0=Dom, 1=Lun...
  const isMonday = day === 1;
  const isFriday = day === 5;

  const base = [
    {
      title: 'Propuesta upsell diseño social media a cliente activo',
      description: 'Clientes con proyecto de branding cerrado tienen alta probabilidad de contratar contenido mensual. Contactar esta semana para propuesta de pack social media.',
      category: 'upsell',
      source: 'heuristic',
      urgency: 'alta',
      estimated_revenue_mxn: 12000,
      implementation_days: 3,
      suggested_action: { immediate: 'Mariana: identificar últimos 3 clientes de branding y enviar propuesta', owner: 'mariana' },
      notes: 'Conversión histórica de upsell post-branding: ~40%'
    },
    {
      title: 'Pack de plantillas Canva para restaurantes CDMX',
      description: 'Nicho de restaurantes locales necesita contenido visual semanal. Pack de 20 plantillas Canva personalizadas es producto rápido de $4,500 MXN con alta demanda.',
      category: 'producto_digital',
      source: 'heuristic',
      urgency: 'media',
      estimated_revenue_mxn: 18000,
      implementation_days: 7,
      suggested_action: { immediate: 'Diego: crear 3 mockups de ejemplo para galería', owner: 'diego' },
      notes: 'Producto escalable: mismo pack, múltiples clientes'
    },
    {
      title: 'Automatización WhatsApp Business para clientes actuales',
      description: 'Ofrecer como add-on el setup de WhatsApp Business con respuestas automáticas. Complementa servicios de diseño y abre nuevo ingreso recurrente.',
      category: 'nuevo_servicio',
      source: 'heuristic',
      urgency: 'media',
      estimated_revenue_mxn: 8000,
      implementation_days: 5,
      suggested_action: { immediate: 'Mariana: mencionar en siguiente cotización de diseño', owner: 'mariana' },
      notes: 'Setup único + mensualidad de mantenimiento'
    }
  ];

  if (isMonday) {
    base.push({
      title: 'Oferta lunes: descuento 10% en logo + identidad (válido esta semana)',
      description: 'Campaña de inicio de semana para activar leads inactivos de los últimos 30 días. Urgencia artificial con descuento por tiempo limitado.',
      category: 'temporada',
      source: 'heuristic',
      urgency: 'alta',
      estimated_revenue_mxn: 15000,
      implementation_days: 1,
      suggested_action: { immediate: 'Mariana: enviar mensaje a leads de las últimas 2 semanas', owner: 'mariana' },
      notes: 'Tiempo limitado: solo lunes-miércoles'
    });
  }

  if (isFriday) {
    base.push({
      title: 'Cierre de viernes: seguimiento a cotizaciones pendientes',
      description: 'Prospectos con cotización enviada hace 3-7 días sin respuesta tienen mejor tasa de cierre los viernes. Llamar antes de las 3 PM.',
      category: 'proceso',
      source: 'heuristic',
      urgency: 'alta',
      estimated_revenue_mxn: 25000,
      implementation_days: 1,
      suggested_action: { immediate: 'Mariana: revisar CRM y llamar a los 5 prospectos más calientes', owner: 'mariana' },
      notes: 'Las 11 AM-1 PM es el mejor horario para follow-up de cierre'
    });
  }

  return base;
}

async function runAxiomScan() {
  const scanRunId = uuidv4();
  console.log(`[AXIOM] Iniciando scan ${scanRunId}...`);

  let inserted = 0;
  let errors = 0;

  try {
    const raw = await generateOpportunities(scanRunId);
    console.log(`[AXIOM] ${raw.length} oportunidades generadas`);

    for (const opp of raw) {
      try {
        const scores = await scoreOpportunity(opp);

        // Solo insertar si score_total >= 30 (descarta basura)
        if (scores.score_total < 30) {
          console.log(`[AXIOM] Oportunidad descartada (score ${scores.score_total}): ${opp.title}`);
          continue;
        }

        const { error } = await supabase.from('axiom_opportunities').insert({
          scan_run_id: scanRunId,
          title: opp.title,
          description: opp.description,
          category: opp.category,
          source: opp.source || 'axiom_scan',
          source_url: opp.source_url || null,
          urgency: opp.urgency || 'media',
          estimated_revenue_mxn: opp.estimated_revenue_mxn || 0,
          implementation_days: opp.implementation_days || 7,
          suggested_action: opp.suggested_action || null,
          notes: opp.notes || null,
          status: 'detected',
          ...scores
        });

        if (error) {
          console.error(`[AXIOM] Insert error:`, error.message);
          errors++;
        } else {
          inserted++;
        }
      } catch (oppErr) {
        console.error(`[AXIOM] Error procesando oportunidad:`, oppErr.message);
        errors++;
      }
    }

    // Audit log
    try {
      await supabase.from('audit_log').insert({
        actor: 'axiom',
        action: 'scan_completed',
        service: 'axiom',
        status: inserted > 0 ? 'success' : 'empty',
        details: { scan_run_id: scanRunId, generated: raw.length, inserted, errors }
      });
    } catch (_) {}

    console.log(`[AXIOM] Scan ${scanRunId} completado: ${inserted} insertadas, ${errors} errores`);
    return { scan_run_id: scanRunId, generated: raw.length, inserted, errors };

  } catch (err) {
    console.error('[AXIOM] Scan falló:', err.message);
    try {
      await supabase.from('audit_log').insert({
        actor: 'axiom',
        action: 'scan_failed',
        service: 'axiom',
        status: 'error',
        details: { scan_run_id: scanRunId, error: err.message },
        error_code: 'SCAN_ERROR'
      });
    } catch (_) {}
    throw err;
  }
}

module.exports = { runAxiomScan };
