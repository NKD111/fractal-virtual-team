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

    // 5. WhatsApp a Neiky
    const sent = await this.sendToNeiky(summary);

    // 6. Broadcast al Office View (chat bubbles staggered)
    this.broadcastToOffice(standups);

    console.log(`✅ Daily Standup completado (whatsapp_sent=${sent})`);
    return { standups, summary, whatsapp_sent: sent };
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
    try {
      await notifyNeiky(message);
      console.log('  ✓ WhatsApp enviado a Neiky');
      return true;
    } catch (err) {
      console.error('  ✗ WhatsApp a Neiky falló:', err.message);
      return false;
    }
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
            text: standup.message.length > 60 ? standup.message.slice(0, 57) + '…' : standup.message,
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
