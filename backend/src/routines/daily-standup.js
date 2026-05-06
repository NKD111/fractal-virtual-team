// backend/src/routines/daily-standup.js
// Fase 8.5 PASO 4: Daily Standup orchestrator (per spec).
// Mariana sintetiza el día. Cada agente reporta. Llega WhatsApp a Neiky
// y se broadcastean chat bubbles al Office View.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const agentContext = require('../agents/agent-context');
const { notifyNeiky } = require('../core/whatsapp');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const TEAM_AGENTS = [
  { name: 'CARLOS',  role: 'Senior Designer',  focus: 'diseño y branding' },
  { name: 'SOFIA',   role: 'Project Manager',  focus: 'proyectos y deadlines' },
  { name: 'LUCAS',   role: 'Analytics',        focus: 'métricas y datos' },
  { name: 'ROBERTO', role: 'CFO',              focus: 'finanzas' },
  { name: 'DIANA',   role: 'Client Manager',   focus: 'clientes' }
];

class DailyStandup {

  async run() {
    console.log('🌅 Daily Standup iniciando...');

    // 1. Contexto del día (clientes/proyectos/promesas reales en DB)
    const context = await agentContext.buildContext('mariana');

    // 2. Cada agente del equipo reporta
    const standups = await this.generateTeamStandups(context);

    // 3. Mariana sintetiza
    const summary = await this.generateMarianasSummary(standups, context);

    // 4. Persiste en DB para histórico
    await this.saveStandupToDB(standups, summary);

    // 5. WhatsApp a Neiky (probamos AMBOS canales y reportamos cuál delivered)
    const { sent, diagnostic } = await this.sendToNeiky(summary);

    // 6. Broadcast al Office View (chat bubbles staggered)
    this.broadcastToOffice(standups);

    console.log(`✅ Daily Standup completado (whatsapp_sent=${sent})`);
    return { standups, summary, whatsapp_sent: sent, whatsapp_diagnostic: diagnostic };
  }

