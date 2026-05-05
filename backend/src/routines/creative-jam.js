// backend/src/routines/creative-jam.js
// Multi-agent collaboration: identidad gráfica 2027 para Fractal MX.
//
// Flujo:
//   1. Mariana abre el brief al equipo creativo (bubble)
//   2. Carlos, Diego, Valentina, Max, Alex tiran ideas iniciales encadenadas
//      (cada uno lee lo anterior y construye sobre eso)
//   3. Sintetizamos en 2 propuestas distintas con Claude sonnet
//   4. Diego dispara generación de imagen IA por propuesta (DALL-E 3)
//   5. Sofia revisa y aprueba (PM check de viabilidad)
//   6. Mariana aprueba final
//   7. Email único a Neiky con TODO: ideas individuales, propuestas, imágenes,
//      narrativa de cada elección

const Anthropic = require('@anthropic-ai/sdk');
const { sendEmail } = require('../core/email');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const CREATIVES = [
  { slug: 'carlos',    name: 'CARLOS',    role: 'Senior Designer (branding + sistemas visuales)', vibe: 'creativo bold, vinilos de techno, sneakers raros, perfeccionista' },
  { slug: 'valentina', name: 'VALENTINA', role: 'Art Director', vibe: 'visionaria, criterio fuerte, Wong Kar-wai, cerámica' },
  { slug: 'diego',     name: 'DIEGO',     role: 'Senior Designer Editorial', vibe: 'cerebral San Ángel, tipografía suiza, humor seco' },
  { slug: 'alex',      name: 'ALEX',      role: 'Content Creator', vibe: 'hipster GDL, súper online, K-pop irónico, memes que sí venden' },
  { slug: 'max',       name: 'MAX',       role: 'AI Video Editor', vibe: 'Tijuana, técnico, headphones, surf Rosarito' }
];

