// backend/src/agents/carlos.agent.js
// Fractal Virtual Team v4.2 — CARLOS (Senior Designer - Branding & Visual Systems)
// BLOQUE H: JSON prompting + generateFromBrief + generateCarousel
// UPGRADE 4: Memoria semántica inyectada en generateFromBrief y generateBrandingConcepts

const BaseAgent = require('../core/BaseAgent');
const CARLOS_PROMPT = require('../prompts/carlos.prompts');
const higgsfield = require('../core/higgsfield-client');
const { buildMemoryContext } = require('../core/memory-engine');
const {
  generateNoTextImagePrompt,
  generateTypographySpec,
  validateBriefForTypography,
} = require('../core/typography-spec');

// ─── SISTEMA DE PROMPTS FIF (BLOQUE H) ────────────────────────────────────────
// Base siempre presente en cada imagen generada para FIF.
// Garantiza consistencia visual en toda la parrilla mensual.
const FIF_VISUAL_SYSTEM = {

  base: `Premium editorial-commercial franchise expo
    campaign design. Clean white or very light gray
    background. Strong visual hierarchy. Navy blue
    #0B2A4A and institutional red #D7193F as main
    brand colors. White #FFFFFF and light gray
    #F2F4F7 as backgrounds. Subtle cyan #4FC3E0
    only as secondary accent very sparingly.

    Visual style: high-end corporate magazine layout,
    aspirational Mexican franchise business campaign,
    clean modular composition, structured information
    blocks, rounded icon cards, thin separator lines,
    soft curved lines, subtle dot patterns, geometric
    diamond accents in navy and red, premium white
    space, strong typographic hierarchy similar to
    Gotham or Montserrat bold.

    NEVER: neon, cyberpunk, biker aesthetics,
    glitch effects, chaotic compositions, excessive
    gradients, dark moody backgrounds, distorted text,
    fake logos, messy typography, overlaid text on
    faces, low-quality stock photo style, random
    colors outside brand palette.`,

  fotografia: `Realistic high-quality expo hall
    photography. Modern franchise expo in Mexico.
    Professional Mexican and Latin American business
    audience. Entrepreneurs, investors, franchise
    owners and consultants networking. Premium booths
    in navy, white and red. Warm professional lighting.
    Natural faces, no distortions, no deformed hands.
    Aspirational commercial photography quality.
    Sharp details. Cinematic but clean.`,

  composicion_post: `Format: vertical Instagram post
    1080x1350px. Composition: white background editorial
    layout. Left side for headline and structured
    information modules. Right side with large curved
    photo window showing expo scene. Bottom area for
    statistics or CTA. Strong visual balance.
    Generous white space. Clean corporate finish.`,

  composicion_banner: `Format: ultra-wide horizontal
    banner 2048x700px. Left 45%: completely clean white
    space for editable text and logos. NO patterns,
    NO text, NO stripes on left side. Right 55%:
    realistic expo photo scene. Soft fade transition.
    Important faces must NOT be in upper-right corner.`
};

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
    // UPGRADE 4: memoria semántica de victorias y patrones del cliente
    let memoriaCtx = '';
    try {
      memoriaCtx = await buildMemoryContext(
        clientBrief.cliente || clientBrief.client_id || '',
        'branding',
        JSON.stringify(clientBrief).slice(0, 500)
      );
    } catch { /* no bloquea */ }

    const conceptPrompt = `${this.basePrompt}
${memoriaCtx ? memoriaCtx + '\n' : ''}
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

  // ─── BLOQUE H: JSON PROMPTING + BRIEF → IMAGE PIPELINE ───────────────────

  /**
   * Construye el prompt completo FIF a partir de un brief de parrilla.
   * Combina FIF_VISUAL_SYSTEM.base + fotografia + composicion correcta + brief específico.
   *
   * @param {object} brief - registro de parrilla_briefs
   * @returns {string} prompt listo para enviar a Higgsfield
   */
  buildPromptFromBrief(brief, memoriaCtx = '') {
    const composicion = brief.tipo_pieza === 'banner'
      ? FIF_VISUAL_SYSTEM.composicion_banner
      : FIF_VISUAL_SYSTEM.composicion_post;

    // ── REGLA CRÍTICA: NUNCA inyectar texto del headline en el prompt de imagen ──
    // El texto se monta en post-producción con Gotham. Ver typography-spec.js.
    // El headline se usa SOLO como contexto de tono visual, NO como texto a renderizar.
    const tono_visual = brief.headline
      ? `Visual tone reference (DO NOT render as text): ${brief.headline}`
      : '';

    const basePrompt = [
      FIF_VISUAL_SYSTEM.base,
      FIF_VISUAL_SYSTEM.fotografia,
      composicion,
      `BRIEF ESPECÍFICO:\n${brief.prompt_higgsfield || brief.concepto || ''}`,
      tono_visual,
      brief.objetivo ? `Visual objective: ${brief.objetivo}` : '',
      brief.notas_para_carlos ? brief.notas_para_carlos : '',
      memoriaCtx ? `\n${memoriaCtx}` : ''
    ].filter(Boolean).join('\n\n');

    // Siempre pasar por generateNoTextImagePrompt para garantizar zonas limpias
    return generateNoTextImagePrompt(basePrompt, brief.tipo_pieza || 'post_informativo', brief);
  }

  /**
   * PASO 2: Genera el spec tipográfico para una pieza.
   * Debe llamarse DESPUÉS de generar la imagen base.
   * El spec es lo que Claudia/producción monta en Photoshop/Canva.
   */
  generateTypographySpecForBrief(brief) {
    const content = {
      headline:      brief.headline     || '',
      subheadline:   brief.subheadline  || brief.descripcion || '',
      cta:           brief.cta          || 'REGÍSTRATE AHORA',
      fecha:         brief.fecha        || '',
      sede:          brief.sede         || '',
      url:           brief.url          || 'www.efg.com.mx',
      dato_clave:    brief.dato_clave   || '',
      eyebrow:       brief.eyebrow      || (brief.cliente || 'EFG').toUpperCase(),
      bullets:       brief.bullets      || [],
    };
    return generateTypographySpec(brief, content);
  }

  /**
   * Genera imagen(es) a partir de un brief de parrilla_briefs.
   * Rutea a generateCarousel() si tipo_pieza === 'carousel'.
   * Para piezas individuales usa buildPromptFromBrief() + GPT Image 2 con fallback Nano Banana.
   *
   * @param {object} brief - registro completo de parrilla_briefs
   * @returns {object} resultado con images/variations + model_used
   */
  async generateFromBrief(brief) {
    if (!brief) throw new Error('generateFromBrief: brief requerido');

    // Routear carousel a su propio flujo
    if (brief.tipo_pieza === 'carousel') {
      return this.generateCarousel(brief);
    }

    // ── VALIDACIÓN TIPOGRÁFICA ANTES DE GENERAR ───────────────────────────────
    const typoValidation = validateBriefForTypography(brief);
    if (!typoValidation.valid) {
      console.warn(`[Carlos] Brief incompleto para spec tipográfico:`, typoValidation.errors);
    }
    if (typoValidation.warnings.length > 0) {
      console.log(`[Carlos] Advertencias brief:`, typoValidation.warnings);
    }

    // UPGRADE 4: Enriquecer prompt con memoria semántica
    let memoriaCtx = '';
    try {
      memoriaCtx = await buildMemoryContext(
        brief.cliente || 'FIF',
        brief.tipo_pieza,
        brief.concepto || brief.prompt_higgsfield || ''
      );
      if (memoriaCtx) {
        console.log(`[Carlos] Memoria semántica inyectada (${memoriaCtx.length} chars)`);
      }
    } catch { /* no bloquea si falla */ }

    // ── PASO 1: Imagen BASE sin texto (buildPromptFromBrief ya aplica no-text rules) ──
    const prompt = this.buildPromptFromBrief(brief, memoriaCtx);
    const isBanner = brief.tipo_pieza === 'banner';
    const aspectRatio = isBanner ? '16:9' : '4:5';
    const quality = '2k';

    console.log(`🎨 CARLOS [PASO 1 - Background sin texto]: ${brief.tipo_pieza} — "${prompt.substring(0, 80)}..."`);

    let imageResult = null;

    // GPT Image 2 primary
    try {
      const primaryRatio = aspectRatio === '4:5' ? '3:4' : aspectRatio;
      const [v1, v2] = await Promise.all([
        higgsfield.generateImage(prompt, { model: 'gpt_image_2', aspectRatio: primaryRatio, quality }),
        higgsfield.generateImage(prompt, { model: 'gpt_image_2', aspectRatio: primaryRatio, quality })
      ]);
      imageResult = { images: [v1, v2], model_used: 'gpt_image_2' };
      console.log(`✅ CARLOS [PASO 1]: Background generado (GPT Image 2)`);
    } catch (e) {
      console.warn(`[Carlos] GPT Image 2 falló (${e.message}), usando Nano Banana Pro...`);
      try {
        const [f1, f2] = await Promise.all([
          higgsfield.generateImage(prompt, { model: 'nano_banana_2', aspectRatio, quality }),
          higgsfield.generateImage(prompt, { model: 'nano_banana_2', aspectRatio, quality })
        ]);
        imageResult = { images: [f1, f2], model_used: 'nano_banana_2' };
        console.log(`✅ CARLOS [PASO 1]: Background generado (Nano Banana Pro - fallback)`);
      } catch (fallbackErr) {
        console.error('[Carlos] Ambos modelos fallaron:', fallbackErr.message);
        return { success: false, error: fallbackErr.message, prompt };
      }
    }

    // ── PASO 2: Spec tipográfico (Gotham — consistente 100%) ──────────────────
    const typoSpec = this.generateTypographySpecForBrief(brief);
    console.log(`📝 CARLOS [PASO 2 - Typography Spec]: ${typoSpec.capas.length} capas Gotham generadas`);

    // Save to Supabase if brief has ID
    if (brief.id && imageResult) {
      try {
        const { supabase } = require('../core/supabase');
        await supabase.from('parrilla_briefs').update({
          url_arte_final:  imageResult.images[0]?.resultUrl,
          url_arte_v2:     imageResult.images[1]?.resultUrl,
          status:          'listo_qc',
          metadata: {
            ...(brief.metadata || {}),
            typo_spec:     typoSpec,
            typo_valid:    typoValidation,
            pipeline_step: 'background_generated_text_pending',
            nota_produccion: 'Imagen sin texto generada. Montar texto según typo_spec con Gotham.'
          }
        }).eq('id', brief.id);
      } catch (dbErr) {
        console.warn('[Carlos generateFromBrief] DB update error (non-fatal):', dbErr.message);
      }
    }

    return {
      success:    true,
      images:     imageResult.images,
      model_used: imageResult.model_used,
      prompt,
      typo_spec:  typoSpec,
      typo_validation: typoValidation,
      pipeline_notes: [
        '✅ Paso 1: Background visual generado SIN texto (listo para montaje)',
        `✅ Paso 2: Spec tipográfico Gotham generado (${typoSpec.capas.length} capas)`,
        '⏳ Paso 3: Valentina QC — revisar composición + consistencia de marca',
        '⏳ Paso 4: Producción monta texto con Gotham según spec',
        '⏳ Paso 5: QC final antes de entregar a Claudia',
      ]
    };
  }

  /**
   * Genera un carousel completo usando JSON prompting.
   * Paso 1: Claude genera JSON con specs de 5-7 slides.
   * Paso 2: Se genera cada slide con el mismo estilo base FIF.
   *
   * @param {object} brief - registro de parrilla_briefs con tipo_pieza === 'carousel'
   * @returns {object} { success, images: [{slide, url, specs}], model_used }
   */
  async generateCarousel(brief) {
    console.log(`🎨 CARLOS [generateCarousel]: generando carousel FIF — "${brief.headline || brief.concepto}"`);

    // Paso 1: Generar JSON con specs de slides
    let slides = {};
    try {
      const jsonPrompt = `Genera el JSON de especificaciones para
