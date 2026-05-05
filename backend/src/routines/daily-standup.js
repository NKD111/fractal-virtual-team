// backend/src/routines/daily-standup.js
// Fase 8.5: Mariana corre un standup matutino con el equipo. Cada agente
// reporta su status (autogenerado por Claude con contexto real de DB).
// ORACLE sintetiza. Resultado: registro en `daily_context` + broadcast al
// Office View (chat bubbles via WebSocket).

const { supabase } = require('../core/supabase');
const Anthropic = require('@anthropic-ai/sdk');

const TEAM = ['mariana', 'diana', 'carlos', 'diego', 'max', 'valentina', 'alex', 'sofia', 'lucas', 'roberto', 'qcbot'];

const ROLES = {
  mariana:   'Hub Coordinator',
  diana:     'Senior Client Manager',
  carlos:    'Senior Designer',
  diego:     'Senior Designer Editorial',
  max:       'AI Video Editor',
  valentina: 'Art Director',
  alex:      'Content Creator',
  sofia:     'Project Manager',
  lucas:     'Analytics',
  roberto:   'CFO',
  qcbot:     'Quality Control Bot'
};

/** Emit a chat bubble over an agent in the Office View (5s display). */
function emitBubble(agentSlug, text, kind = 'standup') {
  try {
    if (global.io) {
      global.io.emit('chat_bubble', {
        agent: agentSlug,
        text: text.length > 60 ? text.slice(0, 57) + '…' : text,
        kind,
        ts: Date.now()
      });
    }
  } catch (_) { /* no-op */ }
}

/** Pull lightweight ops context from DB for prompt injection. */
async function gatherOpsContext() {
  const [proj, prom, msgs] = await Promise.allSettled([
    supabase.from('projects').select('name, status, deadline, clients(name)').not('status', 'in', '("completed","cancelled")').limit(15),
    supabase.from('pending_promises').select('promise_text, execute_at, user_phone').eq('status', 'pending').limit(10),
    supabase.from('messages_log').select('user_phone, message_text, created_at').order('created_at', { ascending: false }).limit(8)
  ]);
  return {
    projects: proj.value?.data || [],
    promises: prom.value?.data || [],
    recentMessages: msgs.value?.data || []
  };
}

/** Generate one agent's standup line using Claude. Falls back to a
 *  templated line if the API call fails. */
async function generateAgentLine(slug, role, opsContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback = `${slug} reportando — sin novedades, listos para el día.`;
  if (!apiKey) return fallback;
  try {
    const client = new Anthropic({ apiKey });
    const projSummary = opsContext.projects.slice(0, 5).map(p => `${p.name} (${p.status})`).join(', ');
    const promSummary = opsContext.promises.length;
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `Eres ${slug.toUpperCase()} (${role}) en el daily standup matutino de Fractal MX.
Contexto: ${projSummary || 'sin proyectos activos'}. ${promSummary} promesas pendientes.
Reporta tu status del día en UNA frase corta (máx 18 palabras), tono casual de agencia.
Solo la frase, sin prefijos ni nombre.`
      }]
    });
    return msg.content[0]?.text?.trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Run the full standup and return the synthesized summary. */
async function runDailyStandup({ silent = false } = {}) {
  console.log('🗣️  ROUTINE: Daily Standup iniciado...');
  const ops = await gatherOpsContext();

  // Mariana opens
  if (!silent) emitBubble('mariana', 'Buenos días equipo, ¿cómo amanecemos?', 'standup');
  await new Promise(r => setTimeout(r, 500));

  // Each agent reports (sequential so bubbles appear in order in the Office)
  const reports = {};
  for (const slug of TEAM) {
    if (slug === 'mariana') continue;
    const line = await generateAgentLine(slug, ROLES[slug], ops);
    reports[slug] = line;
    if (!silent) emitBubble(slug, line, 'standup');
    await new Promise(r => setTimeout(r, 800)); // stagger so bubbles read naturally
  }

  // Oracle synthesizes
  let oracleSummary = '';
  if (global.oracle?.isInitialized) {
    try {
      const r = await global.oracle.consult({
        question: `Equipo de Fractal MX en standup matutino:
${Object.entries(reports).map(([s, t]) => `- ${s}: ${t}`).join('\n')}

Sintetiza en 2-3 puntos accionables el foco del día. Tono directo.`,
        agent: { id: null, name: 'SYSTEM', role: 'standup_synthesis' },
        depth: 'quick'
      });
      oracleSummary = r?.answer || '';
    } catch (_) {}
  }
  if (oracleSummary && !silent) emitBubble('oracle', oracleSummary.slice(0, 60), 'standup');

  // Persist
  const todayKey = new Date().toISOString().slice(0, 10);
  await supabase.from('daily_context').upsert({
    context_date: todayKey,
    reports,
    oracle_summary: oracleSummary,
    project_count: ops.projects.length,
    promise_count: ops.promises.length,
    generated_at: new Date().toISOString()
  }, { onConflict: 'context_date' }).then(() => {}).catch(() => {});

  console.log(`✅ Daily Standup: ${Object.keys(reports).length} agentes reportaron`);
  return { reports, oracleSummary, ops };
}

module.exports = { runDailyStandup, emitBubble, TEAM, ROLES };
