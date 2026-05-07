// backend/src/core/proactive-scheduler.js
// Fractal Virtual Team v4.2 — Mariana Proactiva
//
// Sistema de mensajes proactivos programados:
//   • Check-in matutino: L-V 8:30 AM México
//   • Check-in vespertino: L-V 6:00 PM México
//   • Auto follow-ups: cada 30 min si hay ítems pendientes
//   • Alertas críticas: cada hora si hay prioridad 1
//
// REGLAS "NO MOLESTAR":
//   • Solo 8:00 AM – 9:00 PM hora México
//   • Máximo 5 mensajes proactivos por día (sin contar priority 1)
//   • No domingos (excepto priority 1)

const { Queue, Worker } = require('bullmq');
const { createClient } = require('@supabase/supabase-js');
const moment = require('moment-timezone');

const TIMEZONE = 'America/Mexico_City';
const MAX_DAILY = 50;   // Neiky quiere estar informado constantemente — sin límite real
const HOUR_START = 9;   // 9:00 AM inicio jornada
const HOUR_END = 18;    // 6:00 PM fin jornada (descanso del equipo)
const PULSE_INTERVAL_MIN = 20; // Update de equipo cada 20 minutos durante jornada

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── BullMQ Queue ─────────────────────────────────────────────────────────────
let proactiveQueue = null;

function getProactiveQueue() {
  if (!proactiveQueue) {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
    if (redisUrl) {
      const connection = { url: redisUrl, maxRetriesPerRequest: null };
      proactiveQueue = new Queue('fractal-proactive', { connection });
      console.log('[ProactiveScheduler] BullMQ queue conectada');
    }
  }
  return proactiveQueue;
}

// ─── Reglas de horario ────────────────────────────────────────────────────────
function isWithinHours(priority = 2) {
  const now = moment().tz(TIMEZONE);
  const hour = now.hour();
  const day = now.day(); // 0=Domingo, 1=Lunes...6=Sábado

  // Prioridad crítica (1): siempre pasa
  if (priority === 1) return true;

  // No domingos para prioridad normal/informativa
  if (day === 0) return false;

  // Solo dentro del horario permitido
  return hour >= HOUR_START && hour < HOUR_END;
}

async function countTodayMessages(recipient = 'neiky') {
  const today = moment().tz(TIMEZONE).startOf('day').toISOString();
  try {
    const { count } = await supabase
      .from('proactive_log')
      .select('*', { count: 'exact', head: true })
      .eq('recipient', recipient)
      .gte('sent_at', today);
    return count || 0;
  } catch {
    return 0;
  }
}

async function canSend(priority = 2, recipient = 'neiky') {
  if (!isWithinHours(priority)) return false;
  if (priority === 1) return true; // crítico: siempre

  const count = await countTodayMessages(recipient);
  return count < MAX_DAILY;
}

async function logMessage(type, message, followupId = null, recipient = 'neiky') {
  try {
    await supabase.from('proactive_log').insert({
      type,
      channel: 'whatsapp',
      recipient,
      message: message?.substring(0, 500),
      followup_id: followupId || null
    });
  } catch (err) {
    console.warn('[ProactiveScheduler] No se pudo loggear en proactive_log:', err.message);
  }
}

// ─── Envío de mensajes ────────────────────────────────────────────────────────
async function sendProactiveToNeiky(message, type, followupId = null, priority = 2) {
  const allowed = await canSend(priority);
  if (!allowed) {
    const now = moment().tz(TIMEZONE);
    console.log(`[ProactiveScheduler] Mensaje ${type} bloqueado — fuera de horario o límite diario (${now.format('HH:mm ddd')})`);
    return false;
  }

  const phone = process.env.NEIKY_WHATSAPP || process.env.NEIKY_PHONE || '+5215534189583';
  let sent = false;

  // 1. WhatsApp (Twilio)
  try {
    const { sendTwilioMessage } = require('./whatsapp');
    await sendTwilioMessage(phone, message);
    console.log(`[ProactiveScheduler] ✅ WhatsApp → ${type}`);
    sent = true;
  } catch (err) {
    console.warn('[ProactiveScheduler] WhatsApp falló:', err.message);
  }

  // 2. Socket.io (web)
  if (!sent && global.io) {
    global.io.emit('proactive_message', {
      from: 'MARIANA',
      type,
      message,
      timestamp: new Date().toISOString()
    });
    console.log(`[ProactiveScheduler] ✅ Socket.io → ${type}`);
    sent = true;
  }

  // 3. Email fallback
  if (!sent) {
    try {
      const { sendEmail } = require('./email');
      await sendEmail({
        to: process.env.NEIKY_EMAIL || 'nakedgeometry19@gmail.com',
        subject: `🌸 Mariana: ${type}`,
        html: `<p style="font-family:sans-serif;">${message.replace(/\n/g, '<br>')}</p>`,
        text: message,
        fromName: 'Mariana · Fractal MX'
      });
      console.log(`[ProactiveScheduler] ✅ Email → ${type}`);
      sent = true;
    } catch (err) {
      console.error('[ProactiveScheduler] Todos los canales fallaron:', err.message);
    }
  }

  if (sent) await logMessage(type, message, followupId);
  return sent;
}

