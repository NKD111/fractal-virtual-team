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
const { decideProspectoCaliente } = require('../core/oracle-decision');

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

    const [clients, projects, messages, events, promises, agentLogs] = await Promise.allSettled([
      // Intentar clients primero, fallback a conversations si no existe
      supabase.from('clients').select('id, name, tier, whatsapp, phone, last_contacted_at, lifetime_value, quality_rating').limit(100)
        .then(r => r.error ? supabase.from('conversations').select('id, client_name, client_whatsapp, status, assigned_agent, last_message_at').limit(100) : r),
      supabase.from('projects').select('id, client_name, client_whatsapp, project_type, status, budget_mxn, created_at').not('status', 'in', '("completed","cancelled","deleted")').limit(80),
      // messages → fallback a conversations si tabla messages no existe
      supabase.from('messages').select('id, conversation_id, role, content, created_at').gte('created_at', since7d).order('created_at', { ascending: false }).limit(200)
        .then(r => r.error ? { data: [] } : r),
      supabase.from('system_events').select('id, event_type, severity, service_key, details, started_at').gte('started_at', since24h).limit(100)
        .then(r => r.error ? { data: [] } : r),
      supabase.from('pending_promises').select('id, promise_text, execute_at, user_phone, status').eq('status', 'pending').lte('execute_at', new Date(Date.now() + 7 * 86400000).toISOString()).limit(50)
        .then(r => r.error ? { data: [] } : r),
      supabase.from('agent_logs').select('id, agent_id, action, success, error_message, created_at').gte('created_at', since24h).limit(100)
        .then(r => r.error ? { data: [] } : r)
    ]);

    return {
      clients: (clients.status === 'fulfilled' ? clients.value?.data : null) || [],
      projects: (projects.status === 'fulfilled' ? projects.value?.data : null) || [],
      recent_messages: (messages.status === 'fulfilled' ? messages.value?.data : null) || [],
      recent_events: (events.status === 'fulfilled' ? events.value?.data : null) || [],
      agent_logs: (agentLogs.status === 'fulfilled' ? agentLogs.value?.data : null) || [],
      pending_promises: (promises.status === 'fulfilled' ? promises.value?.data : null) || []
    };
  }

  /**
   * Llama a Claude con el contexto + prompt para detectar oportunidades.
   * Devuelve array de objetos opportunity.
   */
  async detectOpportunities(context, runId) {
    const compactContext = {
      clients_count: (context.clients || []).length,
      clients_summary: (context.clients || []).slice(0, 30).map(c => ({
        id: c.id, name: c.name, tier: c.tier,
        last_contacted: c.last_contacted_at, lifetime_value: c.lifetime_value
      })),
      active_projects: (context.projects || []).slice(0, 25).map(p => ({
        id: p.id, name: p.name, status: p.status, deadline: p.deadline,
        value: p.value_mxn, client: p.clients?.name
      })),
      recent_messages_count: (context.recent_messages || []).length,
      pending_promises: (context.pending_promises || []).length,
      events_warning_count: (context.recent_events || []).filter(e => e.severity === 'warning' || e.severity === 'critical').length,
      agent_failure_rate_24h: this.calculateAgentFailureRate(context.agent_logs || [])
    };

    const now = new Date();
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const timeContext = `Hoy es ${dayNames[now.getDay()]}, ${now.toLocaleDateString('es-MX')}. Hora CDMX: ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}.`;
    const hasData = compactContext.clients_count > 0 || compactContext.active_projects.length > 0 || compactContext.recent_messages_count > 0;

    const userMsg = `SCAN INPUT (run ${runId}):
${timeContext}

\`\`\`json
${JSON.stringify(compactContext, null, 2)}
\`\`\`

INSTRUCCIONES:
- Aplica las heurísticas de tu prompt.
- Devuelve un OBJETO JSON con la propiedad "opportunities" = array.
- ${hasData ? 'Máximo 10 oportunidades basadas en los datos.' : 'NO hay datos de clientes aún — genera 4-6 oportunidades heurísticas basadas en el contexto temporal (día de la semana, hora del día) y en las mejores prácticas para agencias creativas mexicanas en frío. Fractal MX necesita oportunidades de acción inmediata aunque no haya datos aún.'}
- NUNCA devuelvas un array vacío. Siempre al menos 3 oportunidades.
- NO incluyas markdown fences. NO incluyas texto explicativo antes ni después del JSON.
- Cada opp debe tener exactamente estas claves:
  category, title, description, score (0-10 numeric), urgency (low|medium|high|critical),
  source, related_client_id (string|null), related_project_id (string|null),
  suggested_action (object con who, what, deadline_hours, channel)

Empieza tu respuesta directamente con la llave \`{\` y termina con \`}\`. NADA más.`;

    let response;
    try {
      response = await chat({
        system: this.basePrompt,
        messages: [{ role: 'user', content: userMsg }],
        model: 'claude-sonnet-4-6',
        max_tokens: 3500
      });
    } catch (e) {
      console.error('[AXIOM] chat() failed:', e.message);
      return [];
    }

    const raw = (response.content || '').trim();
    let cleaned = raw;
    // Strip markdown fences si vienen
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // Si hay texto antes del primer `{`, recortar
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace > 0 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      const opps = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];
      // Validate basic shape per opp
      return opps.filter(o => o && typeof o === 'object' && o.category && o.title && typeof o.score === 'number');
    } catch (e) {
      console.error('[AXIOM] JSON parse failed:', e.message);
      console.error('[AXIOM] cleaned head:', cleaned.slice(0, 300));
      // Try secondary parse: extract first valid {...} chunk
      const match = cleaned.match(/\{[\s\S]*"opportunities"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (match) {
        try {
          const parsed2 = JSON.parse(match[0]);
          return Array.isArray(parsed2.opportunities) ? parsed2.opportunities : [];
        } catch (_) {}
      }
      return [];
    }
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

  // ─── BLOQUE I: DEEP PROSPECT ANALYSIS ────────────────────────────────────

  /**
   * Análisis profundo de un prospecto específico de la tabla `prospects`.
   * Genera mensaje personalizado de primer contacto para WhatsApp.
   * Si close_probability > 40, activa a Mariana con mensaje sugerido.
   * Si score > 70, requiere aprobación de NKD antes de enviar.
   *
   * @param {object} opportunity - registro de la tabla prospects
   * @returns {object} data analizada + estado guardado
   */
  async deepProspectAnalysis(opportunity) {
    console.log(`[AXIOM] deepProspectAnalysis: ${opportunity.nombre_empresa} (${opportunity.website})`);

    const analysisPrompt = `Eres AXIOM, el motor de crecimiento de Fractal MX (agencia creativa AI-powered en CDMX).
Analiza esta empresa como prospecto de alto valor.

EMPRESA: ${opportunity.nombre_empresa}
WEB: ${opportunity.website || '(sin website)'}
INDUSTRIA: ${opportunity.industria || 'no especificada'}
CIUDAD: ${opportunity.ciudad || 'CDMX'}

SERVICIOS DE FRACTAL MX:
- Parrilla mensual de contenido ($500-1,500 USD/mes) — recurrente
- Auditoría digital básica ($300 USD) — gancho de entrada
- Auditoría digital completa ($800 USD) — con estrategia
- Landing cinematográfica ($1,500-3,000 USD) — proyecto premium
- Videos y reels ($200-500 USD/pieza) — proyecto puntual

ANALIZA y responde SOLO en JSON válido con estos campos exactos:
{
  "web_score": <número 1-10>,
  "social_score": <número 1-10>,
  "ads_analysis": "<string: tienen ads? calidad? presupuesto estimado>",
  "weak_points": ["punto 1", "punto 2", "punto 3"],
  "recommended_service": "<nombre del servicio más apropiado>",
  "suggested_price": <número USD sin símbolo>,
  "close_probability": <número 0-100>,
  "timing_reason": "<por qué AHORA es el momento ideal>",
  "whatsapp_message": "<mensaje de primer contacto, 3 párrafos máx, tono profesional CDMX, mencionar algo específico de su negocio, CTA claro al final, nunca suena a spam masivo>"
}`;

    let data;
    try {
      const response = await chat({
        system: this.basePrompt,
        messages: [{ role: 'user', content: analysisPrompt }],
        model: 'claude-sonnet-4-6',
        max_tokens: 2000
      });
      const raw = (response.content || '').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      data = JSON.parse(raw);
    } catch (err) {
      console.error('[AXIOM deepProspect] análisis falló:', err.message);
      return { success: false, error: err.message };
    }

    // Guardar análisis en tabla prospects
    try {
      await supabase.from('prospects').update({
        score: data.close_probability,
        analisis_web: String(data.web_score) + '/10 — ' + (data.ads_analysis || ''),
        analisis_redes: String(data.social_score) + '/10',
        analisis_ads: data.ads_analysis,
        puntos_debiles: (data.weak_points || []).join(' | '),
        por_que_fractal: data.timing_reason,
        servicio_sugerido: data.recommended_service,
        precio_sugerido: data.suggested_price,
        mensaje_contacto: data.whatsapp_message,
        status: 'listo_para_contactar'
      }).eq('id', opportunity.id);
      console.log(`[AXIOM] prospecto actualizado: score=${data.close_probability}, servicio=${data.recommended_service}`);
    } catch (dbErr) {
      console.warn('[AXIOM deepProspect] DB update error (non-fatal):', dbErr.message);
    }

    // Activar flujo de decisión por score
    if (data.close_probability > 40) {
      try {
        if (data.close_probability > 70) {
          // ORACLE decide y notifica a NKD (Nivel 2)
          await decideProspectoCaliente({
            nombre_empresa: opportunity.nombre_empresa,
            website: opportunity.website,
            industria: opportunity.industria,
            score: data.close_probability,
            servicio_sugerido: data.recommended_service,
            precio_sugerido: data.suggested_price,
            mensaje_propuesto: data.whatsapp_message,
            timing: data.timing_reason,
            puntos_debiles: data.weak_points
          });
          console.log(`[AXIOM] ORACLE consultado — score=${data.close_probability}, NKD notificada`);
        } else {
          // Score 40-70: notificar a Mariana directamente
          const notification = {
            type: 'nuevo_prospecto_caliente',
            prospect_id: opportunity.id,
            empresa: opportunity.nombre_empresa,
            score: data.close_probability,
            servicio: data.recommended_service,
            precio: data.suggested_price,
            mensaje_sugerido: data.whatsapp_message,
            instruccion: `Contactar a ${opportunity.nombre_empresa} por WhatsApp. Usar mensaje sugerido como base.`
          };
          await this.sendMessageTo('MARIANA', JSON.stringify(notification), { type: 'axiom_prospect_alert' });
          console.log(`[AXIOM] Mariana notificada — score=${data.close_probability}`);
        }
      } catch (notifyErr) {
        console.warn('[AXIOM deepProspect] notifyMariana error (non-fatal):', notifyErr.message);
      }
    }

    return { success: true, data, prospect_id: opportunity.id };
  }

  /**
   * Exporta top 50 prospectos a N8N para sync con Google Sheets.
   * Requiere N8N_WEBHOOK_URL configurado en env.
   */
  async exportToGoogleSheet() {
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, nombre_empresa, website, industria, ciudad, score, servicio_sugerido, precio_sugerido, status, mensaje_contacto, created_at')
      .order('score', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!process.env.N8N_WEBHOOK_URL) {
      console.warn('[AXIOM] N8N_WEBHOOK_URL no configurado — skip export');
      return { skipped: true, reason: 'N8N_WEBHOOK_URL not set', count: prospects?.length || 0 };
    }

    try {
      const https = require('https');
      const url = new URL(process.env.N8N_WEBHOOK_URL + '/prospects_to_sheets');
      const body = JSON.stringify({ prospects });
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      console.log(`[AXIOM] exportToGoogleSheet: ${prospects?.length} prospectos enviados a N8N`);
    } catch (httpErr) {
      console.warn('[AXIOM] N8N webhook error (non-fatal):', httpErr.message);
    }

    return { success: true, count: prospects?.length || 0 };
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
