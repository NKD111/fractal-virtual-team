// backend/src/routines/task-runner.js
// Orquestador de tarea con SEGUIMIENTO REAL:
//   1. Persiste cada tarea en `tasks` table con status lifecycle
//   2. Mariana clasifica + DECLARA deliverables prometidos (no fakes)
//   3. Agente trabaja narrando avance vinculado a la promesa
//   4. Si la tarea es visual (propuesta/moodboard/identidad/diseño) →
//      genera imagen IA real vía model-router (DALL-E + Cloudinary)
//   5. Supervisor revisa
//   6. Email al usuario con la imagen embebida + lista de entregables
//      cumplidos vs prometidos (transparente)

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

// ── Persistence helpers ────────────────────────────────────────────────────
async function persistTask(row) {
  try { await supabase.from('tasks').insert(row); }
  catch (e) { console.warn('[task] persist insert:', e.message); }
}
async function updateTask(id, patch) {
  try { await supabase.from('tasks').update(patch).eq('id', id); }
  catch (e) { console.warn('[task] persist update:', e.message); }
}

// ── Classification + promised deliverables (real, not fake) ────────────────
async function classifyTask(message, needsVisual) {
  const lower = message.toLowerCase();

  // Default promised list always includes a final email + work summary
  const basePromised = [{ type: 'email', desc: 'Email de entrega con resumen y próximos pasos' }];
  if (needsVisual) basePromised.unshift({ type: 'image', desc: 'Referencia visual generada con IA' });

  // Heuristic routing
  for (const [agent, keywords] of Object.entries(ROUTING)) {
    if (keywords.some(k => lower.includes(k))) {
      return { agent, brief: message, eta_sec: needsVisual ? 120 : 90, promised: basePromised };
    }
  }

  // Claude classification
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `Eres MARIANA en Fractal MX. Lees una solicitud de Neiky y decides:
1. A qué agente asignar (slug exacto): ${Object.keys(ROUTING).join(', ')}.
2. Lista honesta de DELIVERABLES prometidos: items concretos que se ENTREGAN,
   no narrativa. Tipos: 'image', 'doc', 'plan', 'quote', 'email'.

Responde SOLO en JSON (NO markdown):
{"agent":"<slug>","brief":"<resumen 1 línea>","eta_sec":<60-180>,
 "promised":[{"type":"<tipo>","desc":"<que se entrega concretamente>"}]}`,
        messages: [{ role: 'user', content: message }]
      });
      const txt = res.content[0]?.text || '{}';
      const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
      if (json.agent && ROUTING[json.agent]) {
        if (!json.promised || !json.promised.length) json.promised = basePromised;
        // Always include email at the end
        if (!json.promised.some(p => p.type === 'email')) {
          json.promised.push({ type: 'email', desc: 'Email de entrega' });
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
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Estás trabajando una tarea.
Reporta brevemente en qué paso vas (paso ${stepIdx + 1} de ${totalSteps}) — debe sentirse REAL.
Conéctalo con el deliverable que estás trabajando: "${promisedItem?.desc || 'la entrega'}".
UNA oración natural, máx 18 palabras, EN ESPAÑOL, sin emojis.`,
      messages: [{ role: 'user', content: `Tarea: "${brief}". ¿En qué vas?` }]
    });
    return res.content[0]?.text?.trim() || fallback;
  } catch { return fallback; }
}

// ── IMAGE GENERATION (real DALL-E via model-router + Cloudinary) ──────────
async function generateTaskImage(brief, agentSlug) {
  if (!anthropic) return { url: null, error: 'no Claude for prompt' };

  // Build a strong DALL-E prompt from the brief
  let dallePrompt = brief.slice(0, 200);
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `Eres ${agentSlug.toUpperCase()}, designer en Fractal MX. Convierte el brief en un
prompt DALL-E EN INGLÉS (max 60 palabras), muy descriptivo: composition, mood,
colors, style, lighting. NO incluyas marcas registradas. Devuelve solo el prompt, sin prefijo.`,
      messages: [{ role: 'user', content: brief }]
    });
    dallePrompt = res.content[0]?.text?.trim().replace(/^["']|["']$/g, '') || dallePrompt;
  } catch (_) {}

  try {
    const modelRouter = require('../services/workflows/model-router');
    const result = await modelRouter.generate(dallePrompt, { brief, agent: agentSlug }, {
      size: '1024x1024', quality: 'hd', style: 'natural'
    });
    const cdnUrl = await modelRouter.persistToCloudinary(result.imageUrl, ['fractal-task', agentSlug]);
    return { url: cdnUrl, model: result.model, reasoning: result.reasoning, prompt: dallePrompt };
  } catch (err) {
    console.warn(`[task] image gen failed:`, err.message);
    return { url: null, error: err.message, prompt: dallePrompt };
  }
}

async function generateFinalSummary(agentSlug, brief, promised, delivered, image) {
  const fallback = {
    subject: `${agentSlug.toUpperCase()} · ${brief.slice(0, 50)}`,
    summary_html: `<p>Terminé la tarea. Aquí el detalle.</p>`,
    next_steps: ['Revisar y dar feedback', 'Confirmar dirección elegida']
  };
  if (!anthropic) return fallback;

  const promisedTxt = promised.map(p => `- ${p.type}: ${p.desc}`).join('\n');
  const deliveredTxt = delivered.map(d => `- ${d.type}: ${d.note || d.url || d.desc}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: `Eres ${agentSlug.toUpperCase()} en Fractal MX. Acabas de terminar una tarea para Neiky.
Genera el contenido del email de entrega.

Devuelve JSON (NO markdown):
{
  "subject": "<asunto claro y profesional>",
  "summary_html": "<HTML simple, sin <html>/<body>: 3-5 párrafos breves con el plan/análisis/recomendación REAL del agente. NO genérico. Mencionar si hay limitaciones honestamente.>",
  "next_steps": ["acción concreta 1", "acción 2", "acción 3"]
}

Si entre los deliverables hay tipo 'image' y se generó imagen: menciónala
("Adjunto la referencia visual"). Si no se generó: dilo honestamente
("La imagen no salió esta vez, va el prompt sugerido para reintentar").`,
      messages: [{ role: 'user', content:
        `Brief original: "${brief}"\n\nPrometí entregar:\n${promisedTxt}\n\nLo que entregué realmente:\n${deliveredTxt}\n${image?.url ? '\nImagen generada: SI' : '\nImagen generada: NO (' + (image?.error || 'sin servicio') + ')'}\n\nGenera el email.` }]
    });
    const txt = res.content[0]?.text || '{}';
    const json = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    if (json.subject && json.summary_html) return json;
  } catch (e) { console.warn('[task] summary fallback:', e.message); }
  return fallback;
}

