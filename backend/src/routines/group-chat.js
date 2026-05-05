// backend/src/routines/group-chat.js
// Conversación grupal real con HILO coherente. Un agente arranca un tema,
// 2-3 responden encadenado, después otro se cuela cambiando el ángulo o
// haciendo broma. Cada línea se broadcastea como chat_bubble en orden.

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const AGENTS = {
  mariana:   { name: 'MARIANA',   vibe: 'cálida, melódica, mexicana, organiza al equipo, le dice "nene/mi rey" a Neiky pero no aquí' },
  diana:     { name: 'DIANA',     vibe: 'elegante ex-Ogilvy, estratégica, directa, lee biografías' },
  carlos:    { name: 'CARLOS',    vibe: 'diseñador bold, sneakers raros, vinilos de techno, apasionado' },
  diego:     { name: 'DIEGO',     vibe: 'cerebral San Ángel, humor seco muy seco, ama la tipografía suiza' },
  alex:      { name: 'ALEX',      vibe: 'hipster GDL, súper online, K-pop irónico, memes que sí venden' },
  sofia:     { name: 'SOFIA',     vibe: 'PM organizada calmada Querétaro, Pilates 7am, pan de Rosetta' },
  lucas:     { name: 'LUCAS',     vibe: 'ex-Google regio, analítico, boardgames pesados, whisky con hielo grande' },
  max:       { name: 'MAX',       vibe: 'Tijuana, técnico callado, headphones siempre, surf en Rosarito' },
  valentina: { name: 'VALENTINA', vibe: 'art director visionaria, cerámica miércoles, Wong Kar-wai' },
  roberto:   { name: 'ROBERTO',   vibe: 'CFO ex-PWC formal Polanco, corre maratones, humor seco' },
  qcbot:     { name: 'QC-BOT',    vibe: 'bot sin emociones, brutalmente honesto, sólo logs sin warnings' }
};

const SLUGS = Object.keys(AGENTS);

const TOPICS = [
  { theme: 'series de anime', kicker: 'CARLOS', kickerLine: 'Acabo de terminar Vinland Saga temporada 2 y estoy en shock, no me esperaba ese giro emocional.' },
  { theme: 'taquerías de CDMX que valen la pena', kicker: 'MARIANA', kickerLine: 'Equipo, voto serio: ¿taquería favorita en CDMX que no sea El Califa? necesito sugerencias.' },
  { theme: 'café especialidad vs café de oficina', kicker: 'SOFIA', kickerLine: 'Hoy pedí café de la cafetería de abajo y juro que estaba quemado, ya no aguanto.' },
  { theme: 'mejor película de Wong Kar-wai', kicker: 'VALENTINA', kickerLine: 'Anoche revisité In the Mood for Love y sigue siendo la película más bella del cine.' },
  { theme: 'boardgames pesados un sábado lluvioso', kicker: 'LUCAS', kickerLine: 'Quien quiera Twilight Imperium este sábado, dejen libre 6 horas mínimo.' },
  { theme: 'la peor tipografía que han visto en un cliente', kicker: 'DIEGO', kickerLine: 'Cliente nuevo me mandó un brief en Comic Sans con bullets en Papyrus. No descansaré hasta convencerlo.' },
  { theme: 'qué traer al desayuno comunitario del viernes', kicker: 'ALEX',  kickerLine: 'Voto por chilaquiles del Pendulo del viernes, alguien second?' }
];

