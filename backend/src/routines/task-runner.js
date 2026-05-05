// backend/src/routines/task-runner.js
// FLUJO 2-FASES con loop de confirmación por email:
//
//   PHASE 1 — PITCH (runTask)
//     1. Mariana clasifica + asigna
//     2. Agente arma un PLAN (no entregable final)
//     3. Email a Neiky con: brief, plan propuesto, preguntas concretas
//     4. Status: awaiting_confirmation
//     5. Subject del email lleva tag [FX-<taskId>] para parsing inbound
//
//   PHASE 2 — EXECUTE (resumeTask)
//     1. Triggered por reply de Neiky (webhook inbound) O magic-link
//     2. Agente lee feedback + ejecuta el deliverable real
//     3. Si visual: genera imagen IA con DALL-E
//     4. Supervisor revisa
//     5. Email final con TODO + tabla promesa vs entregado
//     6. Status: delivered

const Anthropic = require('@anthropic-ai/sdk');
const { sendEmail } = require('../core/email');
const { supabase } = require('../core/supabase');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const ROUTING = {
  diana:     ['cliente', 'cuenta', 'propuesta', 'negociación', 'relación', 'churn', 'health'],
  carlos:    ['diseño', 'logo', 'branding', 'identidad', 'paleta', 'sistema visual'],
  diego:     ['editorial', 'tipografía', 'corporate', 'libro', 'reporte impreso'],
  alex:      ['contenido', 'redes', 'copy', 'caption', 'instagram', 'tiktok', 'reel'],
  sofia:     ['proyecto', 'timeline', 'deadline', 'avance', 'kanban', 'sprint', 'gestión',
              'gestion', 'seguimiento', 'status', 'plan', 'planeación', 'planeacion',
              'organiza', 'organizar', 'calendario', 'agenda'],
  lucas:     ['analytics', 'datos', 'métricas', 'kpi', 'dashboard', 'reporte'],
  max:       ['video', 'edición', 'motion', 'youtube', 'animación'],
  valentina: ['arte', 'creativo', 'concepto', 'visión', 'estrategia creativa', 'moodboard'],
  roberto:   ['factura', 'pago', 'precio', 'cotización', 'presupuesto', 'iva', 'flujo de caja']
};

const SUPERVISOR = {
  carlos: 'valentina', diego: 'valentina', max: 'valentina',
  alex: 'sofia', sofia: 'mariana',
  diana: 'mariana', lucas: 'roberto',
  roberto: 'mariana', valentina: 'sofia'
};

const VISUAL_KEYWORDS = [
  'moodboard', 'propuesta', 'identidad', 'diseño', 'arte', 'logo', 'banner',
  'flyer', 'poster', 'cartel', 'visual', 'paleta', 'branding', 'reel', 'video',
  'imagen', 'mockup', 'concepto', 'creativo', 'lona', 'anuncio', 'gráfico',
  'grafico', 'pieza'
];

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app';

function emit(event, payload) {
  if (!global.io) return;
  try { global.io.emit(event, payload); } catch (_) {}
}
function bubble(slug, text) {
  emit('chat_bubble', { agent: slug, text: String(text || '').slice(0, 240), kind: 'task', ts: Date.now() });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function detectVisualNeed(message) {
  const lower = message.toLowerCase();
  return VISUAL_KEYWORDS.some(k => lower.includes(k));
}

async function persistTask(row) {
  try { await supabase.from('tasks').insert(row); }
  catch (e) { console.warn('[task] persist insert:', e.message); }
}
async function updateTask(id, patch) {
  try { await supabase.from('tasks').update(patch).eq('id', id); }
  catch (e) { console.warn('[task] persist update:', e.message); }
}
async function loadTask(id) {
  try {
    const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
    return data || null;
  } catch (e) { console.warn('[task] load:', e.message); return null; }
}

async function classifyTask(message, needsVisual) {
  const lower = message.toLowerCase();
  const basePromised = [{ type: 'email', desc: 'Email de entrega final con resumen + próximos pasos' }];
  if (needsVisual) basePromised.unshift({ type: 'image', desc: 'Referencia visual generada con IA' });

  for (const [agent, keywords] of Object.entries(ROUTING)) {
    if (keywords.some(k => lower.includes(k))) {
      return { agent, brief: message, eta_sec: needsVisual ? 120 : 90, promised: basePromised };
    }
  }
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `Eres MARIANA en Fractal MX. Lees una solicitud de Neiky y decides:
1. A qué agente asignar: ${Object.keys(ROUTING).join(', ')}.
2. Lista honesta de DELIVERABLES prometidos (type + desc concreta).
   Tipos: 'image', 'doc', 'plan', 'quote', 'email'.
JSON SOLO:
{"agent":"<slug>","brief":"<resumen 1 línea>","eta_sec":<60-180>,
 "promised":[{"type":"<tipo>","desc":"<que entregamos>"}]}`,
        messages: [{ role: 'user', content: message }]
      });
      const txt = res.content[0]?.text || '{}';
      const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
      if (json.agent && ROUTING[json.agent]) {
        if (!json.promised?.length) json.promised = basePromised;
        if (!json.promised.some(p => p.type === 'email')) {
          json.promised.push({ type: 'email', desc: 'Email de entrega final' });
        }
        return json;
      }
    } catch (e) { console.warn('[task] classify fallback:', e.message); }
  }
  return { agent: 'diana', brief: message, eta_sec: 90, promised: basePromised };
}