// ─── Generadores de mensajes ──────────────────────────────────────────────────

async function buildMorningCheckin() {
  const now = moment().tz(TIMEZONE);
  const dayName = now.format('dddd');

  // Cargar followups pendientes del día
  const { data: followups } = await supabase
    .from('scheduled_followups')
    .select('*')
    .eq('status', 'pending')
    .lte('execute_at', now.clone().endOf('day').toISOString())
    .order('priority', { ascending: true })
    .limit(5);

  let msg = `☀️ Buenos días, nene! Feliz ${dayName}.\n\n`;
  msg += `Aquí tu resumen de hoy desde Fractal MX:\n`;

  if (!followups || followups.length === 0) {
    msg += `\n✅ Sin pendientes urgentes por ahora. Día despejado para crear.`;
  } else {
    msg += '\n📋 Pendientes del día:';
    for (const f of followups) {
      const icon = f.priority === 1 ? '🔴' : f.priority === 2 ? '🟡' : '🟢';
      const clientName = f.context?.client_name || '';
      const amount = f.context?.amount ? ` — $${f.context.amount}` : '';
      msg += `\n${icon} ${f.type.replace(/_/g, ' ')}${clientName ? ` · ${clientName}` : ''}${amount}`;
    }
  }

  msg += `\n\n¿Por dónde empezamos? 🌸`;
  return msg;
}

async function buildEveningCheckin() {
  const now = moment().tz(TIMEZONE);

  const { data: pending } = await supabase
    .from('scheduled_followups')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .limit(5);

  let msg = `🌙 Buenas noches, nene! Ya es fin de jornada.\n\n`;

  if (!pending || pending.length === 0) {
    msg += `✅ Sin pendientes para mañana. Hermoso cierre.\n`;
  } else {
    msg += `📋 Quedan ${pending.length} pendiente(s) para mañana:\n`;
    for (const f of pending.slice(0, 3)) {
      const icon = f.priority === 1 ? '🔴' : '🟡';
      const ctx = f.context || {};
      msg += `\n${icon} ${f.type.replace(/_/g, ' ')}${ctx.client_name ? ` — ${ctx.client_name}` : ''}`;
    }
    if (pending.length > 3) msg += `\n... y ${pending.length - 3} más.`;
  }

  msg += `\n\n¡Descansa bien! Mañana seguimos. 💪`;
  return msg;
}

async function buildFollowUpAlert(followup) {
  const ctx = followup.context || {};
  const typeLabels = {
    awaiting_user_info: 'info pendiente del cliente',
    payment_due: 'pago pendiente',
    delivery_reminder: 'entrega programada',
    quote_silence: 'cotización sin respuesta',
    inactive_project: 'proyecto inactivo',
    client_no_response: 'cliente sin respuesta',
    custom_alert: 'alerta personalizada'
  };

  const label = typeLabels[followup.type] || followup.type;
  const client = ctx.client_name ? ` con **${ctx.client_name}**` : '';
  const project = ctx.project_name ? ` (${ctx.project_name})` : '';
  const amount = ctx.amount ? ` — $${ctx.amount.toLocaleString('es-MX')}` : '';
  const deadline = ctx.deadline ? `\n⏰ Deadline: ${ctx.deadline}` : '';
  const notes = ctx.original_message ? `\n💬 "${ctx.original_message.substring(0, 120)}"` : '';

  return `⚠️ Recordatorio: ${label}${client}${project}${amount}${deadline}${notes}\n\n¿Lo atendemos ahora?`;
}

