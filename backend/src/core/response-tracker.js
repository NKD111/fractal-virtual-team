// backend/src/core/response-tracker.js
// Fractal Virtual Team v4.2 — Sistema de Seguimiento Inteligente y Autónomo
//
// Cuando un agente pregunta algo a Neiky y no responde:
//   1. Se clasifica la urgencia de la pregunta
//   2. Se programa un re-ping inteligente con el tiempo apropiado
//   3. Si aún no responde, se escala o cancela según configuración
//   4. Todo respeta las reglas: 8 AM - 9 PM, max 5/día, no domingos
//
// Flujo:
//   Agente pregunta → trackQuestion() → DB → cron cada 15min → sendReminder()
//   Neiky responde (cualquier msg) → checkIfAnswers() → markAnswered()

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const moment = require('moment-timezone');

const TIMEZONE = 'America/Mexico_City';
const MAX_DAILY_REMINDERS = 5;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Clasificación de urgencia ────────────────────────────────────────────────

const QUESTION_TYPES = {
  pricing_approval: {
    patterns: [
      /cu[aá]nto.*cobr/i,
      /aprobar?\s+(precio|cotizaci[oó]n|presupuesto)/i,
      /confirmas?\s+el\s+(precio|monto|costo)/i,
      /le\s+mandamos\s+(la\s+)?(cotizaci[oó]n|propuesta)/i,
      /\$[\d,]+.*aprueba/i
    ],
    urgency_level: 5,
    first_reminder_minutes: 60,
    subsequent_multiplier: 2,
    max_reminders: 4,
    escalate_after: true
  },
  client_decision: {
    patterns: [
      /cliente.*(quiere|necesita|pregunta|espera)/i,
      /qu[eé]\s+le\s+(digo|respondo|contesto)/i,
      /(acepto|tomamos)\s+(el|este)\s+(proyecto|cliente|trabajo)/i,
      /c[oó]mo\s+procedemos\s+con/i
    ],
    urgency_level: 4,
    first_reminder_minutes: 120,
    subsequent_multiplier: 2,
    max_reminders: 3,
    escalate_after: true
  },
  info_request: {
    patterns: [
      /me\s+pasas?/i,
      /necesito.*(info|datos|archivo|imagen|logo|brief)/i,
      /me\s+confirmas?/i,
      /podr[ií]as?\s+enviarme/i,
      /falta.*(el|la|los|las|tu|su)/i
    ],
    urgency_level: 3,
    first_reminder_minutes: 240,
    subsequent_multiplier: 2,
    max_reminders: 3,
    escalate_after: false
  },
  status_update: {
    patterns: [
      /c[oó]mo\s+va/i,
      /algún\s+(cambio|update|avance)/i,
      /cuentas?\s+con\s+algo\s+nuevo/i,
      /ya\s+(revisaste|viste|checaste)/i
    ],
    urgency_level: 2,
    first_reminder_minutes: 1440,
    subsequent_multiplier: 1.5,
    max_reminders: 2,
    escalate_after: false
  },
  casual: {
    patterns: [
      /qu[eé]\s+tal/i,
      /c[oó]mo\s+est[aá]s/i,
      /buenos?\s+d[ií]as/i,
      /buenas?\s+tardes/i
    ],
    urgency_level: 1,
    first_reminder_minutes: null,
    max_reminders: 0,
    escalate_after: false
  }
};

function classifyQuestion(message, context = {}) {
  for (const [type, config] of Object.entries(QUESTION_TYPES)) {
    for (const pattern of config.patterns || []) {
      if (pattern.test(message)) {
        return { type, ...config };
      }
    }
  }
  return { type: 'casual', ...QUESTION_TYPES.casual };
}