async function generateProgressLine(agentSlug, brief, stepIdx, totalSteps, promisedItem) {
  const fallback = `Avanzando con ${promisedItem?.desc || 'la tarea'} (${stepIdx + 1}/${totalSteps})…`;
  if (!anthropic) return fallback;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 70,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Reportas paso (${stepIdx + 1}/${totalSteps})
sobre: "${promisedItem?.desc || 'la tarea'}". UNA oración natural máx 18 palabras EN ESPAÑOL sin emojis.`,
      messages: [{ role: 'user', content: `Tarea: "${brief}". ¿En qué vas?` }]
    });
    return res.content[0]?.text?.trim() || fallback;
  } catch { return fallback; }
}

async function generatePitch(agentSlug, brief, promised) {
  const fallback = {
    subject: `[FX-pending] Plan inicial — ${brief.slice(0, 50)}`,
    plan_html: `<p>Aquí va mi plan para tu solicitud. Confirma o ajusta para que arranquemos la entrega.</p>`,
    questions: ['¿Vas adelante con este enfoque?']
  };
  if (!anthropic) return fallback;
  const promisedTxt = promised.map(p => `- ${p.type}: ${p.desc}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Recibiste una tarea de Neiky y antes
de gastarle horas le mandas un PITCH BREVE para confirmar dirección.

Devuelve JSON (NO markdown):
{
  "subject": "<asunto profesional, máx 70 chars, sin tag>",
  "plan_html": "<HTML simple sin <html>/<body>: 3-4 párrafos cortos. Incluye:
    1. Cómo entendiste la tarea (1 frase).
    2. Tu enfoque propuesto (1-2 frases concretas con decisiones específicas, no genéricas).
    3. Qué entregarás cuando confirme.
    4. Cualquier supuesto crítico que necesites validar.>",
  "questions": ["pregunta concreta 1", "pregunta 2", "pregunta 3"]
}

Sé directo. Sin saludos floridos. NO entregues el deliverable todavía,
sólo el pitch para validar dirección.`,
      messages: [{ role: 'user', content: `Brief: "${brief}"\nDeliverables prometidos:\n${promisedTxt}\nGenera el pitch.` }]
    });
    const txt = res.content[0]?.text || '{}';
    const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    if (json.subject && json.plan_html) return json;
  } catch (e) { console.warn('[task] pitch fallback:', e.message); }
  return fallback;
}

async function generateTaskImage(brief, agentSlug, feedback = '') {
  if (!anthropic) return { url: null, error: 'no Claude' };
  let dallePrompt = `${brief.slice(0, 200)} ${feedback}`.trim();
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `Convierte el brief + feedback en un prompt DALL-E EN INGLÉS (max 60 palabras).
Composition + mood + colors + style + lighting. Sin marcas. Sólo el prompt, sin prefijo.`,
      messages: [{ role: 'user', content: `Brief: ${brief}\nFeedback: ${feedback || '(none)'}` }]
    });
    dallePrompt = res.content[0]?.text?.trim().replace(/^["']|["']$/g, '') || dallePrompt;
  } catch (_) {}
  try {
    const modelRouter = require('../services/workflows/model-router');
    const result = await modelRouter.generate(dallePrompt, { brief, agent: agentSlug }, {
      size: '1024x1024', quality: 'hd', style: 'natural'
    });
    const cdnUrl = await modelRouter.persistToCloudinary(result.imageUrl, ['fractal-task', agentSlug]);
    return { url: cdnUrl, model: result.model, prompt: dallePrompt };
  } catch (err) {
    return { url: null, error: err.message, prompt: dallePrompt };
  }
}

async function generateFinalDeliverable(agentSlug, brief, feedback, promised, image) {
  const fallback = {
    subject: `${agentSlug.toUpperCase()} · ${brief.slice(0, 50)}`,
    summary_html: `<p>Entregable final basado en tu confirmación.</p>`,
    next_steps: ['Revisar', 'Confirmar para producir']
  };
  if (!anthropic) return fallback;
  const promisedTxt = promised.map(p => `- ${p.type}: ${p.desc}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Neiky CONFIRMÓ el plan y ahora
generas la ENTREGA FINAL.

Devuelve JSON (NO markdown):
{
  "subject": "<asunto profesional con palabra ENTREGA, max 70 chars>",
  "summary_html": "<HTML simple sin <html>/<body>: 4-6 párrafos REALES con el plan ejecutado,
    análisis sustancial, decisiones tomadas, justificación. Si hay imagen IA generada,
    descríbela y conéctala con el brief. Tono profesional cálido. Sin generic.>",
  "next_steps": ["paso accionable 1", "paso 2", "paso 3"]
}`,
      messages: [{ role: 'user', content:
        `Brief original: "${brief}"\n\nFeedback de Neiky en su reply: "${feedback || '(confirmó sin agregar nada)'}"\n\nPrometí entregar:\n${promisedTxt}\n\nImagen IA: ${image?.url ? 'SÍ generada' : 'NO (' + (image?.error || 'sin servicio') + ')'}\n\nGenera la entrega final.` }]
    });
    const txt = res.content[0]?.text || '{}';
    const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    if (json.subject && json.summary_html) return json;
  } catch (e) { console.warn('[task] final fallback:', e.message); }
  return fallback;
}

function buildPitchEmailHtml({ agentSlug, brief, pitch, promised, taskId, userEmail }) {
  const promisedHtml = promised.map(p =>
    `<li><strong>${p.type}</strong>: ${p.desc}</li>`
  ).join('');
  const questionsHtml = (pitch.questions || []).map(q => `<li>${q}</li>`).join('');
  const confirmUrl = `${PUBLIC_URL}/api/task/${taskId}/confirm-page`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f0;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;">
    <div style="background:#fff8dc;border:1px solid #ffd700;padding:10px 14px;border-radius:8px;font-size:12px;color:#7a5d00;margin-bottom:18px;">
      ⏳ <strong>Pendiente de tu confirmación</strong> — Responde a este correo (en el cuerpo) o usa el botón abajo. Apenas tengamos tu OK arrancamos la entrega completa.
    </div>

    <h1 style="color:#1a1a14;margin:0 0 4px;font-size:20px;">${pitch.subject}</h1>
    <p style="color:#888;font-size:12px;margin:0 0 20px;">${agentSlug.toUpperCase()} · Fractal MX · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>

    <div style="background:#fafaf6;border-left:3px solid #B14FFF;padding:10px 14px;font-size:13px;color:#444;margin:0 0 20px;">
      <strong>Brief original:</strong> ${brief}
    </div>

    <h3 style="color:#1a1a14;border-bottom:2px solid #1a1a14;padding-bottom:6px;">Mi enfoque propuesto</h3>
    <div style="font-size:14px;line-height:1.6;color:#1a1a14;">${pitch.plan_html}</div>

    <h3 style="color:#1a1a14;margin-top:20px;">Cuando confirmes, te entrego:</h3>
    <ul style="font-size:13px;line-height:1.6;padding-left:20px;">${promisedHtml}</ul>

    ${questionsHtml ? `
      <h3 style="color:#1a1a14;margin-top:20px;">Preguntas para alinear:</h3>
      <ul style="font-size:13px;line-height:1.6;padding-left:20px;">${questionsHtml}</ul>` : ''}

    <div style="background:#e8f4f8;border-radius:8px;padding:16px;margin-top:24px;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1a1a14;">¿Vamos adelante?</p>
      <a href="${confirmUrl}" style="background:#B14FFF;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-weight:600;font-size:14px;display:inline-block;">Confirmar y arrancar entrega →</a>
      <p style="margin:14px 0 0;font-size:12px;color:#666;">
        O simplemente <strong>responde a este correo</strong> con tu OK / ajustes / preguntas.<br>
        El sistema lo lee y arrancamos la entrega final automáticamente.
      </p>
    </div>

    <p style="margin-top:24px;font-size:13px;color:#444;">
      Saludos,<br><strong>${agentSlug[0].toUpperCase() + agentSlug.slice(1)}</strong> · Fractal MX
    </p>
    <p style="font-size:10px;color:#aaa;margin-top:24px;text-align:center;">[FX-${taskId}]</p>
  </div>
</body></html>`;
}

