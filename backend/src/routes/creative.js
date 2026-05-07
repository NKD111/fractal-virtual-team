// backend/src/routes/creative.js
// Fractal Virtual Team v4.2 — Creative Department API (FASE 9)
// Endpoints para flujo creativo FIF/Vanexpo y general

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const FIF_BRAND_SYSTEM = require('../clients/fif-brand-system');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function auditLog(action, details = {}) {
  try {
    await supabase.from('audit_log').insert({
      agent: 'creative-api',
      action,
      details,
      created_at: new Date().toISOString()
    });
  } catch (_) {}
}

// ─── GET /api/creative/status ─────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const nexusReady = !!(global.nexus?.think);

    // Proyectos activos con workflow creativo
    let activeBriefs = [];
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, client_id, brief, created_at, updated_at')
        .eq('status', 'active')
        .not('brief', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(10);
      activeBriefs = (data || []).filter(p => p.brief?.workflow_status);
    } catch (_) {}

    res.json({
      ok: true,
      nexus_ready: nexusReady,
      brand_system: 'FIF v1.0 loaded',
      active_briefs: activeBriefs.length,
      endpoints: {
        brief:    'POST /api/creative/brief   — nuevo brief FIF',
        status:   'GET  /api/creative/brief/:id — estado de entregable',
        list:     'GET  /api/creative/briefs  — todos los briefs activos',
        parrilla: 'POST /api/creative/parrilla — estrategia parrilla mensual',
        review:   'POST /api/creative/review  — registrar revisión QC/Valentina'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/creative/brief ─────────────────────────────────────────────────
// Recibe nuevo brief, crea proyecto en Supabase, asigna agente, notifica equipo.
// Body: { type, client, agent, brief, deadline_internal?, note? }
//   type: 'arte_publicitario'|'carrusel'|'infografia'|'video_reel'|'banner_web'|
//         'material_impreso'|'parrilla_mensual'
//   client: 'fif'|'central_interactiva'|'ccm'
//   agent: 'carlos'|'diego'|'max'|'alex'
//   brief: { tipo_pieza, publico, mensaje, datos, formato, deadline_cliente }
router.post('/brief', async (req, res) => {
  try {
    const {
      type,
      client = 'fif',
      agent,
      brief = {},
      deadline_internal,
      note,
      created_by = 'mariana'
    } = req.body || {};

    if (!type || !agent) {
      return res.status(400).json({ error: 'type y agent son requeridos' });
    }

    // Validar que el brief tenga información mínima
    const requiredFields = ['tipo_pieza', 'publico', 'mensaje'];
    const missingFields = requiredFields.filter(f => !brief[f]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Brief incompleto',
        missing: missingFields,
        hint: 'Mariana debe preguntar a NKD antes de asignar'
      });
    }

    // Workflow status inicial
    const workflowStatus = {
      phase: 'assigned',
      assigned_to: agent,
      assigned_at: new Date().toISOString(),
      qcbot_approved: false,
      valentina_approved: false,
      nkd_approved: false,
      delivered_to_client: false
    };

    // Crear proyecto en Supabase
    // status debe ser 'active' — el workflow va en brief.workflow_status
    // client_name es requerido por el schema; usamos el nombre del cliente como fallback
    const clientNameMap = { fif: 'FIF / Vanexpo', central_interactiva: 'Central Interactiva', ccm: 'Centro Convenciones Morelos' };
    const projectPayload = {
      name: `${type.toUpperCase()} — ${client.toUpperCase()} — ${new Date().toISOString().split('T')[0]}`,
      client_name: clientNameMap[client] || client.toUpperCase(),
      status: 'active',
      client_id: null, // resuelto por el sistema si aplica
      brief: {
        ...brief,
        type,
        client,
        brand_system: client === 'fif' ? 'fif-brand-system' : null,
        deadline_internal: deadline_internal || null,
        note: note || null,
        created_by,
        workflow_status: workflowStatus
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectPayload)
      .select()
      .single();

    if (projectError) {
      console.error('[creative/brief] Supabase error:', projectError.message);
      return res.status(500).json({ error: projectError.message });
    }

    // Notificar al agente asignado si está disponible globalmente
    let agentNotified = false;
    try {
      const agentInstance = global[agent];
      if (agentInstance?.think) {
        const briefSummary = JSON.stringify(brief, null, 2);
        const msg = `NUEVO BRIEF ASIGNADO — ${type.toUpperCase()} para ${client.toUpperCase()}\n\n${briefSummary}\n\nDeadline interno: ${deadline_internal || 'Por confirmar con Sofia'}`;
        agentInstance.think(msg, { projectId: project.id, client })
          .catch(e => console.error(`[creative/brief] agent notify error:`, e.message));
        agentNotified = true;
      }
    } catch (_) {}

    await auditLog('brief_created', {
      project_id: project.id,
      type,
      client,
      agent,
      created_by
    });

    res.json({
      ok: true,
      project_id: project.id,
      assigned_to: agent,
      workflow_status: workflowStatus.phase,
      agent_notified: agentNotified,
      brand_system: client === 'fif' ? FIF_BRAND_SYSTEM.quality_standard : null
    });
  } catch (err) {
    console.error('[creative/brief]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/creative/brief/:id ──────────────────────────────────────────────
router.get('/brief/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status, brief, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const workflowStatus = data.brief?.workflow_status || {};
    res.json({
      ok: true,
      project: {
        id: data.id,
        name: data.name,
        status: data.status,
        workflow_status: workflowStatus,
        assigned_to: workflowStatus.assigned_to,
        phase: workflowStatus.phase,
        qcbot_approved: workflowStatus.qcbot_approved,
        valentina_approved: workflowStatus.valentina_approved,
        nkd_approved: workflowStatus.nkd_approved,
        delivered_to_client: workflowStatus.delivered_to_client,
        brief_summary: {
          type: data.brief?.type,
          client: data.brief?.client,
          deadline_internal: data.brief?.deadline_internal
        },
        created_at: data.created_at,
        updated_at: data.updated_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/creative/briefs ─────────────────────────────────────────────────
// Listar todos los briefs activos con su workflow status
router.get('/briefs', async (req, res) => {
  try {
    const { client, agent, phase } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status, brief, created_at, updated_at')
      .eq('status', 'active')
      .not('brief', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });

    let briefs = (data || []).filter(p => p.brief?.workflow_status);

    // Filtros opcionales
    if (client) briefs = briefs.filter(p => p.brief?.client === client);
    if (agent) briefs = briefs.filter(p => p.brief?.workflow_status?.assigned_to === agent);
    if (phase) briefs = briefs.filter(p => p.brief?.workflow_status?.phase === phase);

    res.json({
      ok: true,
      count: briefs.length,
      briefs: briefs.map(p => ({
        id: p.id,
        name: p.name,
        type: p.brief?.type,
        client: p.brief?.client,
        phase: p.brief?.workflow_status?.phase,
        assigned_to: p.brief?.workflow_status?.assigned_to,
        deadline_internal: p.brief?.deadline_internal,
        updated_at: p.updated_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/creative/review ────────────────────────────────────────────────
// Registra revisión de QC-BOT o Valentina sobre un entregable
// Body: { project_id, reviewer: 'qcbot'|'valentina'|'nkd', approved: bool, feedback? }
router.post('/review', async (req, res) => {
  try {
    const { project_id, reviewer, approved, feedback } = req.body || {};

    if (!project_id || !reviewer || approved === undefined) {
      return res.status(400).json({ error: 'project_id, reviewer y approved son requeridos' });
    }

    const allowedReviewers = ['qcbot', 'valentina', 'nkd'];
    if (!allowedReviewers.includes(reviewer)) {
      return res.status(400).json({ error: `reviewer debe ser: ${allowedReviewers.join(', ')}` });
    }

    // Obtener el proyecto actual
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('id, brief')
      .eq('id', project_id)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const brief = project.brief || {};
    const workflowStatus = brief.workflow_status || {};

    // Actualizar el estado de revisión
    const reviewKey = `${reviewer}_approved`;
    const reviewTimestamp = `${reviewer}_reviewed_at`;
    workflowStatus[reviewKey] = approved;
    workflowStatus[reviewTimestamp] = new Date().toISOString();
    if (feedback) workflowStatus[`${reviewer}_feedback`] = feedback;

    // Determinar la nueva fase
    if (!approved) {
      workflowStatus.phase = `${reviewer}_rejected`;
    } else if (reviewer === 'qcbot') {
      workflowStatus.phase = 'pending_valentina';
    } else if (reviewer === 'valentina') {
      workflowStatus.phase = 'pending_nkd';
    } else if (reviewer === 'nkd') {
      workflowStatus.phase = 'nkd_approved';
    }

    brief.workflow_status = workflowStatus;

    // Actualizar en Supabase
    const { error: updateError } = await supabase
      .from('projects')
      .update({ brief, updated_at: new Date().toISOString() })
      .eq('id', project_id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    // Registrar en qc_checks si es QC-BOT
    if (reviewer === 'qcbot') {
      try {
        await supabase.from('qc_checks').insert({
          task_id: project_id,
          check_type: 'creative_fif',
          status: approved ? 'approved' : 'rejected',
          qc_report: feedback || (approved ? '✅ APROBADO' : '❌ RECHAZADO'),
          reviewed_at: new Date().toISOString()
        });
      } catch (_) {}
    }

    await auditLog('review_registered', {
      project_id,
      reviewer,
      approved,
      new_phase: workflowStatus.phase
    });

    res.json({
      ok: true,
      project_id,
      reviewer,
      approved,
      new_phase: workflowStatus.phase,
      next_step: approved
        ? reviewer === 'nkd' ? 'Entregar al cliente' : `Enviar a ${reviewer === 'qcbot' ? 'Valentina' : 'NKD'}`
        : `Devolver a ${workflowStatus.assigned_to} con feedback`
    });
  } catch (err) {
    console.error('[creative/review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/creative/parrilla ──────────────────────────────────────────────
// Genera estrategia editorial mensual FIF usando NEXUS
// Body: { month, eventData, registrationPhase?, priorityAudiences?, clientNotes? }
router.post('/parrilla', async (req, res) => {
  try {
    if (!global.nexus?.generateParrillaFIF && !global.nexus?.think) {
      return res.status(503).json({ error: 'NEXUS no inicializado' });
    }

    const {
      month,
      eventData,
      registrationPhase,
      priorityAudiences,
      clientNotes
    } = req.body || {};

    if (!month) {
      return res.status(400).json({ error: 'month es requerido (e.g. "Mayo 2026")' });
    }

    let plan;
    if (global.nexus.generateParrillaFIF) {
      plan = await global.nexus.generateParrillaFIF({
        month, eventData, registrationPhase, priorityAudiences, clientNotes
      });
    } else {
      // Fallback: usar think directamente
      const prompt = `Genera el plan editorial mensual FIF para ${month}.
Datos del evento: ${JSON.stringify(eventData || {})}
Fase de registro: ${registrationPhase || 'No especificada'}
Audiencias prioritarias: ${(priorityAudiences || []).join(', ')}
Notas: ${clientNotes || 'Sin notas'}`;
      plan = await global.nexus.think(prompt, { client: 'fif', month });
    }

    await auditLog('parrilla_generated', { month, client: 'fif' });

    res.json({
      ok: true,
      month,
      plan,
      generated_at: new Date().toISOString(),
      brand_system_reference: 'fif-brand-system.js',
      delivery_deadline: `Día 20 del mes a claudia@centralinteractiva.com`
    });
  } catch (err) {
    console.error('[creative/parrilla]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/creative/design-plugin-audit ───────────────────────────────────
// Ejecuta el audit de 4 capas del Design Plugin sobre un brief específico.
// Body: { brief_id } o { brief: {...}, art_url: '...', cliente: 'FIF' }
//
// Retorna JSON con veredictos por capa + dev handoff notes para Claudia.
router.post('/design-plugin-audit', async (req, res) => {
  try {
    let brief = req.body.brief;
    const { brief_id, art_url, cliente = 'FIF' } = req.body;

    // Cargar brief desde Supabase si solo viene el ID
    if (!brief && brief_id) {
      const { data, error } = await supabase
        .from('parrilla_briefs')
        .select('*')
        .eq('id', brief_id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Brief no encontrado', brief_id });
      brief = data;
    }

    if (!brief) return res.status(400).json({ error: 'Se requiere brief o brief_id' });

    // Instanciar Valentina
    let valentina;
    try {
      const ValentinaAgent = require('../agents/valentina.agent');
      valentina = new ValentinaAgent();
    } catch (e) {
      return res.status(500).json({ error: 'No se pudo instanciar ValentinaAgent', detail: e.message });
    }

    const artUrl = art_url || brief.url_arte_final || '';
    const clienteNombre = cliente || brief.cliente || 'FIF';

    console.log(`[creative/design-plugin-audit] Brief: ${brief.id || 'manual'} | ${clienteNombre} | ${brief.tipo_pieza || 'post'}`);

    const audit = await valentina.designPluginAudit(brief, artUrl, clienteNombre);

    // Guardar notas_entrega en Supabase si viene de un brief_id
    if (brief_id && audit.dev_handoff?.notas_para_claudia) {
      try {
        await supabase.from('parrilla_briefs').update({
          notas_entrega: audit.dev_handoff.notas_para_claudia
        }).eq('id', brief_id);
      } catch { /* non-fatal */ }
    }

    await auditLog('design_plugin_audit', {
      brief_id: brief_id || brief.id,
      cliente: clienteNombre,
      overall_status: audit.overall_status,
      score: audit.overall_score
    });

    res.json({
      ok: true,
      brief_id: brief_id || brief.id,
      cliente: clienteNombre,
      audit,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[creative/design-plugin-audit]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/creative/test-generate ────────────────────────────────────────
// Test de generación end-to-end. Crea un creative_job, llama a Carlos,
// guarda el resultado y notifica a NKD por WhatsApp.
// Body: { brief, client?, dryRun? }
// DÍA 3 — Plan Estabilización v6
router.post('/test-generate', async (req, res) => {
  const { brief: briefText, client = 'FIF', dryRun = false } = req.body || {};

  if (!briefText) {
    return res.status(400).json({ error: 'brief requerido. Ej: "Arte FIF sobre registros abiertos, fondo blanco, paleta navy"' });
  }

  // Validar credenciales de generación
  const higgsConfigured = process.env.HIGGSFIELD_API_KEY &&
                          process.env.HIGGSFIELD_API_KEY !== 'PENDING' &&
                          process.env.HIGGSFIELD_API_KEY !== '';

  if (!higgsConfigured && !dryRun) {
    return res.status(503).json({
      error: 'HIGGSFIELD_API_KEY no configurado',
      action: 'Agrega HIGGSFIELD_API_KEY en Railway Variables → Redeploy → reintentar',
      dry_run_available: true,
      hint: 'Usa { "dryRun": true } para validar el pipeline sin generar imagen real'
    });
  }

  // Registrar el job
  const { data: job, error: jobError } = await supabase
    .from('creative_jobs')
    .insert({
      client: client.toUpperCase(),
      status: dryRun ? 'dry_run' : 'processing',
      brief: briefText,
      source: 'api'
    })
    .select()
    .single();

  if (jobError) {
    // creative_jobs puede no existir aún → retornar info sin fallar
    console.warn('[test-generate] creative_jobs insert error:', jobError.message);
    if (dryRun) {
      return res.json({
        status: 'dry_run',
        job_id: null,
        message: 'Pipeline válido. creative_jobs tabla aún no creada (correr 012_creative_jobs.sql)',
        higgsfield: higgsConfigured ? '✅' : '❌ PENDING',
        brief: briefText
      });
    }
  }

  const jobId = job?.id || null;

  if (dryRun) {
    return res.json({
      status: 'dry_run',
      job_id: jobId,
      brief: briefText,
      higgsfield: higgsConfigured ? '✅ configured' : '❌ PENDING',
      message: 'Dry run OK — pipeline validado. Quita dryRun para generar imagen real.'
    });
  }

  // Responder inmediatamente — generación corre en background
  res.json({
    status: 'generating',
    job_id: jobId,
    brief: briefText,
    message: 'Carlos está generando. Recibirás el resultado por WhatsApp en ~2 min.'
  });

  // Generación en background
  setImmediate(async () => {
    try {
      const CarlosAgent = require('../agents/carlos.agent');
      const { notifyNeiky } = require('../core/whatsapp');

      const carlos = new CarlosAgent();

      const clientMap = {
        'FIF': 'FIF', 'EFG': 'EFG', 'FRACTAL': 'FRACTAL',
        'CENTRAL_INTERACTIVA': 'FIF', 'CCM': 'FIF'
      };

      const carlosBrief = {
        cliente: clientMap[client.toUpperCase()] || 'FIF',
        tipo_pieza: 'post_informativo',
        headline: briefText.substring(0, 80),
        concepto: briefText,
        cta: 'REGÍSTRATE AHORA',
        fecha: '',
        mes: new Date().toISOString().substring(0, 7),
      };

      const result = await carlos.generateFromBrief(carlosBrief);

      const imageUrl = result?.images?.[0]?.resultUrl ||
                       result?.images?.[0]?.url ||
                       result?.images?.[0]?.image_url || null;

      // Actualizar job
      if (jobId) {
        await supabase.from('creative_jobs').update({
          status: result?.success ? 'pending_approval' : 'failed',
          image_url: imageUrl || null,
          typo_spec: result?.typo_spec || null,
          error_message: result?.success ? null : (result?.error || 'Carlos falló sin razón específica'),
          updated_at: new Date().toISOString()
        }).eq('id', jobId);
      }

      if (result?.success && imageUrl) {
        await notifyNeiky(
          `🎨 *Arte generado — listo para revisión*\n\n` +
          `*Cliente:* ${client.toUpperCase()}\n` +
          `*Brief:* "${briefText.substring(0, 80)}"\n` +
          `*Job:* ${jobId ? jobId.substring(0, 8) : 'N/A'}\n\n` +
          `🖼 Imagen: ${imageUrl}\n\n` +
          `Responde:\n` +
          `• *apruebo job_${jobId ? jobId.substring(0, 8) : '?'}* — para aprobar\n` +
          `• *ajustar ${jobId ? jobId.substring(0, 8) : '?'} [qué cambiar]* — para modificar`
        );
      } else {
        // Fallback: enviar spec tipográfico
        const spec = result?.typo_spec;
        const specText = spec?.capas?.length
          ? spec.capas.map(c => `• ${c.elemento}: "${c.texto || '—'}" | ${c.fuente} ${c.peso}`).join('\n')
          : '(spec no generado)';

        await notifyNeiky(
          `⚠️ *Arte: no se pudo generar imagen* (${result?.error || 'Higgsfield no disponible'})\n\n` +
          `*Brief:* "${briefText.substring(0, 80)}"\n\n` +
          `📝 *Spec para producción manual:*\n${specText}\n\n` +
          `_Configura HIGGSFIELD_API_KEY en Railway para habilitar generación automática._`
        );
      }

    } catch (err) {
      console.error('[test-generate background]', err.message);
      if (jobId) {
        await supabase.from('creative_jobs').update({
          status: 'failed',
          error_message: err.message,
          updated_at: new Date().toISOString()
        }).eq('id', jobId).catch(() => {});
      }
      const { notifyNeiky } = require('../core/whatsapp');
      notifyNeiky(`❌ Error en test-generate:\n${err.message}\nJob: ${jobId || 'N/A'}`).catch(() => {});
    }
  });
});

// ─── GET /api/creative/jobs ───────────────────────────────────────────────────
// Lista creative_jobs recientes. Filtros: status, client, limit
router.get('/jobs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { status, client } = req.query;

    let q = supabase
      .from('creative_jobs')
      .select('id, client, status, brief, image_url, cost_usd, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) q = q.eq('status', status);
    if (client) q = q.ilike('client', `%${client}%`);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message, hint: 'Correr 012_creative_jobs.sql en Supabase' });

    res.json({ jobs: data || [], count: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
