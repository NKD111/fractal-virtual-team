// backend/src/routines/insights-scanner.js
// Lucas analiza patrones cross-data y publica insights accionables.
// Pueden ser disparados manual (POST /api/insights/run) o por cron diario.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const { wrapAnthropic, audit } = require('../core/telemetry');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }))
  : null;

async function gatherSignals() {
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [tasks, costs, qcReviews, promises, leads, events] = await Promise.allSettled([
    supabase.from('tasks').select('id, brief, agent_assigned, status, created_at, completed_at').gte('created_at', since30),
    supabase.from('cost_log').select('provider, cost_usd, agent, ts').gte('ts', since14),
    supabase.from('qc_reviews').select('agent, score, passed, ts').gte('ts', since14),
    supabase.from('pending_promises').select('agent_id, status, execute_at, created_at').gte('created_at', since30),
    supabase.from('embed_leads').select('source_url, qualified, conversation, created_at').gte('created_at', since14),
    supabase.from('system_events').select('event_type, severity, started_at').gte('started_at', since14).limit(200)
  ]);

  return {
    tasks: tasks.value?.data || [],
    costs: costs.value?.data || [],
    qcReviews: qcReviews.value?.data || [],
    promises: promises.value?.data || [],
    leads: leads.value?.data || [],
    events: events.value?.data || []
  };
}

async function generateInsights(signals) {
  // Heuristic insights first (no API cost)
  const insights = [];

  // 1. QC fail rate por agente
  const qcByAgent = {};
  for (const q of signals.qcReviews) {
    if (!qcByAgent[q.agent]) qcByAgent[q.agent] = { total: 0, failed: 0, scoreSum: 0 };
    qcByAgent[q.agent].total++;
    if (!q.passed) qcByAgent[q.agent].failed++;
    qcByAgent[q.agent].scoreSum += Number(q.score || 0);
  }
  for (const [agent, s] of Object.entries(qcByAgent)) {
    const failRate = s.failed / s.total;
    const avgScore = s.scoreSum / s.total;
    if (failRate > 0.3 && s.total >= 3) {
      insights.push({
        kind: 'risk',
        title: `${agent.toUpperCase()} con ${Math.round(failRate * 100)}% rechazo de QC`,
        body: `${s.failed} de ${s.total} outputs reprobados (avg ${avgScore.toFixed(1)}/10). Revisar prompt o aumentar contexto.`,
        affected: [agent],
        severity: 'warn'
      });
    }
  }

  // 2. Costo por agente (top spender)
  const costByAgent = {};
  for (const c of signals.costs) {
    if (!c.agent) continue;
    costByAgent[c.agent] = (costByAgent[c.agent] || 0) + Number(c.cost_usd || 0);
  }
  const top = Object.entries(costByAgent).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0.50) {
    insights.push({
      kind: 'optimization',
      title: `${top[0].toUpperCase()} es el agente más caro (14d)`,
      body: `Gasto total $${top[1].toFixed(2)} USD. Considera bajar a haiku o reducir tokens en prompts largos.`,
      metric: `$${top[1].toFixed(2)}`,
      affected: [top[0]],
      severity: 'info'
    });
  }

  // 3. Tasks atascadas en awaiting_confirmation >24h
  const stale = signals.tasks.filter(t => {
    if (t.status !== 'awaiting_confirmation') return false;
    const ageH = (Date.now() - new Date(t.created_at).getTime()) / 3_600_000;
    return ageH > 24;
  });
  if (stale.length >= 2) {
    insights.push({
      kind: 'risk',
      title: `${stale.length} tareas esperan tu confirmación >24h`,
      body: `Pierde momentum. Considera auto-confirmar tareas de bajo riesgo.`,
      severity: 'warn',
      affected: stale.map(t => t.id).slice(0, 5)
    });
  }

  // 4. Lead conversion rate
  const totalLeads = signals.leads.length;
  const qualified = signals.leads.filter(l => l.qualified).length;
  if (totalLeads >= 5) {
    const rate = qualified / totalLeads;
    insights.push({
      kind: 'pattern',
      title: `${qualified}/${totalLeads} leads del widget calificaron (${Math.round(rate * 100)}%)`,
      body: rate > 0.4
        ? 'Conversión sólida. Considera más tráfico al widget.'
        : 'Conversión baja. Revisar el copy de Mariana o el targeting del sitio.',
      severity: 'info'
    });
  }

  // 5. Patrón cross-cliente (Claude analiza si hay API)
  if (anthropic && signals.tasks.length >= 5) {
    try {
      const briefs = signals.tasks.map(t => `- ${t.brief?.slice(0, 100)}`).join('\n');
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: `Eres LUCAS, analytics lead. Lees los briefs de las tareas recientes
y detectas 1-2 PATRONES no obvios (no estadística básica, sino oportunidades
o tendencias estratégicas). Devuelve JSON ARRAY:
[{ "kind": "pattern|opportunity", "title": "...", "body": "1-2 frases concretas" }]
Si no hay patrón claro, devuelve []. NO markdown.`,
        messages: [{ role: 'user', content: `Briefs últimos 30d:\n${briefs}\n\nDetecta patrones:` }]
      });
      const txt = r.content[0]?.text || '[]';
      const arr = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
      for (const item of arr) {
        if (item.title) insights.push({ ...item, severity: 'info', affected: [] });
      }
    } catch (e) { /* silent */ }
  }

  return insights;
}

async function runInsightsScan() {
  console.log('🔍 Running insights scan...');
  const signals = await gatherSignals();
  const insights = await generateInsights(signals);
  console.log(`  → ${insights.length} insights detected`);
  for (const ins of insights) {
    try {
      await supabase.from('insights').insert(ins);
    } catch (e) { /* silent */ }
  }
  await audit({ actor: 'lucas', action: 'insights.scan', details: { count: insights.length } });
  return insights;
}

module.exports = { runInsightsScan };
