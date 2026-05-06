// backend/src/workflows/_workflow-engine.js
// Engine compartido por los 3 workflows. Listens Supabase realtime para changes en projects + ejecuta acciones según status.

const { supabase } = require('../core/supabase');

/**
 * Define un workflow:
 * @param {string} type — 'video' | 'branding' | 'social'
 * @param {Object} pipeline — { from_status: { next_agent, next_status, action } }
 */
class WorkflowEngine {
  constructor(type, pipeline) {
    this.type = type;
    this.pipeline = pipeline;
    this.subscription = null;
  }

  start() {
    if (this.subscription) return;
    this.subscription = supabase
      .channel(`projects_${this.type}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `project_type=eq.${this.type}` },
        (payload) => this.handleChange(payload).catch(e => console.error(`[workflow-${this.type}] err:`, e.message))
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'projects', filter: `project_type=eq.${this.type}` },
        (payload) => this.handleChange(payload).catch(e => console.error(`[workflow-${this.type}] insert err:`, e.message))
      )
      .subscribe();
    console.log(`[workflow-${this.type}] subscribed to projects realtime`);
  }

  async stop() {
    if (this.subscription) {
      await supabase.removeChannel(this.subscription);
      this.subscription = null;
    }
  }

  async handleChange(payload) {
    const project = payload.new;
    const prevStatus = payload.old?.status;
    const newStatus = project.status;
    if (prevStatus === newStatus && payload.eventType !== 'INSERT') return; // sin cambio relevante

    const step = this.pipeline[newStatus];
    if (!step) {
      // Status sin handler — solo log
      return;
    }

    console.log(`[workflow-${this.type}] project ${project.id} status=${newStatus} → notify ${step.next_agent}`);

    // 1. Notificar al agente correspondiente (via internal channel — broadcast WebSocket si hay)
    if (global.io) {
      try {
        global.io.emit('agent:notify', {
          agent: step.next_agent,
          project_id: project.id,
          client: project.client_name,
          message: step.message || `Project ${project.id} (${project.project_type}) ahora en ${newStatus}, te toca`,
          timestamp: new Date()
        });
      } catch (_) {}
    }

    // 2. Emit project status change event
    if (global.io) {
      try {
        global.io.emit('project:status_changed', {
          project_id: project.id,
          type: project.project_type,
          from: prevStatus,
          to: newStatus,
          assigned_to: step.next_agent,
          timestamp: new Date()
        });
      } catch (_) {}
    }

    // 3. Update project — assigned_to
    if (step.next_agent) {
      await supabase.from('projects')
        .update({ assigned_to: step.next_agent })
        .eq('id', project.id)
        .then(() => {}).catch(() => {});
    }

    // 4. Audit
    await supabase.rpc('log_action', {
      p_actor: 'workflow_' + this.type,
      p_action: `status_transition:${prevStatus || 'new'}->${newStatus}`,
      p_service: 'workflows',
      p_status: 'success',
      p_details: { project_id: project.id, next_agent: step.next_agent, message: step.message }
    }).then(() => {}).catch(() => {});

    // 5. Special handlers
    if (step.handler) {
      try {
        await step.handler(project);
      } catch (e) {
        console.error(`[workflow-${this.type}] handler err:`, e.message);
      }
    }
  }
}

module.exports = WorkflowEngine;