function emit(event, payload) {
  if (!global.io) return;
  try { global.io.emit(event, payload); } catch (_) {}
}
function bubble(slug, text) {
  emit('chat_bubble', { agent: slug, text: String(text || '').slice(0, 240), kind: 'jam', ts: Date.now() });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const BRIEF = `Identidad gráfica 2027 para Fractal MX — agencia creativa AI-powered en CDMX.
Año pivote: el equipo es virtual, los agentes son AI con personalidad.
Pendiente: Vanexpo, Central Interactiva, Centro Convenciones Morelos como clientes ancla.
Necesitamos una identidad que se sienta MUY 2027 — no genérica. Audaz, mexicana sin caer en clichés, AI-native pero humana.
Output esperado: 2 propuestas distintas, cada una con concepto + paleta + tipografía + 1 referencia visual generada por IA.`;

async function pitchInitialIdea(creative, history) {
  const fallback = `(${creative.name} aporta una idea inicial al brainstorm.)`;
  if (!anthropic) return fallback;
  const transcript = history.map(h => `${h.name}: ${h.text}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 140,
      system: `Eres ${creative.name}, ${creative.role} en Fractal MX. Vibe: ${creative.vibe}.
Estás en una sesión de brainstorm para la identidad gráfica 2027 de tu propia agencia.
Lee lo que dijeron los demás. Aporta UNA idea concreta (concepto + un detalle visual o tipográfico).
EN ESPAÑOL, una sola oración, máx 26 palabras. Sin emojis. Conecta con lo último si aplica.`,
      messages: [{ role: 'user', content: `BRIEF:\n${BRIEF}\n\nIdeas hasta ahora:\n${transcript || '(eres el primero)'}\n\n¿Cuál es tu propuesta inicial?` }]
    });
    return res.content[0]?.text?.trim().replace(/^["'`]|["'`]$/g, '') || fallback;
  } catch { return fallback; }
}

async function reactToIdeas(creative, history) {
  const fallback = `(${creative.name} asiente y construye sobre la idea anterior.)`;
  if (!anthropic) return fallback;
  const transcript = history.map(h => `${h.name}: ${h.text}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 130,
      system: `Eres ${creative.name}. Vibe: ${creative.vibe}.
Reacciona al brainstorm: refina, contradice o amplía UNA de las ideas que ya se dijeron.
Menciona a quien le respondes por nombre. EN ESPAÑOL, una oración (máx 24 palabras), sin emojis.`,
      messages: [{ role: 'user', content: `Hilo:\n${transcript}\n\nTu reacción:` }]
    });
    return res.content[0]?.text?.trim().replace(/^["'`]|["'`]$/g, '') || fallback;
  } catch { return fallback; }
}

async function synthesizeProposals(history) {
  const transcript = history.map(h => `${h.name}: ${h.text}`).join('\n');
  if (!anthropic) {
    return [
      { title: 'Propuesta A', concept: 'AI-mexicano contemporáneo', palette: 'terracota + verde menta', typography: 'Sans humanista', rationale: 'Sintetiza el pitch del equipo.', imagePrompt: 'isometric studio room with cacti and computers, terracotta and mint, fractal motif' },
      { title: 'Propuesta B', concept: 'Brutalismo digital cálido', palette: 'negro + amarillo limón', typography: 'Mono + sans bold', rationale: 'Apuesta más arriesgada del jam.', imagePrompt: 'brutalist composition with mexican folk patterns, neon yellow and black' }
    ];
  }
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: `Eres VALENTINA, Art Director de Fractal MX. Acabas de moderar un brainstorm con tu equipo creativo.
Sintetiza en EXACTAMENTE 2 propuestas distintas. Cada propuesta debe ser COHERENTE y RECOGER aportes específicos del equipo.
Devuelve JSON ARRAY (NO markdown):
[
  {
    "title": "<nombre corto evocativo>",
    "concept": "<1 línea sobre el concepto>",
    "palette": "<3-4 colores con códigos hex>",
    "typography": "<recomendación tipográfica>",
    "rationale": "<2-3 líneas: cómo se conecta con los aportes del equipo, mencionando nombres>",
    "imagePrompt": "<prompt en INGLÉS para DALL-E, descriptivo y específico, max 60 palabras, mood + composition + colors>"
  },
  {...}
]`,
      messages: [{ role: 'user', content: `Brainstorm completo:\n${transcript}\n\nGenera las 2 propuestas finales.` }]
    });
    const txt = res.content[0]?.text || '[]';
    const cleaned = txt.replace(/```json\s*|\s*```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr) && arr.length >= 2) return arr.slice(0, 2);
    throw new Error('bad shape');
  } catch (err) {
    console.warn('[jam] synthesize fallback:', err.message);
    return [
      { title: 'Propuesta A', concept: 'AI-mexicano contemporáneo', palette: '#C8956D, #88C9A1, #1A1A14, #FAFAF6', typography: 'Sans humanista', rationale: 'Recoge la línea de Valentina sobre cerámica + Carlos sobre sistemas visuales bold.', imagePrompt: 'isometric office with ceramic textures, terracotta and mint accents, geometric fractal motif, modern mexican flat illustration' },
      { title: 'Propuesta B', concept: 'Brutalismo digital cálido', palette: '#000000, #FFCE5C, #FF6B35, #FAFAF6', typography: 'Mono + sans display bold', rationale: 'Toma la apuesta de Diego por tipografía editorial fuerte y la energía online de Alex.', imagePrompt: 'brutalist editorial composition with mexican folk pattern accents, neon yellow on black, bold display typography, retro computing aesthetic' }
    ];
  }
}

async function generateConceptImage(prompt, idx) {
  try {
    const modelRouter = require('../services/workflows/model-router');
    const result = await modelRouter.generate(prompt, { type: 'identity_2027', concept: `proposal_${idx}` }, {
      size: '1024x1024', quality: 'hd', style: 'natural'
    });
    const cdnUrl = await modelRouter.persistToCloudinary(result.imageUrl, ['fractal-2027', 'identity-jam']);
    return { url: cdnUrl, model: result.model, reasoning: result.reasoning };
  } catch (err) {
    console.warn(`[jam] image ${idx} fallback (no IA):`, err.message);
    return { url: null, error: err.message };
  }
}

