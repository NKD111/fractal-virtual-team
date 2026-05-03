// backend/src/core/pricing-rules.js
// Fractal Virtual Team v4.2 — Sistema de Pricing con consulta obligatoria a Neiky

const { createClient } = require('@supabase/supabase-js');

/**
 * Sistema de Pricing
 *
 * REGLA ABSOLUTA: Mariana NUNCA pone precios sin consultar a Neiky.
 * Este sistema valida cualquier solicitud de cotización.
 */
class PricingSystem {
  constructor(supabase) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Rangos aprobados por defecto (en MXN)
    this.STANDARD_RANGES = {
      video_estandar:    { min: 5000,  max: 8000,  currency: 'MXN', label: 'Video estándar (30-60s)' },
      video_robusto:     { min: 8001,  max: 25000, currency: 'MXN', label: 'Video robusto (60s+, multicámara)' },
      video_documental:  { min: 25000, max: 80000, currency: 'MXN', label: 'Video documental / serie' },
      diseno_grafico:    { min: 2000,  max: 8000,  currency: 'MXN', label: 'Diseño gráfico (piezas unitarias)' },
      branding_completo: { min: 25000, max: 80000, currency: 'MXN', label: 'Branding completo (identidad + sistema)' },
      branding_basico:   { min: 8000,  max: 20000, currency: 'MXN', label: 'Branding básico (logo + guía)' },
      parrilla_mensual:  { min: 12000, max: 25000, currency: 'MXN', label: 'Gestión parrilla mensual (RRSS)' },
      consultoria:       { min: 5000,  max: 15000, currency: 'MXN', label: 'Consultoría estratégica' },
      reels_pack:        { min: 8000,  max: 18000, currency: 'MXN', label: 'Pack de reels (4-8 piezas)' },
      campana_integral:  { min: 40000, max: 150000, currency: 'MXN', label: 'Campaña integral (estrategia + producción)' }
    };

