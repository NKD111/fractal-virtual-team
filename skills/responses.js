/**
 * Mariana response engine v2
 * Personalidad, objeciones, proactividad, continuidad, escalamiento
 */

const PROJECT_LABELS = {
  video_4k:        'video',
  reels:           'reels / contenido corto',
  content_calendar:'parrilla de contenido',
  branding:        'branding e identidad visual',
  strategy:        'estrategia de marketing',
  photography:     'sesión fotográfica',
  motion:          'animación / motion graphics',
  web:             'página web',
  social_media:    'manejo de redes sociales',
  ads:             'campañas publicitarias',
};

const SOURCE_KW = [
  'recomend','instagram','facebook','tiktok','linkedin','google',
  'youtube','amigo','colega','anuncio','referencia','conocid',
  'vi en','me dijeron','me mandaron','redes','twitter','x.com',
];
const NEED_KW = [
  'video','reels','branding','logo','web','pagina','landing',
  'foto','estrategia','marketing','contenido','animacion','motion',
  'presupuesto','precio','costo','cuanto','cotizacion','redes sociales',
  'publicidad','ads','campañas',
];

function looksLikeSource(text) { return SOURCE_KW.some(k => text.toLowerCase().includes(k)); }
function looksLikeNeed(text)   { return NEED_KW.some(k => text.toLowerCase().includes(k)); }
function fn(name) { return (name || 'amigo').split(' ')[0]; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Objection handlers ────────────────────────────────────────────────────────
function handleObjection(intent, firstName) {
  switch (intent) {
    case 'objection_price':
      return pick([
        `Entiendo completamente, ${firstName} 🙌 Lo que hacemos en Fractal MX está diseñado para generar retorno real, no solo ser un gasto. ¿Tienes un presupuesto aproximado en mente? Así vemos qué podemos armar para ti.`,
        `Entiendo, ${firstName}. Trabajamos con distintos alcances y presupuestos — desde proyectos puntuales hasta colaboraciones completas. ¿Qué rango tienes en mente? Con eso te digo honestamente si podemos ayudarte.`,
        `Totalmente válido, ${firstName}. No queremos que inviertas en algo que no te genere resultados. Dime qué presupuesto manejas y construimos algo que sí tenga sentido para tu negocio 💡`,
      ]);
    case 'objection_thinking':
      return pick([
        `Claro, tómate el tiempo que necesitas, ${firstName} 😊 Si tienes alguna duda específica que te ayude a decidir, con gusto te la resuelvo ahora.`,
        `Perfecto, ${firstName}. Sin presión 🙌 Si surge alguna pregunta mientras lo piensas, aquí estoy. ¿Hay algo puntual que te genere duda?`,
        `Totalmente, ${firstName}. Es una decisión importante y está bien pensarla. ¿Qué sería lo que más te ayudaría a tomar la decisión?`,
      ]);
    case 'objection_competitor':
      return pick([
        `Qué bueno que ya tienes apoyo, ${firstName} 👍 Muchos de nuestros clientes llegaron en esa misma situación y encontraron en nosotros algo diferente. ¿Qué es lo que más te interesa mejorar de lo que tienes actualmente?`,
        `Entiendo, ${firstName}. No busco que cambies por cambiar — si lo que tienes funciona, genial. Pero si hay algo que sientes que falta o que quieres llevar al siguiente nivel, con gusto platiquemos.`,
        `Perfecto, ${firstName}. Si ya tienes equipo, quizás lo que buscas es una segunda opinión o apoyar en algo específico. ¿Qué es lo que estás buscando complementar?`,
      ]);
    case 'objection_time':
      return pick([
        `Sin problema, ${firstName} 😊 ¿Cuándo crees que sería un buen momento? Te escribo cuando tú digas.`,
        `Entendido, ${firstName}. El timing es importante. ¿Hay algo que esté pasando en tu negocio ahora que cuando se resuelva te abriría espacio para esto?`,
        `Claro, ${firstName}. No hay prisa 🙌 ¿Puedo escribirte en unos días para ver si el momento es mejor?`,
      ]);
    default:
      return null;
  }
}

// ─── FAQ handlers ──────────────────────────────────────────────────────────────
function handleFAQ(intent, firstName) {
  switch (intent) {
    case 'faq_services':
      return `En Fractal MX nos especializamos en marketing digital creativo 🚀\n\n• Branding e identidad visual\n• Video producción y reels\n• Estrategia de contenido\n• Manejo de redes sociales\n• Campañas publicitarias (Meta, Google)\n• Páginas web y landing pages\n\n¿Hay algún área en específico que te interese, ${firstName}?`;
    case 'faq_portfolio':
      return `¡Con gusto! 📁 Tenemos casos de éxito en restaurantes, despachos, marcas de moda y empresas de servicios.\n\nFermín te puede compartir el portafolio directamente — ¿te parece si le pido que te lo mande?`;
    case 'faq_timeline':
      return `Depende del proyecto, ${firstName} ⏱️\n\n• Reels / contenido: 3-7 días\n• Branding completo: 2-4 semanas\n• Página web: 3-6 semanas\n• Estrategia: 1-2 semanas\n\n¿Qué tipo de proyecto tienes en mente?`;
    default:
      return null;
  }
}

// ─── Main response builder ─────────────────────────────────────────────────────
function buildResponse(conv, name, text, extracted, sentiment) {
  const firstName = fn(name);
  const { emotion } = sentiment;
  const { intent, projectType, budget, timeline } = extracted;
  const state = conv.state || 'new';

  // Track negative streak for escalation
  if (emotion === 'negativo' || emotion === 'muy_negativo') {
    conv.negativeStreak = (conv.negativeStreak || 0) + 1;
  } else {
    conv.negativeStreak = 0;
  }

  // Auto-escalate to Fermín if very frustrated
  if (conv.negativeStreak >= 2) {
    conv.state = 'escalated';
    conv.needsEscalation = true;
    return `${firstName}, noto que algo no está bien y quiero que tengas la mejor atención posible 🙏\n\nVoy a pedirle a Fermín que te contacte directamente ahora. ¿Hay algo urgente que deba saber antes de que te llame?`;
  }

  // Media message (foto, audio, etc.)
  if (intent === 'media' || !text.trim()) {
    return pick([
      `Recibí tu mensaje, ${firstName} 📎 Si me mandaste una imagen o audio, lo estoy considerando. ¿Qué me quieres mostrar?`,
      `¡Vi lo que mandaste, ${firstName}! 📸 Cuéntame más — ¿qué tienes en mente?`,
    ]);
  }

  // Objection handling (en cualquier estado)
  const objectionResponse = handleObjection(intent, firstName);
  if (objectionResponse) return objectionResponse;

  // FAQ handling (en cualquier estado)
  const faqResponse = handleFAQ(intent, firstName);
  if (faqResponse) return faqResponse;

  // Contact request (en cualquier estado)
  if (intent === 'contact_fermin') {
    conv.needsEscalation = true;
    return `Claro, ${firstName} 📲 Le aviso a Fermín para que te contacte directamente. ¿Hay algo en particular que quieras que le comparta?`;
  }

  // Ready to move forward
  if (intent === 'ready' && state !== 'new') {
    conv.state = 'closing';
    return `¡Excelente actitud, ${firstName}! 🚀 Le paso toda tu información a Fermín para que te prepare una propuesta personalizada. ¿Cuándo es un buen momento para que te contacte?`;
  }

  // ─── State machine ────────────────────────────────────────────────────────────
  if (state === 'new') {
    conv.state = 'asked_source';
    if (!conv.source && looksLikeSource(text)) conv.source = text;
    if (!conv.need && looksLikeNeed(text)) conv.need = text;

    // Trajo todo desde el primer mensaje
    if (conv.source && conv.need) {
      conv.state = 'qualifying';
      const label = PROJECT_LABELS[projectType] || 'tu proyecto';
      return pick([
        `¡Hola ${firstName}! 👋 Soy Mariana, asistente de Fermín en Fractal MX.\n\nEntendido — buscas apoyo con *${label}* y nos llegaste por recomendación. ¡Perfecto!\n\n${budget ? `Vi que tienes un presupuesto de *$${budget.toLocaleString('es-MX')} MXN*.` : '¿Tienes un presupuesto aproximado o fecha límite en mente?'}`,
        `¡Qué gusto, ${firstName}! 👋 Soy Mariana de Fractal MX.\n\n*${label}* es algo en lo que somos muy buenos 💪 Ya tengo tu contexto — ¿me compartes si tienes un presupuesto y fecha en mente para arrancar?`,
      ]);
    }

    // Trajo necesidad pero no fuente
    if (conv.need) {
      const label = PROJECT_LABELS[projectType] || 'tu proyecto';
      return `¡Hola ${firstName}! 👋 Soy Mariana, asistente de Fermín en Fractal MX.\n\nVi que te interesa *${label}* — es algo que hacemos muy bien 💪\n\nAntes de contarte más, ¿cómo nos conociste?`;
    }

    // Solo saludo o mensaje genérico
    return pick([
      `¡Hola ${firstName}! 👋 Soy Mariana, asistente de Fermín Monroy en Fractal MX.\n\n¿Cómo nos conociste? 😊`,
      `¡Qué tal, ${firstName}! 👋 Soy Mariana, de Fractal MX. ¿Nos conociste por redes, recomendación o de otra forma?`,
    ]);
  }

  if (state === 'asked_source') {
    if (!conv.source) conv.source = text;
    if (!conv.need && looksLikeNeed(text)) conv.need = text;
    conv.state = conv.need ? 'qualifying' : 'asked_need';

    const sourceAck = looksLikeSource(text)
      ? pick(['¡Qué bueno saberlo! 🙌 ', '¡Genial! Las referencias son lo que más valoramos 🙏 ', ''])
      : pick(['¡Gracias por contarme! 😊 ', 'Perfecto, ']);

    if (conv.need) {
      const label = PROJECT_LABELS[projectType] || conv.need;
      return `${sourceAck}Ya mencionaste que buscas *${label}*.\n\n¿Tienes fecha límite o presupuesto en mente? Así le doy más contexto a Fermín 📋`;
    }

    return `${sourceAck}¿En qué te podemos ayudar, ${firstName}? Cuéntame sobre tu proyecto o negocio 🙌`;
  }

  if (state === 'asked_need') {
    if (!conv.need) conv.need = text;
    conv.state = 'qualifying';

    const label = PROJECT_LABELS[projectType] || text;

    if (projectType === 'branding') {
      return `Branding es el corazón de todo, ${firstName} 💪\n\n¿Partes desde cero (sin logo ni identidad) o quieres renovar lo que ya tienes?`;
    }
    if (projectType === 'web') {
      return `Una buena página web puede cambiar completamente cómo te perciben, ${firstName} 🌐\n\n¿Es para mostrar servicios, vender en línea o generar leads?`;
    }
    if (projectType === 'ads') {
      return `Campañas bien ejecutadas generan resultados reales 📈\n\n¿Ya tienes cuenta de Meta/Google Ads o arrancamos desde cero? ¿Y qué presupuesto mensual manejarías?`;
    }
    if (budget) {
      return `Perfecto — con *$${budget.toLocaleString('es-MX')} MXN* hay varias opciones para *${label}* 💡\n\n¿Tienes fecha límite?`;
    }

    return `Perfecto, *${label}* es algo en lo que somos muy buenos, ${firstName} 🚀\n\n¿Tienes un presupuesto aproximado y fecha en mente?`;
  }

  if (state === 'qualifying') {
    conv.state = 'closing';

    const summaryParts = [];
    if (conv.need) summaryParts.push(`proyecto de *${PROJECT_LABELS[projectType] || conv.need}*`);
    if (budget) summaryParts.push(`presupuesto $${budget.toLocaleString('es-MX')} MXN`);
    if (timeline) summaryParts.push(`fecha: ${timeline}`);

    const summary = summaryParts.length ? summaryParts.join(', ') : 'tu proyecto';

    return pick([
      `Perfecto, ${firstName} 🙏 Tengo todo lo que necesito: ${summary}.\n\nLe comparto todo a Fermín para que te prepare una propuesta personalizada. ¿Prefieres que te contacte por aquí o por llamada?`,
      `¡Anotado, ${firstName}! Con esa info — ${summary} — Fermín puede prepararte algo muy bien dirigido 🎯\n\n¿Cuándo es buen momento para que te llame?`,
    ]);
  }

  if (state === 'closing' || state === 'escalated') {
    if (/whatsapp|aqui|aquí|mensaje|chat|por aqu[ií]/i.test(text)) {
      return `Perfecto, ${firstName} 📲 Fermín te escribe por aquí a la brevedad. ¡Que tengas excelente día!`;
    }
    if (/llam|tel[eé]fono|llamen|llamada/i.test(text)) {
      return `Anotado 📞 ¿Tienes preferencia de horario? Fermín es muy puntual.`;
    }
    if (timeline) {
      return `Guardado — ${timeline} como fecha referencia 📅 Fermín te contactará con tiempo para que llegues tranquilo.`;
    }
    if (intent === 'thanks') {
      return pick([
        `¡Con mucho gusto, ${firstName}! 😊 Fue un placer. Fermín te escribe pronto. ¡Éxito con todo!`,
        `¡Gracias a ti, ${firstName}! 🙌 Que tengas excelente día. Fermín estará en contacto.`,
      ]);
    }
    return pick([
      `Recibido, ${firstName} 👍 Le hago saber a Fermín. ¿Hay algo más que quieras agregar antes de que él te contacte?`,
      `Perfecto, ${firstName}. Fermín tiene todo lo que necesita. ¿Algo más?`,
    ]);
  }

  // Fallback
  return `Entendido, ${firstName} 😊 ¿Hay algo más en lo que pueda ayudarte?`;
}

module.exports = { buildResponse };
