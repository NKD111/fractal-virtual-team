// backend/src/routines/intro-chat.js
// Fase 8.5 extra: "Primer día" — los 11 agentes se presentan, hablan de sus
// gustos personales y se conocen entre sí durante ~5 min. Cada línea se
// broadcastea como chat_bubble para verlas flotar arriba de su sprite en
// el Office View.

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// 11 agentes en orden de turno. Cada uno tiene un "estilo" para que las
// respuestas se sientan únicas aunque la generación falle y use fallback.
const AGENTS = [
  { slug: 'mariana',   role: 'Hub Coordinator',          vibe: 'cálida, melódica, mexicana, organiza al equipo' },
  { slug: 'diana',     role: 'Senior Client Manager',     vibe: 'elegante ex-Ogilvy, estratégica, directa' },
  { slug: 'carlos',    role: 'Senior Designer (branding)', vibe: 'creativo bold, perfeccionista, apasionado' },
  { slug: 'diego',     role: 'Senior Designer Editorial',  vibe: 'cerebral, San Ángel, humor seco, culto' },
  { slug: 'alex',      role: 'Content Creator',           vibe: 'hipster GDL, super online, energético' },
  { slug: 'sofia',     role: 'Project Manager',           vibe: 'organizada, calmada, Querétaro, su café' },
  { slug: 'lucas',     role: 'Analytics ex-Google',        vibe: 'analítico, bilingüe, humor seco regio' },
  { slug: 'max',       role: 'AI Video Editor',           vibe: 'Tijuana, técnico, con headphones puestos' },
  { slug: 'valentina', role: 'Art Director',              vibe: 'visionaria, criterio fuerte, segura' },
  { slug: 'roberto',   role: 'CFO ex-PWC',                vibe: 'formal Polanco, humor seco, preciso' },
  { slug: 'qcbot',     role: 'Quality Control Bot',        vibe: 'sin emociones, brutalmente honesto, bot' }
];

// Rondas de conversación. Cada elemento define qué se le pide a cada agente.
// Total: 11 + 11 + 8 + 8 = 38 mensajes. A 8s c/u = ~5 minutos.
const PROMPTS = [
  {
    label: 'intro',
    instruction: `Es tu PRIMER DÍA en Fractal MX. Preséntate al equipo en una sola oración (máx 18 palabras). Di tu nombre, qué haces, y algo curioso de ti. Tono natural, sin emojis.`
  },
  {
    label: 'hobby',
    instruction: `El equipo te pidió que cuentes UNO de tus gustos personales o pasatiempos en una sola oración (máx 16 palabras). Sé específico y auténtico — música, comida, deportes, libros, lo que sea.`
  },
  {
    label: 'react',
    instruction: `Escuchaste a varios compañeros presentarse. Reacciona casualmente en una oración (máx 14 palabras) con algo amable o gracioso, como en un primer día relajado. Puedes mencionar a otro nombre del equipo.`
  },
  {
    label: 'cdmx',
    instruction: `Comparte una recomendación de la CDMX o México que tu equipo deba conocer (lugar, comida, plan, taquería) en una oración (máx 16 palabras).`
  }
];

