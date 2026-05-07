// backend/src/core/agent-registry.js
// FASE 7 — Agentes en modo STANDBY
// Clasifica agentes en ACTIVOS (siempre cargados) y STANDBY (solo cuando hay tarea).
// Reduce carga de contexto innecesaria y mejora velocidad del sistema.

// ─── REGISTRO DE AGENTES ─────────────────────────────────────────────────────

const AGENT_STATUS = {

  // ACTIVOS — cargados en todos los procesos del sistema
  // Estos agentes manejan operaciones diarias y no pueden estar offline
  ACTIVOS: [
    'mariana',    // Hub coordinator — primer contacto, siempre presente
    'diana',      // Client manager + translator — activa en todo el pipeline
    'alex',       // Content creator — activo en fase 2 del pipeline
    'carlos',     // Senior designer — activo en fase 4 del pipeline
    'valentina',  // Art director QA — activo en fase 5 (último filtro)
    'oracle',     // Strategic intelligence — activo en morning/evening/council
    'nexus',      // Content strategy — activo en fase 1 del pipeline
    'axiom'       // Growth engine — activo cada 6 horas
  ],

  // STANDBY — se activan solo cuando hay una tarea específica que los requiere
  // No cargan en el contexto base, ahorran tokens y latencia
  STANDBY: [
    'diego',      // Se activa para: PDFs, materiales editoriales, presentaciones
    'max',        // Se activa para: producción de video, reels, animaciones
    'sofia',      // Se activa cuando: hay >3 proyectos activos simultáneos
    'lucas',      // Se activa para: reportes mensuales, análisis de métricas
    'roberto',    // Se activa para: decisiones financieras, presupuestos, P&L
    'atlas'       // Se activa para: problemas técnicos, debugging, mantenimiento
  ],

  // CALIDAD — agentes de QA especializados (activados en pipeline fase 5)
  CALIDAD: [
    'consistency_auditor',  // Se activa en QA capa 2
    'client_simulator',     // Se activa en QA capa 5
    'emotional_reviewer',   // Se activa en QA capa 3
    'ctr_validator'         // Se activa en QA capa 4 (solo banners)
  ],

  // ESTRATÉGICOS — se activan en momentos específicos del calendario
  ESTRATEGICOS: [
    'brand_guardian',       // Viernes 6 PM — auditoría semanal de marca
    'campaign_strategist'   // Inicio de trimestre — arcos narrativos
  ]
};

// ─── TRIGGERS DE ACTIVACIÓN ──────────────────────────────────────────────────
// Qué condición activa a cada agente STANDBY

const ACTIVATION_TRIGGERS = {
  diego:    { condition: 'task.type === "pdf" || task.type === "editorial"', description: 'PDFs y materiales editoriales' },
  max:      { condition: 'task.type === "video" || task.type === "reel"',    description: 'Producción de video' },
  sofia:    { condition: 'activeProjects >= 3',                              description: '3+ proyectos activos' },
  lucas:    { condition: 'day === 1 || request === "analytics"',             description: 'Día 1 del mes o reporte solicitado' },
  roberto:  { condition: 'task.involves_budget || task.type === "quote"',    description: 'Decisiones de dinero' },
  atlas:    { condition: 'error.severity === "critical" || request === "tech"', description: 'Errores técnicos críticos' }
};

// ─── FUNCIONES DEL REGISTRY ──────────────────────────────────────────────────

/**
 * isActive(agent_name)
 * ¿Está este agente activo (no en standby)?
 */
function isActive(agent_name) {
  const name = (agent_name || '').toLowerCase().replace(/[- ]/g, '_');
  return AGENT_STATUS.ACTIVOS.includes(name);
}

/**
 * isStandby(agent_name)
 */
function isStandby(agent_name) {
  const name = (agent_name || '').toLowerCase().replace(/[- ]/g, '_');
  return AGENT_STATUS.STANDBY.includes(name);
}

/**
 * getAgentMode(agent_name)
 * Retorna el modo del agente: 'active' | 'standby' | 'quality' | 'strategic' | 'unknown'
 */
function getAgentMode(agent_name) {
  const name = (agent_name || '').toLowerCase().replace(/[- ]/g, '_');
  if (AGENT_STATUS.ACTIVOS.includes(name))      return 'active';
  if (AGENT_STATUS.STANDBY.includes(name))      return 'standby';
  if (AGENT_STATUS.CALIDAD.includes(name))      return 'quality';
  if (AGENT_STATUS.ESTRATEGICOS.includes(name)) return 'strategic';
  return 'unknown';
}

/**
 * activateAgent(agent_name, task, context)
 * Activa un agente standby para una tarea específica.
 * Loguea la activación para métricas de uso.
 */
async function activateAgent(agent_name, task, context = {}) {
  const mode = getAgentMode(agent_name);
  if (mode === 'unknown') {
    console.warn(`[AgentRegistry] Agente desconocido: ${agent_name}`);
    return null;
  }

  console.log(`[AgentRegistry] Activando ${agent_name.toUpperCase()} (${mode}) para: ${task}`);

  // Intentar obtener el agente del global scope (registrado en index.js)
  const globalKey = agent_name.replace(/_/g, '');
  const agent = global[globalKey] || global[agent_name];

  if (!agent) {
    console.warn(`[AgentRegistry] ${agent_name} no registrado en global scope — activación manual requerida`);
    return { agent: agent_name, activated: false, reason: 'No registrado en global' };
  }

  return { agent: agent_name, activated: true, instance: agent };
}

/**
 * getSystemStatus()
 * Estado completo del registry para el dashboard.
 */
function getSystemStatus() {
  return {
    activos:      AGENT_STATUS.ACTIVOS.length,
    standby:      AGENT_STATUS.STANDBY.length,
    calidad:      AGENT_STATUS.CALIDAD.length,
    estrategicos: AGENT_STATUS.ESTRATEGICOS.length,
    total:        Object.values(AGENT_STATUS).flat().length,
    breakdown:    AGENT_STATUS
  };
}

module.exports = {
  AGENT_STATUS,
  ACTIVATION_TRIGGERS,
  isActive,
  isStandby,
  getAgentMode,
  activateAgent,
  getSystemStatus
};
