/**
 * Mariana Valdés — generador de respuestas con personalidad completa,
 * inteligencia emocional, límites, detección tóxica, y follow-ups proactivos.
 */

const {
  answerPersonalQuestion, foodieContext, travelContext,
  empathyContext, extractPersonalDetails, personalTouch,
} = require('./mariana-persona');
const { resolveQuestion, getServiceInfo, priceRange, PROCESS } = require('./knowledge-base');
const { availabilityComment, checkAvailability }               = require('./project-manager');
const { scheduleFollowup, buildFollowupMessage, hasPending }   = require('./pending-jobs');

const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const fn    = name => (name || 'amigo').split(' ')[0];
const money = b => b ? `$${b.toLocaleString('es-MX')} MXN` : null;

const PROJECT_LABELS = {
  video_4k:'video', reels:'reels', content_calendar:'parrilla de contenido',
  branding:'branding', strategy:'estrategia', photography:'fotos',
  motion:'animación', web:'página web', social_media:'redes sociales', ads:'campañas',
};

const SOURCE_KW  = ['recomend','instagram','facebook','tiktok','linkedin','google','youtube','amigo','colega','anuncio','referencia','conocid','me dijeron','me mandaron','redes','twitter'];
const NEED_KW    = ['video','reels','branding','logo','web','pagina','landing','foto','estrategia','marketing','contenido','animacion','motion','presupuesto','precio','costo','cuanto','cotizacion','redes sociales','publicidad','ads','diseño','identidad'];
const EMPATHY_KW = ['mal','cansad','estresad','agobiad','difícil','dificil','complicado','no sé','no se','perdid','triste','frustrad','desesperado','crisis','problema','no puedo','caótico','caotico','batalland'];
const FOOD_KW    = ['restaurante','café','cafeter','comida','gastro','foodie','cocina','menú','chef'];
const TRAVEL_KW  = ['viaj','tour','turism','hotel','hostal','agencia de viajes'];

// ─── Detección emocional / límites ────────────────────────────────────────────
const RUDE_KW      = ['pinche','cabrón','idiota','imbécil','estúpido','pendejo','inútil','incompetentes','pésimos','malísimos','no sirven','basura','mamada','ridículos'];
const DEMANDING_KW = ['exijo','necesito ya','ahora mismo','cuántas veces','ya les dije','no entienden','se supone','no es lo que pedí','qué onda no saben','mal hecho','lo hicieron mal','puras excusas'];
const CHANGES_KW   = ['otro cambio','otra modificación','cámbienlo','no me gusta','vuelvan a hacerlo','no quedó','no me convence','así no','háganlo de nuevo','más cambio','quiero diferente','tampoco me convence'];
const MILESTONE_KW = /casi list|ya casi|cuándo entregan|cuándo terminan|cuándo está listo|estamos cerca|ya mero|falta poco|última etapa|última revisión|ya lo terminaron/i;
const OUT_OF_SCOPE_RX = /gratis|sin costo adicional|de más|sin cargo|de regalo|bonus|incluido en el precio|sin cobrar|ya pagué todo|eso ya estaba/i;

const WHO_IS_FER  = /\bqui[eé]n es fer\b|\bfer qui[eé]n\b|\btu jefe\b|\bquien revisa\b|\bquien autoriza\b/i;
const ASK_PROCESS = /\bc[oó]mo funciona|cu[aá]l es el proceso|c[oó]mo trabajan|c[oó]mo es|por d[oó]nde empezamos|primeros pasos/i;
const ASK_PRICE   = /\bcu[aá]nto cuesta|precio|presupuesto aproximado|rango|cuanto cobran|tarifa|cuanto vale/i;
const ASK_DETAIL  = /qu[eé] incluye|qu[eé] viene|qu[eé] tiene|qu[eé] abarca|en qu[eé] consiste|qu[eé] obtengo/i;
const CHECK_TRIGGER = /disponib|cuándo pueden|cu[aá]ndo empezar[ií]a|tienen espacio|est[aá]n libres|tienen tiempo/i;

