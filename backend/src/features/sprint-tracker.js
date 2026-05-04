// backend/src/features/sprint-tracker.js
// B6: Sofia - Sprint Tracker

const { supabase } = require('../core/supabase');

class SprintTracker {
  async createSprint({ projectId, tasks = [], deadline = null }) {
    const sprint = {
      project_id: projectId,
      tasks: tasks.map((t, i) => ({
        id: i + 1,
        description: t.description,
        assigned_to: t.assigned_to,
        estimated_hours: t.hours || null,
        status: 'pending',
        created_at: new Date().toISOString()
      })),
      deadline,
      created_at: new Date().toISOString(),
      status: 'active'
    };

    try {
      await supabase.from('system_events').insert({
        event_type: 'sprint_created',
        severity: 'low',
        service_key: 'sprints',
        details: { project_id: projectId, task_count: tasks.length, sprint }
      });
    } catch (_) {}

    return sprint;
  }

  async getDailyScrumReport(projectId) {
    const { data: checklist } = await supabase
      .from('delivery_checklists').select('*').eq('project_id', projectId).maybeSingle();
    if (!checklist) return null;

    const items = checklist.items || [];
    const done = items.filter(i => i.done);
    const pending = items.filter(i => !i.done);
    const blockers = pending.filter(i => i.blocked);

    return {
      project_id: projectId,
      completion: checklist.completion_percent,
      done_yesterday: done.slice(-3),
      doing_today: pending.slice(0, 3),
      blockers,
      generated_at: new Date().toISOString()
    };
  }
}

module.exports = SprintTracker;
