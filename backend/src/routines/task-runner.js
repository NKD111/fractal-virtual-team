// backend/src/routines/task-runner.js
// Orquestador de "tarea visualizada":
//   1. Mariana CLASIFICA el mensaje del usuario y decide a qué agente asignar
//   2. Emite eventos para que el frontend anime una "bolita" Mariana → agente
//   3. El agente narra avances vía chat_bubble cada ~30s mientras "trabaja"
//   4. Al final envía email al usuario con el resultado (Resend)
//
// Eventos socket emitidos:
//   task_created      { taskId, message, from: 'user' }
//   task_assigned     { taskId, agent, brief, eta_sec }
//   task_progress     { taskId, agent, step, total }
//   task_complete     { taskId, agent, summary, email_sent }
//   task_failed       { taskId, error }

const Anthropic = require('@anthropic-ai/sdk');
const { sendEmail } = require('../core/email');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const ROUTING = {
  diana:     ['cliente', 'cuenta', 'propuesta', 'negociación', 'relación', 'churn', 'health'],
  carlos:    ['diseño', 'logo', 'branding', 'identidad', 'paleta', 'sistema visual'],
  diego:     ['editorial', 'tipografía', 'corporate', 'libro', 'reporte impreso'],
  alex:      ['contenido', 'redes', 'copy', 'caption', 'instagram', 'tiktok', 'reel'],
  sofia:     [
    'proyecto', 'timeline', 'deadline', 'avance', 'kanban', 'sprint', 'gestión',
    'gestion', 'seguimiento', 'status', 'plan', 'planeación', 'planeacion',
    'organiza', 'organizar', 'calendario', 'agenda'
  ],
  lucas:     ['analytics', 'datos', 'métricas', 'kpi', 'dashboard', 'reporte'],
  max:       ['video', 'edición', 'motion', 'youtube', 'animación'],
  valentina: ['arte', 'creativo', 'concepto', 'visión', 'estrategia creativa', 'moodboard'],
  roberto:   ['factura', 'pago', 'precio', 'cotización', 'presupuesto', 'iva', 'flujo de caja']
};

// Sofia (PM) supervisa los entregables de creativos y contenido para dar
// seguimiento de proyecto. Valentina sigue siendo el visto bueno artístico.
// Mariana cierra todo (hub coordinator).
const SUPERVISOR = {
  carlos: 'valentina', diego: 'valentina', max: 'valentina',
  alex: 'sofia',  // contenido pasa por PM
  sofia: 'mariana',
  diana: 'mariana', lucas: 'roberto',
  roberto: 'mariana', valentina: 'sofia'
};

function emit(event, payload) {
  if (!global.io) return;
  try { global.io.emit(event, payload); } catch (_) {}
}
function bubble(slug, text) {
  emit('chat_bubble', { agent: slug, text: String(text || '').slice(0, 240), kind: 'task', ts: Date.now() });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function classifyTask(message) {
  // Quick heuristic first
  const lower = message.toLowerCase();
  for (const [agent, keywords] of Object.entries(ROUTING)) {
    if (keywords.some(k => lower.includes(k))) {
      return { agent, brief: message, eta_sec: 90 };
    }
  }
  // Claude classification fallback
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: `Eres MARIANA en Fractal MX. Lees una solicitud y decides a qué agente asignar.
Agentes disponibles: ${Object.keys(ROUTING).join(', ')}.
Responde SOLO en JSON: {"agent":"<slug>","brief":"<resumen 1 línea>","eta_sec":<60-180>}.
NO markdown.`,
        messages: [{ role: 'user', content: message }]
      });
      const txt = res.content[0]?.text || '{}';
      const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
      if (json.agent && ROUTING[json.agent]) return json;
    } catch (e) { console.warn('[task] classify fallback:', e.message); }
  }
  // Default to Diana (client mgr)
  return { agent: 'diana', brief: message, eta_sec: 90 };
}