function emitBubble(slug, text) {
  if (!global.io) return;
  try {
    global.io.emit('chat_bubble', {
      agent: slug,
      text: String(text || '').slice(0, 240),
      kind: 'group',
      ts: Date.now()
    });
  } catch (_) {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Genera la respuesta de un agente al hilo actual, dado el historial. */
async function generateReply(slug, agent, theme, history) {
  const fallback = `(${agent.name} asiente y sigue trabajando.)`;
  if (!anthropic) return fallback;

  const transcript = history.map(h => `${h.name}: ${h.text}`).join('\n');
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 110,
      system: `Eres ${agent.name} en Fractal MX, una agencia creativa AI-powered en CDMX.
Vibe personal: ${agent.vibe}.

Estás en una charla casual del equipo (no es del trabajo). El tema es: "${theme}".
Lee el hilo y responde EN ESPAÑOL en UNA SOLA oración (máx 24 palabras).
Tu respuesta debe:
- Conectar con LO ÚLTIMO que dijo alguien específicamente
- Sumar algo (recomendación / chiste / opinión / reacción real)
- Sentirse como compañero de oficina, no formal
- NUNCA empezar con tu nombre
- NUNCA usar emojis
- Puedes mencionar a otros del equipo por nombre`,
      messages: [{
        role: 'user',
        content: `Hilo hasta ahora:\n${transcript || '(eres el primero)'}\n\n¿Qué dices tú, ${agent.name}?`
      }]
    });
    const txt = res.content[0]?.text?.trim().replace(/^["'`]|["'`]$/g, '');
    return txt || fallback;
  } catch {
    return fallback;
  }
}

/** Pick next speaker — bias toward someone who hasn't talked recently
 *  to ensure rotation, but allow some bursts of 2 messages by same agent.
 *  Excludes the immediate previous speaker. */
function pickNext(history, excludeSlug) {
  const recent = history.slice(-3).map(h => h.slug);
  const candidates = SLUGS.filter(s => s !== excludeSlug);
  // Score: lower if recent
  const scored = candidates.map(s => ({
    slug: s,
    score: recent.includes(s) ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3
  })).sort((a, b) => b.score - a.score);
  return scored[0].slug;
}

async function runOneTopic({ theme, kicker, kickerLine, replies = 8, gapMs = 8000 }) {
  console.log(`\n💬 Topic: "${theme}" — kicker ${kicker} → ${replies} replies`);
  const history = [];

  // Kicker line first
  const kickerSlug = kicker.toLowerCase();
  emitBubble(kickerSlug, kickerLine);
  history.push({ slug: kickerSlug, name: AGENTS[kickerSlug].name, text: kickerLine });
  console.log(`  ${kicker.padEnd(10)} → ${kickerLine}`);
  await sleep(gapMs);

  let prevSlug = kickerSlug;
  for (let i = 0; i < replies; i++) {
    const nextSlug = pickNext(history, prevSlug);
    const agent = AGENTS[nextSlug];
    const line = await generateReply(nextSlug, agent, theme, history);
    emitBubble(nextSlug, line);
    history.push({ slug: nextSlug, name: agent.name, text: line });
    console.log(`  ${agent.name.padEnd(10)} → ${line}`);
    prevSlug = nextSlug;
    await sleep(gapMs);
  }
  return history;
}

/** Run a full session — N topics back-to-back. */
async function runGroupChat({ topics = 2, repliesPerTopic = 8, gapMs = 8000, theme: forcedTheme = null } = {}) {
  console.log(`💬 Group chat session — ${topics} topics × ${repliesPerTopic} replies each`);

  // Pick topics: forced if provided, else random shuffled
  const pool = forcedTheme
    ? [{ theme: forcedTheme, kicker: pickRandomKicker(forcedTheme), kickerLine: `Tema: ${forcedTheme}.` }]
    : [...TOPICS].sort(() => Math.random() - 0.5).slice(0, topics);

  const all = [];
  for (const t of pool) {
    const h = await runOneTopic({ ...t, replies: repliesPerTopic, gapMs });
    all.push({ topic: t.theme, lines: h.length });
    // small pause between topics
    await sleep(gapMs * 1.5);
  }
  return { topics: all, total_lines: all.reduce((a, b) => a + b.lines, 0) };
}

function pickRandomKicker(theme) {
  // Pick the agent whose vibe most relates, or just a random one
  return SLUGS[Math.floor(Math.random() * SLUGS.length)].toUpperCase();
}

module.exports = { runGroupChat, TOPICS };