function calculateNextReminder(item, attemptNumber) {
  const config = QUESTION_TYPES[item.question_type] || QUESTION_TYPES.info_request;
  const baseMs = config.first_reminder_minutes * 60 * 1000;
  const multiplier = Math.pow(config.subsequent_multiplier || 2, Math.max(0, attemptNumber - 1));
  const delayMs = baseMs * multiplier;
  return new Date(Date.now() + delayMs);
}

// ─── Mensajes de reminder por tipo ────────────────────────────────────────────

const REMINDER_MESSAGES = {
  pricing_approval: [
    (ctx) => `Nene, sigue pendiente lo del precio${ctx.client_name ? ` de ${ctx.client_name}` : ''}. ¿Lo revisamos?`,
    (ctx) => `Mi rey, ${ctx.client_name || 'el cliente'} sigue esperando cotización. ¿Te ayudo a definirla?`,
    (ctx) => `🚨 ${ctx.client_name || 'El cliente'} lleva tiempo esperando. ¿Le doy un estimado o le digo que mañana?`,
    (ctx) => `Última nota sobre ${ctx.client_name || 'la cotización'}: tomo acción conservadora si no me confirmas. ¿Procedo?`
  ],
  client_decision: [
    (ctx) => `Bebé, ¿qué decidimos con ${ctx.client_name || 'el cliente'}?`,
    (ctx) => `Recordatorio nene: ${ctx.client_name || 'el cliente'} espera respuesta${ctx.topic ? ` sobre ${ctx.topic}` : ''}.`,
    (ctx) => `Última nota: si no me dices algo, le digo a ${ctx.client_name || 'el cliente'} que te contacte directo. ¿Va?`
  ],
  info_request: [
    (ctx) => `Hey, sigo esperando${ctx.what ? ` ${ctx.what}` : ' esa información'} cuando puedas 😊`,
    (ctx) => `Recordatorio: necesito${ctx.what ? ` ${ctx.what}` : ' esos datos'} para avanzar${ctx.project_name ? ` con ${ctx.project_name}` : ''}.`,
    (ctx) => `${ctx.project_name || 'El proyecto'} está pausado esperando${ctx.what ? ` ${ctx.what}` : ' tu información'}. Avísame.`
  ],
  status_update: [
    (ctx) => `¿Cómo vas con lo que platicamos${ctx.topic ? ` de ${ctx.topic}` : ''}?`,
    (ctx) => `Sigo aquí cuando tengas un momento para platicar${ctx.topic ? ` de ${ctx.topic}` : ''}.`
  ]
};

function buildReminderMessage(item, attemptNumber) {
  const ctx = item.context || {};
  const messages = REMINDER_MESSAGES[item.question_type] || REMINDER_MESSAGES.info_request;
  const msgFn = messages[Math.min(attemptNumber - 1, messages.length - 1)];
  return msgFn ? msgFn(ctx) : `Recordatorio: ¿ya tienes respuesta para "${(item.original_message || '').substring(0, 80)}"?`;
}

// ─── Límites de envío ─────────────────────────────────────────────────────────

async function canSendReminder(urgencyLevel = 2) {
  const now = moment().tz(TIMEZONE);
  const hour = now.hour();
  const day = now.day();

  // Urgencia máxima: siempre pasa
  if (urgencyLevel >= 5) return true;

  // Fuera de horario
  if (hour < 8 || hour >= 21) return false;

  // Domingos: solo urgencia >= 5
  if (day === 0) return false;

  // Límite diario
  const today = now.startOf('day').toISOString();
  try {
    const { count } = await supabase
      .from('proactive_log')
      .select('*', { count: 'exact', head: true })
      .eq('recipient', 'neiky')
      .gte('sent_at', today);
    return (count || 0) < MAX_DAILY_REMINDERS;
  } catch {
    return true;
  }
}

async function checkUserPause() {
  // Consultar si Neiky puso pausa (guardado en scheduled_followups con type='user_pause')
  try {
    const { data } = await supabase
      .from('scheduled_followups')
      .select('execute_at')
      .eq('type', 'user_pause')
      .eq('status', 'pending')
      .gte('execute_at', new Date().toISOString())
      .limit(1);
    return data && data.length > 0;
  } catch {
    return false;
  }
}