function buildFinalEmailHtml({ agentSlug, brief, feedback, summary, promised, delivered, image, supervisorNote, taskId }) {
  const promisedHtml = promised.map(p => {
    const fulfilled = delivered.some(d => d.type === p.type && (d.url || d.content || d.note));
    return `<li style="color:${fulfilled ? '#1a7f37' : '#9a6700'};">
      ${fulfilled ? '✅' : '⏳'} <strong>${p.type}</strong>: ${p.desc}
    </li>`;
  }).join('');

  const imgBlock = image?.url
    ? `<div style="margin:18px 0;">
        <img src="${image.url}" alt="referencia" style="max-width:100%;border-radius:8px;border:1px solid #1a1a14;display:block;" />
        <p style="font-size:11px;color:#888;margin:4px 0 0;">Imagen generada por ${image.model || 'IA'}</p>
      </div>`
    : (image?.prompt
      ? `<div style="background:#fff5e6;border:1px dashed #f5a623;padding:12px;border-radius:6px;color:#9a6700;font-size:12px;margin:18px 0;">
          <strong>Imagen IA pendiente</strong> — ${image.error || 'sin servicio activo'}.<br>
          Prompt sugerido: <code style="background:#fff;padding:6px;display:block;margin-top:6px;">${image.prompt}</code>
        </div>` : '');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f0;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;">
    <div style="background:#dcfce7;border:1px solid #16a34a;padding:8px 14px;border-radius:8px;font-size:12px;color:#15803d;margin-bottom:18px;">
      ✅ <strong>Entrega completa</strong> — Confirmaste el plan, aquí va todo.
    </div>

    <h1 style="color:#1a1a14;margin:0 0 4px;font-size:20px;">${summary.subject}</h1>
    <p style="color:#888;font-size:12px;margin:0 0 20px;">${agentSlug.toUpperCase()} · Fractal MX · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>

    <div style="background:#fafaf6;border-left:3px solid #B14FFF;padding:10px 14px;font-size:13px;color:#444;margin:0 0 14px;">
      <strong>Brief:</strong> ${brief}
    </div>

    ${feedback ? `<div style="background:#f0f0ff;border-left:3px solid #B14FFF;padding:10px 14px;font-size:13px;color:#444;margin:0 0 20px;">
      <strong>Tu confirmación:</strong> ${feedback}
    </div>` : ''}

    <div style="font-size:14px;line-height:1.6;color:#1a1a14;">${summary.summary_html}</div>

    ${imgBlock}

    <h3 style="margin-top:24px;color:#1a1a14;border-bottom:2px solid #1a1a14;padding-bottom:6px;">Prometido vs entregado</h3>
    <ul style="font-size:13px;line-height:1.6;padding-left:20px;">${promisedHtml}</ul>

    ${(summary.next_steps?.length) ? `
      <h3 style="margin-top:20px;color:#1a1a14;">Próximos pasos</h3>
      <ol style="font-size:13px;line-height:1.6;padding-left:20px;">
        ${summary.next_steps.map(s => `<li>${s}</li>`).join('')}
      </ol>` : ''}

    ${supervisorNote ? `
      <div style="background:#e8f4f8;border-radius:8px;padding:12px;margin-top:18px;font-size:13px;">
        <strong>${supervisorNote.from}:</strong> ${supervisorNote.text}
      </div>` : ''}

    <p style="margin-top:24px;font-size:13px;color:#444;">
      Saludos,<br><strong>${agentSlug[0].toUpperCase() + agentSlug.slice(1)}</strong> · Fractal MX
    </p>
    <p style="font-size:10px;color:#aaa;margin-top:24px;text-align:center;">[FX-${taskId}]</p>
  </div>
</body></html>`;
}

// ── PHASE 1 — PITCH ────────────────────────────────────────────────────────
async function runTask({ message, userEmail = 'nakedgeometry19@gmail.com', source = 'web' }) {
  const taskId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log(`\n📋 Task ${taskId} [${source}] PITCH: "${message.slice(0, 100)}…"`);

  const needsVisual = detectVisualNeed(message);
  await persistTask({
    id: taskId, source, user_email: userEmail, message,
    needs_visual: needsVisual, status: 'classifying'
  });

  emit('task_created', { taskId, message, from: 'user' });
  bubble('mariana', 'Recibido, déjame ver a quién le toca esto.');
  await sleep(2500);

  let plan;
  try { plan = await classifyTask(message, needsVisual); }
  catch (err) {
    await updateTask(taskId, { status: 'failed', error: err.message });
    emit('task_failed', { taskId, error: err.message });
    return { ok: false, error: err.message };
  }
  const supervisor = SUPERVISOR[plan.agent] || null;
  await updateTask(taskId, {
    brief: plan.brief, agent_assigned: plan.agent, supervisor,
    promised: plan.promised, status: 'pitching'
  });
  bubble('mariana', `Esto va para ${plan.agent.toUpperCase()}. Te manda el pitch en breve.`);
  emit('task_assigned', { taskId, agent: plan.agent, brief: plan.brief, eta_sec: 30 });
  await sleep(2500);

  // Agente arma el pitch
  bubble(plan.agent, 'Arranco con el plan, te lo mando por correo para confirmar dirección.');
  await sleep(2500);
  const pitch = await generatePitch(plan.agent, plan.brief, plan.promised);
  bubble(plan.agent, 'Pitch listo, te lo envío.');

  // Email pitch
  let emailResult = { ok: false };
  try {
    const html = buildPitchEmailHtml({
      agentSlug: plan.agent, brief: plan.brief, pitch,
      promised: plan.promised, taskId, userEmail
    });
    emailResult = await sendEmail({
      to: userEmail,
      subject: `[FX-${taskId}] ${pitch.subject}`,
      html,
      text: `${pitch.plan_html.replace(/<[^>]+>/g, '')}\n\nResponde a este correo o usa: ${PUBLIC_URL}/api/task/${taskId}/confirm-page`,
      fromName: `${plan.agent[0].toUpperCase() + plan.agent.slice(1)} · Fractal MX`
    });
    bubble(plan.agent, `Te llegó el pitch a ${userEmail.split('@')[0]}…, espero tu OK.`);
  } catch (err) {
    console.error('[task] pitch email failed:', err.message);
    bubble(plan.agent, `Email del pitch falló (${err.message.slice(0, 30)}…).`);
  }

  await updateTask(taskId, {
    status: emailResult.ok ? 'awaiting_confirmation' : 'failed',
    email_subject: pitch.subject, email_id: emailResult.messageId,
    error: emailResult.ok ? null : 'pitch email failed'
  });

  emit('task_complete', {
    taskId, agent: plan.agent,
    summary: pitch.subject,
    email_sent: emailResult.ok,
    awaiting_confirmation: true
  });

  return { ok: true, taskId, phase: 'pitch', awaiting_confirmation: true,
    agent: plan.agent, email_sent: emailResult.ok };
}

// ── PHASE 2 — EXECUTE (resume on user reply) ───────────────────────────────
async function resumeTask({ taskId, feedback = '', source = 'web-confirm' }) {
  const task = await loadTask(taskId);
  if (!task) return { ok: false, error: `task ${taskId} not found` };
  if (task.status === 'delivered') return { ok: false, error: 'already delivered' };
  if (!task.agent_assigned) return { ok: false, error: 'no agent assigned' };

  console.log(`\n▶️  Task ${taskId} RESUME [${source}]: feedback="${feedback.slice(0, 80)}…"`);

  await updateTask(taskId, { status: 'working' });
  emit('task_resumed', { taskId, agent: task.agent_assigned, feedback });
  bubble(task.agent_assigned, 'Recibí tu confirmación, arranco con la entrega completa.');
  await sleep(2000);

  // Progress beats
  const promised = task.promised || [];
  const totalSteps = Math.min(promised.length, 3);
  for (let i = 0; i < totalSteps; i++) {
    emit('task_progress', { taskId, agent: task.agent_assigned, step: i + 1, total: totalSteps });
    const line = await generateProgressLine(task.agent_assigned, task.brief, i, totalSteps, promised[i]);
    bubble(task.agent_assigned, line);
    await sleep(8000);
  }

  // Image if visual
  const delivered = [];
  let image = null;
  if (task.needs_visual) {
    bubble(task.agent_assigned, 'Genero la referencia visual final.');
    image = await generateTaskImage(task.brief, task.agent_assigned, feedback);
    if (image.url) {
      delivered.push({ type: 'image', url: image.url, ts: Date.now() });
      bubble(task.agent_assigned, 'Imagen lista.');
      await updateTask(taskId, { image_url: image.url });
    }
    await sleep(2000);
  }

  // Supervisor
  let supervisorNote = null;
  if (task.supervisor) {
    bubble(task.supervisor, `Reviso lo que hizo ${task.agent_assigned}.`);
    await sleep(2500);
    bubble(task.supervisor, `Aprobado.`);
    supervisorNote = { from: task.supervisor.toUpperCase(), text: 'Aprobado. Calidad consistente con la marca.' };
    await updateTask(taskId, { status: 'reviewing' });
    await sleep(1500);
  }

  // Final email
  const summary = await generateFinalDeliverable(task.agent_assigned, task.brief, feedback, promised, image);
  delivered.push({ type: 'email', note: summary.subject, ts: Date.now() });

  let emailResult = { ok: false };
  try {
    const html = buildFinalEmailHtml({
      agentSlug: task.agent_assigned, brief: task.brief, feedback, summary,
      promised, delivered, image, supervisorNote, taskId
    });
    emailResult = await sendEmail({
      to: task.user_email,
      subject: `[FX-${taskId}] ${summary.subject}`,
      html,
      text: `${summary.summary_html.replace(/<[^>]+>/g, '\n').trim()}`,
      fromName: `${task.agent_assigned[0].toUpperCase() + task.agent_assigned.slice(1)} · Fractal MX`
    });
    bubble(task.agent_assigned, `Entrega completa enviada.`);
  } catch (err) {
    console.error('[task] final email failed:', err.message);
    bubble(task.agent_assigned, `Final email falló (${err.message.slice(0, 30)}…).`);
  }

  await updateTask(taskId, {
    status: emailResult.ok ? 'delivered' : 'failed',
    delivered, email_id: emailResult.messageId,
    completed_at: new Date().toISOString()
  });

  emit('task_complete', {
    taskId, agent: task.agent_assigned,
    summary: summary.subject,
    email_sent: emailResult.ok,
    image_url: image?.url || null,
    delivered: true
  });

  return { ok: true, taskId, phase: 'execute', delivered: true,
    image_url: image?.url, email_sent: emailResult.ok };
}

// Extract taskId from email subject like "[FX-t_xxx_yyy] Re: ..."
function parseTaskIdFromSubject(subject) {
  if (!subject) return null;
  const m = String(subject).match(/\[FX-(t_[a-z0-9_]+)\]/i);
  return m?.[1] || null;
}

// Strip quoted reply thread from inbound email body
function extractReplyBody(rawBody) {
  if (!rawBody) return '';
  const text = String(rawBody);
  // Common reply markers
  const splits = [
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*On .+ wrote:/i,
    /\n\s*El .+ escribió:/i,
    /\n\s*De:.+(\n.+)+/,
    /\n>+ /  // quoted lines
  ];
  let cleaned = text;
  for (const s of splits) {
    const idx = cleaned.search(s);
    if (idx > 20) { cleaned = cleaned.slice(0, idx); break; }
  }
  return cleaned.trim().slice(0, 1000);
}

module.exports = {
  runTask, resumeTask, classifyTask, detectVisualNeed,
  parseTaskIdFromSubject, extractReplyBody
};
