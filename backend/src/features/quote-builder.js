// backend/src/features/quote-builder.js
// A2: Cotizador Inteligente (estructura solo — Neiky pone los precios)

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

class QuoteBuilder {
  constructor() {
    this.serviceTemplates = {
      video_reel: {
        deliverables: ['Video principal (60-90s)', 'Versión Stories (9:16)', 'Thumbnail'],
        estimated_hours: { produccion: 8, edicion: 6, revision: 2 },
        complexity_multiplier: { basic: 1, standard: 1.5, premium: 2.5 },
        revision_rounds: 2
      },
      video_corporativo: {
        deliverables: ['Video principal (2-3 min)', 'Versión corta (60s)', 'Cortes para RRSS'],
        estimated_hours: { produccion: 16, edicion: 12, revision: 4 },
        complexity_multiplier: { basic: 1, standard: 1.8, premium: 3 },
        revision_rounds: 2
      },
      branding: {
        deliverables: ['Logotipo (3 propuestas)', 'Manual de marca', 'Archivos editables'],
        estimated_hours: { conceptualizacion: 8, diseno: 12, revision: 4 },
        complexity_multiplier: { basic: 1, standard: 1.5, premium: 2 },
        revision_rounds: 2
      },
      expo_booth: {
        deliverables: ['Diseño stand', 'Materiales impresos', 'Assets digitales'],
        estimated_hours: { diseno: 20, revision: 6 },
        complexity_multiplier: { basic: 1, standard: 1.6, premium: 2.8 },
        revision_rounds: 2
      },
      social_media_pack: {
        deliverables: ['10 posts diseñados', 'Templates editables', 'Guía de uso'],
        estimated_hours: { estrategia: 4, diseno: 10, revision: 2 },
        complexity_multiplier: { basic: 1, standard: 1.3, premium: 1.8 },
        revision_rounds: 2
      }
    };
  }

  listServices() { return Object.keys(this.serviceTemplates); }

  async buildQuote({ clientId, serviceType, complexity = 'standard', briefId = null, specialNotes = '' }) {
    const template = this.serviceTemplates[serviceType];
    if (!template) throw new Error(`Servicio no reconocido: ${serviceType}`);

    const { data: client } = await supabase
      .from('clients').select('*').eq('id', clientId).maybeSingle();

    let revisionRounds = template.revision_rounds;
    const conditions = client?.special_conditions;
    if (typeof conditions === 'string' && conditions.includes('unlimited_revisions')) revisionRounds = 99;
    if (Array.isArray(conditions) && conditions.includes('unlimited_revisions')) revisionRounds = 99;

    const { data: savedQuote } = await supabase.from('quotes').insert({
      client_id: clientId,
      project_brief_id: briefId,
      service_type: serviceType,
      deliverables: template.deliverables,
      estimated_hours: template.estimated_hours,
      complexity,
      revision_rounds: revisionRounds,
      status: 'pending_review'
    }).select().single();

    const structure = {
      client_name: client?.name,
      service_type: serviceType,
      complexity,
      deliverables: template.deliverables,
      estimated_hours: template.estimated_hours,
      revision_rounds: revisionRounds,
      complexity_multiplier: template.complexity_multiplier[complexity],
      special_notes: specialNotes
    };

    await this.notifyNeikyForPricing(savedQuote, client, structure);
    return { quote: savedQuote, structure };
  }

  async notifyNeikyForPricing(quote, client, structure) {
    const message =
`💰 *COTIZACIÓN LISTA PARA PRECIO*

Cliente: ${client?.name || 'sin cliente'}
Servicio: ${structure.service_type}
Complejidad: ${structure.complexity}

Entregables:
${structure.deliverables.map(d => `• ${d}`).join('\n')}

Horas estimadas:
${Object.entries(structure.estimated_hours).map(([k, v]) => `• ${k}: ${v}h`).join('\n')}

Rondas de revisión: ${structure.revision_rounds === 99 ? 'Ilimitadas' : structure.revision_rounds}

👉 *Define el precio y envío la cotización al cliente.*
Quote ID: ${quote.id}`;
    try { await notifyNeiky(message); } catch (err) { console.warn('[QuoteBuilder] notify error:', err.message); }
  }
}

module.exports = QuoteBuilder;