  async generateTeamStandups(context) {
    const standups = {};
    for (const agent of TEAM_AGENTS) {
      const fallback = `${agent.name} en su ${agent.focus}, sin novedades. Listo para el día.`;
      let text = fallback;
      if (anthropic) {
        try {
          const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: `${context}

Eres ${agent.name}, ${agent.role} de Fractal MX.
Responde el standup matutino en máximo 2 oraciones.
Sé específico sobre los proyectos actuales.
Tono natural y directo, como en un equipo real.
No uses emojis excesivos.`,
            messages: [{ role: 'user', content: '¿Qué vas a trabajar hoy?' }]
          });
          text = res.content[0]?.text?.trim() || fallback;
        } catch (e) {
          console.warn(`[standup] ${agent.name} fallback:`, e.message);
        }
      }
      standups[agent.name] = { agent: agent.name, role: agent.role, message: text, timestamp: new Date() };
      console.log(`  ✓ ${agent.name}: ${text.slice(0, 80)}…`);
    }
    return standups;
  }

  async generateMarianasSummary(standups, context) {
    const standupText = Object.values(standups).map(s => `${s.agent}: ${s.message}`).join('\n');
    const fallback = `Equipo activo. ${Object.keys(standups).length} agentes reportaron. ` +
                     `Foco del día: revisar proyectos activos y mantener seguimiento con clientes.`;

    if (!anthropic) return fallback;
    try {
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `${context}

Eres MARIANA, Hub Coordinator de Fractal MX.
Genera el resumen matutino para Neiky (el director).
Incluye: estado del equipo, proyectos prioritarios del día, alertas si las hay.
Tono: profesional pero cercano. Máximo 5 puntos clave. Emojis con moderación.`,
        messages: [{
          role: 'user',
          content: `El equipo ha reportado:\n\n${standupText}\n\nGenera el resumen ejecutivo del día para Neiky.`
        }]
      });
      return res.content[0]?.text?.trim() || fallback;
    } catch (e) {
      console.warn('[standup] Mariana summary fallback:', e.message);
      return fallback;
    }
  }

  async saveStandupToDB(standups, summary) {
    const today = new Date().toISOString().slice(0, 10);
    const reports = {};
    for (const [k, v] of Object.entries(standups)) reports[k.toLowerCase()] = v.message;

    // Persist daily_context (one row per date)
    try {
      await supabase.from('daily_context').upsert({
        context_date: today,
        reports,
        oracle_summary: summary,
        project_count: 0,
        promise_count: 0,
        generated_at: new Date().toISOString()
      }, { onConflict: 'context_date' });
    } catch (_) {}

    // Persist event log entries
    for (const standup of Object.values(standups)) {
      try {
        await supabase.from('system_events').insert({
          event_type: 'agent_standup',
          severity: 'info',
          service_key: 'standup',
          details: {
            agent: standup.agent,
            message: standup.message,
            type: 'daily_standup',
            date: today
          }
        });
      } catch (_) {}
    }
    try {
      await supabase.from('system_events').insert({
        event_type: 'daily_summary',
        severity: 'info',
        service_key: 'standup',
        details: { summary, date: today, agents_count: Object.keys(standups).length }
      });
    } catch (_) {}
  }

  async sendToNeiky(summary) {
    const message =
      `🌅 *Buenos días Neiky!*\n\n` +
      `${summary}\n\n` +
      `— Mariana 🤖 | Fractal MX`;
    const phone = process.env.NEIKY_WHATSAPP || '+525534189583';
    const diag = { phone, channels: {} };

    // Try BOTH channels and report. Helps diagnose silent-success cases
    // (API returned 200 but message never arrived).
    const { sendMetaMessage, sendTwilioMessage } = require('../core/whatsapp');

    try {
      const metaRes = await sendMetaMessage(phone, message);
      diag.channels.meta = { ok: true, response: metaRes };
      console.log('  ✓ Meta API:', JSON.stringify(metaRes).slice(0, 200));
    } catch (metaErr) {
      diag.channels.meta = {
        ok: false,
        error: metaErr.message,
        details: metaErr.response?.data || null
      };
      console.error('  ✗ Meta API:', JSON.stringify(diag.channels.meta).slice(0, 300));
    }

    try {
      const twRes = await sendTwilioMessage(phone, message);
      const sid = twRes?.sid;
      // Poll real delivery status for up to 10s — initial 'queued' doesn't mean
      // WhatsApp delivered (sandbox opt-in, bad format, blocked, etc). Avoids
      // silent-success false positive that hid the +52 vs +521 bug for weeks.
      let realStatus = twRes?.status;
      let errorCode = null;
      let errorMessage = null;
      if (sid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const m = await twilio.messages(sid).fetch();
            realStatus = m.status;
            errorCode = m.errorCode || null;
            errorMessage = m.errorMessage || null;
            if (['delivered', 'read', 'failed', 'undelivered'].includes(realStatus)) break;
          } catch (_) {}
        }
      }
      const succeeded = ['delivered', 'read', 'sent'].includes(realStatus);
      diag.channels.twilio = { ok: succeeded, sid, status: realStatus, errorCode, errorMessage };
      if (succeeded) {
        console.log('  ✓ Twilio:', diag.channels.twilio);
      } else {
        console.error('  ✗ Twilio (real status):', JSON.stringify(diag.channels.twilio).slice(0, 300));
      }
    } catch (twErr) {
      diag.channels.twilio = {
        ok: false,
        error: twErr.message,
        code: twErr.code || null,
        details: twErr.response?.data || null
      };
      console.error('  ✗ Twilio (threw):', JSON.stringify(diag.channels.twilio).slice(0, 300));
    }

    const sent = diag.channels.meta?.ok || diag.channels.twilio?.ok;
    return { sent, diagnostic: diag };
  }

  broadcastToOffice(standups) {
    if (!global.io) return;
    let delay = 0;
    for (const standup of Object.values(standups)) {
      setTimeout(() => {
        try {
          global.io.emit('agent_standup', {
            agent: standup.agent.toLowerCase(),
            message: standup.message,
            type: 'standup'
          });
          // Also fire chat_bubble for consistency with the existing handler
          global.io.emit('chat_bubble', {
            agent: standup.agent.toLowerCase(),
            text: String(standup.message || '').slice(0, 240),
            kind: 'standup',
            ts: Date.now()
          });
        } catch (_) {}
      }, delay);
      delay += 2000;
    }
  }
}

module.exports = new DailyStandup();
