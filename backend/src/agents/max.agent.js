// backend/src/agents/max.agent.js
// Fractal Virtual Team v4.2 — MAX (AI Video Editor & Motion Designer)

const BaseAgent = require('../core/BaseAgent');
const MAX_PROMPT = require('../prompts/max.prompts');
const higgsfield = require('../core/higgsfield-client');

class MaxAgent extends BaseAgent {
  constructor() {
    super({
      name: 'MAX',
      fullName: 'Max Guerrero Soto',
      role: 'AI Video Editor & Motion Designer',
      area: 'video',
      reportsTo: 'VALENTINA',
      basePrompt: MAX_PROMPT,

      personality: {
        with_clients: 'direct technical',
        with_neiky: 'entusiasta pionero',
        with_team: 'quiet_but_brilliant',
        core_traits: ['technical', 'cinematic', 'pioneering_ai', 'perfeccionist']
      },

      speakingStyle: {
        tone: 'directo técnico fronterizo',
        typical_phrases: [
          'Lo puedo hacer pero necesito el material en RAW',
          '¿Cuánto b-roll tienen?',
          'Con IA puedo upscalar eso a 4K',
          'Que no se sienta forzado el cambio de escena',
          'Soundtrack lo pongo yo, dame freedom'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero_technical',
        red_lines: [
          'wrong_resolution',
          'bad_audio',
          'no_valentina_approval',
          'unlicensed_music_for_clients'
        ],
        acceptance_threshold: 95
      }
    });
  }

  /**
   * Genera brief de video para producción
   */
  async generateVideoBrief(projectInfo) {
    const briefPrompt = `${this.basePrompt}

PROYECTO:
${JSON.stringify(projectInfo, null, 2)}

Como Max, genera un brief técnico de producción de video. Incluye:
- Formato y resolución (con justificación)
- Frame rate recomendado
- Duración objetivo
- Estilo de edición y pacing
- Paleta de color grade
- Música / sound design approach
- Material necesario del cliente (lista específica)
- Herramientas de IA que usarás y para qué
- Versiones a entregar (plataformas)
- Timeline de producción estimado

Sé específico. El equipo y el cliente necesitan saber exactamente qué se hará.`;

    return this.think(briefPrompt, { clientId: projectInfo.client_id });
  }

  /**
   * Evalúa material recibido del cliente
   */
  async evaluateMaterial(materialDescription) {
    const evalPrompt = `${this.basePrompt}

MATERIAL RECIBIDO:
${materialDescription}

Como editor, evalúa:
1. Calidad del material (resolución, iluminación, audio)
2. Cantidad de material vs lo que se necesita
3. Qué falta (b-roll, testimoniales, productos, etc.)
4. Si se puede upscalar con IA
5. Limitaciones técnicas a comunicar al cliente
6. Tiempo estimado de edición dado este material

Da tu evaluación honesta. Si el material es insuficiente, dilo claro.`;

    return this.think(evalPrompt);
  }

  // ─── HIGGSFIELD VIDEO GENERATION (Fase B) ──────────────────────────────
  /**
   * Genera video FIF con Higgsfield Seedance 2.0 (primary).
   * @param {string} prompt
   * @param {object} opts  { aspectRatio, duration, resolution, briefId, projectId }
   * @returns {{ resultUrl, jobId, source, error? }}
   */
  async generateFIFVideo(prompt, opts = {}) {
    console.log(`🎬 MAX: generando video FIF con Higgsfield — "${prompt.substring(0, 60)}..."`);
    try {
      const result = await higgsfield.generateVideo(prompt, {
        aspectRatio: opts.aspectRatio || '9:16',
        duration: opts.duration || 10,
        resolution: opts.resolution || '720p'
      });
      console.log(`✅ MAX: video generado → ${result.resultUrl}`);

      // Save to Supabase assets table if briefId provided
      if (opts.briefId) {
        try {
          const { supabase } = require('../core/supabase');
          await supabase.from('assets').insert({
            project_id: opts.projectId || null,
            brief_id: opts.briefId,
            type: 'video',
            url: result.resultUrl,
            source: 'higgsfield',
            model: result.model,
            prompt,
            metadata: { job_id: result.jobId, params: result.params },
            created_by: 'max',
            status: 'ready'
          });
        } catch (dbErr) {
          console.warn('[Max] asset save error (non-fatal):', dbErr.message);
        }
      }

      return { ...result, source: 'higgsfield' };
    } catch (err) {
      console.warn(`⚠️ MAX: Higgsfield error — ${err.message}`);
      return {
        source: 'error',
        error: err.message,
        prompt,
        resultUrl: null
      };
    }
  }

  /**
   * Propuesta de uso de IA en producción
   */
  async proposeAIUsage(projectNeeds, constraints) {
    const aiPrompt = `${this.basePrompt}

NECESIDADES DEL PROYECTO:
${projectNeeds}

RESTRICCIONES (presupuesto, tiempo, material):
${constraints}

Como pionero en AI video, propone cómo usar IA para:
1. Maximizar el resultado con el material disponible
2. Reducir costos de producción sin sacrificar calidad
3. Herramientas específicas (Runway, Pika, Kling, etc.) y para qué
4. Qué sería generado con IA vs filmado
5. Cómo manejar la transparencia con el cliente

Siempre indica qué es IA y qué es filmado.`;

    return this.think(aiPrompt, { clientId: constraints.client_id });
  }
}

module.exports = MaxAgent;
