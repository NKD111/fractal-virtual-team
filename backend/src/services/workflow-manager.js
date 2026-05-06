// backend/src/services/workflow-manager.js
// WorkflowManager — escucha proyectos nuevos/actualizados y dispara el workflow correcto.
// Se instancia una vez al startup y se registra en global.workflowManager.

const { supabase } = require('../core/supabase');

// Workflows disponibles por project_type
const WORKFLOWS = {
  video: {
    name: 'Video / Animación',
    assigned_agent: 'max',
    initial_status: 'brief_received',
    steps: ['brief_confirmed', 'storyboard', 'produccion', 'revision', 'entrega'],
    default_days: 5
  },
  branding: {
    name: 'Branding / Identidad Visual',
    assigned_agent: 'carlos',
    initial_status: 'brief_received',
    steps: ['brief_confirmed', 'propuesta_concepto', 'revision_1', 'ajustes', 'entrega_final'],
    default_days: 7
  },
  social: {
    name: 'Social Media / Contenido',
    assigned_agent: 'diego',
    initial_status: 'brief_received',
    steps: ['brief_confirmed', 'calendario_contenido', 'produccion', 'revision', 'entrega'],
    default_days: 3
  },
  web: {
    name: 'Sitio Web / Landing Page',
    assigned_agent: 'alex',
    initial_status: 'brief_received',
    steps: ['brief_confirmed', 'wireframe', 'diseno', 'desarrollo', 'revision', 'deploy'],
    default_days: 14
  },
  print: {
    name: 'Diseño Print / Impresión',
    assigned_agent: 'carlos',
    initial_status: 'brief_received',
    steps: ['brief_confirmed', 'propuesta', 'revision', 'arte_final', 'entrega'],
    default_days: 4
  }
};

class WorkflowManager {
  constructor() {
    this._channel = null;
    this._active = false;
  }

  // Inicializar listener de Supabase Realtime
  async initialize() {
    if (this._active) return;

    try {
      // Suscribirse a INSERT y UPDATE en projects
      this._channel = supabase
        .channel('projects-workflow')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'projects' },
          (payload) => this._onProjectInsert(payload.new)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'projects' },
          (payload) => this._onProjectUpdate(payload.old, payload.new)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this._active = true;
            console.log('✅ WorkflowManager: Supabase Realtime subscribed (projects)');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('⚠️ WorkflowManager: Realtime channel error — workflows solo vía dispatch()');
          }
        });
    } catch (err) {
      console.warn('[WorkflowManager] Realtime init error:', err.message, '— usando dispatch manual');
    }
  }

  // Dispatch manual (llamado desde POST /api/projects)
  async dispatch(project) {
    if (!project?.project_type) return;
    const wf = WORKFLOWS[project.project_type];
    if (!wf) {
      console.log(`[WorkflowManager] Tipo sin workflow específico: ${project.project_type}`);
      return;
    }
    await this._processProject(project, wf, 'dispatch');
  }

  async _onProjectInsert(project) {
    if (!project?.project_type) return;
    const wf = WORKFLOWS[project.project_type];
    if (!wf) return;
    await this._processProject(project, wf, 'realtime_insert');
  }

  async _onProjectUpdate(oldProject, newProject) {
    // Disparar workflow solo cuando cambia status a brief_confirmed
    if (newProject.status === 'brief_confirmed' && oldProject.status !== 'brief_confirmed') {
      const wf = WORKFLOWS[newProject.project_type];
      if (wf) await this._processProject(newProject, wf, 'brief_confirmed');
    }
  }

  async _processProject(project, workflow, trigger) {
    console.log(`[WorkflowManager] ${workflow.name} | project=${project.id} | trigger=${trigger}`);

    try {
      // Asignar agente si no tiene
      if (!project.assigned_to) {
        await supabase
          .from('projects')
          .update({ assigned_to: workflow.assigned_agent, updated_at: new Date().toISOString() })
          .eq('id', project.id);
      }

      // Registrar en audit_log
      await supabase.from('audit_log').insert({
        actor: 'workflow_manager',
        action: `workflow_${project.project_type}_started`,
        service: 'workflows',
        status: 'success',
        details: {
          project_id: project.id,
          project_type: project.project_type,
          client_name: project.client_name,
          workflow: workflow.name,
          steps: workflow.steps,
          assigned_agent: workflow.assigned_agent,
          trigger
        }
      });

      // Notificar al agente asignado (log — sin WhatsApp en test)
      console.log(`[WorkflowManager] → Agente ${workflow.assigned_agent.toUpperCase()} asignado para ${project.client_name || project.id}`);

    } catch (err) {
      console.error(`[WorkflowManager] Error procesando workflow ${workflow.name}:`, err.message);

      await supabase.from('audit_log').insert({
        actor: 'workflow_manager',
        action: `workflow_${project.project_type}_error`,
        service: 'workflows',
        status: 'error',
        details: { project_id: project.id, error: err.message },
        error_code: 'WORKFLOW_ERROR'
      }).catch(() => {});
    }
  }

  getActiveWorkflows() {
    return Object.entries(WORKFLOWS).map(([type, wf]) => ({
      type,
      name: wf.name,
      assigned_agent: wf.assigned_agent,
      steps: wf.steps,
      default_days: wf.default_days
    }));
  }
}

module.exports = WorkflowManager;
