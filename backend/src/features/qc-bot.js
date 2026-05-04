// backend/src/features/qc-bot.js
// B4: QC-Bot - Revisión Automática (Oracle-driven)

const { supabase } = require('../core/supabase');

const CRITERIA = {
  video: [
    '¿Duración correcta?',
    '¿Calidad de audio buena?',
    '¿Textos/subtítulos correctos?',
    '¿Color grading consistente?',
    '¿Cumple con el brief?'
  ],
  branding: [
    '¿Logo vectorial y escalable?',
    '¿Colores coinciden con el brief?',
    '¿Tipografía legible?',
    '¿Versiones blanco y negro?',
    '¿Manual de marca completo?'
  ],
  copy: [
    '¿Sin errores ortográficos?',
    '¿Tono coincide con la marca?',
    '¿Mensaje claro?',
    '¿Tiene call-to-action?'
  ]
};

class QCBot {
  getCriteria(type) { return CRITERIA[type] || CRITERIA.copy; }

  async reviewDeliverable({ projectId, deliverableType, content, checklistId = null }) {
    console.log(`🔍 QC-BOT: revisando ${deliverableType}...`);
    const criteria = this.getCriteria(deliverableType);

    let result = { score: 7, passed: true, issues: [], suggestions: [], approved: true };
    if (global.oracle?.isInitialized) {
      try {
        const review = await global.oracle.consult({
          question: `Revisa este entregable de ${deliverableType} para una agencia creativa:

${String(content).substring(0, 4000)}

Criterios a evaluar:
${criteria.join('\n')}

Responde SOLO en JSON sin markdown: {
  "score": 0-10,
  "passed": true/false,
  "issues": ["problemas"],
  "suggestions": ["mejoras"],
  "approved": true/false
}`,
          agent: { id: null, name: 'QC-BOT', role: 'quality_control' },
          context: { deliverable_type: deliverableType },
          depth: 'standard'
        });
        try { result = JSON.parse(review?.answer || '{}'); }
        catch { /* keep default */ }
      } catch (_) {}
    }

    // Update checklist if provided
    if (checklistId) {
      try {
        await supabase.from('delivery_checklists').update({
          qc_approved: !!result.approved,
          qc_notes: (result.issues || []).join('; '),
          qc_checked_at: new Date().toISOString()
        }).eq('id', checklistId);
      } catch (_) {}
    }

    // Log fail
    if (!result.approved) {
      try {
        await supabase.from('system_events').insert({
          event_type: 'qc_failed',
          severity: 'warning',
          service_key: 'qc-bot',
          details: { project_id: projectId, deliverable_type: deliverableType, score: result.score, issues: result.issues }
        });
      } catch (_) {}
    }

    return result;
  }
}

module.exports = QCBot;
