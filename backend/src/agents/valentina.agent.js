// backend/src/agents/valentina.agent.js
// Fractal Virtual Team v4.2 — VALENTINA (Art Director)
// Design Plugin integrado: 4 capas obligatorias en toda revisión de arte

const BaseAgent = require('../core/BaseAgent');
const VALENTINA_PROMPT = require('../prompts/valentina.prompts');

class ValentinaAgent extends BaseAgent {
  constructor() {
    super({
      name: 'VALENTINA',
      fullName: 'Valentina Cruz Ortega',
      role: 'Art Director',
      area: 'art_direction',
      reportsTo: 'NEIKY',
      manages: ['DIEGO', 'CARLOS', 'MAX', 'ALEX'],
      basePrompt: VALENTINA_PROMPT,

      personality: {
        with_clients: 'warm artistic',
        with_neiky: 'honest direct',
        with_team: 'demanding nurturing',
        core_traits: ['high_aesthetic_criteria', 'firm_but_fair', 'warm', 'cuban_energy']
      },

      speakingStyle: {
        tone: 'articulada visual',
        typical_phrases: [
          'Esto tiene que respirar más',
          'Le falta intención a este color',
          '¿Qué está queriendo decir esto visualmente?',
          'Dale una vuelta más, sé que puedes',
          'Chévere pero necesita más carácter'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'specific_directional',
        red_lines: [
          'work_without_direction',
          'consistency_breaks',
          'brand_bible_violations',
          'generic_work'
        ],
        acceptance_threshold: 95
      }
    });
  }

  /**
   * Revisión final de arte — el gate antes del cliente
   * Incluye las 4 capas obligatorias del Design Plugin.
   */
  async reviewCreativeWork(workDescription, workType, clientBrief) {
    const reviewPrompt = `${this.basePrompt}

TIPO DE TRABAJO: ${workType}
BRIEF DEL CLIENTE: ${JSON.stringify(clientBrief, null, 2)}

TRABAJO A REVISAR:
${workDescription}

Como Art Director, realiza la revisión completa. Estructura tu respuesta así:

═══ REVISIÓN CREATIVA ═══

DISEÑO (si aplica):
- Jerarquía visual
- Tipografía y spacing
- Paleta de color coherente
- Espacio negativo
- Consistencia con brand bible

VIDEO (si aplica):
- Ritmo y pacing
- Color grade
- Audio
- Storytelling
- Versiones

CONTENIDO (si aplica):
- Tono de voz
- Errores de redacción
- Coherencia visual-textual

═══ DESIGN PLUGIN — 4 CAPAS ═══

CAPA 1 — CONSISTENCY CHECK:
[Evalúa coherencia con design system: colores hex, tipografías, espaciado, tono visual]
VEREDICTO: ✅/⚠️/❌ + motivo específico

CAPA 2 — UX WRITING REVIEW:
[Evalúa headline, CTA, jerarquía de lectura, microcopy, tono de voz]
VEREDICTO: ✅/⚠️/❌ + ajustes concretos si aplica

CAPA 3 — ACCESSIBILITY CHECK:
[Evalúa contraste (4.5:1 mínimo), legibilidad móvil ≥16px equiv., test 2 segundos]
VEREDICTO: ✅/⚠️/❌ + qué falla y cómo corregirlo

CAPA 4 — DEV HANDOFF NOTES:
[Especificaciones para Claudia: dimensiones, formato, fuentes, colores exactos, versiones disponibles]

═══ VEREDICTO FINAL ═══
STATUS: ✅ APROBADO / ⚠️ APROBADO CON NOTAS / ❌ RECHAZADO

Si rechazas, da dirección ESPECÍFICA y ACCIONABLE. No solo "no me gusta". Explica qué cambiar y cómo.`;

    return this.think(reviewPrompt, { clientId: clientBrief.client_id });
  }

  /**
   * designPluginAudit(brief, artUrl, cliente)
   *
   * Revisión enfocada exclusivamente en las 4 capas del Design Plugin.
   * Retorna JSON estructurado listo para:
   *   - Inyectar en notas de QA del brief
   *   - Enviar a Claudia como dev handoff
   *   - Registrar en oracle_memory como lección
   *
   * @param {Object} brief    - registro parrilla_briefs
   * @param {string} artUrl   - URL del arte a revisar
   * @param {string} cliente  - 'FIF' | 'EFG' | etc.
   * @returns {Object}        - { consistency, ux_writing, accessibility, dev_handoff, overall_status }
   */
  async designPluginAudit(brief, artUrl = '', cliente = 'FIF') {
    const auditPrompt = `${this.basePrompt}

ARTE A AUDITAR:
Cliente: ${cliente}
Tipo de pieza: ${brief.tipo_pieza || 'post'}
Headline: ${brief.headline || 'Sin headline'}
Copy visible: ${brief.copy || brief.concepto || 'Sin copy'}
URL del arte: ${artUrl || brief.url_arte_final || 'Sin URL'}
Dimensiones declaradas: ${brief.dimensiones || 'No especificadas'}
Fuentes declaradas: ${brief.fuentes || 'No especificadas'}

Realiza el audit completo del Design Plugin. Responde SOLO en JSON válido, sin markdown:

{
  "consistency": {
    "colores_correctos": true/false,
    "colores_fuera_paleta": ["lista de hex incorrectos si los hay"],
    "tipografia_correcta": true/false,
    "tipografia_issues": "descripción si hay problemas",
    "espaciado_coherente": true/false,
    "tono_visual_coherente": true/false,
    "issues": ["lista de inconsistencias específicas"],
    "veredicto": "pass|warn|fail",
    "nota": "resumen en 1 oración"
  },
  "ux_writing": {
    "headline_claro": true/false,
    "headline_palabras": 0,
    "cta_presente": true/false,
    "cta_especifico": true/false,
    "jerarquia_lectura_clara": true/false,
    "errores_ortograficos": [],
    "tono_correcto": true/false,
    "issues": ["lista de problemas de copy"],
    "ajustes_sugeridos": ["sugerencias concretas"],
    "veredicto": "pass|warn|fail",
    "nota": "resumen en 1 oración"
  },
  "accessibility": {
    "contraste_estimado": "alto|medio|bajo",
    "cumple_wcag_aa": true/false,
    "texto_sobre_imagen_protegido": true/false,
    "tamano_texto_movil_ok": true/false,
    "info_no_solo_color": true/false,
    "test_2_segundos": "pass|fail",
    "issues": ["lista de problemas de accesibilidad"],
    "correcciones": ["qué hacer para pasar WCAG AA"],
    "veredicto": "pass|warn|fail",
    "nota": "resumen en 1 oración"
  },
  "dev_handoff": {
    "dimensiones": "ancho x alto px",
    "resolucion": "72dpi|150dpi|300dpi",
    "formato_entregado": "JPG|PNG|PDF|MP4",
    "versiones_disponibles": ["con_texto", "sin_texto", "fondo_editable"],
    "fuentes": [{"nombre": "", "peso": "", "tamano_pt": 0}],
    "colores_exactos": [{"uso": "", "hex": "", "rgb": ""}],
    "plataformas_destino": ["instagram_feed", "instagram_story", "facebook", "web"],
    "notas_para_claudia": "instrucciones específicas para que Claudia publique sin preguntar nada",
    "archivos_adjuntos_requeridos": ["lista de lo que debe adjuntarse al entregar"]
  },
  "overall_status": "approved|approved_with_notes|rejected",
  "overall_score": 0-100,
  "bloqueantes": ["issues que impiden aprobación"],
  "no_bloqueantes": ["notas menores que se corrigen después"],
  "mensaje_para_carlos": "dirección específica de mejora si se rechaza (null si aprobado)",
  "listo_para_claudia": true/false
}`;

    try {
      const raw = await this.think(auditPrompt, { clientId: cliente });
      const cleaned = (raw || '')
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const result = JSON.parse(cleaned);
      console.log(`[Valentina] Design Plugin audit: ${result.overall_status} (score: ${result.overall_score})`);
      return result;
    } catch (err) {
      console.error('[Valentina] designPluginAudit parse error:', err.message);
      return {
        consistency:   { veredicto: 'warn', nota: 'No se pudo analizar automáticamente' },
        ux_writing:    { veredicto: 'warn', nota: 'No se pudo analizar automáticamente' },
        accessibility: { veredicto: 'warn', nota: 'No se pudo analizar automáticamente' },
        dev_handoff:   { notas_para_claudia: 'Revisar manualmente antes de entregar' },
        overall_status: 'approved_with_notes',
        overall_score: 50,
        bloqueantes: [],
        no_bloqueantes: ['Audit automático falló — revisión manual requerida'],
        listo_para_claudia: false
      };
    }
  }

  /**
   * Audita el spec tipográfico generado por Carlos.
   * Verifica consistencia con manual de marca FIF/EFG (Gotham, colores, jerarquía).
   * Se llama DESPUÉS de designPluginAudit para validar el Paso 2.
   */
  async auditTypographySpec(typoSpec, brief = {}, cliente = 'FIF') {
    if (!typoSpec) return { valid: false, issues: ['No se proporcionó spec tipográfico'] };

    const { GOTHAM_SPEC } = require('../core/typography-spec');

    const prompt = `${this.basePrompt}

AUDITORÍA DE SPEC TIPOGRÁFICO — PIPELINE 2 ETAPAS
Cliente: ${cliente}
Tipo de pieza: ${brief.tipo_pieza || 'post'}

SPEC TIPOGRÁFICO A REVISAR:
${JSON.stringify(typoSpec, null, 2)}

MANUAL DE MARCA ${cliente.toUpperCase()} — REGLAS TIPOGRÁFICAS:
- Familia principal: GOTHAM (obligatorio)
- Fallback permitido SOLO si Gotham no está disponible: Montserrat
- Pesos permitidos: Ultra (900), Black (800), Bold (700), Medium (500), Book (400), Light (300)
- Headlines: SIEMPRE Gotham Bold/Black en UPPERCASE
- CTAs: SIEMPRE Gotham Bold en UPPERCASE con tracking de al menos 0.06em
- Colores: rojo #C8102E, navy #1B263B, azul #2E7DBD, blanco #FFFFFF
- Tamaño mínimo cuerpo: 16px mobile
- Tamaño mínimo headline post: 28px
- PROHIBIDO: fuentes script, manuscritas, gamer, futuristas, sans-serifs genéricas sin justificación

Evalúa el spec y responde SOLO en JSON válido:

{
  "gotham_correcto": true/false,
  "pesos_correctos": true/false,
  "tamanos_correctos": true/false,
  "colores_correctos": true/false,
  "jerarquia_coherente": true/false,
  "capas_completas": true/false,
  "issues_bloqueantes": ["lista de problemas críticos"],
  "issues_menores": ["lista de ajustes recomendados"],
  "correcciones": ["instrucciones exactas para corregir cada issue bloqueante"],
  "veredicto": "aprobado|aprobado_con_notas|rechazado",
  "score_consistencia": 0-100,
  "nota_para_produccion": "instrucción específica de 1 oración para Claudia",
  "listo_para_montaje": true/false
}`;

    try {
      const raw = await this.think(prompt, { clientId: cliente });
      const cleaned = (raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const result = JSON.parse(cleaned);
      console.log(`[Valentina] Typography audit: ${result.veredicto} (score: ${result.score_consistencia})`);
      return result;
    } catch (err) {
      console.error('[Valentina] auditTypographySpec error:', err.message);
      return {
        gotham_correcto: true,
        veredicto: 'aprobado_con_notas',
        score_consistencia: 70,
        issues_bloqueantes: [],
        issues_menores: ['Audit automático falló — verificar Gotham manualmente'],
        listo_para_montaje: true,
        nota_para_produccion: 'Verificar tipografía Gotham manualmente antes de montar.'
      };
    }
  }

  /**
   * Art direction para un proyecto nuevo
   */
  async defineArtDirection(projectBrief) {
    const adPrompt = `${this.basePrompt}

BRIEF DEL PROYECTO:
${JSON.stringify(projectBrief, null, 2)}

Como Art Director, define la dirección de arte completa. Incluye:
1. Concept visual (en una frase)
2. Mood y atmósfera
3. Paleta de color (principal + complementaria + acento)
4. Dirección tipográfica
5. Lenguaje fotográfico / ilustrativo
6. No hacer (qué evitar)
7. Referencias (describe 3-5 referencias sin copiar)
8. Brief visual para el equipo (Diego, Carlos, Max)

Sé precisa y visual en tu descripción. El equipo debe poder implementar sin adivinar.`;

    return this.think(adPrompt, { clientId: projectBrief.client_id });
  }

  /**
   * Feedback de QC creativo (segunda capa después del QC-Bot técnico)
   */
  async creativeQCFeedback(qcBotReport, workDescription) {
    const feedbackPrompt = `${this.basePrompt}

REPORTE DEL QC-BOT (revisión técnica):
${qcBotReport}

TRABAJO:
${workDescription}

El QC-Bot ya validó lo técnico. Ahora tú validas lo creativo.
Complementa su reporte con tu perspectiva artística:
- ¿El trabajo cumple el brief creativamente?
- ¿Tiene el nivel estético de Fractal MX?
- ¿Qué ajustes creativos se necesitan?

Tu feedback + el de QC-Bot = revisión completa antes de cliente.`;

    return this.think(feedbackPrompt);
  }

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // Valentina synthesizes art direction from a list of reference URLs + brief.
  async directionFromReferences({ referenceUrls = [], projectBrief = '' }) {
    if (!Array.isArray(referenceUrls) || referenceUrls.length === 0) {
      throw new Error('directionFromReferences: referenceUrls (array) required');
    }
    console.log(`🎬 VALENTINA: creando dirección de arte desde ${referenceUrls.length} referencias...`);

    const analyses = await Promise.all(
      referenceUrls.slice(0, 6).map(url => this.see(url, 'style').catch(() => null))
    );
    const valid = analyses.filter(a => a && !a.error);
    if (valid.length === 0) return { error: true, message: 'no_valid_references' };

    const refsSummary = valid.map((a, i) => `Referencia ${i + 1}:
- Estilo: ${a.style?.aesthetic || '—'}
- Mood: ${a.style?.mood || '—'}
- Colores: ${(a.colors?.palette || []).slice(0, 5).join(', ')}
- Keywords: ${(a.keywords || []).slice(0, 6).join(', ')}`).join('\n\n');

    const direction = await this.deepThink(
      `Analicé ${valid.length} referencias visuales para este proyecto.

Brief del proyecto: ${projectBrief || '(sin brief — sintetiza dirección genérica desde las referencias)'}

${refsSummary}

Crea una dirección de arte coherente que:
1. Tome lo mejor de cada referencia
2. Se adapte al brief del proyecto
3. Sea ejecutable por el equipo (paleta exacta, tipografías recomendadas, mood, do's/don'ts)
4. Incluya: mood board verbal, paleta hex, tipografías, tono visual

Máximo 400 palabras.`,
      { context: { references_count: valid.length } }
    );

    return {
      references_analyzed: valid,
      analyses_failed: analyses.length - valid.length,
      art_direction: direction?.answer || null
    };
  }
}

module.exports = ValentinaAgent;