const FALLBACKS = {
  mariana:   ['Hola equipo, soy Mariana — coordino todo desde WhatsApp y café en mano.', 'Me clavo con bossa nova mientras ordeno tareas, no juzguen.', 'Bienvenidos! avísenme si necesitan algo.', 'Si hay tlayudas en Roma Norte yo invito.'],
  diana:    ['Diana, Client Manager — vengo de Ogilvy, manejo clientes con guante blanco.', 'Tomo Earl Grey y leo biografías los domingos.', 'Bienvenido Carlos, tu portfolio es bestial.', 'El Bellinghausen sigue siendo un clásico.'],
  carlos:   ['Carlos, Senior Designer — branding y sistemas visuales son mi mundo.', 'Me clavo con sneakers raros y vinilos de techno.', 'Diego, cuándo armamos un crit en serio.', 'La taquería Los Cocuyos en Bolívar, sin discusión.'],
  diego:    ['Diego, diseño editorial — la tipografía bien hecha me da paz.', 'Colecciono libros de tipografía suiza, soy aburrido a propósito.', 'Carlos, te debo una lección de Garamond.', 'Café Avellaneda en San Ángel, casi al cierre.'],
  alex:    ['Alex, Content — manejo redes y memes que sí venden.', 'Soy fan del K-pop ironic y de salir a correr al amanecer.', 'Sofi te mando los TikToks que vimos ayer.', 'Mercado Roma para cenar tarde, garantizado.'],
  sofia:   ['Sofía, Project Manager — todo lo que entra a Asana sale a tiempo.', 'Pilates a las 7am y pan dulce de Rosetta los sábados.', 'Lucas, tus dashboards están preciosos.', 'Querétaro centro un domingo es vida.'],
  lucas:   ['Lucas, Analytics — vengo de Google, hablo con dashboards mejor que con humanos.', 'Boardgames pesados y whisky con hielo grande.', 'Roberto, el churn no miente, mi rey.', 'El Mirador del Cerro de las Campanas al atardecer.'],
  max:    ['Max, Video Editor — corto reels con AI antes de que tu cliente termine de hablar.', 'Surf en Rosarito y hardstyle a las 8am, sin pena.', 'Vale, ese moodboard nuevo está fuego.', 'Mariscos La Guerrerense en Ensenada, fin de la lista.'],
  valentina: ['Valentina, Art Director — el visto bueno final pasa por mí, lo siento.', 'Cerámica los miércoles y películas de Wong Kar-wai.', 'Carlos, prepárate para defender ese kerning.', 'La Galería OMR en Roma vale toda visita.'],
  roberto:  ['Roberto, CFO — los miércoles son sagrados (pago Central Interactiva).', 'Corro maratones y leo a Munger, sí, soy ese señor.', 'Sofia, gracias por entregar a tiempo, eres lujo.', 'Pujol existe pero en Polanquito hay neta accesible.'],
  qcbot:    ['QC-BOT — pipeline ok. Diferencias detectadas serán reportadas.', 'No tengo gustos. Disfruto los logs sin warnings.', 'NIVEL DE TOLERANCIA A ERRORES: 0.', 'No salgo. Sirvo.']
};

function emitBubble(slug, text) {
  if (!global.io) return;
  try {
    global.io.emit('chat_bubble', {
      agent: slug,
      text: text.length > 90 ? text.slice(0, 87) + '…' : text,
      kind: 'intro',
      ts: Date.now()
    });
  } catch (_) {}
}

async function generateLine(agent, promptIdx) {
  const p = PROMPTS[promptIdx];
  const fb = FALLBACKS[agent.slug]?.[promptIdx] || `${agent.slug.toUpperCase()} en silencio.`;
  if (!anthropic) return fb;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `Eres ${agent.slug.toUpperCase()}, ${agent.role} en Fractal MX. Vibe: ${agent.vibe}.
Es tu primer día, atmósfera relajada de equipo. Responde en una sola oración natural,
sin prefijos ni nombre. NUNCA uses emojis. Responde EN ESPAÑOL.`,
      messages: [{ role: 'user', content: p.instruction }]
    });
    const txt = res.content[0]?.text?.trim().replace(/^["'`]|["'`]$/g, '');
    return txt || fb;
  } catch {
    return fb;
  }
}

async function runIntroChat({ rounds = PROMPTS.length, gapMs = 8000 } = {}) {
  console.log(`💬 Intro Chat — ${rounds} rondas × ${AGENTS.length} agentes (gap ${gapMs}ms)`);
  let totalSent = 0;

  for (let r = 0; r < Math.min(rounds, PROMPTS.length); r++) {
    // Shuffle agent order each round so siempre se siente espontáneo
    const order = [...AGENTS].sort(() => Math.random() - 0.5);
    for (const agent of order) {
      // Generate + emit (don't await Anthropic for the gap — start gap timer in parallel)
      const gen = generateLine(agent, r);
      const wait = new Promise(res => setTimeout(res, gapMs));
      const [line] = await Promise.all([gen, wait]);
      emitBubble(agent.slug, line);
      totalSent++;
      console.log(`  ${agent.slug.padEnd(10)} → ${line}`);
    }
  }

  console.log(`✅ Intro chat completo (${totalSent} líneas)`);
  return { lines_sent: totalSent, agents: AGENTS.length, rounds };
}

module.exports = { runIntroChat };
