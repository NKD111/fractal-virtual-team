// backend/src/routines/evening-reflection.js
// BLOQUE E1 — Evening Reflection (22:00 CDMX diario)
// Cron: 0 22 * * *
// Modelo: Opus (análisis estratégico nocturno)

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const obsidianSync = require('../services/obsidian-sync');

async function getDayMetrics() {
  const today = new Date().toISOString().split('T')[0];

  // Intentar leer métricas del día desde metric_snapshots
  const { data: snapshot } = await supabase
    .from('metric_snapshots')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (snapshot) return snapshot;

  // Fallback: construir métricas básicas
  const { count: messagesCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today);

  const { count: assetsCount } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today)
    .eq('type', 'image');

  const { data: errors } = await supabase
    .from('system_events')
    .select('id')
    .gte('started_at', today)
    .in('severity', ['error', 'critical']);

  return {
    projects_advanced: 0,
    arts_created: assetsCount || 0,
    mariana_messages: messagesCount || 0,
    revenue_today: 0,
    axiom_opportunities: 0,
    errors: errors?.length || 0,
    higgsfield_credits: 0
  };
}

async function saveToOracleMemory(tipo, data) {
  try {
    await supabase.from('oracle_memory').insert({
      tipo,
      contenido: JSON.stringify(data),
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[EveningReflection] saveToOracleMemory skipped:', err.message);
  }
}

async function eveningReflection() {
  console.log('🌙 EVENING REFLECTION: iniciando...');

  try {
    const hoy = await getDayMetrics();

    // Usar ORACLE global si está disponible
    let reflection = null;

    if (global.oracle?.consult) {
      const result = await global.oracle.consult({
        question: `Eres el sistema de reflexión nocturna de Fractal MX.

DATOS DEL DÍA:
- Proyectos avanzados: ${hoy.projects_advanced || 0}
- Artes producidos: ${hoy.arts_created || 0}
- Mensajes Mariana: ${hoy.mariana_messages || 0}
- Revenue hoy: $${hoy.revenue_today || 0} USD
- Oportunidades AXIOM: ${hoy.axiom_opportunities || 0}
- Errores del sistema: ${hoy.errors || 0}
- Créditos Higgsfield usados: ${hoy.higgsfield_credits || 0}

Genera el Evening Reflection:
1. Resumen del día en máximo 3 líneas
2. Una victoria del día (aunque sea pequeña)
3. Una fricción identificada
4. Top 3 prioridades para mañana
5. Una pregunta estratégica para reflexionar

Tono: directo, útil, como un buen socio de negocios.
Formato: WhatsApp (sin markdown, sin asteriscos).
Máximo 200 palabras.`,
        agent: { id: null, name: 'ORACLE', role: 'evening_reflection' },
        depth: 'standard'
      });
      reflection = result?.answer;
    }

    if (!reflection) {
      // Fallback si ORACLE no está disponible
      const date = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      reflection = `Resumen del ${date}:\n\nArtes producidos: ${hoy.arts_created || 0}\nMensajes Mariana: ${hoy.mariana_messages || 0}\nErrores: ${hoy.errors || 0}\n\nEl sistema operó sin intervención humana. Mañana continúa la construcción del Business OS.`;
    }

    const message = `🌙 Evening Reflection\n\n${reflection}`;
    await notifyNeiky(message);

    await saveToOracleMemory('evening_reflection', {
      date: new Date().toISOString(),
      metrics: hoy,
      reflection
    });

    // ── Sync automático a BOVEDA NKD ────────────────────────────────
    obsidianSync.saveEveningReflection(reflection, hoy).catch(err =>
      console.warn('[EveningReflection] Obsidian sync skipped:', err.message)
    );

    console.log('✅ Evening Reflection enviado a NKD');
    return { success: true, reflection };

  } catch (err) {
    console.error('❌ Evening Reflection error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { eveningReflection };
