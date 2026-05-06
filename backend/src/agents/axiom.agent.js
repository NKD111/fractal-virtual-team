// backend/src/agents/axiom.agent.js
// Fractal Virtual Team — AXIOM (Opportunity Scanner)
//
// Agente NO conversacional — corre en background. Su entrypoint principal
// es scanCycle() que es llamado por axiom-scan.js cada 6h.
// También expone processMessage() para casos donde Mariana le pregunte directamente
// "axiom, qué tienes hoy?".

const BaseAgent = require('../core/BaseAgent');
const AXIOM_PROMPT = require('../prompts/axiom.prompts');
const { supabase } = require('../core/supabase');
const { chat } = require('../core/anthropic');
const crypto = require('crypto');

class AxiomAgent extends BaseAgent {
  constructor() {
    super({
      name: 'AXIOM',
      fullName: 'AXIOM Opportunity Scanner',
      role: 'Background Opportunity Detection System',
      area: 'intelligence',
      basePrompt: AXIOM_PROMPT,

      personality: {
        core_traits: ['analytical', 'objective', 'tireless', 'pattern_oriented']
      },

      speakingStyle: {
        tone: 'technical_concise',
        emojis: 'none_except_status_badges',
        typical_phrases: [
          'AXIOM SCAN REPORT:',
          'OPPORTUNITY DETECTED:',
          'PATTERN OBSERVED:',
          'SUGGESTED ACTION:'
        ]
      }
    });
  }

  /**
   * Entrypoint principal — invocado por cron cada 6h
   * @returns {Promise<{run_id, opportunities_count, duration_ms, summary}>}
   */
  async scanCycle() {
    const start = Date.now();
    const runId = crypto.randomUUID();
    console.log(`[AXIOM] scan ${runId} starting...`);

    try {
      await this.updateStatus('scanning', 'neutral');

      // 1. Recolectar datos del sistema
      const context = await this.gatherContext();
      console.log(`[AXIOM] context: ${context.clients.length} clients, ${context.projects.length} projects, ${context.recent_messages.length} msgs, ${context.recent_events.length} events`);

      // 2. Pedir a Claude que analice y detecte oportunidades
      const opportunities = await this.detectOpportunities(context, runId);

      // 3. Persistir cada oportunidad (con dedupe)
      let inserted = 0;
      let updated = 0;
      for (const opp of opportunities) {
        const result = await this.persistOpportunity(opp, runId);
        if (result === 'inserted') inserted++;
        else if (result === 'updated') updated++;
      }

      // 4. Notificar urgentes a Mariana
      const urgent = opportunities.filter(o => o.urgency === 'high' || o.urgency === 'critical');
      if (urgent.length > 0) {
        await this.notifyMariana(urgent, runId);
      }

      const duration = Date.now() - start;
      console.log(`[AXIOM] scan ${runId} done — ${inserted} new, ${updated} updated, ${urgent.length} urgent, ${duration}ms`);

      // 5. Log a audit_log
      await supabase.rpc('log_action', {
        p_actor: 'axiom',
        p_action: 'scan_completed',
        p_service: 'axiom',
        p_status: 'success',
        p_details: {
          run_id: runId,
          opportunities_detected: opportunities.length,
          inserted,
          updated,
          urgent_count: urgent.length,
          duration_ms: duration
        }
      });

      await this.updateStatus('idle', 'neutral');

      return {
        run_id: runId,
        opportunities_count: opportunities.length,
        inserted,
        updated,
        urgent_count: urgent.length,
        duration_ms: duration,
        summary: opportunities.slice(0, 5).map(o => `[${o.urgency.toUpperCase()}] ${o.title}`)
      };
    } catch (err) {
      console.error('[AXIOM] scan failed:', err.message);
      await supabase.rpc('log_action', {
        p_actor: 'axiom',
        p_action: 'scan_failed',
        p_service: 'axiom',
        p_status: 'failed',
        p_details: { run_id: runId, error: err.message },
        p_error_code: 'SCAN_ERROR'
      }).then(() => {}).catch(() => {});
      throw err;
    }
  }

  /**
   * Recolecta contexto desde Supabase para el análisis
   */
  async gatherContext() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [clients, projects, messages, events, promises, agentLogs] = await Promise.all([
      supabase.from('clients').select('id, name, tier, whatsapp, phone, last_contacted_at, lifetime_value, quality_rating').limit(100),
      supabase.from('projects').select('id, name, status, deadline, value_mxn, clients(id, name, tier)').not('status', 'in', '("completed","cancelled")').limit(80),
      supabase.from('messages').select('id, conversation_id, role, content, created_at').gte('created_at', since7d).order('created_at', { ascending: false }).limit(200),
      supabase.from('system_events').select('id, event_type, severity, service_key, details, started_at').gte('started_at', since24h).limit(100),
      supabase.from('pending_promises').select('id, promise_text, execute_at, user_phone, status').eq('status', 'pending').lte('execute_at', new Date(Date.now() + 7 * 86400000).toISOString()).limit(50),
      supabase.from('agent_logs').select('id, agent_id, action, success, error_message, created_at').gte('created_at', since24h).limit(100)
    ]);