const looksLikeSource  = t => SOURCE_KW.some(k => t.toLowerCase().includes(k));
const looksLikeNeed    = t => NEED_KW.some(k => t.toLowerCase().includes(k));
const looksLikeVenting = t => EMPATHY_KW.some(k => t.toLowerCase().includes(k));
const looksLikeFood    = t => FOOD_KW.some(k => t.toLowerCase().includes(k));
const looksLikeTravel  = t => TRAVEL_KW.some(k => t.toLowerCase().includes(k));
const isRude           = t => RUDE_KW.some(k => t.toLowerCase().includes(k));
const isDemanding      = t => DEMANDING_KW.some(k => t.toLowerCase().includes(k));
const isAskingChanges  = t => CHANGES_KW.some(k => t.toLowerCase().includes(k));

// ─── Estado emocional de la conversación ─────────────────────────────────────
function initEmotional() {
  return { toxicScore: 0, demandScore: 0, ferAlerted: false, partingHinted: false };
}

function updateEmotionalState(conv, text, sentiment) {
  if (!conv.emotional) conv.emotional = initEmotional();
  const e = conv.emotional;
  const t = (text || '').toLowerCase();

  // Acumular toxicidad
  if (isRude(t))      e.toxicScore  = Math.min((e.toxicScore  || 0) + 2, 10);
  if (isDemanding(t)) e.toxicScore  = Math.min((e.toxicScore  || 0) + 1, 10);
  if (sentiment.emotion === 'muy_negativo') e.toxicScore = Math.min((e.toxicScore || 0) + 1, 10);

  // Acumular demandas de cambios fuera de alcance
  if (isAskingChanges(t))     e.demandScore = Math.min((e.demandScore || 0) + 1, 10);
  if (OUT_OF_SCOPE_RX.test(text)) e.demandScore = Math.min((e.demandScore || 0) + 1, 10);

  // Bajar score si el cliente se calma
  if (sentiment.emotion === 'positivo' || sentiment.emotion === 'muy_positivo') {
    e.toxicScore  = Math.max((e.toxicScore  || 0) - 1, 0);
    e.demandScore = Math.max((e.demandScore || 0) - 1, 0);
  }
}

