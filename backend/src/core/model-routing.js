// backend/src/core/model-routing.js
// Fractal Virtual Team v4.2 — Intelligent Model Routing (FASE 9 / BLOQUE B)
// Selecciona el modelo Claude óptimo según el tipo de tarea y agente
// BLOQUE B: Haiku/Sonnet/Opus routing — reduce API cost ~80%

/**
 * Modelos disponibles con sus características
 */
const MODELS = {
  // Alta inteligencia — para tareas complejas y estratégicas
  OPUS: 'claude-opus-4-7',
  // Equilibrio calidad/costo — para la mayoría de tareas creativas
  SONNET: 'claude-sonnet-4-6',
  // Velocidad — para tareas simples y de bajo costo
  HAIKU: 'claude-haiku-4-5'
};

/**
 * Reglas de routing por tipo de tarea
 * Fractal MX usa Sonnet como default para ahorrar créditos (NKD instrucción)
 */
const ROUTING_RULES = {
  // OPUS — Solo para decisiones estratégicas complejas
  oracle_deep_analysis: MODELS.OPUS,
  strategic_decision: MODELS.OPUS,
  complex_negotiation: MODELS.OPUS,
  megazord_coordination: MODELS.OPUS,
  financial_analysis: MODELS.OPUS,

  // SONNET — Default Fractal MX para la mayoría de tareas
  creative_brief: MODELS.SONNET,
  parrilla_strategy: MODELS.SONNET,
  client_communication: MODELS.SONNET,
  content_generation: MODELS.SONNET,
  design_direction: MODELS.SONNET,
  video_brief: MODELS.SONNET,
  qc_review: MODELS.SONNET,
  project_management: MODELS.SONNET,
  nexus_parrilla: MODELS.SONNET,

  // HAIKU — Para tareas simples y automáticas
  quick_ack: MODELS.HAIKU,
  status_check: MODELS.HAIKU,
  data_extraction: MODELS.HAIKU,
  simple_routing: MODELS.HAIKU,
  cron_notification: MODELS.HAIKU,
  audit_log: MODELS.HAIKU
};

/**
 * Mapping de agentes a sus modelos preferidos
 * La mayoría usa SONNET (default Fractal MX)
 */
const AGENT_MODELS = {
  mariana:   MODELS.SONNET,  // Hub coordinator — Sonnet es suficiente
  diana:     MODELS.SONNET,  // Client manager
  carlos:    MODELS.SONNET,  // Designer
  diego:     MODELS.SONNET,  // Designer
  alex:      MODELS.SONNET,  // Content
  max:       MODELS.SONNET,  // Video
  valentina: MODELS.SONNET,  // Art director
  sofia:     MODELS.SONNET,  // PM
  lucas:     MODELS.SONNET,  // Analytics
  roberto:   MODELS.SONNET,  // Finance
  qcbot:     MODELS.HAIKU,   // QC automático — no necesita mucha inteligencia
  nexus:     MODELS.SONNET,  // Strategy — Sonnet suficiente
  oracle:    MODELS.OPUS,    // Oracle — necesita máxima inteligencia
  axiom:     MODELS.SONNET   // Scan automático — Sonnet para análisis de calidad
};

// ─── BLOQUE B: MODEL_ROUTING — formato canónico del Business OS ─────────────
// Usado por todos los agentes para seleccionar modelo correctamente
const MODEL_ROUTING = {

  // Haiku: operativo, logs, notificaciones simples
  // ~100x más barato que Opus
  haiku: {
    model: MODELS.HAIKU,
    usar_para: [
      'notificaciones_whatsapp_simples',
      'logs_del_sistema',
      'standup_message',
      'mariana_respuestas_basicas',
      'confirmaciones_de_entrega',
      'alertas_de_cron',
      'status_check',
      'quick_ack',
      'cron_notification',
      'audit_log'
    ]
  },

  // Sonnet: producción creativa, agentes operativos
  // Balance perfecto costo/calidad
  sonnet: {
    model: MODELS.SONNET,
    usar_para: [
      'carlos_diseno',
      'diego_editorial',
      'max_video',
      'alex_contenido',
      'sofia_pm',
      'diana_cliente',
      'valentina_qa',
      'nexus_estrategia',
      'axiom_scan',
      'briefs_de_parrilla',
      'copies_y_conceptos',
      'creative_brief',
      'design_direction',
      'content_generation',
      'client_communication'
    ]
  },

  // Opus: SOLO para decisiones estratégicas profundas
  // Cuesta 15x más que Sonnet — usar con criterio
  opus: {
    model: MODELS.OPUS,
    usar_para: [
      'oracle_morning_briefing',
      'oracle_evening_reflection',
      'oracle_weekly_business_council',
      'oracle_monthly_review',
      'oracle_modelo_predictivo',
      'nexus_decisiones_criticas',
      'oracle_deep_analysis',
      'strategic_decision',
      'financial_analysis'
    ]
  }
};

