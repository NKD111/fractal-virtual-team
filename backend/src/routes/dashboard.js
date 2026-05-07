const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// GET full dashboard data
router.get('/', async (req, res) => {
  try {
    const [
      { data: agents },
      { data: projects },
      { data: clients },
      { data: tasks },
      { data: recentMessages }
    ] = await Promise.all([
      supabase.from('agents').select('slug, name, status, mood, energy_level, color, current_task'),
      supabase.from('projects').select('id, name, status, priority, deadline').eq('status', 'active'),
      supabase.from('clients').select('id, name, tier').order('created_at', { ascending: false }).limit(10),
      supabase.from('tasks').select('id, title, status, priority, assigned_to').neq('status', 'completed').limit(20),
      supabase.from('messages').select('id, role, content, created_at').order('created_at', { ascending: false }).limit(20)
    ]);

    res.json({
      success: true,
      dashboard: {
        agents: agents || [],
        activeProjects: projects || [],
        recentClients: clients || [],
        pendingTasks: tasks || [],
        recentMessages: recentMessages?.reverse() || [],
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET office state (for PixiJS frontend)
router.get('/office', async (req, res) => {
  try {
    const { data } = await supabase
      .from('office_state')
      .select('*, agents(slug, name, color, status, mood)');
    res.json({ success: true, officeState: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET financial summary (Roberto's data)
router.get('/financials', async (req, res) => {
  try {
    const [{ data: invoices }, { data: payments }] = await Promise.all([
      supabase.from('invoices').select('status, total, currency').order('created_at', { ascending: false }).limit(50),
      supabase.from('payments').select('amount, currency, status').order('created_at', { ascending: false }).limit(50)
    ]);

    const totalBilled = invoices?.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.total || 0), 0) || 0;
    const totalPaid = payments?.filter(p => p.status === 'confirmed').reduce((s, p) => s + (p.amount || 0), 0) || 0;
    const pending = invoices?.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0) || 0;

    res.json({
      success: true,
      financials: {
        totalBilled,
        totalPaid,
        pendingCollection: pending,
        currency: 'MXN',
        invoiceCount: invoices?.length || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── BLOQUE P — Business OS v4.0 Dashboard ────────────────────────────────────
// GET /api/dashboard/business-os — Dashboard completo del Business OS v4.0
const agentRegistry  = require('../core/agent-registry');
const memoryEngine   = require('../core/memory-engine');
const pipelineEngine = require('../core/pipeline-engine');

router.get('/business-os', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7); // YYYY-MM

    const [
      snapshotResult,
      parrillaResult,
      axiomResult,
      productsResult,
      projectsResult
    ] = await Promise.allSettled([
      // Último snapshot de métricas
      supabase.from('metric_snapshots')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Estado pipeline FIF del mes actual
      supabase.from('parrilla_briefs')
        .select('status, tipo_pieza')
        .eq('mes', month)
        .eq('cliente', 'FIF'),

      // Top prospects AXIOM
      supabase.from('prospects')
        .select('nombre_empresa, score, status, servicio_sugerido')
        .order('score', { ascending: false })
        .limit(5),

      // Revenue productos digitales este mes
      supabase.from('digital_products_sales')
        .select('precio_usd, producto')
        .gte('fecha_venta', `${month}-01`),

      // Proyectos activos
      supabase.from('projects')
        .select('name, status, project_type, budget_mxn')
        .eq('status', 'en_produccion')
        .limit(10)
    ]);

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value?.data : null;
    const briefs = parrillaResult.status === 'fulfilled' ? (parrillaResult.value?.data || []) : [];
    const prospects = axiomResult.status === 'fulfilled' ? (axiomResult.value?.data || []) : [];
    const sales = productsResult.status === 'fulfilled' ? (productsResult.value?.data || []) : [];
    const projects = projectsResult.status === 'fulfilled' ? (projectsResult.value?.data || []) : [];

    // ── v4: Cargar métricas de agentes, memoria y pipelines ──────────────────
    const [
      memoriaVictorias,
      memoriaErrores,
      memoriaPatrones,
      memoriaPrompts,
      allPipelinesStatus
    ] = await Promise.allSettled([
      memoryEngine.getMemoryCount(memoryEngine.MEMORY_TYPES.VICTORIA),
      memoryEngine.getMemoryCount(memoryEngine.MEMORY_TYPES.ERROR),
      memoryEngine.getMemoryCount(memoryEngine.MEMORY_TYPES.PATRON_CLIENTE),
      memoryEngine.getMemoryCount(memoryEngine.MEMORY_TYPES.PROMPT_EXITOSO),
      pipelineEngine.getAllPipelinesStatus(month)
    ]);

    const registryStatus = agentRegistry.getSystemStatus();

    const victorias    = memoriaVictorias.status    === 'fulfilled' ? memoriaVictorias.value    : 0;
    const erroresAprendidos = memoriaErrores.status === 'fulfilled' ? memoriaErrores.value       : 0;
    const patronesCliente   = memoriaPatrones.status === 'fulfilled' ? memoriaPatrones.value    : 0;
    const promptsExitosos   = memoriaPrompts.status  === 'fulfilled' ? memoriaPrompts.value     : 0;
    const pipelines    = allPipelinesStatus.status   === 'fulfilled' ? allPipelinesStatus.value  : [];

    // QA metrics — calcular desde briefs del mes
    const totalBriefs      = briefs.length;
    const aprobadosQA      = briefs.filter(b => ['aprobado_qa','en_produccion','entregado'].includes(b.status)).length;
    const aprobadosNKD     = briefs.filter(b => b.status === 'entregado').length;
    const tasaQA           = totalBriefs > 0 ? Math.round((aprobadosQA / totalBriefs) * 100) : 0;
    const tasaNKD          = totalBriefs > 0 ? Math.round((aprobadosNKD / totalBriefs) * 100) : 0;

    // Calcular día actual del pipeline FIF (1-20)
    const dayOfMonth = new Date().getDate();
    const pipelineDay = Math.min(dayOfMonth, 20);

    // Estado de cada status en parrilla
    const briefStatus = briefs.reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {});

    // Revenue productos digitales
    const revenueProductos = sales.reduce((sum, s) => sum + (s.precio_usd || 0), 0);

    // Revenue total del mes (snapshot + productos)
    const revenueTotal = (snapshot?.revenue_month || 0) + revenueProductos;
    const revenueMeta = 5000; // USD
    const revenuePct = Math.round((revenueTotal / revenueMeta) * 100);

    // Capas del Business OS
    const layers = {
      capa1_contexto: '✅ FRACTAL.md cargado | Brand Guide FIF/EFG activo',
      capa2_datos: '✅ Supabase conectado | metric_snapshots + parrilla_briefs + prospects',
      capa3_inteligencia: '✅ Oracle (dom 3AM) + AXIOM (6h) + Evening Reflection (22h)',
      capa4_automatizacion: `✅ Crons activos: Parrilla FIF (7 fases) + YouTube + Revenue Alert + Oracle`,
      capa5_build: `${projects.filter(p => p.project_type === 'landing_cinematografica').length > 0 ? '✅' : '⬜'} Landings | ${sales.length > 0 ? '✅' : '⬜'} Productos digitales`
    };

    res.json({
      success: true,
      version: 'Business OS v4.0',
      timestamp: new Date().toISOString(),
      layers,
      // ── v4 sections ─────────────────────────────────────────────────────────
      sistema: {
        nivel:              '4/9',
        fases_completadas:  ['F1_contexto_modular','F2_qa_pipeline','F3_diana_translate',
                             'F4_parallel_exec','F5_pipeline_engine','F6_estrategicos',
                             'F7_agent_registry','F8_memory_engine','F9_dashboard_v4'],
        agentes_activos:    registryStatus.activos,
        agentes_standby:    registryStatus.standby,
        agentes_calidad:    registryStatus.calidad,
        agentes_estrategicos: registryStatus.estrategicos,
        total_agentes:      registryStatus.total,
        crons_activos:      snapshot?.crons_active || 0,
        api_cost_hoy:       snapshot?.api_cost_today || 0,
        system_health:      snapshot?.system_health || 'unknown',
        proyectos_activos:  projects.length
      },
      calidad: {
        tasa_aprobacion_qa:  tasaQA,
        tasa_aprobacion_nkd: tasaNKD,
        piezas_evaluadas:    totalBriefs,
        aprobadas_qa:        aprobadosQA,
        entregadas_cliente:  aprobadosNKD
      },
      memoria: {
        victorias_registradas: victorias,
        errores_aprendidos:    erroresAprendidos,
        patrones_cliente:      patronesCliente,
        prompts_exitosos:      promptsExitosos,
        total_memoria:         victorias + erroresAprendidos + patronesCliente + promptsExitosos
      },
      pipelines,
      revenue: {
        hoy: snapshot?.revenue_today || 0,
        mes: revenueTotal,
        meta: revenueMeta,
        porcentaje: revenuePct,
        por_agente: Math.round(revenueTotal / 14),
        productos_digitales: revenueProductos
      },
      pipeline_fif: {
        mes: month,
        dia: pipelineDay,
        total_piezas: briefs.length,
        status: briefStatus,
        aprobadas_qa: briefStatus['aprobado_qa'] || 0,
        entregadas: briefStatus['entregado'] || 0
      },
      axiom: {
        top_prospects: prospects,
        top_score: prospects[0]?.score || 0
      },
      higgsfield: {
        imagenes_generadas: snapshot?.images_generated || 0,
        creditos_usados: snapshot?.higgsfield_credits_used || 0
      },
      pendientes_nkd: [
        'Email de Claudia (Central Interactiva) → CLAUDIA_EMAIL env var',
        'Aprobar 5 PDFs cuando Code los entregue',
        'Confirmar precios: Auditoría $300/$800 | Landing $1,500/$3,000',
        'Confirmar email BV-1 Meta cuando llegue',
        'Expo Mobility — pasar contexto del cliente',
        'Aprobar mensajes AXIOM antes de que Mariana contacte prospectos',
        'Canal YouTube: nombre + faceless% + frecuencia'
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/dashboard/telemetry ─────────────────────────────────────────────
// UPGRADE 5: Observabilidad completa — costo, latencia, errores en tiempo real
router.get('/telemetry', async (req, res) => {
  try {
    const { getCostsToday, getCostsMonth, getCostsByAgent, getLatencyByTask, getErrorRate } = require('../core/telemetry');
    const { getCacheStats } = require('../core/claude-cache');
    const hours = parseInt(req.query.hours) || 24;

    const [costHoy, costMes, costByAgent, latencia, errores] = await Promise.allSettled([
      getCostsToday(),
      getCostsMonth(),
      getCostsByAgent(hours),
      getLatencyByTask(hours),
      getErrorRate(hours)
    ]);

    const cacheStats = getCacheStats();

    res.json({
      success:   true,
      periodo:   `últimas ${hours}h`,
      timestamp: new Date().toISOString(),

      costos: {
        hoy:           costHoy.status === 'fulfilled' ? costHoy.value : { error: costHoy.reason?.message },
        mes:           costMes.status === 'fulfilled' ? costMes.value : { error: costMes.reason?.message },
        por_agente:    costByAgent.status === 'fulfilled' ? costByAgent.value : [],
      },

      latencia: {
        por_tarea:     latencia.status === 'fulfilled' ? latencia.value : [],
        nota:          'Capas QA: objetivo <8000ms con UPGRADE 1 turbo'
      },

      errores: errores.status === 'fulfilled' ? errores.value : { overall: 'N/A' },

      cache: cacheStats,

      alertas: await buildTelemetryAlerts(
        costHoy.status === 'fulfilled' ? costHoy.value?.total : 0,
        latencia.status === 'fulfilled' ? latencia.value : [],
        errores.status === 'fulfilled' ? errores.value : {}
      )
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function buildTelemetryAlerts(costToday, latencias, errorRates) {
  const alerts = [];
  if (costToday > 10) alerts.push({ level: 'warn', msg: `Costo hoy: $${costToday} USD (umbral: $10)` });
  if (costToday > 25) alerts.push({ level: 'critical', msg: `Costo crítico: $${costToday} USD` });
  const slowTasks = latencias.filter(t => t.avg_ms > 15000);
  if (slowTasks.length) alerts.push({ level: 'warn', msg: `Tareas lentas (>15s): ${slowTasks.map(t => t.task).join(', ')}` });
  const errRate = parseFloat(errorRates.overall);
  if (errRate > 10) alerts.push({ level: 'warn', msg: `Tasa de error: ${errorRates.overall}% (umbral: 10%)` });
  if (errRate > 25) alerts.push({ level: 'critical', msg: `Error rate crítica: ${errorRates.overall}%` });
  return alerts;
}

// ── GET /api/dashboard/circuit-breakers ──────────────────────────────────────
// UPGRADE 3: Estado en tiempo real de todos los circuit breakers
// Muestra qué servicios están caídos, cuántos fallos tienen y error rate
router.get('/circuit-breakers', (req, res) => {
  try {
    const { breakers } = require('../core/circuit-breaker');
    const status = Object.entries(breakers).reduce((acc, [key, cb]) => {
      acc[key] = cb.getStatus();
      return acc;
    }, {});

    const openCount = Object.values(status).filter(s => s.state === 'OPEN').length;
    const degraded  = openCount > 0;

    res.json({
      success:        true,
      timestamp:      new Date().toISOString(),
      sistema_status: degraded ? 'DEGRADADO' : 'OPERACIONAL',
      servicios_caidos: openCount,
      breakers:       status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/dashboard/circuit-breakers/:name/reset ─────────────────────────
// Permite reset manual de un circuito específico desde el dashboard
router.post('/circuit-breakers/:name/reset', (req, res) => {
  try {
    const { breakers } = require('../core/circuit-breaker');
    const { name } = req.params;
    if (!breakers[name]) {
      return res.status(404).json({ error: `Circuit breaker '${name}' no encontrado` });
    }
    breakers[name].reset();
    res.json({ success: true, message: `Circuit breaker '${name}' reseteado`, status: breakers[name].getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