// ─── Respuesta emocional / límites — retorna string o null ───────────────────
function emotionalGuard(conv, text, sentiment, first) {
  const e   = conv.emotional || initEmotional();
  const t   = (text || '').toLowerCase();
  const rel = conv.relationship || {};

  // 1. Groserías directas — poner límite inmediato y serio
  if (isRude(t)) {
    return pick([
      `${first}, te pido de favor que nos tratemos con respeto. Entiendo que puede haber frustración, pero trabajamos mejor desde el buen trato. ¿Qué está pasando exactamente?`,
      `${first}, antes de continuar quiero pedirte que nos tratemos con respeto. Quiero ayudarte, pero necesito ese espacio para hacerlo bien. ¿Qué necesitas?`,
      `Entiendo que algo te frustró y lamento eso. Pero necesito que hablemos con respeto para poder ayudarte como mereces. ¿Me platicas qué pasó?`,
    ]);
  }

  // 2. Exigencias fuera de alcance — límite amistoso pero claro
  if (OUT_OF_SCOPE_RX.test(text)) {
    return pick([
      `${first}, eso quedaría fuera del alcance que acordamos y tendría un costo adicional. ¿Te paso una cotización?`,
      `Eso no está incluido en lo que definimos, pero con gusto lo cotizamos aparte. ¿Lo reviso con Fer?`,
      `Eso es adicional al alcance pactado, ${first}. No es un no, solo requiere su cotización. ¿Te parece?`,
    ]);
  }

  // 3. Saturación de cambios — poner límite suave → serio según score
  if (isAskingChanges(t)) {
    const score = e.demandScore || 0;
    if (score <= 1) {
      return pick([
        `Claro, lo revisamos. Solo para tenerte al tanto: ya estamos en las rondas de revisión incluidas. Si necesitamos más, te aviso antes de proceder, ¿va?`,
        `Perfecto, lo vemos. Para que estés enterado: con esto ya estamos en las revisiones del paquete; si surge algo extra te lo comento antes.`,
      ]);
    }
    if (score <= 3) {
      return pick([
        `${first}, ya llevamos varias rondas de cambios — completamente normal, pero ya estamos al límite de las incluidas. Cualquier ajuste adicional tendríamos que cotizarlo. ¿Hay algo puntual que no esté funcionando? Quizás haya una forma más eficiente de resolverlo.`,
        `${first}, te soy honesta: ya van varios ajustes y quiero que el resultado sea lo que buscas, pero también necesito cuidar los tiempos del equipo. ¿Podemos hacer una lista de lo que falta para atacarlo todo de una vez?`,
      ]);
    }
    if (!e.ferAlerted) {
      e.ferAlerted = true;
      conv.needsEscalation  = true;
      conv.escalationReason = 'excessive_changes';
      return pick([
        `${first}, voy a ser directa: llevamos muchas rondas y el equipo está al máximo. Voy a hablarlo con Fer para encontrar la mejor solución. ¿Me das un momento?`,
        `${first}, necesito pausar un segundo. Llevamos varios ajustes y quiero que el proyecto salga bien. Déjame revisarlo con Fer para definir cómo cerramos esto de la mejor forma.`,
      ]);
    }
  }

  // 4. Cliente tóxico acumulado — alerta a Fer antes de sugerir separación
  if ((e.toxicScore || 0) >= 4 && !e.ferAlerted) {
    e.ferAlerted = true;
    conv.needsEscalation  = true;
    conv.escalationReason = 'toxic_client';
    return pick([
      `${first}, quiero ser honesta: siento que no estamos conectando bien y me preocupa para el proyecto. Voy a involucrar a Fer para que tomen contacto directo. Creo que es lo mejor.`,
      `${first}, noto cierta tensión y prefiero nombrarlo. Le voy a pedir a Fer que se involucre — él puede atenderte mejor. ¿Te parece?`,
    ]);
  }

  // 5. Si Fer ya fue alertado y la cosa sigue pesada — sugerir separación amistosa
  if ((e.toxicScore || 0) >= 7 && e.ferAlerted && !e.partingHinted) {
    e.partingHinted = true;
    return pick([
      `${first}, te lo digo con honestidad y sin drama: quizás nuestros servicios no estén al nivel de lo que buscas en este momento, y lo entendemos perfectamente. Si decides explorar otras opciones está bien, y si más adelante quieres retomar, aquí estaremos.`,
      `${first}, con toda apertura: si sientes que no somos el equipo para lo que necesitas, lo entendemos. Mejor nombrarlo ahora. Si algo cambia, sabes que aquí estamos.`,
    ]);
  }

  return null; // todo bien, fluir normal
}

// ─── Celebración de hitos ─────────────────────────────────────────────────────
function milestoneResponse(conv, text, first) {
  if (!MILESTONE_KW.test(text)) return null;
  const pt = conv.profile && conv.profile.projectType;
  const label = pt ? PROJECT_LABELS[pt] || pt : 'el proyecto';
  return pick([
    `${first}, qué gusto que ya estamos en la recta final ✨ El equipo está muy contento con cómo está quedando ${label}. Ya casi.`,
    `Ya casi 🙌 ${label} quedó muy bien, todo el equipo súper contento. Fer te manda los detalles asap.`,
    `Sí, ya estamos en la última etapa ✨ Me da mucho gusto cuando llegamos aquí — significa que todo el proceso fluyó bien. ¿Hay algo puntual que quieras revisar antes de la entrega?`,
  ]);
}

