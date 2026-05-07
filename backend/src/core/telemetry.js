// backend/src/core/telemetry.js
// Universal observability: cost tracking, audit log, helpers idempotency.
//
// Anthropic + OpenAI + Resend + Twilio + Meta WA pricing aproximada (USD).
// Actualizar cuando cambien tarifas.

const { supabase } = require('./supabase');

// ── Pricing table (per 1M tokens / per unit) ──────────────────────────────
const PRICING = {
  anthropic: {
    'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
    'claude-haiku-4-5-20251001':          { in: 1.0, out: 5.0 },
    'claude-sonnet-4-6':         { in: 3.0, out: 15.0 },
    'claude-opus-4':             { in: 15.0, out: 75.0 }
  },
  openai: {
    'gpt-4o':              { in: 2.5,  out: 10.0 },
    'gpt-4o-mini':         { in: 0.15, out: 0.6 },
    'dall-e-3':            { unit: 0.04 },           // $0.04 per 1024x1024 standard
    'dall-e-3-hd':         { unit: 0.08 }            // HD
  },
  resend:  { 'emails.send':   { unit: 0.0004 } },    // $0.40 / 1k = $0.0004 ea
  twilio:  { 'whatsapp.send': { unit: 0.005 } },     // approx
  meta_wa: { 'send':          { unit: 0.0 } }        // free for session msgs
};

// ── COST LOG ───────────────────────────────────────────────────────────────
async function logCost({ provider, endpoint, model, input_tokens = 0, output_tokens = 0, units = 0, task_id = null, agent = null, client_id = null, context = {} }) {
  let cost_usd = 0;
  try {
    const p = PRICING[provider];
    if (p) {
      const m = p[model] || p[endpoint] || null;
      if (m) {
        if (typeof m.in === 'number') cost_usd += (input_tokens / 1_000_000) * m.in;
        if (typeof m.out === 'number') cost_usd += (output_tokens / 1_000_000) * m.out;
        if (typeof m.unit === 'number' && units > 0) cost_usd += units * m.unit;
      }
    }
    cost_usd = Math.round(cost_usd * 1e6) / 1e6;
    await supabase.from('cost_log').insert({
      provider, endpoint, model, input_tokens, output_tokens, units, cost_usd,
      task_id, agent, client_id, context
    });
  } catch (e) { /* silent — telemetry must never break flow */ }
  return cost_usd;
}

// ── AUDIT LOG ──────────────────────────────────────────────────────────────
async function audit({ actor, action, target = null, details = {}, cost_usd = 0, duration_ms = null, ok = true }) {
  try {
    await supabase.from('audit_log').insert({
      actor, action, target, details, cost_usd, duration_ms, ok
    });
  } catch (e) { /* silent */ }
}

// ── ANTHROPIC WRAPPER (logs every call automatically) ──────────────────────
function wrapAnthropic(client) {
  if (!client?.messages?.create) return client;
  const orig = client.messages.create.bind(client.messages);
  client.messages.create = async function (params, opts) {
    const t0 = Date.now();
    let result, err;
    try { result = await orig(params, opts); }
    catch (e) { err = e; throw e; }
    finally {
      const usage = result?.usage || {};
      const ctx = (opts && typeof opts === 'object') ? (opts._ctx || {}) : {};
      logCost({
        provider: 'anthropic',
        endpoint: 'messages.create',
        model: params?.model || 'unknown',
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        task_id: ctx.task_id || null,
        agent: ctx.agent || null,
        context: { duration_ms: Date.now() - t0, error: err?.message || null }
      }).catch(() => {});
    }
    return result;
  };
  return client;
}

// ── EMAIL WRAPPER ──────────────────────────────────────────────────────────
async function logEmailSent({ taskId, agent, ok }) {
  await logCost({
    provider: 'resend', endpoint: 'emails.send', units: ok ? 1 : 0,
    task_id: taskId, agent
  });
}

// ── DALL-E WRAPPER ─────────────────────────────────────────────────────────
async function logImageGen({ taskId, agent, model = 'dall-e-3', hd = true }) {
  await logCost({
    provider: 'openai', endpoint: 'images.generate',
    model: hd ? 'dall-e-3-hd' : 'dall-e-3', units: 1,
    task_id: taskId, agent
  });
}

// ── COST AGGREGATES ────────────────────────────────────────────────────────
async function getCostsToday() {
  try {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('cost_log')
      .select('provider, cost_usd, units, input_tokens, output_tokens')
      .gte('ts', since.toISOString());
    if (!data) return { total: 0, by_provider: {}, calls: 0 };
    const by_provider = {};
    let total = 0;
    for (const row of data) {
      total += Number(row.cost_usd || 0);
      by_provider[row.provider] = (by_provider[row.provider] || 0) + Number(row.cost_usd || 0);
    }
    return {
      total: Math.round(total * 10000) / 10000,
      by_provider,
      calls: data.length
    };
  } catch (e) { return { total: 0, by_provider: {}, calls: 0, error: e.message }; }
}