// ─── Update de jornada (cada 20 min de 9-18 L-V) ─────────────────────────────
async function buildWorkingHoursUpdate() {
  const now = moment().tz(TIMEZONE);

  // Tareas activas (últimas 2 horas)
  let activeTasksText = '';
  try {
    const twoHoursAgo = now.clone().subtract(2, 'hours').toISOString();
    const { data: activeTasks } = await supabase
      .from('tasks')
      .select('agent_assigned, message, status, created_at')
      .in('status', ['working', 'classifying', 'pitching', 'awaiting_confirmation', 'reviewing'])
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    if (activeTasks?.length > 0) {
      const taskLines = activeTasks.map(t => {
        const agt = (t.agent_assigned || 'Mariana').toUpperCase();
        const statusLabel = { working: '🔄 ejecutando', classifying: '🔍 clasificando', pitching: '📋 enviando plan', awaiting_confirmation: '⏳ esperando OK', reviewing: '👁 en revisión' }[t.status] || t.status;
        return `• ${agt}: ${statusLabel} — "${(t.message || '').substring(0, 50)}"`;
      });
      activeTasksText = `\n\n📋 *Tareas activas:*\n${taskLines.join('\n')}`;
    }
  } catch { /* no bloquear */ }

  // Agentes con auto-work reciente
  let teamText = '';
  try {
    const { getTeamStatus } = require('./agent-work-manager');
    const teamStatus = await getTeamStatus();
    const busy = teamStatus.filter(a => a.status === 'working');
    const idle = teamStatus.filter(a => a.status === 'idle');

    if (busy.length > 0) {
      const busyList = busy.slice(0, 4).map(a => `${a.name || a.agent}`).join(', ');
      teamText += `\n👥 *Trabajando:* ${busyList}`;
    }
    if (idle.length > 0) {
      teamText += `\n💤 *Disponibles:* ${idle.length} agente(s)`;
    }
  } catch { /* no bloquear */ }

  const hora = now.format('HH:mm');
  return `🏢 *Update ${hora}h — Fractal MX*${activeTasksText}${teamText}\n\n_Escribe "equipo" para ver detalles · "asigna trabajo" para activar al equipo_`;
}

async function executeWorkingHoursUpdate() {
  const now = moment().tz(TIMEZONE);
  const hour = now.hour();
  const day = now.day();

  // Solo de lunes (1) a viernes (5), 9-18h
  if (day < 1 || day > 5 || hour < HOUR_START || hour >= HOUR_END) return;

  try {
    // Si hay tareas activas o agentes idle → siempre enviar
    // Si todo está tranquilo → enviar de todas formas (Neiky quiere saber)
    const msg = await buildWorkingHoursUpdate();

    // Auto-delegación cuando el equipo está idle — ponemos a trabajar a los que están libres
    try {
      const { getTeamStatus, assignAutoWork } = require('./agent-work-manager');
      const teamStatus = await getTeamStatus();
      const idleAgents = teamStatus.filter(a => a.status === 'idle');

      if (idleAgents.length >= 3) {
        // Más de 3 agentes idle → poner a trabajar automáticamente (silencioso)
        setImmediate(async () => {
          try {
            const suggestions = await assignAutoWork(idleAgents.slice(0, 3).map(a => a.agent));
            if (suggestions?.length > 0) {
              console.log(`[ProactiveScheduler] Auto-work asignado a ${suggestions.length} agentes idle`);
            }
          } catch (e) {
            console.warn('[ProactiveScheduler] assignAutoWork error:', e.message);
          }
        });
      }
    } catch { /* no bloquear el update */ }

    await sendProactiveToNeiky(msg, 'working_hours_update', null, 2);
  } catch (err) {
    console.error('[ProactiveScheduler] executeWorkingHoursUpdate error:', err.message);
  }
}

// ─── Ejecutores por tipo de job ───────────────────────────────────────────────

async function executeMorningCheckin() {
  const msg = await buildMorningCheckin();
  await sendProactiveToNeiky(msg, 'morning_checkin');
}

async function executeEveningCheckin() {
  const msg = await buildEveningCheckin();
  await sendProactiveToNeiky(msg, 'evening_checkin');
}

