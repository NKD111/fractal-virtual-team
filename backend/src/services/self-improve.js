// backend/src/services/self-improve.js
// Captura outputs ganadores y semanal refina el baseAddendum de cada agente.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const { wrapAnthropic, audit } = require('../core/telemetry');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }))
  : null;

async function captureOutcome({ agent, task_id, outcome, signal, excerpt, feedback = null }) {
  try {
    await supabase.from('prompt_evolutions').insert({
      agent, task_id, outcome, signal,
      excerpt: String(excerpt || '').slice(0, 1500),
      feedback: feedback ? String(feedback).slice(0, 500) : null
    });
  } catch (_) {}
}

async function refineAgent(agentSlug) {
  if (!anthropic) return { ok: false, reason: 'no Claude' };
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('prompt_evolutions')
    .select('outcome, signal, excerpt, feedback, ts')
    .eq('agent', agentSlug)
    .eq('applied', false)
    .gte('ts', since)
    .limit(20);
  if (!rows?.length) return { ok: false, reason: 'no signals' };

  const wins = rows.filter(r => r.outcome === 'win');
  const losses = rows.filter(r => r.outcome === 'loss');
  if (wins.length < 2) return { ok: false, reason: 'not enough wins' };

  const winsTxt = wins.map(w => `[${w.signal}] ${w.excerpt}`).slice(0, 5).join('\n---\n');
  const lossesTxt = losses.map(l => `[${l.signal}] ${l.excerpt}${l.feedback ? ` | feedback: ${l.feedback}` : ''}`).slice(0, 3).join('\n---\n');

  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `Eres meta-coach del agente ${agentSlug.toUpperCase()} en Fractal MX.
Lees ejemplos de outputs que GANARON (cliente respondió rápido, QC alto)
y los que PERDIERON (rebotados, QC bajo, feedback negativo).
Genera un ADDENDUM corto al system prompt del agente que ayude a replicar
los patrones ganadores y evitar los perdedores.

Devuelve JSON SOLO (no markdown):
{ "addendum": "<máx 280 caracteres con instrucciones concretas en español, en imperativo>" }`,
      messages: [{ role: 'user', content: `WINS:\n${winsTxt}\n\nLOSSES:\n${lossesTxt || '(sin losses recientes)'}\n\nGenera el addendum.` }]
    });
    const txt = r.content[0]?.text || '{}';
    const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    if (!json.addendum) return { ok: false, reason: 'bad shape' };

    // Upsert agent_baseline
    const { data: existing } = await supabase.from('agent_baseline').select('version').eq('slug', agentSlug).maybeSingle();
    const version = (existing?.version || 0) + 1;
    await supabase.from('agent_baseline').upsert({
      slug: agentSlug, base_addendum: json.addendum, version,
      updated_at: new Date().toISOString()
    }, { onConflict: 'slug' });

    // Mark signals as applied
    await supabase.from('prompt_evolutions').update({ applied: true })
      .eq('agent', agentSlug).eq('applied', false).gte('ts', since);

    await audit({ actor: 'system', action: 'agent.refined', target: agentSlug, details: { version, wins: wins.length, losses: losses.length } });
    return { ok: true, version, addendum: json.addendum };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function refineAll() {
  const agents = ['mariana', 'diana', 'carlos', 'diego', 'alex', 'sofia', 'lucas', 'max', 'valentina', 'roberto'];
  const results = [];
  for (const a of agents) {
    const r = await refineAgent(a);
    results.push({ agent: a, ...r });
  }
  return results;
}

async function getAgentAddendum(slug) {
  try {
    const { data } = await supabase.from('agent_baseline').select('base_addendum').eq('slug', slug).maybeSingle();
    return data?.base_addendum || '';
  } catch { return ''; }
}

module.exports = { captureOutcome, refineAgent, refineAll, getAgentAddendum };
