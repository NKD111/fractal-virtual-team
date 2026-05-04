// backend/src/oracle/oracle.js
// ORACLE — Shared intelligence resource for all agents.
// Multi-model (Haiku/Sonnet/Opus) with auto-routing based on complexity.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const ModelRouter = require('./routers/model-router');
const QuotaManager = require('./quota/quota-manager');
const InsightDistributor = require('./distribution/insight-distributor');
const WebResearcher = require('./research/web-researcher');

const MODELS = {
  haiku:  'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7'
};

const MAX_TOKENS = {
  quick:    300,
  standard: 1500,
  premium:  4000
};

class Oracle {
  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.router = new ModelRouter();
    this.quotaManager = new QuotaManager();
    this.distributor = new InsightDistributor();
    this.researcher = new WebResearcher();
    this.isInitialized = false;
    this.startedAt = null;
    this._timers = [];
  }

  async initialize() {
    if (this.isInitialized) return;
    console.log('\n🔮 ORACLE — Sistema de Inteligencia Compartida iniciando...');

    try {
      await this.quotaManager.loadQuotas();
      this._scheduleQuotaReset();
      this._scheduleMetricsGeneration();
      this.isInitialized = true;
      this.startedAt = new Date().toISOString();
      console.log('✅ ORACLE activo — Todos los agentes pueden consultar (this.quickAsk / this.analyze / this.deepThink / this.research)\n');
    } catch (err) {
      console.error('[Oracle] Initialization error:', err.message);
    }
  }

  // ─── MAIN ENTRY POINT ─────────────────────────────────────────────────
  async consult({ question, agent, context = {}, depth = 'auto', requireResearch = false }) {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Oracle is not initialized');
    }

    if (!question || typeof question !== 'string') {
      throw new Error('Oracle.consult requires a question string');
    }

    // Normalize agent (BaseAgent instance OR plain { id, name, role })
    const agentInfo = this._normalizeAgent(agent);

    // 1. Decide model
    const modelDecision = await this.router.determineModel({ question, depth, requireResearch });

    // 2. Soft quota check (warns only)
    const quotaStatus = await this.quotaManager.check(agentInfo.id, modelDecision.model);
    if (quotaStatus.warning) {
      console.warn(`⚠️ ORACLE: ${agentInfo.name} al ${quotaStatus.percent.toFixed(0)}% de su quota diaria de ${modelDecision.model}`);
    }

    // 3. Execute
    let result;
    try {
      if (requireResearch) {
        result = await this._executeResearch({ question, agent: agentInfo, context, model: modelDecision.model });
      } else {
        result = await this._executeConsult({ question, agent: agentInfo, context, model: modelDecision.model, depth: modelDecision.depth });
      }
    } catch (err) {
      console.error('🔮 ORACLE consultation error:', err.message);
      throw err;
    }

    const responseTime = Date.now() - startTime;

    // 4. Compute actual cost from real token usage
    const actualCost = result.tokens_used
      ? this.router.actualCost(modelDecision.model, result.tokens_used.input || 0, result.tokens_used.output || 0)
      : modelDecision.estimated_cost;

    // 5. Log to DB (non-blocking on error)
    this._logQuery({ agent: agentInfo, question, context, modelDecision, actualCost, result, responseTime, requireResearch })
      .catch(err => console.warn('[Oracle] log error:', err.message));

    // 6. Consume quota
    this.quotaManager.consume(agentInfo.id, modelDecision.model)
      .catch(err => console.warn('[Oracle] consume error:', err.message));

    // 7. Maybe distribute insight (non-blocking)
    if (this._isValuableInsight(result)) {
      this.distributor.consider(result, agent).catch(err => console.warn('[Oracle] distribute error:', err.message));
    }

    return {
      answer: result.answer,
      model_used: modelDecision.model,
      depth: modelDecision.depth,
      estimated_cost: modelDecision.estimated_cost,
      actual_cost: actualCost,
      response_time_ms: responseTime,
      tokens_used: result.tokens_used,
      sources: result.sources || null,
      quota_warning: quotaStatus.warning ? quotaStatus : null
    };
  }

  // ─── DIRECT CLAUDE CONSULT ────────────────────────────────────────────
  async _executeConsult({ question, agent, context, model, depth }) {
    const response = await this.anthropic.messages.create({
      model: MODELS[model] || MODELS.sonnet,
      max_tokens: MAX_TOKENS[depth] || MAX_TOKENS.standard,
      system: this._buildSystemPrompt({ agent, context, depth }),
      messages: [{ role: 'user', content: question }]
    });
    return {
      answer: response.content?.[0]?.text || '',
      tokens_used: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      }
    };
  }

  // ─── WEB RESEARCH ─────────────────────────────────────────────────────
  async _executeResearch({ question, agent, context, model }) {
    const sources = await this.researcher.search(question);
    const content = await this.researcher.extractContent(sources);

    const synthesis = await this.anthropic.messages.create({
      model: MODELS[model] || MODELS.sonnet,
      max_tokens: 4000,
      system: `Eres ORACLE, sistema de investigación de Fractal MX.
Sintetiza la información encontrada en web en una respuesta clara, concisa y accionable.
Agente que consulta: ${agent.name} (${agent.role})
Responde en español mexicano.`,
      messages: [{
        role: 'user',
        content: `Pregunta: ${question}

Fuentes encontradas:
${content.map((c, i) => `[${i+1}] ${c.title}\n${c.summary}`).join('\n\n') || '(no se encontraron fuentes — responde desde tu conocimiento)'}

Dame una síntesis accionable.`
      }]
    });

    const answer = synthesis.content?.[0]?.text || '';

    // Cache the research for future reuse (7 days TTL)
    try {
      await supabase.from('oracle_research').insert({
        topic: question,
        sources_consulted: sources.map(s => s.url),
        summary: answer,
        requested_by: agent.id || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    } catch (_) { /* non-critical */ }

    return {
      answer,
      sources: sources.slice(0, 5).map(s => ({ title: s.title, url: s.url })),
      tokens_used: {
        input: synthesis.usage.input_tokens,
        output: synthesis.usage.output_tokens
      },
      is_research: true
    };
  }

  // ─── SHORTCUTS ────────────────────────────────────────────────────────
  async quickConsult(args) { return this.consult({ ...args, depth: 'quick' }); }
  async analyze(args)      { return this.consult({ ...args, depth: 'standard' }); }
  async deepThink(args)    { return this.consult({ ...args, depth: 'premium' }); }
  async research(args)     { return this.consult({ question: args.topic || args.question, agent: args.agent, context: args.context, requireResearch: true }); }

  // ─── HELPERS ──────────────────────────────────────────────────────────
  _normalizeAgent(agent) {
    if (!agent) return { id: null, name: 'unknown', role: 'unknown' };
    // BaseAgent instance
    if (agent.agentData) {
      return {
        id: agent.agentData.id,
        name: agent.agentData.name || agent.slug,
        role: agent.agentData.role || ''
      };
    }
    // Plain object
    return {
      id: agent.id || null,
      name: agent.name || agent.slug || 'unknown',
      role: agent.role || ''
    };
  }

  _buildSystemPrompt({ agent, context, depth }) {
    const depthInstructions = {
      quick:    'Responde en máximo 2 oraciones. Ultra directo.',
      standard: 'Responde en 1-2 párrafos. Balanceado y accionable.',
      premium:  'Análisis profundo. Considera todas las aristas.'
    };

    return `Eres ORACLE, sistema de inteligencia compartida de Fractal MX.

ROL: Recurso de conocimiento que hace al equipo más inteligente.
NO tomas decisiones finales. Das la mejor información posible.

QUIEN CONSULTA:
- Agente: ${agent.name}
- Rol: ${agent.role}
- Contexto: ${JSON.stringify(context).substring(0, 500)}

EMPRESA: Fractal MX — Agencia creativa AI-powered, CDMX
CEO: Neiky (Fermín Monroy)

INSTRUCCIONES:
- Responde en español mexicano natural
- Sé directo y accionable
- ${depthInstructions[depth] || depthInstructions.standard}
- Si no sabes algo con certeza, dilo
- Considera siempre el contexto del cliente`;
  }

  _isValuableInsight(result) {
    return !!(result?.answer && result.answer.length > 500);
  }

  async _logQuery({ agent, question, context, modelDecision, actualCost, result, responseTime, requireResearch }) {
    await supabase.from('oracle_queries').insert({
      agent_id: agent.id,
      agent_name: agent.name,
      question,
      context,
      query_type: requireResearch ? 'research' : modelDecision.depth,
      model_used: modelDecision.model,
      estimated_cost: modelDecision.estimated_cost,
      actual_cost: actualCost,
      response: result.answer,
      response_time_ms: responseTime,
      tokens_used: result.tokens_used || null,
      completed_at: new Date().toISOString()
    });
  }

  // ─── SCHEDULERS ───────────────────────────────────────────────────────
  _scheduleQuotaReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;
    this._timers.push(setTimeout(async () => {
      await this.quotaManager.resetDaily();
      this._timers.push(setInterval(() => this.quotaManager.resetDaily().catch(() => {}), 24 * 60 * 60 * 1000));
    }, msUntilMidnight));
  }

  _scheduleMetricsGeneration() {
    // Check every minute, run at 23:55 local server time
    this._timers.push(setInterval(async () => {
      const d = new Date();
      if (d.getHours() === 23 && d.getMinutes() === 55) {
        await this.generateDailyMetrics().catch(err => console.warn('[Oracle] metrics error:', err.message));
      }
    }, 60 * 1000));
  }

  async generateDailyMetrics() {
    const today = new Date().toISOString().split('T')[0];

    const { data: queries } = await supabase
      .from('oracle_queries')
      .select('model_used, actual_cost, estimated_cost, response_time_ms, agent_name')
      .gte('created_at', today);

    if (!queries?.length) return;

    const totalCost = queries.reduce((sum, q) => sum + Number(q.actual_cost || q.estimated_cost || 0), 0);
    const avgResponseTime = queries.reduce((sum, q) => sum + (q.response_time_ms || 0), 0) / queries.length;

    const byModel = {};
    const byAgent = {};
    queries.forEach(q => {
      byModel[q.model_used] = (byModel[q.model_used] || 0) + 1;
      byAgent[q.agent_name] = (byAgent[q.agent_name] || 0) + 1;
    });

    // Theoretical cost if everything ran on Opus
    const opusCostEstimate = queries.length * 0.05;
    const savings = opusCostEstimate - totalCost;

    await supabase.from('oracle_metrics').upsert({
      date: today,
      total_queries: queries.length,
      queries_by_model: byModel,
      queries_by_agent: byAgent,
      total_cost: totalCost,
      cost_optimization_savings: savings,
      avg_response_time_ms: Math.round(avgResponseTime),
      generated_at: new Date().toISOString()
    }, { onConflict: 'date' });

    console.log(`🔮 ORACLE métricas: ${queries.length} queries, $${totalCost.toFixed(4)} USD, ahorro vs todo-Opus: $${savings.toFixed(4)}`);
  }

  async getStatus() {
    let queriesToday = 0, totalCostToday = 0;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('oracle_queries')
        .select('actual_cost, estimated_cost', { count: 'exact' })
        .gte('created_at', today);
      queriesToday = data?.length || 0;
      totalCostToday = (data || []).reduce((s, q) => s + Number(q.actual_cost || q.estimated_cost || 0), 0);
    } catch (_) {}

    return {
      initialized: this.isInitialized,
      started_at: this.startedAt,
      queries_today: queriesToday,
      cost_today_usd: Number(totalCostToday.toFixed(4)),
      models_available: Object.keys(MODELS)
    };
  }
}

// Singleton
let _instance = null;
function getOracle() {
  if (!_instance) _instance = new Oracle();
  return _instance;
}

module.exports = { Oracle, getOracle };