un carousel de Instagram de FIF (Feria Internacional de Franquicias)
con este brief:

Headline: ${brief.headline || ''}
Concepto: ${brief.concepto || ''}
Objetivo: ${brief.objetivo || ''}
Copy de apoyo: ${brief.copy_apoyo || ''}
CTA: ${brief.cta || ''}

El JSON debe tener entre 5-7 slides.
Para cada slide incluir:
- tipo: cover/contenido/datos/cta
- headline_slide (corto, máximo 8 palabras, impacto)
- visual_prompt (en inglés, para GPT Image 2, 2 oraciones)
- composicion (descripción del layout de este slide)
- elementos_graficos (iconos, módulos o datos a incluir)

Todos los slides deben compartir el mismo
estilo visual FIF para verse como una serie cohesiva.
Responde SOLO en JSON válido, sin texto extra.
Formato: { "slide_1": {...}, "slide_2": {...}, ... }`;

      const rawJson = await this.think(jsonPrompt, { skipFormatting: true });
      // Limpiar markdown si Claude envuelve en ```json
      const clean = rawJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      slides = JSON.parse(clean);
    } catch (jsonErr) {
      console.warn('[Carlos generateCarousel] JSON generation error:', jsonErr.message);
      // Fallback: slides básicos si Claude falla
      slides = {
        slide_1: { tipo: 'cover', headline_slide: brief.headline || 'FIF 2025', visual_prompt: 'Premium franchise expo hall, Mexico City. Navy and red brand colors.', composicion: 'Full bleed expo photo with headline overlay area bottom', elementos_graficos: 'FIF logo area top, large headline' },
        slide_2: { tipo: 'contenido', headline_slide: brief.objetivo || 'Tu próximo negocio', visual_prompt: 'Professional entrepreneurs networking at franchise expo. Warm lighting.', composicion: 'Split layout: left info modules, right expo photo', elementos_graficos: '3 benefit icons, supporting copy' },
        slide_3: { tipo: 'cta', headline_slide: brief.cta || '¡Regístrate ya!', visual_prompt: 'Aspirational franchise expo booth, navy red white colors. Premium feel.', composicion: 'Clean white background, centered headline, bold CTA button area', elementos_graficos: 'CTA button, date/location info, FIF branding' }
      };
    }

    // Paso 2: Generar cada slide como imagen
    const images = [];
    for (const [key, slide] of Object.entries(slides)) {
      const slidePrompt = `${FIF_VISUAL_SYSTEM.base}

${FIF_VISUAL_SYSTEM.fotografia}

${FIF_VISUAL_SYSTEM.composicion_post}

${slide.visual_prompt}

Layout: ${slide.composicion}
Include: ${slide.elementos_graficos}
This is ${key} of a coordinated carousel series.
Must match the visual style of all other slides in the series.`;

      try {
        const img = await higgsfield.generateImage(slidePrompt, {
          model: 'gpt_image_2',
          aspectRatio: '3:4',
          quality: '2k'
        });
        images.push({ slide: key, url: img.resultUrl, specs: slide, model: 'gpt_image_2' });
      } catch (imgErr) {
        // Fallback por slide individual
        try {
          const imgFb = await higgsfield.generateImage(slidePrompt, {
            model: 'nano_banana_2',
            aspectRatio: '4:5',
            quality: '2k'
          });
          images.push({ slide: key, url: imgFb.resultUrl, specs: slide, model: 'nano_banana_2' });
        } catch (fbErr) {
          console.warn(`[Carlos carousel] slide ${key} falló:`, fbErr.message);
          images.push({ slide: key, url: null, specs: slide, error: fbErr.message });
        }
      }
    }

    // Actualizar parrilla_brief si tiene ID
    const successImages = images.filter(i => i.url);
    if (brief.id && successImages.length > 0) {
      try {
        const { supabase } = require('../core/supabase');
        await supabase.from('parrilla_briefs').update({
          url_arte_final: successImages[0]?.url,
          url_arte_v2: successImages[1]?.url || null,
          url_arte_v3: successImages[2]?.url || null,
          status: 'listo_qc',
          notas_revision: `Carousel ${images.length} slides generados (${successImages.length} exitosos)`
        }).eq('id', brief.id);
      } catch (dbErr) {
        console.warn('[Carlos generateCarousel] DB update error (non-fatal):', dbErr.message);
      }
    }

    const modelUsed = images.find(i => i.model)?.model || 'gpt_image_2';
    console.log(`✅ CARLOS [carousel]: ${successImages.length}/${images.length} slides generados con ${modelUsed}`);

    return {
      success: successImages.length > 0,
      images,
      total_slides: images.length,
      successful_slides: successImages.length,
      model_used: modelUsed,
      slide_specs: slides
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
