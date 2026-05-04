// backend/src/intelligence/business-understanding.js
// Sistema 7 — Conocimiento del Negocio Fractal MX
'use strict';

const BUSINESS_KNOWLEDGE = {
  business_model: {
    type: 'creative_agency_AI_powered',
    name: 'Fractal MX',
    owner: 'Neiky (Fermín Monroy / NKD)',
    location: 'Mexico City, México',
    revenue_streams: ['video_production', 'reels', 'branding', 'strategy', 'AI_marketing'],
    margin_targets: {
      videos: '60-70%',
      design: '70-80%',
      strategy: '80-90%'
    }
  },

  pricing_rules: {
    rule: 'Mariana NO puede poner precios sin consultar a Neiky',
    mariana_can: 'negociar con flexibilidad otorgada',
    neiky_does: 'cierra presupuestos directamente',
    approved_ranges: {
      reels_simple: { min: 3000, max: 8000 },
      reels_premium: { min: 8000, max: 20000 },
      branding: { min: 15000, max: 80000 },
      estrategia: { min: 10000, max: 50000 },
      retainer_mensual: { min: 10000, max: 40000 }
    }
  },

  client_classification: {
    premium: {
      criteria: 'revenue_monthly > 30000 OR strategic_value = high',
      examples: ['Central Interactiva', 'Vanexpo'],
      treatment: 'priority_response_under_2h',
      color: '#FFD700'
    },
    standard: {
      criteria: 'recurring AND revenue_monthly > 10000',
      examples: ['Centro Convenciones Morelos'],
      treatment: 'response_under_24h',
      color: '#4CAF50'
    },
    casual: {
      criteria: 'one_time_project',
      treatment: 'response_under_48h',
      color: '#2196F3'
    }
  },

  client_specific_rules: {
    'Vanexpo': {
      percentage_revenue: 35,
      revisions: 'unlimited',
      critical_note: 'Bajar bien el briefing AL INICIO. Cambios ilimitados = briefing perfecto',
      contacts: {
        'Luis Manuel Díaz': 'contacto principal, decisiones',
        'Lidia Quezada': 'operativo, seguimiento'
      },
      events: ['FIF', 'Expo Tendero', 'Expo Eléctrica']
    },
    'Central Interactiva': {
      percentage_revenue: 30,
      tier: 'premium',
      payment_day: 'wednesday',
      invoice_pct: 30,
      contacts: {
        'Julio Bojórquez': '15-20 cambios técnicos por ronda, es detallista',
        'Claudia González': 'amistosa, comunicación fluida',
        'Angie': 'amistosa, comunicación fluida'
      },
      accounts: ['FIF', 'Cintermex', 'Informa Markets']
    },
    'Centro Convenciones Morelos': {
      percentage_revenue: 15,
      monthly_retainer: 15000,
      critical_note: 'Balance familiar vs nicho biker — tono siempre dual',
      contact: 'José Luis "Pepe" Saavedra',
      events: ['Expo Mobility 2', 'Nexus Ink']
    }
  },

  red_flags: [
    { pattern: /pago.*atras|no.*pag|deuda/i, flag: 'pago_atrasado', days_threshold: 5, severity: 4 },
    { pattern: /cambio|revision|modifica/gi, flag: 'multiples_revisiones', count_threshold: 3, severity: 3 },
    { pattern: /descuento.*[2-9]\d%|rebaj.*[2-9]\d%/i, flag: 'descuento_excesivo', severity: 3 },
    { pattern: /silencio|sin.*respuesta/i, flag: 'cliente_silencioso', days_threshold: 7, severity: 3 },
    { pattern: /renegoci|cambiar.*acuerdo/i, flag: 'renegociacion_post_aprobacion', severity: 4 },
    { pattern: /barato|econom|otros.*cobran.*menos/i, flag: 'comparacion_competencia', severity: 4 }
  ],

  green_flags: [
    { pattern: /recomend|refir|colegas?/i, flag: 'referido', action: 'trackear_nuevo_lead' },
    { pattern: /mas.*servicio|otro.*proyecto|ampliar/i, flag: 'upsell_opportunity', action: 'notificar_neiky' },
    { pattern: /pago.*adelant|anticip/i, flag: 'pago_anticipado', action: 'agradecer_y_priorizar' },
    { pattern: /contrato.*mensual|retainer/i, flag: 'retainer_interest', action: 'proponer_paquete' }
  ],

  seasonality: {
    high_demand: ['marzo', 'abril', 'mayo', 'septiembre', 'octubre', 'noviembre'],
    low_demand: ['diciembre', 'enero', 'julio', 'agosto'],
    strategy_low: 'aprovechar para sistemas internos, capacitación, mejoras de proceso'
  },

  team: {
    MARIANA: 'Hub Coordinator, mano derecha de Neiky',
    DIANA: 'Client Manager Senior, clientes complejos',
    ALEX: 'Content Creator, redes y copy',
    CARLOS: 'Senior Designer, branding y sistemas visuales',
    SOFIA: 'Project Manager, timelines',
    LUCAS: 'Analytics, datos y predicciones',
    DIEGO: 'Senior Designer, editorial y corporate',
    MAX: 'AI Video Editor, video cinematográfico',
    VALENTINA: 'Art Director, QC final visual',
    ROBERTO: 'CFO, finanzas y facturación',
    QCBOT: 'Quality Control automatizado'
  }
};

// Métodos utilitarios
function detectRedFlags(text) {
  return BUSINESS_KNOWLEDGE.red_flags.filter(rf => rf.pattern.test(text));
}

function detectGreenFlags(text) {
  return BUSINESS_KNOWLEDGE.green_flags.filter(gf => gf.pattern.test(text));
}

function getClientRules(clientName) {
  const rules = BUSINESS_KNOWLEDGE.client_specific_rules;
  const key = Object.keys(rules).find(k =>
    clientName && clientName.toLowerCase().includes(k.toLowerCase())
  );
  return key ? rules[key] : null;
}

function getClientTier(monthlyRevenue) {
  if (monthlyRevenue >= 30000) return 'premium';
  if (monthlyRevenue >= 10000) return 'standard';
  return 'casual';
}

function isPricingApproved(amount, serviceType) {
  const ranges = BUSINESS_KNOWLEDGE.pricing_rules.approved_ranges;
  const range = ranges[serviceType];
  if (!range) return false; // escalate if unknown service
  return amount >= range.min && amount <= range.max;
}

function getCurrentSeason() {
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const current = monthNames[new Date().getMonth()];
  if (BUSINESS_KNOWLEDGE.seasonality.high_demand.includes(current)) return 'high';
  if (BUSINESS_KNOWLEDGE.seasonality.low_demand.includes(current)) return 'low';
  return 'normal';
}

module.exports = {
  BUSINESS_KNOWLEDGE,
  detectRedFlags,
  detectGreenFlags,
  getClientRules,
  getClientTier,
  isPricingApproved,
  getCurrentSeason
};
