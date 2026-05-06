// backend/src/routes/projects.js
// /api/projects — CRUD básico de proyectos + workflow dispatch.

const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// GET /api/projects/status — resumen de proyectos activos
router.get('/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, client_name, client_whatsapp, project_type, status, budget_mxn, created_at, updated_at')
      .not('status', 'in', '("completed","cancelled","deleted")')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const byStatus = (data || []).reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    const byType = (data || []).reduce((acc, p) => {
      if (p.project_type) acc[p.project_type] = (acc[p.project_type] || 0) + 1;
      return acc;
    }, {});

    res.json({
      active: data?.length || 0,
      by_status: byStatus,
      by_type: byType,
      projects: data || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects — lista proyectos (con filtros opcionales)
router.get('/', async (req, res) => {
  try {
    const { status, project_type, limit = 20 } = req.query;
    let query = supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit) || 20, 100));

    if (status) query = query.eq('status', status);
    if (project_type) query = query.eq('project_type', project_type);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ projects: data || [], count: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects — crear proyecto nuevo + disparar workflow
router.post('/', async (req, res) => {
  try {
    const {
      client_name,
      client_whatsapp,
      project_type,
      brief,
      status = 'brief_received',
      budget_mxn,
      assigned_to,
      notes
    } = req.body || {};

    if (!client_name) return res.status(400).json({ error: 'client_name requerido' });

    const insertData = {
      client_name,
      client_whatsapp: client_whatsapp || null,
      project_type: project_type || null,
      brief: brief || null,
      status,
      budget_mxn: budget_mxn || null,
      assigned_to: assigned_to || null
    };

    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Audit log
    await supabase.from('audit_log').insert({
      actor: 'api',
      action: 'project_created',
      service: 'projects',
      status: 'success',
      details: { project_id: data.id, client_name, project_type, status }
    }).catch(() => {});

    // Dispatch workflow según project_type
    let workflowTriggered = null;
    if (project_type && global.workflowManager) {
      try {
        await global.workflowManager.dispatch(data);
        workflowTriggered = project_type;
      } catch (wfErr) {
        console.warn('[projects] Workflow dispatch error:', wfErr.message);
      }
    }

    res.status(201).json({
      ok: true,
      project: data,
      workflow_triggered: workflowTriggered
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id — actualizar proyecto
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status', 'brief', 'budget_mxn', 'assigned_to', 'revision_count',
                     'deliverable_url', 'paid', 'notes', 'project_type'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada que actualizar' });

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_log').insert({
      actor: 'api',
      action: 'project_updated',
      service: 'projects',
      status: 'success',
      details: { project_id: req.params.id, updates }
    }).catch(() => {});

    res.json({ ok: true, project: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id — soft delete (status=deleted)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, client_name, status')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_log').insert({
      actor: 'api',
      action: 'project_deleted',
      service: 'projects',
      status: 'success',
      details: { project_id: req.params.id }
    }).catch(() => {});

    res.json({ ok: true, deleted: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