// ─── Comentarios casuales (con compostura) ───────────────────────────────────
function casualBanter(text, rel) {
  if (rel.vibe !== 'bro' && rel.vibe !== 'friendly') return null;
  if (/lunes/i.test(text))  return pick([`Lunes, arrancando con todo ✨`, null]);
  if (/viernes/i.test(text)) return pick([`Viernes, qué bueno 😊`, null]);
  if (/jaja|jeje/i.test(text) && text.length < 30) return pick([`Jaja, claro 😊`, `Jaja sí, exacto.`, null, null]);
  return null;
}

// ─── "Let me check" — Mariana se compromete a regresar ───────────────────────
function triggerCheck(conv, first) {
  const followupMsg = buildFollowupMessage(conv);
  const delay = (30 + Math.floor(Math.random() * 15)) * 60 * 1000;
  scheduleFollowup(conv.phone, conv.name, followupMsg, delay);
  return pick([
    `Déjame revisar las cargas del equipo y te escribo en un momento, ¿va?`,
    `Lo consulto con Fer y el equipo y te confirmo en breve.`,
    `Dame un momento para revisar los proyectos en curso y te confirmo.`,
  ]);
}

// ─── Servicio detallado ───────────────────────────────────────────────────────
function serviceDetailResponse(projectType, profile) {
  const svc  = getServiceInfo(projectType);
  if (!svc) return null;
  const biz  = profile.businessType ? ` para tu ${profile.businessType}` : '';
  const range = priceRange(projectType);
  let resp = `Para ${svc.label.toLowerCase()}${biz} incluimos:\n\n`;
  resp    += svc.includes.map(i => `• ${i}`).join('\n');
  resp    += `\n\nTiempos: ${svc.timeline}.`;
  if (range) resp += `\nInversión: ${range}.`;
  resp    += `\n\n¿Hay algo específico que quieras que te explique?`;
  return resp;
}

function processResponse() {
  return `Así trabajamos:\n\n${PROCESS.join('\n')}\n\nTodo queda documentado desde el inicio. ¿Alguna duda sobre algún paso?`;
}

function priceResponse(projectType, profile) {
  const range = priceRange(projectType);
  const biz   = profile.businessType ? ` para tu ${profile.businessType}` : '';
  if (!range) return `Depende del alcance${biz} — todo es a la medida. ¿Tienes un rango en mente?`;
  return `Para ${PROJECT_LABELS[projectType] || 'ese proyecto'}${biz} el rango va de ${range}. ¿Tienes presupuesto aproximado? Así te digo qué incluimos.`;
}

// ─── Objeciones ───────────────────────────────────────────────────────────────
function handleObjection(intent, profile) {
  const biz = profile.businessType || 'tu negocio';
  const map = {
    objection_price: pick([
      `Lo entiendo perfecto. Todo es a la medida — ¿cuánto tienes disponible? Ajustamos el alcance para ${biz}.`,
      `Sin problema. Compárteme tu rango y vemos cómo armamos algo que te funcione.`,
      `¿Qué presupuesto manejas? Con eso ajustamos el alcance sin problema.`,
    ]),
    objection_thinking: pick([
      `Sin presión, tómate el tiempo. Si surge alguna duda, aquí estoy.`,
      `Claro, piénsalo con calma. ¿Hay algo puntual que te genere duda?`,
      `Totalmente entendible. ¿Qué necesitarías para sentirte tranquilo con la decisión?`,
    ]),
    objection_competitor: pick([
      `Qué bueno que ya tienes apoyo. ¿Qué sientes que le está faltando?`,
      `Entiendo. ¿Y qué te llevó a buscarnos?`,
    ]),
    objection_time: pick([
      `Sin problema. ¿Cuándo crees que sería buen momento?`,
      `Claro, cuando estés listo aquí estamos. ¿Te puedo escribir en unos días?`,
    ]),
  };
  return map[intent] || null;
}