async function executeAutoFollowUps() {
  // Buscar followups pendientes que ya vencieron
  const { data: due } = await supabase
    .from('scheduled_followups')
    .select('*')
    .eq('status', 'pending')
    .lte('execute_at', new Date().toISOString())
    .order('priority', { ascending: true })
    .limit(3);

  if (!due || due.length === 0) return;

  for (const followup of due) {
    const msg = await buildFollowUpAlert(followup);
    const sent = await sendProactiveToNeiky(msg, followup.type, followup.id, followup.priority);

    if (sent) {
      // Marcar como ejecutado
      await supabase.from('scheduled_followups')
        .update({
          status: 'executed',
          message_sent: msg,
          executed_at: new Date().toISOString()
        })
        .eq('id', followup.id);
    }
  }
}

async function executeCriticalAlerts() {
  const { data: critical } = await supabase
    .from('scheduled_followups')
    .select('*')
    .eq('status', 'pending')
    .eq('priority', 1)
    .lte('execute_at', new Date().toISOString())
    .limit(2);

  if (!critical || critical.length === 0) return;

  for (const followup of critical) {
    const msg = `🚨 URGENTE: ${await buildFollowUpAlert(followup)}`;
    const sent = await sendProactiveToNeiky(msg, followup.type, followup.id, 1);
    if (sent) {
      await supabase.from('scheduled_followups')
        .update({ status: 'executed', message_sent: msg, executed_at: new Date().toISOString() })
        .eq('id', followup.id);
    }
  }
}

// ─── Análisis de conversación para crear follow-ups automáticos ───────────────
async function analyzeForFollowUp(marianaResponse, userMessage, context = {}) {
  // Detectar si hay compromisos, pagos mencionados, plazos, etc.
  const patterns = [
    // Pagos
    { regex: /\$[\d,]+|pago|cobro|factura|presupuesto|cotizaci[oó]n/i, type: 'payment_due', delay: 24 * 60 * 60 * 1000 },
    // Entrega
    { regex: /entrega|deadline|lunes|martes|miércoles|jueves|viernes|próxima semana/i, type: 'delivery_reminder', delay: 12 * 60 * 60 * 1000 },
    // Info pendiente de cliente
    { regex: /cuando tengas|mándame|comparte|necesito que|falta (el|la|los|las)/i, type: 'awaiting_user_info', delay: 6 * 60 * 60 * 1000 },
    // Cotización enviada
    { regex: /te mandé|envié|te pasé.*(propuesta|cotización|presupuesto)/i, type: 'quote_silence', delay: 48 * 60 * 60 * 1000 }
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(marianaResponse) || pattern.regex.test(userMessage)) {
      const executeAt = new Date(Date.now() + pattern.delay);

      // Extraer nombre de cliente del contexto si está disponible
      const ctx = {
        original_message: userMessage?.substring(0, 300),
        client_name: context.clientName || null,
        project_name: context.projectName || null
      };

      try {
        await supabase.from('scheduled_followups').insert({
          type: pattern.type,
          context: ctx,
          source: 'auto',
          priority: 2,
          execute_at: executeAt.toISOString(),
          status: 'pending'
        });
        console.log(`[ProactiveScheduler] Auto follow-up creado: ${pattern.type} en ${executeAt.toLocaleString('es-MX')}`);
      } catch (err) {
        console.warn('[ProactiveScheduler] No se pudo crear auto follow-up:', err.message);
      }
      break; // Solo uno por mensaje
    }
  }
}

// ─── Scheduling con intervalos simples (sin node-cron, usando setInterval) ────
// BullMQ repeat es más robusto pero requiere Redis — usar si está disponible,
// si no, setInterval como fallback para los checks periódicos.

let scheduledIntervals = [];

function scheduleWithBullMQ(queue) {
  // Check-in matutino: L-V 8:30 AM México → verificar cada minuto si corresponde
  // Check-in vespertino: L-V 6:00 PM México → igual
  // Auto follow-ups: cada 30 min
  // Critical alerts: cada 60 min

  // BullMQ Repeat jobs para checks periódicos
  const jobs = [
    { name: 'morning-checkin', data: { type: 'morning_checkin' }, opts: { repeat: { pattern: '30 9 * * 1-5', tz: TIMEZONE } } },
    { name: 'evening-checkin', data: { type: 'evening_checkin' }, opts: { repeat: { pattern: '0 18 * * 1-5', tz: TIMEZONE } } },
    { name: 'auto-followups', data: { type: 'auto_followups' }, opts: { repeat: { every: 30 * 60 * 1000 } } },
    { name: 'critical-alerts', data: { type: 'critical_alerts' }, opts: { repeat: { every: 60 * 60 * 1000 } } },
    { name: 'working-hours-update', data: { type: 'working_hours_update' }, opts: { repeat: { every: PULSE_INTERVAL_MIN * 60 * 1000 } } },
  ];

  for (const job of jobs) {
    queue.add(job.name, job.data, job.opts)
      .then(() => console.log(`[ProactiveScheduler] BullMQ job registrado: ${job.name}`))
      .catch(err => console.warn(`[ProactiveScheduler] Error registrando ${job.name}:`, err.message));
  }
}