    return {
      clients: clients.data || [],
      projects: projects.data || [],
      recent_messages: messages.data || [],
      recent_events: events.data || [],
      pending_promises: promises.data || [],
      agent_logs: agentLogs.data || []
    };
  }

  /**
   * Llama a Claude con el contexto + prompt para detectar oportunidades.
   * Devuelve array de objetos opportunity.
   */
  async detectOpportunities(context, runId) {
    // Compactar contexto para no exceder tokens
    const compactContext = {
      clients_summary: context.clients.map(c => ({
        id: c.id,
        name: c.name,
        tier: c.tier,
        last_contacted: c.last_contacted_at,
        lifetime_value: c.lifetime_value
      })).slice(0, 50),
      active_projects: context.projects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        deadline: p.deadline,
        value: p.value_mxn,
        client: p.clients?.name
      })).slice(0, 40),
      recent_messages_count_per_client: this.groupMessagesByClient(context.recent_messages),
      pending_promises: context.pending_promises.length,
      events_warning_count: context.recent_events.filter(e => e.severity === 'warning' || e.severity === 'critical').length,
      agent_failure_rate_24h: this.calculateAgentFailureRate(context.agent_logs)
    };

    const userMsg = `Contexto del sistema (corrida ${runId}):

${JSON.stringify(compactContext, null, 2)}

Aplicando las heurísticas de tu prompt, detecta las oportunidades reales en este snapshot.
Devuelve SOLO el JSON especificado en tu prompt, sin texto adicional, sin markdown fences.
Máximo 10 oportunidades. Solo las que tengan evidencia clara en los datos.`;

    const response = await chat({
      system: this.basePrompt,
      messages: [{ role: 'user', content: userMsg }],
      model: 'claude-sonnet-4-6',
      max_tokens: 4000
    });

    // Parse JSON (strip code fences si las pone)
    let cleaned = (response.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[AXIOM] failed to parse Claude response as JSON:', e.message);
      console.error('[AXIOM] raw response:', cleaned.slice(0, 500));
      return [];
    }
    return parsed.opportunities || [];
  }

  /**
   * Persiste una oportunidad en axiom_opportunities con dedupe:
   * Si ya existe una opp en últimas 48h con misma category + related_client_id
   * y status='open', UPDATE en lugar de INSERT.
   */
  async persistOpportunity(opp, runId) {
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let dupeQuery = supabase
      .from('axiom_opportunities')
      .select('id, score')
      .eq('category', opp.category)
      .eq('status', 'open')
      .gte('detected_at', since48h);

    if (opp.related_client_id) {
      dupeQuery = dupeQuery.eq('related_client_id', opp.related_client_id);
    } else {
      dupeQuery = dupeQuery.is('related_client_id', null).eq('title', opp.title);
    }

    const { data: existing } = await dupeQuery.limit(1);

    if (existing && existing.length > 0) {
      // UPDATE bumping score si el nuevo es más alto
      const dupId = existing[0].id;
      const newScore = Math.max(existing[0].score || 0, opp.score);
      await supabase.from('axiom_opportunities')
        .update({
          score: newScore,
          urgency: opp.urgency,
          description: opp.description,
          suggested_action: opp.suggested_action,
          scan_run_id: runId,
          updated_at: new Date().toISOString()
        })
        .eq('id', dupId);
      return 'updated';
    } else {
      await supabase.rpc('log_opportunity', {
        p_category: opp.category,
        p_title: opp.title,
        p_description: opp.description,
        p_score: opp.score,
        p_urgency: opp.urgency,
        p_source: opp.source || 'axiom_scan',
        p_client_id: opp.related_client_id || null,
        p_project_id: opp.related_project_id || null,
        p_suggested_action: opp.suggested_action || null,
        p_scan_run_id: runId
      });
      return 'inserted';
    }
  }

  /**
   * Notifica a Mariana las opportunities urgent/critical
   */
  async notifyMariana(urgent, runId) {
    const summary = urgent.map(o => {
      const a = o.suggested_action || {};
      return `[${o.urgency.toUpperCase()}·${o.score.toFixed(1)}] ${o.title}\n   → ${a.who || '?'}: ${a.what || '?'} (${a.deadline_hours || '?'}h)`;
    }).join('\n\n');

    const message = `📡 AXIOM scan ${runId.slice(0,8)} — ${urgent.length} oportunidad(es) urgentes:\n\n${summary}\n\nFull report en /api/axiom/opportunities?status=open`;

    try {
      await this.sendMessageTo('MARIANA', message, { type: 'axiom_alert', run_id: runId });
    } catch (err) {
      console.error('[AXIOM] notifyMariana failed:', err.message);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  groupMessagesByClient(messages) {
    const counts = {};
    for (const m of messages) {
      const k = m.conversation_id || 'unknown';
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts).slice(0, 30).map(([conv, count]) => ({ conv, count }));
  }

  calculateAgentFailureRate(logs) {
    if (logs.length === 0) return 0;
    const failed = logs.filter(l => !l.success).length;
    return Math.round((failed / logs.length) * 100) / 100;
  }

  /**
   * Acepta un mensaje directo (ej: Mariana le pregunta a AXIOM)
   * No es su uso principal — su superficie es scan + write.
   */
  async processMessage({ from, text }) {
    if (text && text.toLowerCase().includes('scan')) {
      const result = await this.scanCycle();
      return { success: true, response: `AXIOM scan ejecutado.\nRun: ${result.run_id.slice(0,8)}\nOpps: ${result.opportunities_count} (${result.urgent_count} urgent)\nDur: ${result.duration_ms}ms` };
    }
    // Fallback: query opps abiertas
    const { data: opps } = await supabase
      .from('axiom_opportunities')
      .select('title, urgency, score, suggested_action')
      .eq('status', 'open')
      .order('score', { ascending: false })
      .limit(5);
    const list = (opps || []).map(o => `• [${o.urgency.toUpperCase()}·${o.score}] ${o.title}`).join('\n');
    return { success: true, response: `AXIOM — Top 5 opps abiertas:\n${list || '(ninguna)'}` };
  }
}

module.exports = AxiomAgent;
