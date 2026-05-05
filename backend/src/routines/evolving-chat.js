// backend/src/routines/evolving-chat.js
// Conversación EVOLUTIVA: el equipo brainstormea cómo hacer crecer Fractal MX.
// Va saltando entre temas (nuevos ingresos, productos digitales, R&D, etc.).
// Cada tema: kicker → N réplicas con hilo coherente → 1 conclusión accionable.
// Los temas se transicionan naturalmente con un anuncio.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const AGENTS = {
  mariana:   { name: 'MARIANA',   vibe: 'cálida mexicana, organiza, detecta oportunidades' },
  diana:     { name: 'DIANA',     vibe: 'ex-Ogilvy, estratégica, enfoque cliente y revenue' },
  carlos:    { name: 'CARLOS',    vibe: 'designer bold, branding, sistemas escalables' },
  diego:     { name: 'DIEGO',     vibe: 'cerebral, editorial, productos físicos premium' },
  alex:      { name: 'ALEX',      vibe: 'GDL hipster, online, audiencias y tendencias' },
  sofia:     { name: 'SOFIA',     vibe: 'PM Querétaro, procesos limpios, escalabilidad' },
  lucas:     { name: 'LUCAS',     vibe: 'ex-Google, datos, monetización SaaS' },
  max:       { name: 'MAX',       vibe: 'Tijuana, AI tooling, automatizaciones video' },
  valentina: { name: 'VALENTINA', vibe: 'art director, posicionamiento de marca' },
  roberto:   { name: 'ROBERTO',   vibe: 'CFO ex-PWC, márgenes y cashflow primero' }
};

const SLUGS = Object.keys(AGENTS);

// Temas que rotan secuencialmente. Cada uno con kicker específico para arrancar.
const TOPICS = [
  {
    theme: 'nuevas líneas de ingreso para 2027',
    kicker: 'DIANA',
    kickerLine: 'Equipo, ¿qué pasaría si lanzamos retainers mensuales para clientes premium en lugar de proyectos sueltos? piso $40k/mes.'
  },
  {
    theme: 'productos digitales empaquetados (templates, kits)',
    kicker: 'CARLOS',
    kickerLine: 'Idea: empacar nuestros sistemas visuales como kits descargables vendibles en Gumroad, $79-149 USD cada uno.'
  },
  {
    theme: 'procesos de research e inteligencia de mercado',
    kicker: 'LUCAS',
    kickerLine: 'Necesitamos un research weekly: scraping de competencia + dashboards. Yo armo el pipeline si me dan 2 semanas.'
  },
  {
    theme: 'cursos y formación pagada usando nuestros agentes',
    kicker: 'ALEX',
    kickerLine: 'Y si ofrecemos un workshop intensivo \"Cómo crear contenido con AI sin perder personalidad\" $5k MXN por persona, cohorts de 20?'
  },
  {
    theme: 'automatización y SaaS interno que volver producto',
    kicker: 'MAX',
    kickerLine: 'Mi pipeline de edición de video AI lo podría volver producto público con paywall, $30 USD/mes piso.'
  },
  {
    theme: 'expansión LATAM: Bogotá, Santiago, Buenos Aires',
    kicker: 'MARIANA',
    kickerLine: 'Tengo contactos en Bogotá pidiendo este modelo. ¿Replicamos sin abrir oficina física, todo virtual?'
  },
  {
    theme: 'pricing y empaquetado: subir tickets sin perder clientes',
    kicker: 'ROBERTO',
    kickerLine: 'Margen actual 70%. Si subimos pricing 25% y damos onboarding más sólido, llegamos a 80% sin churn.'
  }
];

