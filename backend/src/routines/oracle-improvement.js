// backend/src/routines/oracle-improvement.js
// BLOQUE M — Modelo predictivo ORACLE (auto-improvement)
// Cron: 0 3 * * 0 (domingo 3 AM CDMX)
// Modelo: Opus
// Analiza fallos de la semana y propone mejoras a system prompts

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');

async function getFailedConversations() {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('system_events')
      .select('event_type, details, started_at')
      .gte('started_at', since7d)
      .in('event_type', ['escalation_to_nkd', 'client_complaint', 'mariana_escalation'])
      .limit(20);
    return data || [];
  } catch { return []; }
}

async function getRejectedArts() {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('tipo_pieza, notas_revision, rondas_revision, created_at')
      .gte('created_at', since7d)
      .eq('status', 'rework')
      .limit(20);
    return data || [];
  } catch { return []; }
}

async function getStuckWorkflows() {
  try {
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('id, status, mes, tipo_pieza, created_at')
      .lte('created_at', since48h)
      .in('status', ['en_produccion', 'pendiente_aprobacion_nkd'])
      .limit(10);
    return data || [];
  } catch { return []; }
}

async function getSystemErrors() {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('system_events')
      .select('event_type, severity, service_key, details, started_at')
      .gte('started_at', since7d)
      .in('severity', ['critical', 'error'])
      .limit(30);
    return data || [];
  } catch { return []; }
}

async function oracleAutoImprovement() {
  console.log('🧠 ORACLE AUTO-IMPROVEMENT: iniciando análisis dominical...');

  try {
    const [falloConversaciones, artesRechazados, workflowsStuck, erroresSistema] = await Promise.all([
      getFailedConversations(),
      getRejectedArts(),
      getStuckWorkflows(),
      getSystemErrors()
    ]);

    const fallos = {
      conversaciones: falloConversaciones,
      artes_rechazados: artesRechazados,
      workflows_atascados: workflowsStuck,
      errores_sistema: erroresSistema,
      resumen: {
        total_conversaciones_fallidas: falloConversaciones.length,
        total_artes_rechazados: artesRechazados.length,
        total_workflows_stuck: workflowsStuck.length,
        total_errores_sistema: erroresSistema.length
      }
    };

    if (!global.oracle?.consult) {
      console.warn('[Oracle Improvement] Oracle no disponible — skip');
      return { success: false, reason: 'oracle_not_available' };
    }

    const result = await global.oracle.consult({
      question: `Eres ORACLE. Es domingo 3 AM. Analiza los fallos de esta semana en Fractal MX
y propón mejoras específicas y accionables.

FALLOS DE LA SEMANA:
${JSON.stringify(fallos, null, 2)}

GENERA:
1. Patrón identificado (qué tipo de fallo predomina)
2. Causa raíz más probable
3. Para cada agente con fallos: texto exacto de mejora para su system prompt
4. Nueva regla para FRACTAL.md si aplica
5. Ajuste al proceso operacional (si hay workflow atascado > 48h)
6. Una predicción: ¿se repetirá este fallo la próxima semana si no se corrige?

Sé específico. Propón texto exacto donde aplique.
Tono: directo, como ingeniero que revisa el sistema.
Formato: WhatsApp. Máximo 400 palabras.`,
      agent: { id: null, name: 'ORACLE', role: 'auto_improvement' },
      depth: 'deep'
    });

    const propuestas = result?.answer || '';

    if (!propuestas) {
      console.warn('[Oracle Improvement] Oracle no generó propuestas');
      return { success: false, reason: 'no_proposals' };
    }

    // Guardar en oracle_memory si la tabla existe
    try {
      await supabase.from('oracle_memory').insert({
        type: 'improvement_proposals',
        content: propuestas,
        metadata: JSON.stringify(fallos.resumen),
        week: new Date().toISOString().split('T')[0]
      });
    } catch (_) { /* tabla puede no existir */ }

    // Notificar a NKD con propuestas + instrucción de aprobación
    const mensaje = `🧠 ORACLE — Mejoras semanales

${propuestas.substring(0, 600)}${propuestas.length > 600 ? '...' : ''}

${fallos.resumen.total_conversaciones_fallidas + fallos.resumen.total_artes_rechazados + fallos.resumen.total_workflows_stuck > 0
  ? `\n📊 Fallos detectados:\n• ${fallos.resumen.total_conversaciones_fallidas} conversaciones escaladas\n• ${fallos.resumen.total_artes_rechazados} artes rechazados\n• ${fallos.resumen.total_workflows_stuck} workflows atascados`
  : '\n✅ Semana sin incidentes críticos.'}

Responde SI para aplicar los cambios propuestos.`;

    await notifyNeiky(mensaje);
    console.log(`✅ Oracle Auto-Improvement: propuestas enviadas a NKD`);

    return { success: true, propuestas, fallos: fallos.resumen };

  } catch (err) {
    console.error('❌ Oracle Auto-Improvement error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { oracleAutoImprovement };
