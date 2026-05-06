// backend/src/workflows/index.js
// Registry de los 3 workflows: video, branding, social.
// Cada uno define su pipeline con transiciones de status + agente asignado.

const WorkflowEngine = require('./_workflow-engine');

const VIDEO_PIPELINE = {
  brief_received:    { next_agent: 'sofia', next_status_hint: 'in_production', message: 'Nuevo brief de video. Asignar deadline interno y notificar Carlos.' },
  in_production:     { next_agent: 'carlos', next_status_hint: 'design_ready', message: 'Generar storyboard + guión visual.' },
  design_ready:      { next_agent: 'max', next_status_hint: 'first_cut', message: 'Storyboard listo, generar primera versión video.' },
  first_cut:         { next_agent: 'valentina', next_status_hint: 'art_approved | back_to_max', message: 'Primera versión, revisar calidad visual.' },
  art_approved:      { next_agent: 'qcbot', next_status_hint: 'qc_passed | qc_rejected', message: 'Aprobado por arte. Correr checklist técnico.' },
  qc_passed:         { next_agent: 'sofia', next_status_hint: 'ready_for_delivery', message: 'QC pasó. Preparar entrega.' },
  ready_for_delivery:{ next_agent: 'mariana', next_status_hint: 'delivered', message: 'Listo para entregar a cliente vía WhatsApp.' },
  delivered:         { next_agent: 'roberto', next_status_hint: 'paid | revision_requested', message: 'Entregado. Esperar approval cliente o cobrar.' },
  paid:              { next_agent: null, next_status_hint: 'completed', message: 'Cobrado. Cerrar proyecto + log a oracle_memory.' }
};

const BRANDING_PIPELINE = {
  brief_received:    { next_agent: 'sofia', message: 'Nuevo brief de branding.' },
  in_production:     { next_agent: 'carlos', message: 'Diseño primario.' },
  design_ready:      { next_agent: 'diego', message: 'Refinamiento editorial.' },
  refinement_done:   { next_agent: 'valentina', message: 'Revisión arte final.' },
  art_approved:      { next_agent: 'qcbot', message: 'QC checklist branding.' },
  qc_passed:         { next_agent: 'sofia', message: 'Listo entrega.' },
  ready_for_delivery:{ next_agent: 'mariana', message: 'Entregar a cliente.' },
  delivered:         { next_agent: 'roberto', message: 'Cobro.' },
  paid:              { next_agent: null, message: 'Cerrar proyecto.' }
};

const SOCIAL_PIPELINE = {
  brief_received:    { next_agent: 'alex', message: 'Brief social media nuevo.' },
  content_drafted:   { next_agent: 'carlos', message: 'Diseñar visuals.' },
  visuals_ready:     { next_agent: 'valentina', message: 'Revisión arte rapid.' },
  art_approved:      { next_agent: 'sofia', message: 'Preparar entrega calendarizada.' },
  ready_for_delivery:{ next_agent: 'mariana', message: 'Entregar al cliente.' },
  delivered:         { next_agent: 'roberto', message: 'Cobrar.' },
  paid:              { next_agent: null, message: 'Cerrar.' }
};

const engines = [];

function start() {
  if (engines.length > 0) return;
  engines.push(new WorkflowEngine('video', VIDEO_PIPELINE));
  engines.push(new WorkflowEngine('branding', BRANDING_PIPELINE));
  engines.push(new WorkflowEngine('social', SOCIAL_PIPELINE));
  for (const e of engines) e.start();
  console.log(`[workflows] 3 workflows started (video, branding, social)`);
}

async function stop() {
  for (const e of engines) await e.stop();
  engines.length = 0;
}

module.exports = { start, stop, VIDEO_PIPELINE, BRANDING_PIPELINE, SOCIAL_PIPELINE };
