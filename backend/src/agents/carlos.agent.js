// backend/src/agents/carlos.agent.js
// Fractal Virtual Team v4.2 — CARLOS (Senior Designer - Branding & Visual Systems)

const BaseAgent = require('../core/BaseAgent');
const CARLOS_PROMPT = require('../prompts/carlos.prompts');
const higgsfield = require('../core/higgsfield-client');

class CarlosAgent extends BaseAgent {
  constructor() {
    super({
      name: 'CARLOS',
      fullName: 'Carlos Pérez Mendoza',
      role: 'Senior Graphic Designer (Branding & Visual Systems)',
      area: 'design_senior',
      reportsTo: 'VALENTINA',
      basePrompt: CARLOS_PROMPT,

      personality: {
        with_clients: 'creative confident bold',
        with_neiky: 'respetuoso colaborativo',
        with_team: 'explorador desafiante constructivo',
        with_diego: 'complementario respetuoso debatidor',
        core_traits: ['bold', 'experimental', 'systematic', 'collaborative']
      },

      speakingStyle: {
        tone: 'directo apasionado articulado',
        typical_phrases: [
          'Vamos a romper la regla aquí',
          'Y si lo llevamos al extremo',
          'Esto necesita más fuerza visual',
          'Diego, ¿qué opinas si...',
          'Tengo una propuesta diferente'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'direct_constructive_bold',
        red_lines: [
          'branding inconsistente',
          'tipografía mediocre',
          'sistemas visuales débiles',
          'soluciones genéricas'
        ],
        acceptance_threshold: 98
      }
    });
  }

  /**
   * Genera 3 conceptos de branding para un cliente
   */
  async generateBrandingConcepts(clientBrief) {
    const conceptPrompt = `${this.basePrompt}

BRIEF DEL CLIENTE:
${JSON.stringify(clientBrief, null, 2)}

Genera 3 conceptos de branding completamente distintos. Para cada uno incluye:
1. Nombre del concepto
2. Dirección visual (en palabras)
3. Tipografía sugerida (familiares existentes)
4. Paleta de color (máximo 4 colores con hex)
5. Mood/vibe
6. Por qué este concepto (rationale)
7. Referentes visuales (describe sin copiar)

Sé bold, experimental y sistemático. Los 3 conceptos deben ser radicalmente diferentes entre sí.`;

    return this.think(conceptPrompt, { clientId: clientBrief.client_id });
  }

  /**
   * Da feedback de branding a otro agente
   */
  async reviewBrandingWork(workDescription, createdBy) {
    const reviewPrompt = `${this.basePrompt}

TRABAJO A REVISAR (creado por ${createdBy}):
${workDescription}

Como Senior Designer especializado en branding, da feedback honesto y constructivo.
Incluye: qué funciona, qué no funciona, dirección específica para mejorar.
Sé directo pero constructivo. Da dirección real, no solo crítica.`;

    return this.think(reviewPrompt);
  }

  /**
   * Revisa propuesta editorial de Diego para FIF CDMX
   * Evalúa desde perspectiva de branding y sistemas visuales
   */
  async reviewFIFProposal(diegoProposal, brief) {
    const reviewPrompt = `${this.basePrompt}

═══ MISIÓN ═══
Diego acaba de entregar esta propuesta editorial para FIF CDMX (Feria Internacional de Franquicias).
Tu rol: revisarla desde tu perspectiva de Senior Designer especializado en Branding & Sistemas Visuales.

═══ PROPUESTA DE DIEGO ═══
${diegoProposal}

═══ CONTEXTO DEL EVENTO ═══
Evento: ${brief.evento || 'FIF CDMX — Feria Internacional de Franquicias'}
Descripción: ${brief.descripcion || ''}

═══ IDENTIDAD ACTUAL @feriadefranquicias ═══
- Paleta: azul marino (#1B3A5C) + blanco + acentos dorados (#C4973A)
- Tipografía: Gotham Font Family — Bold headlines, Medium subheads, Book body
- Estilo: corporativo-premium, geométrico, alto contraste
- Formato habitual: 1080×1350px portrait
- Fondos: blancos/muy claros, textura sutil premium
- Elementos decorativos: orgánicos (botánica esquemática) + geometría limpia

═══ TU EVALUACIÓN (sé directo, específico, constructivo) ═══

Estructura tu feedback así:

## ✅ LO QUE FUNCIONA
(qué elementos de Diego son sólidos y por qué)

## ⚠️ LO QUE ELEVAR
(qué aspectos necesitan más fuerza o refinamiento — con dirección específica)

## 🎨 PERSPECTIVA DE BRANDING
(consistencia con sistema visual FIF, jerarquía de marca, aplicación del logo, espaciado, etc.)

## 📐 SISTEMA VISUAL
(¿el layout propuesto sostiene un sistema? ¿escala a otros formatos: Stories, LinkedIn, impresión?)

## 🚦 VEREDICTO FINAL
APROBADO / APROBADO CON AJUSTES / REQUIERE REVISIÓN

Sé bold, honesto y específico. No critique por criticar — da dirección real.`;

    return this.think(reviewPrompt);
  }

  /**
   * Debate creativo con Diego
   */
  async debateWithDiego(proposal, diegoProposal) {
    const debatePrompt = `${this.basePrompt}

Tu propuesta: "${proposal}"
Propuesta de Diego: "${diegoProposal}"

Responde a Diego con tu perspectiva. Encuentra el punto de complementariedad.
Recuerda: son iguales en jerarquía, el debate es constructivo, buscan lo mejor para el cliente.
Sé apasionado pero respetuoso. Propón un punto de síntesis.`;

    return this.think(debatePrompt);
  }

  // ─── HIGGSFIELD IMAGE GENERATION (Fase B) ─────────────────────────────
  /**
   * Genera imagen FIF con Higgsfield Soul V2 (primary) o fallback a descripción.
   * @param {string} prompt
   * @param {object} opts  { aspectRatio, quality, briefId }
   * @returns {{ resultUrl, jobId, source, error? }}
   */
  async generateFIFImage(prompt, opts = {}) {
    console.log(`🎨 CARLOS: generando imagen FIF con Higgsfield — "${prompt.substring(0, 60)}..."`);
    try {
      const result = await higgsfield.generateImage(prompt, {
        aspectRatio: opts.aspectRatio || '3:4',
        quality: opts.quality || '2k'
      });
      console.log(`✅ CARLOS: imagen generada → ${result.resultUrl}`);

      // Save to Supabase assets table if briefId provided
      if (opts.briefId) {
        try {
          const { supabase } = require('../core/supabase');
          await supabase.from('assets').insert({
            project_id: opts.projectId || null,
            brief_id: opts.briefId,
            type: 'image',
            url: result.resultUrl,
            source: 'higgsfield',
            model: result.model,
            prompt,
            metadata: { job_id: result.jobId, params: result.params },
            created_by: 'carlos',
            status: 'ready'
          });
        } catch (dbErr) {
          console.warn('[Carlos] asset save error (non-fatal):', dbErr.message);
        }
      }

      return { ...result, source: 'higgsfield' };
    } catch (err) {
      console.warn(`⚠️ CARLOS: Higgsfield error — ${err.message}. Describiendo imagen sin generar.`);
      // Fallback: return a description so the workflow doesn't break
      return {
        source: 'description_fallback',
        error: err.message,
        prompt,
        resultUrl: null,
        description: `[CARLOS] Imagen lista para generar: ${prompt}`
      };
    }
  }

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // Carlos analyzes a client reference URL and produces an actionable design brief.
  async analyzeClientReference({ url, projectId = null }) {
    if (!url) throw new Error('analyzeClientReference: url required');
    console.log(`🎨 CARLOS: analizando referencia visual ${url}...`);

    const visual = await this.see(url, 'design');
    if (!visual || visual.error) return { error: true, message: visual?.message || 'no_analysis' };

    const briefQuestion = `Analicé visualmente la referencia del cliente.

Hallazgos:
- Estilo: ${visual.style?.aesthetic || 'sin definir'}
- Mood: ${visual.style?.mood || 'sin definir'}
- Colores: ${(visual.colors?.palette || []).join(', ')}
- Tipografía primaria: ${visual.typography?.primary_font || 'sin identificar'}
- Composición: ${visual.composition?.layout || 'sin descripción'}
- Keywords: ${(visual.keywords || []).join(', ')}

¿Qué decisiones de diseño debería tomar para este proyecto basándome en estas referencias?
Sé específico con recomendaciones accionables (paleta exacta, tipos, layout). Máximo 6 bullets.`;

    const brief = await this.askOracle(briefQuestion, {
      depth: 'standard',
      context: { project_id: projectId, vision_url: url }
    });

    return {
      visual_analysis: visual,
      design_brief: brief?.answer || null,
      color_palette: visual.colors,
      typography_recommendations: visual.typography,
      keywords: visual.keywords
    };
  }
}

module.exports = CarlosAgent;