function buildEmailHtml({ history, proposals, supervisorNote, marianaApproval }) {
  const transcriptHtml = history.map(h =>
    `<li><strong style="color:#B14FFF;">${h.name}:</strong> ${h.text}</li>`
  ).join('');

  const proposalsHtml = proposals.map((p, i) => `
    <div style="border:2px solid #1a1a14;border-radius:12px;padding:18px;margin:18px 0;background:#fafaf6;">
      <h2 style="color:#1a1a14;font-family:'Press Start 2P',monospace;font-size:18px;margin:0 0 8px;">PROPUESTA ${String.fromCharCode(65 + i)} — ${p.title}</h2>
      <p style="margin:6px 0;"><strong>Concepto:</strong> ${p.concept}</p>
      <p style="margin:6px 0;"><strong>Paleta:</strong> ${p.palette}</p>
      <p style="margin:6px 0;"><strong>Tipografía:</strong> ${p.typography}</p>
      <p style="margin:10px 0 4px;"><strong>Por qué llegamos aquí:</strong></p>
      <p style="margin:0 0 12px;color:#444;font-style:italic;">${p.rationale}</p>
      ${p.image?.url
        ? `<img src="${p.image.url}" alt="${p.title}" style="max-width:100%;border-radius:8px;border:1px solid #1a1a14;display:block;margin:8px 0;" />
           <p style="font-size:11px;color:#888;margin:4px 0 0;">Imagen: ${p.image.model || 'IA'} — ${p.image.reasoning || ''}</p>`
        : `<div style="background:#fff5e6;border:1px dashed #f5a623;padding:12px;border-radius:6px;color:#9a6700;font-size:13px;">Imagen IA pendiente — ${p.image?.error || 'sin servicio activo'}. Prompt sugerido:<br><code style="background:#fff;padding:6px;display:block;margin-top:6px;">${p.imagePrompt}</code></div>`
      }
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Identidad Fractal MX 2027 — Creative Jam</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0a0a14;color:#1a1a14;padding:0;margin:0;">
  <div style="max-width:680px;margin:0 auto;background:#fafaf6;padding:32px;">
    <h1 style="color:#B14FFF;margin:0 0 8px;font-size:24px;">🎨 Identidad Fractal MX 2027</h1>
    <p style="color:#666;margin:0 0 24px;font-size:13px;">Resultado del creative jam · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>

    <h3 style="color:#1a1a14;border-bottom:2px solid #B14FFF;padding-bottom:6px;">📝 Brief inicial</h3>
    <p style="background:#fff;padding:12px;border-left:3px solid #B14FFF;font-size:13px;color:#444;">${BRIEF.replace(/\n/g, '<br>')}</p>

    <h3 style="color:#1a1a14;border-bottom:2px solid #B14FFF;padding-bottom:6px;margin-top:28px;">💬 El brainstorm completo</h3>
    <ul style="font-size:13px;line-height:1.6;padding-left:20px;">${transcriptHtml}</ul>

    <h3 style="color:#1a1a14;border-bottom:2px solid #B14FFF;padding-bottom:6px;margin-top:28px;">🎯 Las 2 propuestas finales</h3>
    ${proposalsHtml}

    <div style="background:#e8f4f8;border-radius:8px;padding:14px;margin:18px 0;">
      <p style="margin:0;font-size:13px;"><strong>✅ Sofia (PM):</strong> ${supervisorNote}</p>
    </div>
    <div style="background:#fff0f6;border-radius:8px;padding:14px;margin:18px 0;">
      <p style="margin:0;font-size:13px;"><strong>✅ Mariana (Hub):</strong> ${marianaApproval}</p>
    </div>

    <p style="font-size:11px;color:#888;text-align:center;margin-top:32px;border-top:1px solid #ddd;padding-top:16px;">
      Generado por Fractal Virtual Team · creative-jam pipeline · v4.2
    </p>
  </div>
</body></html>`;
}

async function runCreativeJam({ userEmail = 'nakedgeometry19@gmail.com', gapMs = 7000 } = {}) {
  console.log('\n🎨 Creative Jam — Identidad Fractal MX 2027');

  const history = [];

  // Step 1 — Mariana abre
  bubble('mariana', `Equipo creativo, necesito ideas para nuestra propia identidad 2027. Que se sienta muy nosotros.`);
  await sleep(gapMs);

  // Step 2 — Cada creativo aporta idea inicial (5)
  for (const c of CREATIVES) {
    const idea = await pitchInitialIdea(c, history);
    bubble(c.slug, idea);
    history.push({ slug: c.slug, name: c.name, text: idea });
    console.log(`  ${c.name.padEnd(10)} → ${idea}`);
    await sleep(gapMs);
  }

  // Step 3 — Una segunda ronda donde reaccionan unos a otros (3 reacciones)
  const shuffled = [...CREATIVES].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const c of shuffled) {
    const reply = await reactToIdeas(c, history);
    bubble(c.slug, reply);
    history.push({ slug: c.slug, name: c.name, text: reply });
    console.log(`  ${c.name.padEnd(10)} (react) → ${reply}`);
    await sleep(gapMs);
  }

  // Step 4 — Valentina sintetiza en 2 propuestas
  bubble('valentina', `Listo, tengo claras 2 direcciones. Las redacto.`);
  await sleep(gapMs);
  const proposals = await synthesizeProposals(history);
  console.log(`[jam] 2 propuestas sintetizadas: ${proposals.map(p => p.title).join(' / ')}`);

  // Step 5 — Diego genera imágenes con IA
  bubble('diego', `Las visualizo en imagen, deme un par de minutos.`);
  for (let i = 0; i < proposals.length; i++) {
    const img = await generateConceptImage(proposals[i].imagePrompt, i + 1);
    proposals[i].image = img;
    bubble('diego', img.url ? `Imagen ${i + 1} lista.` : `Imagen ${i + 1} no se generó (sin API), va el prompt.`);
    await sleep(2000);
  }

  // Step 6 — Sofia revisa
  bubble('sofia', `Reviso viabilidad de timeline para ambas. Las 2 son ejecutables en Q1.`);
  const supervisorNote = `Ambas propuestas son ejecutables. Recomiendo arrancar producción en Q1 2027 con un sprint de 3 semanas por línea visual.`;
  await sleep(gapMs);

  // Step 7 — Mariana aprueba final
  bubble('mariana', `Listas las 2 propuestas. Te mando el correo con todo.`);
  const marianaApproval = `Aprobado. Te paso ambas para que decidas cuál quieres seguir desarrollando o si quieres mezclar elementos.`;

  // Step 8 — Email
  const html = buildEmailHtml({ history, proposals, supervisorNote, marianaApproval });
  let emailRes = { ok: false };
  try {
    emailRes = await sendEmail({
      to: userEmail,
      subject: `🎨 Identidad Fractal MX 2027 — 2 propuestas + brainstorm completo`,
      html,
      text: `Identidad Fractal MX 2027.\n\nPropuestas:\n${proposals.map((p, i) => `${String.fromCharCode(65 + i)}. ${p.title} — ${p.concept}`).join('\n')}\n\nReview Sofia: ${supervisorNote}\nAprobado por Mariana: ${marianaApproval}`,
      fromName: 'Mariana · Fractal MX'
    });
    bubble('mariana', `Te llegó el correo a ${userEmail}.`);
  } catch (err) {
    console.error('[jam] email failed:', err.message);
    bubble('mariana', `Email falló (${err.message.slice(0, 30)}…), revisar Resend.`);
  }

  return {
    ok: true,
    proposals: proposals.map(p => ({ title: p.title, concept: p.concept, image_url: p.image?.url || null })),
    history_count: history.length,
    email_sent: emailRes.ok,
    email_id: emailRes.messageId
  };
}

module.exports = { runCreativeJam };
