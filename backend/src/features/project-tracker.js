// backend/src/features/project-tracker.js
// A3: Project Status Tracker

const { supabase } = require('../core/supabase');

const VALID_STATUSES = [
  'briefing', 'quote_sent', 'approved', 'in_production', 'in_review',
  'revision_requested', 'final_review', 'delivered', 'completed', 'on_hold', 'cancelled'
];

class ProjectTracker {
  validStatuses() { return [...VALID_STATUSES]; }

  async updateStatus(projectId, newStatus, updatedBy = null) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Status inválido: ${newStatus}`);

    const update = { status: newStatus, updated_at: new Date().toISOString() };
    const { data: project } = await supabase
      .from('projects')
      .update(update)
      .eq('id', projectId)
      .select('*, clients(*)')
      .single();

    await supabase.from('system_events').insert({
      event_type: 'project_status_change',
      severity: 'low',
      service_key: 'projects',
      details: { project_id: projectId, new_status: newStatus, updated_by: updatedBy, project_name: project?.name }
    }).then(() => {}).catch(() => {});

    if (project && this._isAtRisk(project)) await this._triggerRiskAlert(project);
    return project;
  }

  _isAtRisk(p) {
    if (!p?.deadline) return false;
    const days = (new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24);
    const inDanger = ['in_production', 'in_review', 'revision_requested'].includes(p.status);
    return inDanger && days < 2;
  }

  async _triggerRiskAlert(project) {
    try {
      await supabase.from('system_events').insert({
        event_type: 'project_at_risk',
        severity: 'warning',
        service_key: 'projects',
        details: { project_id: project.id, name: project.name, client: project.clients?.name, deadline: project.deadline }
      });
    } catch (_) {}
  }

  async getDashboard() {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status, deadline, clients(name)')
      .not('status', 'in', '("completed","cancelled")')
      .order('deadline', { ascending: true });

    const list = projects || [];
    const byStatus = list.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
    const atRisk = list.filter(p => {
      if (!p.deadline) return false;
      const days = (new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24);
      return days < 3;
    });
    return {
      total_active: list.length,
      by_status: byStatus,
      at_risk: atRisk,
      upcoming_deadlines: list.slice(0, 5)
    };
  }
}

module.exports = ProjectTracker;