// ─── Envío del reminder ───────────────────────────────────────────────────────

async function sendReminderMessage(item, attemptNumber) {
  const text = buildReminderMessage(item, attemptNumber);
  const phone = process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583';

  let sent = false;

  // WhatsApp
  try {
    const { sendTwilioMessage } = require('./whatsapp');
    await sendTwilioMessage(phone, text);
    sent = true;
  } catch (err) {
    console.warn('[ResponseTracker] WhatsApp falló:', err.message);
  }

  // Socket.io fallback
  if (!sent && global.io) {
    global.io.emit('proactive_message', { from: 'MARIANA', type: 'reminder', message: text, timestamp: new Date().toISOString() });
    sent = true;
  }

  // Email fallback
  if (!sent) {
    try {
      const { sendEmail } = require('./email');
      await sendEmail({
        to: process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com',
        subject: `🔔 Fractal: recordatorio pendiente`,
        html: `<p style="font-family:sans-serif;">${text.replace(/\n/g, '<br>')}</p>`,
        text,
        fromName: 'Mariana · Fractal MX'
      });
      sent = true;
    } catch (err) {
      console.error('[ResponseTracker] Todos los canales fallaron:', err.message);
    }
  }

  if (sent) {
    // Log
    try {
      await supabase.from('proactive_log').insert({
        type: 'reminder',
        channel: 'whatsapp',
        recipient: 'neiky',
        message: text.substring(0, 500)
      });
    } catch {}
  }

  return sent;
}

// ─── Escalamiento ─────────────────────────────────────────────────────────────

async function escalateQuestion(item) {
  const ctx = item.context || {};
  let escalationMsg = '';

  if (item.question_type === 'pricing_approval') {
    escalationMsg = `Nene, ${ctx.client_name || 'el cliente'} lleva mucho esperando.` +
      `\nLe voy a decir que mañana le confirmamos cotización.` +
      `\nSi no estás de acuerdo, avísame antes de las 9pm 🌙`;
  } else if (item.question_type === 'client_decision') {
    escalationMsg = `Nene, tomé una decisión conservadora con ${ctx.client_name || 'el cliente'}:` +
      `\nLe dije que estamos revisando y que le confirmamos mañana.` +
      `\nCuando tengas un momento platícame.`;
  } else {
    escalationMsg = `Marqué como resuelto el pendiente de "${(item.original_message || '').substring(0, 100)}" ya que no hubo respuesta. Avísame si necesitas retomarlo.`;
  }

  // Enviar mensaje de escalamiento (siempre pasa, es la última)
  const phone = process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583';
  try {
    const { sendTwilioMessage } = require('./whatsapp');
    await sendTwilioMessage(phone, escalationMsg);
  } catch {
    if (global.io) global.io.emit('proactive_message', { from: 'MARIANA', type: 'escalation', message: escalationMsg });
  }

  await supabase.from('pending_user_responses')
    .update({ status: 'escalated', was_escalated: true })
    .eq('id', item.id);

  console.log(`[ResponseTracker] ⬆️ Pregunta escalada: ${item.id} (${item.question_type})`);
}

// ─── Detección de respuesta con Claude ───────────────────────────────────────