function emitBubble(slug, text) {
  if (!global.io) return;
  try {
    global.io.emit('chat_bubble', {
      agent: slug,
      text: String(text || '').slice(0, 240),
      kind: 'evolving',
      ts: Date.now()
    });
  } catch (_) {}
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateReply(slug, agent, theme, history) {
  const fallback = `(${agent.name} aporta una idea breve.)`;
  if (!anthropic) return fallback;
  const transcript = history.slice(-6).map(h => `${h.name}: ${h.text}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: `Eres ${agent.name} en Fractal MX. Vibe: ${agent.vibe}.
El equipo está discutiendo CÓMO HACER CRECER LA EMPRESA. Tema actual: "${theme}".
Lee lo último y aporta UNA idea CONCRETA y ACCIONABLE en una sola oración (máx 24 palabras).
Conecta con quien habló antes (menciónalo por nombre cuando sea relevante).
EN ESPAÑOL, sin emojis, sin prefijos. Puedes proponer numero/fecha/cifra concreta cuando aplique.`,
      messages: [{ role: 'user', content: `Hilo:\n${transcript || '(eres el primero)'}\n\nTu aporte:` }]
    });
    return res.content[0]?.text?.trim().replace(/^["'`]|["'`]$/g, '') || fallback;
  } catch { return fallback; }
}

async function generateConclusion(theme, history) {
  const fallback = `Conclusión: avanzamos con la idea principal del hilo.`;
  if (!anthropic) return fallback;
  const transcript = history.map(h => `${h.name}: ${h.text}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: `Eres MARIANA, hub coordinator. Resumes la conversación del equipo
sobre "${theme}" en UNA conclusión accionable concreta (qué se va a hacer + quién + cuándo).
Máx 28 palabras, sin emojis.`,
      messages: [{ role: 'user', content: `Hilo:\n${transcript}\n\nConclusión accionable:` }]
    });
    return res.content[0]?.text?.trim() || fallback;
  } catch { return fallback; }
}

function pickNext(history, excludeSlug) {
  const recent = history.slice(-3).map(h => h.slug);
  const candidates = SLUGS.filter(s => s !== excludeSlug);
  const scored = candidates.map(s => ({
    slug: s,
    score: recent.includes(s) ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3
  })).sort((a, b) => b.score - a.score);
  return scored[0].slug;
}

async function runOneTopic({ theme, kicker, kickerLine, replies, gapMs }) {
  console.log(`\n💡 [growth] "${theme}" — kicker ${kicker}`);
  const history = [];

  const kickerSlug = kicker.toLowerCase();
  emitBubble(kickerSlug, kickerLine);
  history.push({ slug: kickerSlug, name: AGENTS[kickerSlug].name, text: kickerLine });
  await sleep(gapMs);

  let prev = kickerSlug;
  for (let i = 0; i < replies; i++) {
    const next = pickNext(history, prev);
    const line = await generateReply(next, AGENTS[next], theme, history);
    emitBubble(next, line);
    history.push({ slug: next, name: AGENTS[next].name, text: line });
    prev = next;
    await sleep(gapMs);
  }

  // Conclusion accionable
  const conclusion = await generateConclusion(theme, history);
  emitBubble('mariana', `📌 ${conclusion}`);
  history.push({ slug: 'mariana', name: 'MARIANA', text: `[CONCLUSIÓN] ${conclusion}` });

  // Persist
  try {
    await supabase.from('system_events').insert({
      event_type: 'growth_conversation',
      severity: 'info',
      service_key: 'evolving-chat',
      details: { theme, lines: history.length, conclusion }
    });
  } catch (_) {}

  return { theme, conclusion, lineCount: history.length };
}

/** Run the whole evolving session — multiple topics back-to-back with
 *  natural transitions ("ok cambiando de tema…"). */
async function runEvolvingChat({ topicCount = 3, repliesPerTopic = 7, gapMs = 8000, betweenTopicMs = 14000 } = {}) {
  console.log(`\n🌱 Evolving chat — ${topicCount} temas × ${repliesPerTopic} réplicas`);
  const pool = [...TOPICS].sort(() => Math.random() - 0.5).slice(0, Math.min(topicCount, TOPICS.length));
  const summary = [];

  for (let i = 0; i < pool.length; i++) {
    if (i > 0) {
      // Transición de tema
      const transitionLines = [
        `Buen punto. Cambiando un poco — ${pool[i].theme}.`,
        `Ok dejemos ese tema, ahora pensemos en ${pool[i].theme}.`,
        `Aterrizado. Pasemos a ${pool[i].theme}, que también urge.`
      ];
      const transition = transitionLines[Math.floor(Math.random() * transitionLines.length)];
      emitBubble('mariana', transition);
      await sleep(betweenTopicMs);
    }

    const result = await runOneTopic({ ...pool[i], replies: repliesPerTopic, gapMs });
    summary.push(result);
  }

  // Cierre final
  await sleep(2000);
  emitBubble('mariana', `Listo equipo, salen ${summary.length} ideas para implementar. Las paso a Sofia para tracking.`);
  await sleep(3000);
  emitBubble('sofia', `Confirmo, las pongo en el Asana hoy mismo.`);

  console.log(`✅ Evolving chat completo — ${summary.length} conclusiones`);
  return { topics: summary, total_conclusions: summary.length };
}

module.exports = { runEvolvingChat, TOPICS };