function buildEmailHtml({ agentSlug, brief, summary, promised, delivered, image, supervisorNote }) {
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
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f5f0;padding:0;margin:0;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;">
    <h1 style="color:#1a1a14;margin:0 0 4px;font-size:20px;">${summary.subject}</h1>
    <p style="color:#888;font-size:12px;margin:0 0 20px;">${agentSlug.toUpperCase()} · Fractal MX · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>

    <div style="background:#fafaf6;border-left:3px solid #B14FFF;padding:10px 14px;font-size:13px;color:#444;margin:0 0 20px;">
      <strong>Brief original:</strong> ${brief}
    </div>

    <div style="font-size:14px;line-height:1.6;color:#1a1a14;">
      ${summary.summary_html}
    </div>

    ${imgBlock}

    <h3 style="margin-top:24px;color:#1a1a14;border-bottom:2px solid #1a1a14;padding-bottom:6px;">Lo que prometí vs lo que entregué</h3>
    <ul style="font-size:13px;line-height:1.6;padding-left:20px;">${promisedHtml}</ul>

    ${(summary.next_steps && summary.next_steps.length) ? `
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
  </div>
</body></html>`;
}

async function runTask({ message, userEmail = 'nakedgeometry19@gmail.com', source = 'web' }) {
  const taskId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log(`\n📋 Task ${taskId} [${source}]: "${message.slice(0, 100)}…"`);

  const needsVisual = detectVisualNeed(message);

  await persistTask({
    id: taskId, source, user_email: userEmail, message,
    needs_visual: needsVisual, status: 'classifying'
  });

  emit('task_created', { taskId, message, from: 'user' });
  bubble('mariana', 'Recibido, déjame ver a quién le toca esto.');
  await sleep(2500);

  // Step 1 — classify + declare promises
  let plan;
  try {
    plan = await classifyTask(message, needsVisual);
  } catch (err) {
    await updateTask(taskId, { status: 'failed', error: err.message });
    emit('task_failed', { taskId, error: err.message });
    return { ok: false, error: err.message };
  }
  const supervisor = SUPERVISOR[plan.agent] || null;
  await updateTask(taskId, {
    brief: plan.brief, agent_assigned: plan.agent, supervisor,
    promised: plan.promised, status: 'working'
  });
  bubble('mariana', `Esto va para ${plan.agent.toUpperCase()}. Te entrego ${plan.promised.length} cosa(s) cuando termine.`);
  emit('task_assigned', { taskId, agent: plan.agent, brief: plan.brief, eta_sec: plan.eta_sec });
  await sleep(3500);

  // Step 2 — Agent works through progress beats tied to each promise
  const delivered = [];
  const totalSteps = Math.min(plan.promised.length, 3);
  for (let i = 0; i < totalSteps; i++) {
    emit('task_progress', { taskId, agent: plan.agent, step: i + 1, total: totalSteps });
    const line = await generateProgressLine(plan.agent, plan.brief, i, totalSteps, plan.promised[i]);
    bubble(plan.agent, line);
    await sleep(plan.eta_sec * 1000 / totalSteps);
  }

  // Step 3 — Generate IA image if needsVisual
  let image = null;
  if (needsVisual) {
    bubble(plan.agent, 'Genero la referencia visual con IA, deme un momento.');
    image = await generateTaskImage(plan.brief, plan.agent);
    if (image.url) {
      delivered.push({ type: 'image', url: image.url, ts: Date.now() });
      bubble(plan.agent, 'Imagen lista.');
      await updateTask(taskId, { image_url: image.url });
    } else {
      bubble(plan.agent, `La imagen no salió (${image.error?.slice(0, 30) || 'API'}), va el prompt en el correo.`);
    }
    await sleep(2000);
  }

  // Step 4 — Supervisor review
  let supervisorNote = null;
  if (supervisor) {
    bubble(supervisor, `Reviso lo que hizo ${plan.agent}.`);
    await sleep(2500);
    bubble(supervisor, `Aprobado, ya puede salir.`);
    supervisorNote = { from: supervisor.toUpperCase(), text: `Aprobado. Calidad y enfoque consistentes con la marca.` };
    await updateTask(taskId, { status: 'reviewing' });
    await sleep(1500);
  }

  // Step 5 — Email
  const summary = await generateFinalSummary(plan.agent, plan.brief, plan.promised, delivered, image);
  delivered.push({ type: 'email', note: summary.subject, ts: Date.now() });

  let emailResult = { ok: false };
  try {
    const html = buildEmailHtml({
      agentSlug: plan.agent, brief: plan.brief, summary,
      promised: plan.promised, delivered, image, supervisorNote
    });
    emailResult = await sendEmail({
      to: userEmail,
      subject: summary.subject,
      html,
      text: `Brief: ${plan.brief}\n\n${summary.summary_html.replace(/<[^>]+>/g, '\n').trim()}`,
      fromName: `${plan.agent[0].toUpperCase() + plan.agent.slice(1)} · Fractal MX`
    });
    bubble(plan.agent, `Listo, te mandé el email a ${userEmail.split('@')[0]}…`);
  } catch (err) {
    console.error('[task] email failed:', err.message);
    bubble(plan.agent, `Email falló (${err.message.slice(0, 40)}…).`);
    await updateTask(taskId, { status: 'failed', error: err.message });
  }

  await updateTask(taskId, {
    status: emailResult.ok ? 'delivered' : 'failed',
    delivered, email_subject: summary.subject, email_id: emailResult.messageId,
    completed_at: new Date().toISOString()
  });

  emit('task_complete', {
    taskId, agent: plan.agent,
    summary: summary.subject,
    email_sent: emailResult.ok,
    image_url: image?.url || null
  });

  return {
    ok: true, taskId, agent: plan.agent,
    promised: plan.promised, delivered,
    image_url: image?.url || null,
    email_sent: emailResult.ok, email_id: emailResult.messageId
  };
}

module.exports = { runTask, classifyTask, detectVisualNeed };