function scheduleWithIntervals() {
  console.log('[ProactiveScheduler] Usando setInterval como fallback (sin Redis)');

  // Check matutino y vespertino: verificar cada minuto si es la hora
  const checkinInterval = setInterval(async () => {
    const now = moment().tz(TIMEZONE);
    const h = now.hour();
    const m = now.minute();
    const day = now.day();

    // L-V (1-5)
    if (day >= 1 && day <= 5) {
      if (h === 8 && m === 30) await executeMorningCheckin().catch(e => console.error('[Checkin AM]', e.message));
      if (h === 18 && m === 0) await executeEveningCheckin().catch(e => console.error('[Checkin PM]', e.message));
    }
  }, 60 * 1000); // cada minuto

  // Auto follow-ups: cada 30 min
  const followupInterval = setInterval(async () => {
    await executeAutoFollowUps().catch(e => console.error('[AutoFollowUp]', e.message));
  }, 30 * 60 * 1000);

  // Critical alerts: cada hora
  const alertInterval = setInterval(async () => {
    await executeCriticalAlerts().catch(e => console.error('[CriticalAlerts]', e.message));
  }, 60 * 60 * 1000);

  // Pulse de jornada: cada 20 min de 9-18h L-V
  const pulseInterval = setInterval(async () => {
    await executeWorkingHoursUpdate().catch(e => console.error('[WorkingHoursPulse]', e.message));
  }, PULSE_INTERVAL_MIN * 60 * 1000);

  scheduledIntervals.push(checkinInterval, followupInterval, alertInterval, pulseInterval);
}

// ─── API pública ──────────────────────────────────────────────────────────────

function startProactiveScheduler() {
  console.log('[ProactiveScheduler] Iniciando sistema Mariana Proactiva...');

  const queue = getProactiveQueue();
  if (queue) {
    scheduleWithBullMQ(queue);
  } else {
    scheduleWithIntervals();
  }

  console.log('[ProactiveScheduler] ✅ Sistema proactivo activo');
}

function stopProactiveScheduler() {
  for (const interval of scheduledIntervals) clearInterval(interval);
  scheduledIntervals = [];
  proactiveQueue?.close();
}

/**
 * Crear un follow-up manual (llamado desde otros agentes o rutas)
 */
async function scheduleFollowUp({ type, context = {}, executeAt, priority = 2, clientId = null }) {
  const at = executeAt instanceof Date ? executeAt : new Date(executeAt);
  try {
    const { data } = await supabase.from('scheduled_followups').insert({
      type,
      context,
      source: 'manual',
      priority,
      execute_at: at.toISOString(),
      status: 'pending',
      related_client_id: clientId || null
    }).select('id').single();
    console.log(`[ProactiveScheduler] Follow-up manual creado: ${type} → ${at.toLocaleString('es-MX')}`);
    return data?.id;
  } catch (err) {
    console.error('[ProactiveScheduler] Error creando follow-up:', err.message);
    return null;
  }
}

// Ejecutar un job por tipo (usado por el worker BullMQ)
async function executeJobType(type) {
  switch (type) {
    case 'morning_checkin':      return executeMorningCheckin();
    case 'evening_checkin':      return executeEveningCheckin();
    case 'auto_followups':       return executeAutoFollowUps();
    case 'critical_alerts':      return executeCriticalAlerts();
    case 'working_hours_update': return executeWorkingHoursUpdate();
    default: console.warn(`[ProactiveScheduler] Tipo de job desconocido: ${type}`);
  }
}

module.exports = {
  startProactiveScheduler,
  stopProactiveScheduler,
  scheduleFollowUp,
  analyzeForFollowUp,
  executeJobType,
  sendProactiveToNeiky,
  executeWorkingHoursUpdate,
  canSend,
  getProactiveQueue
};