async function generateProgressLine(agentSlug, brief, stepIdx, totalSteps) {
  const fallback = `Avanzando con la tarea (paso ${stepIdx + 1}/${totalSteps})…`;
  if (!anthropic) return fallback;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 70,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Estás trabajando una tarea.
Reporta brevemente en qué paso vas (paso ${stepIdx + 1} de ${totalSteps}).
UNA oración natural, máx 18 palabras, EN ESPAÑOL, sin emojis.`,
      messages: [{ role: 'user', content: `Tarea: "${brief}". ¿En qué vas ahora mismo?` }]
    });
    return res.content[0]?.text?.trim() || fallback;
  } catch { return fallback; }
}

async function generateFinalSummary(agentSlug, brief) {
  if (!anthropic) {
    return { subject: `Re: ${brief.slice(0, 60)}`, html: `<p>Tarea completada.</p>` };
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Acabas de terminar una tarea para Neiky (el director).
Genera un email profesional pero cálido, en formato HTML simple, con:
- Asunto claro
- Resumen ejecutivo de lo que hiciste (3-4 líneas)
- Próximos pasos (2-3 bullets)
- Despedida natural firmada como tú
Devuelve JSON: {"subject":"...","html":"<p>...</p>"}. NO markdown.`,
      messages: [{ role: 'user', content: `Tarea original: "${brief}". Redacta el email de entrega.` }]
    });
    const txt = res.content[0]?.text || '{}';
    const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    if (json.subject && json.html) return json;
  } catch (e) { console.warn('[task] summary fallback:', e.message); }
  return {
    subject: `${agentSlug.toUpperCase()} · ${brief.slice(0, 50)}`,
    html: `<p>Hola Neiky,</p><p>Terminé la tarea: <em>${brief}</em>. Quedo atento a comentarios.</p><p>— ${agentSlug}</p>`
  };
}

async function runTask({ message, userEmail = 'nakedgeometry19@gmail.com', source = 'web' }) {
  const taskId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log(`\n📋 Task ${taskId} [${source}]: "${message}"`);

  emit('task_created', { taskId, message, from: 'user' });
  bubble('mariana', 'Recibido, déjame ver a quién le toca esto.');
  await sleep(2500);

  // Step 1 — Mariana classifies
  let plan;
  try {
    plan = await classifyTask(message);
  } catch (err) {
    emit('task_failed', { taskId, error: err.message });
    return { ok: false, error: err.message };
  }
  bubble('mariana', `Esto va para ${plan.agent.toUpperCase()}. Te pongo en la fila.`);
  emit('task_assigned', { taskId, agent: plan.agent, brief: plan.brief, eta_sec: plan.eta_sec });
  await sleep(3500);

  // Step 2 — Agent works through 3 progress beats
  const totalSteps = 3;
  for (let i = 0; i < totalSteps; i++) {
    emit('task_progress', { taskId, agent: plan.agent, step: i + 1, total: totalSteps });
    const line = await generateProgressLine(plan.agent, plan.brief, i, totalSteps);
    bubble(plan.agent, line);
    await sleep(plan.eta_sec * 1000 / totalSteps);
  }

  // Step 3 — Supervisor review (optional, fast)
  const sup = SUPERVISOR[plan.agent];
  if (sup) {
    bubble(sup, `Reviso lo que hizo ${plan.agent} antes de mandarlo.`);
    await sleep(3000);
    bubble(sup, `Aprobado, ya puede salir.`);
    await sleep(1500);
  }

  // Step 4 — Email delivery
  const summary = await generateFinalSummary(plan.agent, plan.brief);
  let emailResult = { ok: false };
  try {
    emailResult = await sendEmail({
      to: userEmail,
      subject: summary.subject,
      html: summary.html,
      text: summary.html.replace(/<[^>]+>/g, ''),
      fromName: `${plan.agent[0].toUpperCase() + plan.agent.slice(1)} · Fractal MX`
    });
    bubble(plan.agent, `Listo, te mandé el email a ${userEmail}.`);
  } catch (err) {
    console.error('[task] email failed:', err.message);
    bubble(plan.agent, `No pude mandar el email (${err.message.slice(0, 40)}…), se lo paso a Mariana.`);
    bubble('mariana', `Email falló — necesitamos revisar credenciales Resend.`);
  }

  emit('task_complete', {
    taskId, agent: plan.agent,
    summary: summary.subject,
    email_sent: emailResult.ok,
    email_id: emailResult.messageId
  });

  return {
    ok: true, taskId, agent: plan.agent, brief: plan.brief,
    email_sent: emailResult.ok, email_id: emailResult.messageId
  };
}

module.exports = { runTask, classifyTask };