async function claudeDetectsAnswer(question, possibleAnswer) {
  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Pregunta original del agente: "${question.substring(0, 300)}"
Mensaje del usuario: "${possibleAnswer.substring(0, 300)}"

¿El mensaje del usuario responde (total o parcialmente) a esa pregunta?
Responde solo: SI o NO`;

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    });

    const result = response.content[0].text.trim().toUpperCase();
    return result.startsWith('S');
  } catch {
    return false;
  }
}

// ─── ResponseTracker ──────────────────────────────────────────────────────────

class ResponseTracker {

  /**
   * Registra que un agente hizo una pregunta a Neiky.
   * Llamar desde BaseAgent.sendQuestionToNeiky()
   *
   * @param {object} agent - instancia del agente (necesita .name o .slug)
   * @param {string} message - el texto de la pregunta
   * @param {object} context - { clientName, projectName, what, topic, relatedProjectId, relatedClientId }
   */
  async trackQuestion(agent, message, context = {}) {
    const classification = classifyQuestion(message, context);

    if (!classification.first_reminder_minutes) {
      // Casual o sin urgencia → no trackear
      return null;
    }

    const nextReminder = calculateNextReminder({ question_type: classification.type, context }, 1);
    const agentName = agent.name || agent.slug || 'mariana';

    try {
      const { data, error } = await supabase.from('pending_user_responses').insert({
        agent_id: agentName,
        user_id: 'neiky_unified',
        original_message: message.substring(0, 1000),
        question_type: classification.type,
        urgency_level: classification.urgency_level,
        context: {
          client_name: context.clientName || context.client_name || null,
          project_name: context.projectName || context.project_name || null,
          what: context.what || null,
          topic: context.topic || null,
          ...context
        },
        next_reminder_at: nextReminder.toISOString(),
        max_reminders: classification.max_reminders,
        status: 'awaiting_response',
        related_project_id: context.relatedProjectId || null,
        related_client_id: context.relatedClientId || null
      }).select('id').single();

      if (!error && data) {
        console.log(`[ResponseTracker] Pregunta trackeada: ${classification.type} (urgencia ${classification.urgency_level}) → próximo reminder: ${nextReminder.toLocaleString('es-MX')}`);
        return data.id;
      }
    } catch (err) {
      console.warn('[ResponseTracker] No se pudo trackear pregunta:', err.message);
    }

    return null;
  }

  /**
   * Revisa si el mensaje de Neiky responde a alguna pregunta pendiente.
   * Llamar cada vez que Neiky envía un mensaje.
   *
   * @param {string} neikyMessage - texto del mensaje de Neiky
   */
  async checkIfAnswers(neikyMessage) {
    if (!neikyMessage || neikyMessage.length < 3) return;

    try {
      const { data: pending } = await supabase
        .from('pending_user_responses')
        .select('*')
        .eq('status', 'awaiting_response')
        .order('asked_at', { ascending: false })
        .limit(10);

      if (!pending || pending.length === 0) return;

      for (const question of pending) {
        const isAnswer = await claudeDetectsAnswer(question.original_message, neikyMessage);
        if (isAnswer) {
          await supabase.from('pending_user_responses')
            .update({
              status: 'answered',
              answered_at: new Date().toISOString()
            })
            .eq('id', question.id);
          console.log(`[ResponseTracker] ✅ Pregunta respondida: ${question.id} (${question.question_type})`);
        }
      }
    } catch (err) {
      console.warn('[ResponseTracker] checkIfAnswers error:', err.message);
    }
  }

  /**
   * Ejecuta el ciclo de reminders — llamar cada 15 min desde el worker/cron.
   */
  async checkPendingReminders() {
    const now = new Date();

    try {
      const { data: pending } = await supabase
        .from('pending_user_responses')
        .select('*')
        .eq('status', 'awaiting_response')
        .lte('next_reminder_at', now.toISOString())
        .order('urgency_level', { ascending: false })
        .limit(10);

      if (!pending || pending.length === 0) return;

      // Verificar pausa de usuario
      const isPaused = await checkUserPause();

      for (const item of pending) {
        // Saltear si está en pausa y no es crítico
        if (isPaused && item.urgency_level < 5) continue;

        const allowed = await canSendReminder(item.urgency_level);
        if (!allowed) {
          console.log(`[ResponseTracker] Reminder bloqueado para ${item.id} (fuera de horario/límite)`);
          continue;
        }

        const attemptNumber = (item.reminder_count || 0) + 1;
        const sent = await sendReminderMessage(item, attemptNumber);

        if (sent) {
          const isLastReminder = attemptNumber >= (item.max_reminders || 3);
          const nextAt = isLastReminder ? null : calculateNextReminder(item, attemptNumber + 1);

          if (isLastReminder) {
            if (item.escalate_after) {
              await escalateQuestion(item);
            } else {
              await supabase.from('pending_user_responses')
                .update({ status: 'cancelled' })
                .eq('id', item.id);
              console.log(`[ResponseTracker] Pregunta cancelada (sin escalada): ${item.id}`);
            }
          } else {
            await supabase.from('pending_user_responses')
              .update({
                reminder_count: attemptNumber,
                last_reminder_at: now.toISOString(),
                next_reminder_at: nextAt.toISOString()
              })
              .eq('id', item.id);
          }
        }
      }
    } catch (err) {
      console.error('[ResponseTracker] checkPendingReminders error:', err.message);
    }
  }

  /**
   * Procesar comandos de control de Neiky.
   * Detecta frases como "pausa reminders 2 horas", "cancela el follow-up de X"
   *
   * @returns {string|null} respuesta si se procesó un comando, null si no era un comando
   */
  async processControlCommand(message) {
    const lower = message.toLowerCase();

    // "pausa reminders N horas/minutos"
    const pauseMatch = message.match(/paus[ae]\s+(?:reminders?|avisos?)?\s*(\d+)\s*(hora(?:s)?|min(?:utos?)?)/i);
    if (pauseMatch) {
      const amount = parseInt(pauseMatch[1]);
      const unit = pauseMatch[2].toLowerCase().startsWith('hora') ? 'hours' : 'minutes';
      const pauseUntil = moment().tz(TIMEZONE).add(amount, unit).toDate();

      try {
        await supabase.from('scheduled_followups').insert({
          type: 'user_pause',
          context: { reason: 'user_request' },
          source: 'manual',
          priority: 1,
          execute_at: pauseUntil.toISOString(),
          status: 'pending'
        });
      } catch {}

      return `✅ Reminders pausados por ${amount} ${unit === 'hours' ? 'hora(s)' : 'minuto(s)'}. Los críticos (prioridad máxima) aún llegarán.`;
    }

    // "¿qué tienes pendiente?" / "qué preguntas tienes"
    if (/qu[eé]\s+(tienes?\s+)?pendiente|preguntas\s+(tienes?|abiertas?)/i.test(message)) {
      try {
        const { data } = await supabase
          .from('pending_user_responses')
          .select('*')
          .eq('status', 'awaiting_response')
          .order('urgency_level', { ascending: false })
          .limit(5);

        if (!data || data.length === 0) return '✅ Sin preguntas pendientes. Todo al día, nene.';

        let resp = `📋 Tengo ${data.length} pregunta(s) pendiente(s):\n`;
        for (const item of data) {
          const icon = item.urgency_level >= 4 ? '🔴' : item.urgency_level >= 3 ? '🟡' : '🟢';
          resp += `\n${icon} [${item.question_type}] "${(item.original_message || '').substring(0, 80)}..."`;
        }
        return resp;
      } catch {
        return 'No pude cargar los pendientes en este momento.';
      }
    }

    // "reset" / "limpia pendientes"
    if (/^(reset|limpia\s+(todo|pendientes?))$/i.test(lower.trim())) {
      try {
        await supabase.from('pending_user_responses')
          .update({ status: 'cancelled' })
          .eq('status', 'awaiting_response')
          .lt('urgency_level', 5); // mantener críticos
        return '🧹 Limpié todos los pendientes no críticos. Los de urgencia máxima siguen activos.';
      } catch {
        return 'Error limpiando pendientes.';
      }
    }

    return null; // No era un comando de control
  }
}

const responseTracker = new ResponseTracker();
module.exports = responseTracker;