/**
 * Selecciona el modelo óptimo para una tarea
 * @param {Object} params
 * @param {string} params.agent - Nombre del agente
 * @param {string} params.taskType - Tipo de tarea
 * @param {string} params.client - Cliente (fif, central_interactiva, etc.)
 * @param {boolean} params.isUrgent - Si es urgente (puede usar modelo más potente)
 * @param {boolean} params.forceEconomy - Forzar modelo más barato
 * @returns {string} Model ID seleccionado
 */
function selectModel({ agent, taskType, client, isUrgent = false, forceEconomy = false }) {
  // Forzar economía si se indica
  if (forceEconomy) {
    return MODELS.HAIKU;
  }

  // Tarea con regla específica tiene prioridad
  if (taskType && ROUTING_RULES[taskType]) {
    const taskModel = ROUTING_RULES[taskType];
    // Si es urgente y el task model es HAIKU, subir a SONNET
    if (isUrgent && taskModel === MODELS.HAIKU) {
      return MODELS.SONNET;
    }
    return taskModel;
  }

  // Fallback: modelo del agente
  if (agent && AGENT_MODELS[agent]) {
    return AGENT_MODELS[agent];
  }

  // Default Fractal MX: SONNET
  return MODELS.SONNET;
}

/**
 * Determina si una tarea requiere thinking extendido (adaptive)
 * Solo para Oracle y decisiones estratégicas complejas
 */
function requiresAdaptiveThinking({ agent, taskType }) {
  const thinkingTasks = [
    'oracle_deep_analysis',
    'strategic_decision',
    'complex_negotiation',
    'financial_analysis',
    'megazord_coordination'
  ];

  if (taskType && thinkingTasks.includes(taskType)) return true;
  if (agent === 'oracle') return true;

  return false;
}

/**
 * Construye la configuración completa de modelo para una llamada
 * @param {Object} params
 * @returns {{ model: string, thinking?: Object, max_tokens: number }}
 */
function buildModelConfig({ agent, taskType, client, isUrgent = false, forceEconomy = false }) {
  const model = selectModel({ agent, taskType, client, isUrgent, forceEconomy });
  const needsThinking = requiresAdaptiveThinking({ agent, taskType });

  const config = {
    model,
    max_tokens: model === MODELS.HAIKU ? 1024 : model === MODELS.SONNET ? 4096 : 8192
  };

  if (needsThinking && model === MODELS.OPUS) {
    config.thinking = { type: 'adaptive' };
  }

  return config;
}

/**
 * Devuelve el costo estimado por tarea (para logging/reporting)
 * Precios por 1M tokens (input/output promedio)
 */
function estimateCost({ model, inputTokens = 1000, outputTokens = 500 }) {
  const pricing = {
    [MODELS.OPUS]:   { input: 5.0,  output: 25.0 },
    [MODELS.SONNET]: { input: 3.0,  output: 15.0 },
    [MODELS.HAIKU]:  { input: 1.0,  output: 5.0  }
  };

  const p = pricing[model] || pricing[MODELS.SONNET];
  const cost = (inputTokens / 1_000_000 * p.input) + (outputTokens / 1_000_000 * p.output);
  return Math.round(cost * 10000) / 10000; // 4 decimales en USD
}

/**
 * getModel — API simplificada para el Business OS
 * Compatible con el formato del BLOQUE B del Master Plan
 * @param {string} agente - Nombre del agente (carlos, oracle, mariana, etc.)
 * @param {string} tipo_tarea - Tipo de tarea (log, notificacion_simple, strategic_analysis, etc.)
 * @returns {string} Model ID
 */
function getModel(agente, tipo_tarea) {
  if (tipo_tarea === 'log' || tipo_tarea === 'notificacion_simple' ||
      tipo_tarea === 'standup_message' || tipo_tarea === 'alerta_cron') {
    return MODEL_ROUTING.haiku.model;
  }
  if (agente === 'oracle' || tipo_tarea === 'strategic_analysis') {
    return MODEL_ROUTING.opus.model;
  }
  return MODEL_ROUTING.sonnet.model;
}

module.exports = {
  MODELS,
  ROUTING_RULES,
  AGENT_MODELS,
  MODEL_ROUTING,
  selectModel,
  getModel,
  requiresAdaptiveThinking,
  buildModelConfig,
  estimateCost
};
