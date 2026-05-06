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

// ─── BLOQUE P — Business OS v3.0 Dashboard ────────────────────────────────────
// GET /api/dashboard/business-os — Dashboard completo del Business OS v3.0
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
      version: 'Business OS v3.0',
      timestamp: new Date().toISOString(),
      layers,
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
      sistema: {
        crons_activos: snapshot?.crons_active || 0,
        api_cost_hoy: snapshot?.api_cost_today || 0,
        system_health: snapshot?.system_health || 'unknown',
        proyectos_activos: projects.length
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

module.exports = router;
