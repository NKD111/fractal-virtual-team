// backend/src/features/delivery-checklist.js
// A5: Delivery Checklist Automático

const { supabase } = require('../core/supabase');

const TEMPLATES = {
  video: [
    { task: 'Script/guión aprobado', assigned_to: 'SOFIA' },
    { task: 'Grabación completada', assigned_to: 'MAX' },
    { task: 'Primera edición lista', assigned_to: 'MAX' },
    { task: 'Color grading aplicado', assigned_to: 'MAX' },
    { task: 'Audio/música agregada', assigned_to: 'MAX' },
    { task: 'Revisión interna QC-Bot', assigned_to: 'QC-BOT' },
    { task: 'Textos/subtítulos correctos', assigned_to: 'DIEGO' },
    { task: 'Versiones para RRSS exportadas', assigned_to: 'MAX' },
    { task: 'Archivos organizados en Drive', assigned_to: 'SOFIA' },
    { task: 'Entrega al cliente', assigned_to: 'MARIANA' }
  ],
  branding: [
    { task: 'Brief aprobado', assigned_to: 'DIANA' },
    { task: '3 propuestas de logo', assigned_to: 'CARLOS' },
    { task: 'Propuesta seleccionada por cliente', assigned_to: 'MARIANA' },
    { task: 'Refinamiento del logo', assigned_to: 'CARLOS' },
    { task: 'Manual de marca completo', assigned_to: 'CARLOS' },
    { task: 'Revisión QC-Bot', assigned_to: 'QC-BOT' },
    { task: 'Archivos fuente organizados', assigned_to: 'CARLOS' },
    { task: 'Exportaciones en todos los formatos', assigned_to: 'CARLOS' },
    { task: 'Entrega al cliente', assigned_to: 'MARIANA' }
  ],
  social_media: [
    { task: 'Estrategia de contenido aprobada', assigned_to: 'ALEX' },
    { task: 'Templates diseñados', assigned_to: 'CARLOS' },
    { task: '10 posts diseñados', assigned_to: 'CARLOS' },
    { task: 'Copy redactado', assigned_to: 'ALEX' },
    { task: 'Revisión QC-Bot', assigned_to: 'QC-BOT' },
    { task: 'Guía de uso preparada', assigned_to: 'ALEX' },
    { task: 'Entrega al cliente', assigned_to: 'MARIANA' }
  ]
};

class DeliveryChecklist {
  getTemplate(projectType) { return TEMPLATES[projectType] || TEMPLATES.video; }

  async createForProject(projectId, projectType) {
    const items = this.getTemplate(projectType).map((it, i) => ({
      ...it, id: i + 1, done: false, due_date: null
    }));
    const { data: checklist } = await supabase
      .from('delivery_checklists')
      .insert({ project_id: projectId, items, completion_percent: 0 })
      .select().single();
    return checklist;
  }

  async markItemDone(checklistId, itemId, doneBy = null) {
    const { data: cl } = await supabase
      .from('delivery_checklists').select('*').eq('id', checklistId).single();
    if (!cl) throw new Error(`Checklist ${checklistId} not found`);

    const items = cl.items.map(it =>
      it.id === itemId ? { ...it, done: true, done_by: doneBy, done_at: new Date().toISOString() } : it
    );
    const completion = Math.round((items.filter(i => i.done).length / items.length) * 100);

    await supabase.from('delivery_checklists').update({
      items, completion_percent: completion, updated_at: new Date().toISOString()
    }).eq('id', checklistId);

    return { completion, remaining: items.filter(i => !i.done) };
  }

  async getForProject(projectId) {
    const { data } = await supabase.from('delivery_checklists').select('*').eq('project_id', projectId).maybeSingle();
    return data;
  }
}

module.exports = DeliveryChecklist;