// ─── Actualizar relación con el cliente ──────────────────────────────────────
function updateRelationship(conv, text, sentiment) {
  if (!conv.relationship) {
    conv.relationship = { vibe: 'professional', personalDetails: {}, insideJokes: [], msgCount: 0 };
  }
  const rel = conv.relationship;
  rel.msgCount = (rel.msgCount || 0) + 1;

  // Elevar a "friendly" si hay intercambio largo y positivo
  if (rel.msgCount > 4 && sentiment.emotion !== 'negativo') rel.vibe = 'friendly';
  if (rel.msgCount > 8) rel.vibe = 'bro';

  // Bajar vibe si hay toxicidad sostenida
  const toxicScore = (conv.emotional || {}).toxicScore || 0;
  if (toxicScore >= 3 && rel.vibe === 'bro')      rel.vibe = 'friendly';
  if (toxicScore >= 5 && rel.vibe === 'friendly') rel.vibe = 'professional';

  const details = extractPersonalDetails(text);
  Object.assign(rel.personalDetails, details);

  if (/jaja|jeje|lol|jajaja/i.test(text) && text.length > 20) {
    const snippet = text.slice(0, 40).trim();
    if (!rel.insideJokes.includes(snippet)) rel.insideJokes.push(snippet);
    if (rel.insideJokes.length > 5) rel.insideJokes.shift();
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────
function buildResponse(conv, name, text, extracted, sentiment, isReturning = false) {
  const first   = fn(name);
  const profile  = conv.profile  || {};
  const history  = conv.history  || [];
  const { intent, projectType, budget: b, timeline } = extracted;
  const { emotion } = sentiment;
  const state   = conv.state || 'new';
  const t       = (text || '').toLowerCase();

  // Actualizar perfil
  if (b          && !profile.budget)       profile.budget      = b;
  if (timeline   && !profile.timeline)     profile.timeline    = timeline;
  if (projectType && !profile.projectType) profile.projectType = projectType;
  if (looksLikeFood(t))                    profile.foodieClient = true;

  // Actualizar estado emocional y relación
  updateEmotionalState(conv, text, sentiment);
  updateRelationship(conv, text, sentiment);
  const rel    = conv.relationship || {};
  const touch  = personalTouch(rel);
  const isBro  = rel.vibe === 'bro' || rel.vibe === 'friendly';

  // Sync legacy
  if (profile.source)  conv.source = profile.source;
  if (profile.rawNeed) conv.need   = profile.rawNeed;

  // Negative streak clásico → escalación
  conv.negativeStreak = (emotion === 'negativo' || emotion === 'muy_negativo')
    ? (conv.negativeStreak || 0) + 1 : 0;
  if (conv.negativeStreak >= 2) {
    conv.state = 'escalated';
    conv.needsEscalation = true;
    return pick([
      `${first}, noto que algo no está bien. Le aviso a Fer para que te dé seguimiento directo.`,
      `${first}, Fer ya está enterado, te escribe en breve.`,
    ]);
  }

  // Media
  if (!text || !text.trim() || intent === 'media') {
    return pick([`¿Qué me quieres mostrar?`, `Vi que mandaste algo, cuéntame.`]);
  }

  // ─── GUARDIA EMOCIONAL — límites, toxicidad, hitos ────────────────────────
  const guardResp = emotionalGuard(conv, text, sentiment, first);
  if (guardResp) return guardResp;

  // ─── Celebración de hito ───────────────────────────────────────────────────
  const milestone = milestoneResponse(conv, text, first);
  if (milestone) return milestone;

  // ─── Banter casual (solo si hay confianza) ────────────────────────────────
  const banter = casualBanter(text, rel);
  if (banter) return banter;

  // ─── Preguntas personales a Mariana ───────────────────────────────────────
  const personal = answerPersonalQuestion(text);
  if (personal) return personal;

  // ─── ¿Quién es Fer? ────────────────────────────────────────────────────────
  if (WHO_IS_FER.test(text)) {
    return `Fer es mi jefe. Él revisa los proyectos, autoriza propuestas y lleva el contacto directo con los clientes. Súper buena onda, te va a caer muy bien.`;
  }

  // ─── FAQ directas ──────────────────────────────────────────────────────────
  const faqAnswer = resolveQuestion(text);
  if (faqAnswer) return faqAnswer;

  // ─── Proceso ───────────────────────────────────────────────────────────────
  if (ASK_PROCESS.test(text)) return processResponse();

  // ─── Precio ────────────────────────────────────────────────────────────────
  if (ASK_PRICE.test(text)) {
    const pt = projectType || profile.projectType;
    return priceResponse(pt, profile);
  }

  // ─── Detalle de servicio ───────────────────────────────────────────────────
  if (ASK_DETAIL.test(text)) {
    const pt = projectType || profile.projectType;
    if (pt) {
      const detail = serviceDetailResponse(pt, profile);
      if (detail) return detail;
    }
  }

  // ─── Algo fuera de lo que ofrecemos → no comprometer, verificar ───────────
  if (/necesito|quiero|pueden hacer|hacen|manejan/i.test(t) && !looksLikeNeed(t) && state !== 'new') {
    return pick([
      `Eso déjame verificarlo con Fer antes de comprometerte una respuesta. Te confirmo en un momento.`,
      `Buena pregunta. Déjame revisarlo con el equipo para no prometerte algo que no podamos cumplir.`,
    ]);
  }

  // ─── "Check" explícito del cliente (cuándo pueden, disponibilidad) ─────────
  if (CHECK_TRIGGER.test(text) && !hasPending(conv.phone)) {
    return triggerCheck(conv, first);
  }

  // ─── Cliente que regresa ───────────────────────────────────────────────────
  if (isReturning && history.length > 0) {
    const ctx = profile.projectType ? `tu ${PROJECT_LABELS[profile.projectType]}` : null;
    const biz = profile.businessType ? `para tu ${profile.businessType}` : '';
    if (intent === 'greeting' || t.length < 20) {
      return ctx
        ? pick([
            `Hola ${first}, qué gusto saber de ti.${touch} ¿Cómo vas con ${ctx} ${biz}?`,
            `${first}, qué bueno que regresas. ¿Sigues pensando en ${ctx} o cambió algo?`,
            `Hola ${first} ✨ ¿Cómo va todo con ${ctx}?`,
          ])
        : pick([
            `Hola ${first}, qué gusto que regreses.${touch} ¿En qué te ayudo?`,
            `${first}, aquí estoy. ¿En qué te apoyo hoy?`,
          ]);
    }
  }

  // ─── Empatía profunda ──────────────────────────────────────────────────────
  if (looksLikeVenting(text) && state !== 'new') {
    const emp = empathyContext(profile.businessType);
    return pick([
      `${emp} Cuéntame qué está pasando, ¿hay algo en lo que te pueda apoyar?`,
      `${first}, eso suena pesado. ${emp} ¿Qué necesitas?`,
      `Lo entiendo perfecto. ¿Quieres platicarlo? A veces ayuda ordenar las ideas con alguien.`,
    ]);
  }

  // ─── Viajes ───────────────────────────────────────────────────────────────
  if (looksLikeTravel(text) && state === 'asked_need') {
    return travelContext() + ` ¿Qué tipo de proyecto tienes en mente?`;
  }

  // ─── Objeciones ───────────────────────────────────────────────────────────
  const obj = handleObjection(intent, profile);
  if (obj) return obj;

  // ─── Contacto con Fer ─────────────────────────────────────────────────────
  if (intent === 'contact_fermin') {
    conv.needsEscalation = true;
    return pick([
      `Va, le aviso a Fer ahorita 📲 ¿Hay algo que deba saber antes?`,
      `De una, Fer ya está enterado. ¿Algo puntual que le comente?`,
    ]);
  }

  // ─── Ready ────────────────────────────────────────────────────────────────
  if (intent === 'ready' && state !== 'new') {
    conv.state = 'closing';
    const pt = profile.projectType;
    if (pt && !checkAvailability(pt).available && !hasPending(conv.phone)) {
      return triggerCheck(conv, first);
    }
    return pick([
      `Súper 🙌 Lo revisamos y te escribo asap va?`,
      `De una! Fer ya está al tanto, te escribimos con algo personalizado.`,
    ]);
  }

  // ─── Gracias ──────────────────────────────────────────────────────────────
  if (intent === 'thanks') {
    return pick([
      `Con mucho gusto 😊${isBro ? ` Saludos!` : ' Cualquier cosa me dices.'}`,
      `Obvio, para eso estamos 🙌`,
      `Jaja de nada! Al pendiente.`,
    ]);
  }

  // ─── Saludo de relación establecida ───────────────────────────────────────
  if (intent === 'greeting' && conv.msgs > 3) {
    return pick([
      `Hola ${first}! 😊 ¿Qué se te ofrece?`,
      `¡${first}! Aquí andamos jaja ¿En qué te ayudo?`,
    ]);
  }

  // ─── State machine ──────────────────────────────────────────────────────────
  if (state === 'new') {
    if (!profile.source  && looksLikeSource(text)) profile.source  = text;
    if (!profile.rawNeed && looksLikeNeed(text))   profile.rawNeed = text;
    conv.source = profile.source;
    conv.need   = profile.rawNeed;

    if (profile.source && profile.rawNeed) {
      conv.state = 'qualifying';
      const budgetStr = profile.budget ? ` Con ${money(profile.budget)}, anotado.` : '';
      const foodCtx   = looksLikeFood(text) ? ` ${foodieContext()}` : '';
      const avail     = profile.projectType ? availabilityComment(profile.projectType) : null;
      let resp = pick([
        `¡Hola ${first}! Soy Mariana de Fractal MX 👋${budgetStr}${foodCtx} ¿Tienes fecha límite en mente?`,
        `¡Qué tal ${first}! Soy Mariana de Fractal 🙌${budgetStr} ¿Cuándo quisieras arrancar?`,
      ]);
      if (avail) resp += `\n\n${avail}`;
      return resp;
    }
    if (profile.rawNeed) {
      conv.state = 'asked_source';
      return pick([
        `¡Hola ${first}! Soy Mariana de Fractal MX 👋 ¿Cómo nos conociste?`,
        `¡Qué tal ${first}! Soy Mariana, de Fractal. ¿Cómo llegaste con nosotros?`,
      ]);
    }
    conv.state = 'asked_source';
    return pick([
      `¡Hola ${first}! Soy Mariana de Fractal MX 👋 ¿Cómo nos conociste?`,
      `¡Qué tal, ${first}! Soy Mariana, de Fractal MX. ¿Cómo llegaste con nosotros?`,
      `Hola ${first}! Soy Mariana de Fractal 🙌 ¿Por dónde nos encontraste?`,
    ]);
  }

  if (state === 'asked_source') {
    if (!profile.source) { profile.source = text; conv.source = text; }
    if (!profile.rawNeed && looksLikeNeed(text)) { profile.rawNeed = text; conv.need = text; }

    if (profile.rawNeed) {
      conv.state = 'qualifying';
      const avail = profile.projectType ? availabilityComment(profile.projectType) : null;
      let resp = profile.budget
        ? pick([
            `Qué bueno 😊 Ya vi que manejas ${money(profile.budget)}. ¿Tienes fecha límite?`,
            `Genial 🙌 Con ${money(profile.budget)} hay cosas muy chidas. ¿Cuándo quisieras arrancar?`,
          ])
        : pick([
            `Qué bueno 😊 ¿Tienes presupuesto y fecha en mente?`,
            `Súper 🙌 ¿Más o menos qué presupuesto manejas?`,
          ]);
      if (avail) resp += `\n\n${avail}`;
      return resp;
    }
    conv.state = 'asked_need';
    return pick([`Qué bueno 😊 ¿En qué te podemos ayudar?`, `Genial! ¿Qué necesitas?`, `Súper 🙌 ¿Qué estás buscando?`]);
  }

  if (state === 'asked_need') {
    if (!profile.rawNeed) { profile.rawNeed = text; conv.need = text; }
    if (projectType && !profile.projectType) profile.projectType = projectType;
    conv.state = 'qualifying';

    const biz  = profile.businessType ? ` para tu ${profile.businessType}` : '';
    const avail = profile.projectType ? availabilityComment(profile.projectType) : null;
    const fCtx = profile.foodieClient ? ` ${foodieContext()}` : '';

    let resp;
    const pt = profile.projectType;
    if (pt === 'branding')      resp = pick([`Branding${biz}! Súper importante 💪 ¿Partes desde cero o quieres renovar?`, `Ay qué padre, branding${biz}${fCtx} 🙌 ¿Ya tienes algo o empezamos de cero?`]);
    else if (pt === 'web')      resp = `Web${biz}, perfecto. ¿Es para mostrar servicios, vender o captar leads?`;
    else if (pt === 'reels')    resp = pick([`Reels${biz}${fCtx}! 🎬 ¿Es para marca personal o empresa?`, `Reels están súper vigentes 🎬 ¿Para quién son?`]);
    else if (pt === 'ads')      resp = `Campañas${biz} 📈 ¿Ya tienes cuentas activas o arrancamos desde cero?`;
    else if (profile.budget)    resp = pick([`Perfecto. Ya vi que manejas ${money(profile.budget)}. ¿Tienes fecha límite?`, `Qué padre 🙌 Con ${money(profile.budget)} vemos qué se arma.`]);
    else                        resp = pick([`Perfecto. ¿Tienes presupuesto y fecha en mente?`, `Entendido. ¿Más o menos qué presupuesto manejas?`]);

    if (avail) resp += `\n\n${avail}`;
    return resp;
  }

  if (state === 'qualifying') {
    conv.state = 'closing';
    const pt  = PROJECT_LABELS[profile.projectType] || profile.rawNeed || 'tu proyecto';
    const biz = profile.businessType ? ` para tu ${profile.businessType}` : '';
    const bs  = profile.budget   ? ` — ${money(profile.budget)}` : '';
    const ts  = profile.timeline ? ` — ${profile.timeline}` : '';

    if (profile.projectType && !checkAvailability(profile.projectType).available && !hasPending(conv.phone)) {
      return triggerCheck(conv, first);
    }

    return pick([
      `Perfecto${bs}${ts} 🙌 Lo revisamos y te escribo asap va?`,
      `Anotado — ${pt}${biz}. Fer ya está enterado, te escribimos pronto.`,
      `Súper, con eso ya tenemos todo. Te escribimos asap con algo personalizado.`,
    ]);
  }

  // Closing
  if (/llamad|llama|llamen/i.test(t)) return pick([`Va, te llamamos. ¿Qué horario te queda?`, `Perfecto, ¿mañana está bien?`]);
  if (/whatsapp|aqui|aquí|chat|mensaje/i.test(t)) return pick([`Listo, por aquí te mandamos todo 📲`, `Va, te escribimos por aquí.`]);
  if (profile.timeline) return `Anotado — ${profile.timeline}. Lo tenemos bien en mente.`;

  const lastMarianaMsg = [...history].reverse().find(h => h.role === 'mariana');
  const opts = [`Recibido 🙌 ¿Algo más?`, `Perfecto, al pendiente.`, `Listo, lo revisamos y te avisamos asap.`, `Va! Cualquier duda me dices 😊`];
  const filtered = opts.filter(o => !lastMarianaMsg || !lastMarianaMsg.text.startsWith(o.slice(0, 8)));
  return pick(filtered.length ? filtered : opts);
}

module.exports = { buildResponse };
