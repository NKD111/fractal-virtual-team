// backend/src/agents/qcbot.agent.js
// Fractal Virtual Team v4.2 — QC-BOT (Automated Quality Control)

const BaseAgent = require('../core/BaseAgent');
const QCBOT_PROMPT = require('../prompts/qcbot.prompts');

class QCBotAgent extends BaseAgent {
  constructor() {
    super({
      name: 'QCBOT',
      fullName: 'QC-BOT Automated',
      role: 'Quality Control System (Automatizado)',
      area: 'quality_control',
      basePrompt: QCBOT_PROMPT,

      personality: {
        core_traits: ['objective', 'systematic', 'non_emotional', 'thorough']
      },

      speakingStyle: {
        tone: 'objective technical',
        typical_phrases: [
          'QC REPORT:',
          'STATUS: ✅ APROBADO',
          'STATUS: ❌ RECHAZADO',
          'CHECKS REALIZADOS:'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        red_lines: ['data_errors', 'technical_failures', 'below_minimum_specs'],
        acceptance_threshold: 100
      }
    });

    // Checks técnicos por tipo
    this.DESIGN_CHECKS = [
      'dimensions_correct',
      'resolution_minimum',
      'color_mode',
      'fonts_embedded',
      'no_spelling_errors',
      'correct_logo_version',
      'margins_and_bleed',
      'filename_convention'
    ];

    this.VIDEO_CHECKS = [
      'resolution_correct',
      'frame_rate_correct',
      'duration_in_range',
      'audio_levels_correct',
      'subtitles_if_required',
      'platform_versions',
      'no_compression_artifacts',
      'color_space_correct'
    ];

    this.CONTENT_CHECKS = [
      'no_spelling_errors',
      'no_grammar_errors',
      'data_verified',
      'hashtags_correct',
      'mentions_correct',
      'links_working',
      'length_appropriate'
    ];
  }

  /**
   * Procesa un check completo de QC
   */
  async processCheck(checkData) {
    const { taskId, assetType, assetDescription, brief, createdBy } = checkData;

    await this.updateStatus('thinking', 'neutral');

    const checksToRun = this.getChecksForType(assetType);

    const checkPrompt = `${this.basePrompt}

TAREA: ${taskId}
TIPO: ${assetType}
CREADO POR: ${createdBy}
BRIEF:
${JSON.stringify(brief, null, 2)}

DESCRIPCIÓN DEL ASSET:
${assetDescription}

CHECKS TÉCNICOS A REALIZAR:
${checksToRun.map(c => `□ ${c}`).join('\n')}

Realiza cada check e indica si pasó (✅) o falló (❌).
Para los fallos, sé específico: qué falla, dónde está, cómo corregirlo.

Genera el QC REPORT completo en el formato establecido.
Incluye STATUS final y el SIGUIENTE PASO.`;

    const report = await this.think(checkPrompt);

    // Guardar en DB
    await this.saveQCResult(taskId, report, assetType);

    // Notificar al creador
    if (createdBy) {
      await this.sendMessageTo(createdBy,
        `QC completado para tarea ${taskId}.\n\n${report.substring(0, 500)}...`,
        { type: 'qc_result', taskId }
      );
    }

    // Si aprobado, notificar a Valentina
    if (report.includes('✅ APROBADO')) {
      await this.sendMessageTo('VALENTINA',
        `QC-Bot aprobó tarea ${taskId} (${assetType}). Pendiente tu revisión creativa.\n\nReporte técnico:\n${report.substring(0, 800)}`,
        { type: 'approval_request', taskId }
      );
    }

    await this.updateStatus('idle', 'neutral');

    return report;
  }

  /**
   * Check rápido de ortografía/datos en texto
   */
  async quickTextCheck(text, clientData) {
    const quickPrompt = `${this.basePrompt}

Realiza un check rápido de este texto:
"${text}"

Cliente: ${clientData?.name || 'desconocido'}

Verifica SOLO:
□ Errores ortográficos
□ Errores gramaticales evidentes
□ Datos que deberían verificarse (nombres, fechas, precios)

Output: lista de issues o "✅ Sin issues encontrados"`;

    return this.think(quickPrompt);
  }

  /**
   * Obtiene lista de checks según tipo
   */
  getChecksForType(type) {
    const typeMap = {
      design: this.DESIGN_CHECKS,
      video: this.VIDEO_CHECKS,
      content: this.CONTENT_CHECKS,
      all: [...this.DESIGN_CHECKS, ...this.VIDEO_CHECKS, ...this.CONTENT_CHECKS]
    };

    return typeMap[type] || this.CONTENT_CHECKS;
  }

  /**
   * Guarda resultado de QC en base de datos
   */
  async saveQCResult(taskId, report, type) {
    const status = report.includes('✅ APROBADO') ? 'approved' :
                   report.includes('⚠️') ? 'approved_with_notes' : 'rejected';

    try {
      await this.supabase
        .from('qc_checks')
        .update({
          status,
          qc_report: report,
          reviewed_at: new Date()
        })
        .eq('task_id', taskId);
    } catch (e) {
      // Si no existe el qc_check, crear uno
      await this.supabase
        .from('qc_checks')
        .insert({
          task_id: taskId,
          check_type: type,
          status,
          qc_report: report,
          reviewed_at: new Date()
        });
    }
  }

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // QC-Bot performs visual QC review by comparing a deliverable to a reference.
  async visualQCReview({ deliverableImageUrl, referenceUrl = null, projectId = null, briefId = null }) {
    if (!deliverableImageUrl) throw new Error('visualQCReview: deliverableImageUrl required');
    console.log(`🔍 QC-BOT: revisión visual de entregable...`);

    const deliverableAnalysis = await this.analyzeImage(deliverableImageUrl, 'qc');
    if (!deliverableAnalysis || deliverableAnalysis.error) {
      return { passed: false, error: true, message: deliverableAnalysis?.message || 'analyze_failed' };
    }

    let comparison = null;
    if (referenceUrl) {
      comparison = await this.compareDesigns(deliverableImageUrl, referenceUrl, 'qc');
    }

    const visualScore = comparison?.similarity_score ?? null;
    const technicalIssues = deliverableAnalysis?.technical?.issues || [];
    const passed = (visualScore === null || visualScore >= 70) && technicalIssues.length === 0;

    const result = {
      passed,
      visual_score: visualScore,
      style_match: comparison?.style_match || null,
      issues_found: [
        ...technicalIssues,
        ...((comparison?.differences) || [])
      ],
      recommendations: comparison?.recommendations || deliverableAnalysis?.creative_direction?.weaknesses || [],
      verdict: comparison?.verdict || deliverableAnalysis?.creative_direction?.recommendation || null
    };

    // Log via shared supabase
    try {
      const { supabase } = require('../core/supabase');
      await supabase.from('system_events').insert({
        event_type: passed ? 'qc_visual_passed' : 'qc_visual_failed',
        severity: passed ? 'info' : 'warning',
        service_key: 'qc-bot',
        description: `QC Visual ${passed ? 'APROBADO' : 'RECHAZADO'} — score=${visualScore ?? 'n/a'}`,
        details: { project_id: projectId, brief_id: briefId, deliverable_url: deliverableImageUrl, result },
        metadata: { project_id: projectId, brief_id: briefId }
      });
    } catch (_) {}

    return result;
  }
}

module.exports = QCBotAgent;
