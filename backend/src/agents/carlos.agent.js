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

  // ─── HIGGSFIELD IMAGE GENERATION (Fase B+) ────────────────────────────
  /**
   * Construye el prompt editorial FIF combinando base + fotografía + composición + descripción.
   *
   * @param {object} brief
   *   - pieceType: 'post_informativo' | 'post_comercial' | 'post_editorial' | 'banner_web' | 'carousel_slide'
   *   - description: texto libre del arte específico
   * @returns {string} prompt completo listo para enviar al modelo
   */
  buildFIFPrompt(brief) {
    const FIF = require('../clients/fif-brand-system').prompt_system;
    const type = brief.pieceType || 'post_informativo';

    const compositionKey = type === 'banner_web' ? 'composition_banner' : 'composition_post';
    const composition = FIF[compositionKey] || FIF.composition_post;

    return [
      FIF.base,
      FIF.expo_photography,
      composition,
      brief.description || ''
    ].filter(Boolean).join('\n\n');
  }

  /**
   * Genera 2 variaciones de imagen FIF.
   * Primary: Nano Banana 2 (nano_banana_flash) — editorial, 4:5 nativo, consistente.
   * Fallback: GPT Image 2 (gpt_image_2) si NB2 falla.
   *
   * @param {object} brief
   *   - pieceType: 'post_informativo' | 'post_comercial' | 'post_editorial' | 'banner_web' | 'carousel_slide'
   *   - description: {string} descripción específica del arte
   *   - aspectRatio: override ratio (default: '4:5' para posts, '16:9' para banners)
   *   - briefId: para guardar en Supabase
   *   - projectId: id de proyecto
   * @returns {{ variations: [{resultUrl, jobId, model}], model, prompt, error? }}
   */
  async generateFIFImage(brief = {}) {
    // Support legacy string call (prompt, opts) for backwards compatibility
    if (typeof brief === 'string') {
      brief = { description: brief, pieceType: 'post_informativo', ...arguments[1] };
    }

    const FIF_MODELS = require('../clients/fif-brand-system').image_models;
    const pieceType = brief.pieceType || 'post_informativo';
    const isBanner = pieceType === 'banner_web';
    const aspectRatio = brief.aspectRatio || (isBanner ? FIF_MODELS.ratios.banner : FIF_MODELS.ratios.post);
    const resolution = brief.resolution || FIF_MODELS.resolution;

    const prompt = this.buildFIFPrompt(brief);
    console.log(`🎨 CARLOS: generando imagen FIF [${pieceType}] — "${prompt.substring(0, 80)}..."`);

    // ── Try Nano Banana 2 first ──────────────────────────────────────────
    let primaryResults = [];
    try {
      // GPT Image 2 no soporta 4:5 → usar 3:4 (más cercano sin crop agresivo)
      const primaryRatio = aspectRatio === '4:5' ? '3:4' : aspectRatio;

      // Run 2 parallel variations
      const [v1, v2] = await Promise.all([
        higgsfield.generateImage(prompt, {
          model: FIF_MODELS.primary, // gpt_image_2
          aspectRatio: primaryRatio,
          quality: resolution
        }),
        higgsfield.generateImage(prompt, {
          model: FIF_MODELS.primary,
          aspectRatio: primaryRatio,
          quality: resolution
        })
      ]);
      primaryResults = [v1, v2];
      console.log(`✅ CARLOS: 2 variaciones GPT Image 2 generadas`);
    } catch (err) {
      console.warn(`⚠️ CARLOS: GPT Image 2 falló — ${err.message}. Intentando Nano Banana Pro...`);

      // ── Fallback: Nano Banana Pro ─────────────────────────────────────
      try {
        // Nano Banana Pro sí soporta 4:5 nativo
        const [f1, f2] = await Promise.all([
          higgsfield.generateImage(prompt, { model: FIF_MODELS.fallback, aspectRatio, quality: resolution }),
          higgsfield.generateImage(prompt, { model: FIF_MODELS.fallback, aspectRatio, quality: resolution })
        ]);
        primaryResults = [f1, f2];
        console.log(`✅ CARLOS: 2 variaciones Nano Banana Pro generadas (fallback)`);
      } catch (fallbackErr) {
        console.warn(`❌ CARLOS: ambos modelos fallaron. Último error: ${fallbackErr.message}`);
        return { source: 'error', error: fallbackErr.message, prompt, variations: [] };
      }
    }

    const modelUsed = primaryResults[0]?.model || FIF_MODELS.primary;

    // Save to Supabase if briefId provided
    if (brief.briefId) {
      try {
        const { supabase } = require('../core/supabase');
        await Promise.all(primaryResults.map((r, i) =>
          supabase.from('assets').insert({
            project_id: brief.projectId || null,
            brief_id: brief.briefId,
            type: 'image',
            url: r.resultUrl,
            source: 'higgsfield',
            model: r.model,
            prompt,
            metadata: { job_id: r.jobId, params: r.params, variation: i + 1, piece_type: pieceType },
            created_by: 'carlos',
            status: 'ready'
          })
        ));
      } catch (dbErr) {
        console.warn('[Carlos] asset save error (non-fatal):', dbErr.message);
      }
    }

    return {
      source: 'higgsfield',
      model: modelUsed,
      pieceType,
      aspectRatio,
      prompt,
      variations: primaryResults.map((r, i) => ({
        variation: i + 1,
        resultUrl: r.resultUrl,
        jobId: r.jobId,
        params: r.params
      }))
    };
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