async function getCostsMonth() {
  try {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('cost_log')
      .select('cost_usd, provider, ts')
      .gte('ts', since.toISOString());
    if (!data) return { total: 0, by_day: {} };
    let total = 0;
    const by_provider = {};
    for (const row of data) {
      const c = Number(row.cost_usd || 0);
      total += c;
      by_provider[row.provider] = (by_provider[row.provider] || 0) + c;
    }
    return {
      total: Math.round(total * 100) / 100,
      by_provider, calls: data.length
    };
  } catch (e) { return { total: 0, error: e.message }; }
}

// ── UPGRADE 5: OBSERVABILIDAD — Latencia + Errores + Costo por agente ──────

/**
 * Costo agrupado por agente — últimas N horas
 */
async function getCostsByAgent(hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 3600_000);
    const { data } = await supabase
      .from('cost_log')
      .select('agent, model, cost_usd, input_tokens, output_tokens')
      .gte('ts', since.toISOString())
      .not('agent', 'is', null);

    if (!data) return [];
    const byAgent = {};
    for (const row of data) {
      const a = row.agent || 'unknown';
      if (!byAgent[a]) byAgent[a] = { agent: a, cost_usd: 0, calls: 0, tokens: 0 };
      byAgent[a].cost_usd += Number(row.cost_usd || 0);
      byAgent[a].calls++;
      byAgent[a].tokens += (row.input_tokens || 0) + (row.output_tokens || 0);
    }
    return Object.values(byAgent)
      .map(r => ({ ...r, cost_usd: Math.round(r.cost_usd * 1e5) / 1e5 }))
      .sort((a, b) => b.cost_usd - a.cost_usd);
  } catch { return []; }
}

/**
 * Latencia promedio por tarea — últimas N horas
 * Requiere que los logs incluyan context.duration_ms
 */
async function getLatencyByTask(hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 3600_000);
    const { data } = await supabase
      .from('cost_log')
      .select('task_id, context')
      .gte('ts', since.toISOString())
      .not('task_id', 'is', null);

    if (!data) return [];
    const byTask = {};
    for (const row of data) {
      const task = row.task_id || 'unknown';
      const ms = row.context?.duration_ms;
      if (!ms) continue;
      if (!byTask[task]) byTask[task] = { task, total_ms: 0, count: 0 };
      byTask[task].total_ms += ms;
      byTask[task].count++;
    }
    return Object.values(byTask)
      .map(t => ({ task: t.task, avg_ms: Math.round(t.total_ms / t.count), calls: t.count }))
      .sort((a, b) => b.avg_ms - a.avg_ms);
  } catch { return []; }
}

/**
 * Tasa de error por agente — últimas N horas
 */
async function getErrorRate(hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 3600_000);
    const { data } = await supabase
      .from('audit_log')
      .select('actor, ok')
      .gte('created_at', since.toISOString());

    if (!data || data.length === 0) return { overall: 0, by_agent: {}, total_calls: 0 };

    const byAgent = {};
    for (const row of data) {
      const a = row.actor || 'unknown';
      if (!byAgent[a]) byAgent[a] = { total: 0, errors: 0 };
      byAgent[a].total++;
      if (!row.ok) byAgent[a].errors++;
    }

    const overall_errors = data.filter(r => !r.ok).length;
    return {
      overall: (overall_errors / data.length * 100).toFixed(1),
      by_agent: Object.entries(byAgent).reduce((acc, [k, v]) => {
        acc[k] = (v.errors / v.total * 100).toFixed(1) + '%';
        return acc;
      }, {}),
      total_calls: data.length
    };
  } catch { return { overall: 0, by_agent: {}, total_calls: 0 }; }
}

// ── IDEMPOTENCY: prevent double-fire from network retries ─────────────────
const _idempotencyCache = new Map(); // key → { result, ts }
const IDEMPOTENCY_TTL_MS = 30_000;

function idempotent(key, factory) {
  const now = Date.now();
  const cached = _idempotencyCache.get(key);
  if (cached && now - cached.ts < IDEMPOTENCY_TTL_MS) return cached.result;
  const result = factory();
  _idempotencyCache.set(key, { result, ts: now });
  // Cleanup old entries occasionally
  if (_idempotencyCache.size > 100) {
    for (const [k, v] of _idempotencyCache) {
      if (now - v.ts > IDEMPOTENCY_TTL_MS) _idempotencyCache.delete(k);
    }
  }
  return result;
}

module.exports = {
  audit, logCost, logEmailSent, logImageGen,
  wrapAnthropic, getCostsToday, getCostsMonth, idempotent,
  getCostsByAgent, getLatencyByTask, getErrorRate,
  PRICING
};