    // Reglas de iteraciones por defecto
    this.ITERATION_RULES = {
      default: {
        rounds_included: 2,
        simple_changes_per_round: 12,
        substantial_changes_per_round: 4,
        extra_round_charge: '10-30% del proyecto',
        note: 'Cambios adicionales se cobran por separado'
      },
      vanexpo: {
        rounds_included: 'unlimited',
        special_note: 'Sin límite de cambios — CRÍTICO bajar bien las ideas desde el brief',
        contact: 'Luis Manuel Díaz + Lidia Quezada'
      },
      central_interactiva: {
        rounds_included: 3,
        special_note: 'Julio solicita 15-20 ajustes por ronda — presupuestar iteraciones extra',
        extra_round_charge: '15% adicional por ronda extra'
      }
    };
  }

  /**
   * Solicita cotización (siempre consulta a Neiky)
   */
  async requestQuote(quoteData) {
    const {
      clientId,
      projectType,
      description,
      requestedBy,
      urgency = 'normal'
    } = quoteData;

    // 1. Cargar info del cliente
    const { data: client } = await this.supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (!client) throw new Error('Cliente no encontrado');

    // 2. Calcular rango sugerido
    const suggestedRange = this.STANDARD_RANGES[projectType] ||
                           { min: 0, max: 0, currency: 'MXN', note: 'Cotización personalizada — sin rango base' };

    // 3. Identificar reglas especiales
    const specialRules = this.getClientSpecialRules(client);

    // 4. Crear solicitud para Neiky
    const quoteRequest = {
      client_id: client.id,
      client_name: client.name,
      client_company: client.company,
      project_type: projectType,
      description,
      urgency,
      suggested_range: suggestedRange,
      special_rules: specialRules,
      requested_by: requestedBy,
      status: 'pending_neiky_approval',
      created_at: new Date()
    };

    // 5. Guardar en DB
    let savedQuote = quoteRequest;
    try {
      const { data: saved } = await this.supabase
        .from('quote_requests')
        .insert(quoteRequest)
        .select()
        .single();
      if (saved) savedQuote = saved;
    } catch (e) {
      // Si la tabla no existe, continuar con la notificación
      console.warn('quote_requests table not ready:', e.message);
    }

    // 6. Notificar a Neiky SIEMPRE
    await this.notifyNeikyForQuote({
      id: savedQuote.id,
      client: { name: client.name, company: client.company },
      project: { type: projectType, description, urgency },
      suggested: { range: suggestedRange, rules: specialRules },
      requested_by: requestedBy
    });

    return savedQuote;
  }

  /**
   * Reglas especiales por cliente
   */
  getClientSpecialRules(client) {
    const companyRules = {
      'VANEXPO':                         this.ITERATION_RULES.vanexpo,
      'Central Interactiva':             this.ITERATION_RULES.central_interactiva,
      'Centro de Convenciones Morelos':  { ...this.ITERATION_RULES.default, special_note: 'Cliente premium nuevo — máxima calidad y puntualidad' },
      'Bedding Summit LATAM':            { ...this.ITERATION_RULES.default, special_note: 'Cliente de alta inversión — presentar propuesta premium' },
      'FIF 2025':                        this.ITERATION_RULES.central_interactiva
    };

    return companyRules[client.company] || this.ITERATION_RULES.default;
  }

  /**
   * Notifica a Neiky para aprobar cotización
   */
  async notifyNeikyForQuote(quote) {
    const rangeText = quote.suggested.range.min > 0
      ? `$${quote.suggested.range.min.toLocaleString()} – $${quote.suggested.range.max.toLocaleString()} MXN`
      : 'Cotización personalizada (sin rango base)';

    const message = `
🚨 COTIZACIÓN REQUIERE TU APROBACIÓN

Cliente: ${quote.client.name} (${quote.client.company})
Proyecto: ${quote.project.type}
Descripción: ${quote.project.description}
Urgencia: ${quote.project.urgency}
Solicitado por: ${quote.requested_by}

Rango sugerido: ${rangeText}

Reglas especiales:
${JSON.stringify(quote.suggested.rules, null, 2)}

Responde con:
✅ "Sí, ese rango"
📝 "No, cambia a $XXXX"
📞 "Llamo al cliente directo"
`;

    await this.supabase
      .from('notifications')
      .insert({
        recipient: 'neiky',
        title: '💰 Cotización requiere tu aprobación',
        message,
        urgency_level: 3,
        category: 'pricing_approval',
        channel: 'whatsapp',
        metadata: { quote_id: quote.id }
      });
  }

  /**
   * Mariana negocia con flexibilidad otorgada por Neiky
   *
   * neikyDecision:
   * - { approved: true, range: {min, max}, flexibility: 0.15 }
   *   → Mariana puede negociar hasta 15% por debajo del mínimo
   * - { approved: true, fixed: 5000 }
   *   → Precio fijo, sin margen
   * - { approved: false, reason: '...' }
   *   → No proceder
   */
  async applyNeikyDecision(quoteId, neikyDecision) {
    try {
      await this.supabase
        .from('quote_requests')
        .update({
          status: neikyDecision.approved ? 'approved' : 'rejected',
          neiky_decision: neikyDecision,
          approved_at: new Date()
        })
        .eq('id', quoteId);
    } catch (e) {
      console.warn('Could not update quote_requests:', e.message);
    }

    return neikyDecision;
  }

  /**
   * Genera texto de respuesta de Mariana al cliente
   * (cuando Neiky aprobó el rango pero Mariana negocia)
   */
  generateNegotiationResponse(clientName, neikyDecision, projectDescription) {
    if (!neikyDecision.approved) {
      return `Hola ${clientName}, estuve revisando tu proyecto "${projectDescription}" con el equipo y en este momento no podemos proceder con esta cotización. Te cuento más en cuanto pueda, ¿está bien?`;
    }

    if (neikyDecision.fixed) {
      const price = neikyDecision.fixed.toLocaleString();
      return `Hola ${clientName}! Ya revisé con el equipo tu proyecto. La inversión para "${projectDescription}" es de $${price} MXN. ¿Te late?`;
    }

    if (neikyDecision.range) {
      const minPrice = neikyDecision.range.min.toLocaleString();
      const maxPrice = neikyDecision.range.max.toLocaleString();
      return `Hola ${clientName}! Ya hablé con el equipo sobre "${projectDescription}". Dependiendo del alcance, la inversión estaría entre $${minPrice} y $${maxPrice} MXN. Platícame más del proyecto para afinar el número exacto, ¿cuándo tienes 15 minutos?`;
    }

    return `Hola ${clientName}, ya revisé tu solicitud. Dame un momento para coordinarlo con el equipo y te doy el número exacto.`;
  }
}

module.exports = PricingSystem;
