/**
 * Intent extractor v2 — extrae entidades estructuradas Y clasifica intención.
 */

// ─── Entity extraction (existente, mejorado) ──────────────────────────────────
function extractProjectType(text) {
  const t = text.toLowerCase();
  if (/\b(video|v[ií]deo)\s*(4k|hd|fullhd|institucional)?\b/.test(t)) return 'video_4k';
  if (/\breels?\b|\btiktoks?\b|\bshorts?\b/.test(t)) return 'reels';
  if (/parrilla|calendario|cronograma de contenido|plan de contenido/.test(t)) return 'content_calendar';
  if (/branding|identidad (visual|de marca)|logo|logotipo|brand book|manual de marca/.test(t)) return 'branding';
  if (/estrategia|content strategy|plan de marketing|posicionamiento/.test(t)) return 'strategy';
  if (/foto(graf[íi]a|s)?\b|sesi[oó]n\s+fot/.test(t)) return 'photography';
  if (/animaci[oó]n|motion graphics|after effects/.test(t)) return 'motion';
  if (/web|p[aá]gina|landing|sitio/.test(t)) return 'web';
  if (/redes sociales|social media|manejo de redes|community/.test(t)) return 'social_media';
  if (/publicidad|ads|campañas|facebook ads|google ads|paid/.test(t)) return 'ads';
  return null;
}

function extractObjective(text) {
  const t = text.toLowerCase();
  if (/venta|conversi[oó]n|vender|leads?\b/.test(t)) return 'conversions';
  if (/marca|brand awareness|reconocimiento|posicion/.test(t)) return 'brand_awareness';
  if (/engagement|interacci[oó]n|comunidad|seguidores/.test(t)) return 'engagement';
  if (/viral|alcance|reach/.test(t)) return 'viral_growth';
  if (/educa(r|ci[oó]n)|informar|explicar/.test(t)) return 'education';
  return null;
}

function extractTimeline(text) {
  const dateRx = /\b(?:el |para el |antes del |para |antes de )?\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;
  const dayRx = /\b(?:el |para el |este )?\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;
  const relRx = /\ben\s+(\d+)\s+(d[íi]as?|semanas?|meses?)\b/i;
  const urgentRx = /\b(urgente|ya|ahora|hoy|cuanto antes|asap|lo m[aá]s pronto)\b/i;
  const m = text.match(dateRx) || text.match(dayRx) || text.match(relRx);
  if (m) return m[0];
  if (urgentRx.test(text.toLowerCase())) return 'urgente';
  return null;
}

function extractBudgetMxn(text) {
  const m = text.toLowerCase().replace(/[\$,]/g, '');
  const candidates = [];
  for (const match of m.matchAll(/(\d{1,4})\s*(k|mil)\b/g)) {
    candidates.push({ value: parseInt(match[1], 10) * 1000, idx: match.index });
  }
  for (const match of m.matchAll(/\b(\d{4,7})\b/g)) {
    candidates.push({ value: parseInt(match[1], 10), idx: match.index });
  }
  if (!candidates.length) return null;
  const anchorRx = /\b(presupuesto|budget|inversi[oó]n|costo|cuesta|precio|cobrar)\b/g;
  const anchors = [];
  for (const a of m.matchAll(anchorRx)) anchors.push(a.index);
  if (anchors.length) {
    let best = null;
    for (const c of candidates) {
      for (const a of anchors) {
        const dist = c.idx - a;
        if (dist > 0 && dist <= 40 && (!best || dist < best.dist)) best = { ...c, dist };
      }
    }
    if (best) return best.value;
  }
  return Math.max(...candidates.map(c => c.value));
}

function extractUrgency(text) {
  const t = text.toLowerCase();
  if (/\b(urgente|ya|ahora|hoy|cuanto antes|asap|lo m[aá]s pronto)\b/.test(t)) return 'high';
  if (/\b(esta semana|esta quincena|pronto)\b/.test(t)) return 'medium';
  return 'low';
}

function extractReferences(text) {
  const urls = text.match(/\bhttps?:\/\/\S+/gi);
  if (urls && urls.length) return urls.join(' | ');
  if (/freepik|pinterest|behance|drive\.google|imgur|dribbble/i.test(text)) return text;
  return null;
}

// ─── Intent classification (nuevo) ────────────────────────────────────────────
const INTENT_PATTERNS = [
  // Objeciones
  { name: 'objection_price',      rx: /\b(caro|caros|muy caro|no tengo (presupuesto|dinero|lana|feria)|est[aá] pesado|no me alcanza|fuera de mi presupuesto|est[aá] muy alto|reduce|descuento|negociar)\b/ },
  { name: 'objection_thinking',   rx: /\b(lo pienso|lo voy a pensar|me lo pienso|déjame pensar|deja lo pienso|lo consulto|tengo que ver|no s[eé] si|no estoy segur|lo que pasa es que)\b/ },
  { name: 'objection_competitor', rx: /\b(ya tengo|ya trabajo|tengo agencia|tengo alguien|tenemos proveedor|tenemos diseñador|lo hace mi sobrino|ya lo hace|tengo quien)\b/ },
  { name: 'objection_time',       rx: /\b(no es el momento|ahorita no|m[aá]s adelante|despu[eé]s|otro momento|no tengo tiempo|ahorita estoy ocupado|en otro momento)\b/ },
  // FAQs
  { name: 'faq_services',         rx: /\b(qu[eé] hacen|qu[eé] ofrecen|en qu[eé] se especializan|a qu[eé] se dedican|qu[eé] servicios|cu[aá]les son sus servicios|qu[eé] pueden hacer|me puedes explicar)\b/ },
  { name: 'faq_portfolio',        rx: /\b(portafolio|portfolio|ejemplos|trabajos anteriores|casos [eé]xito|qu[eé] han hecho|con qui[eé]nes han trabajado|referencias|puedo ver|tienen trabajos)\b/ },
  { name: 'faq_timeline',        rx: /\b(cu[aá]nto (tiempo|tardan|se tarda)|en cu[aá]nto tiempo|plazos|tiempo de entrega|cu[aá]ndo estar[ií]a listo)\b/ },
  // Positivo / avanzar
  { name: 'ready',                rx: /\b(me interesa|s[ií] quiero|quiero cotizar|cotizaci[oó]n|me late|dale|vamos|adelante|empezamos|c[oó]mo empezamos)\b/ },
  { name: 'contact_fermin',       rx: /\b(fermin|fermín|con quien|hablar con alguien|con la persona|necesito hablar|quiero hablar|dame un contacto|su n[uú]mero)\b/ },
  { name: 'greeting',             rx: /^(hola|buenos|buenas|hey|ey|qu[eé] tal|hi|buen d[ií]a)\b/ },
  { name: 'thanks',               rx: /\b(gracias|thank|perfecto|excelente|genial|listo|dale|de acuerdo|entendido)\b/ },
  { name: 'media',                rx: /^\s*$/ },  // cuerpo vacío = media
];

function classifyIntent(text) {
  const t = (text || '').toLowerCase().trim();
  for (const { name, rx } of INTENT_PATTERNS) {
    if (rx.test(t)) return name;
  }
  return 'unknown';
}

function extract(text) {
  if (!text || typeof text !== 'string') return {};
  return {
    projectType: extractProjectType(text),
    objective:   extractObjective(text),
    timeline:    extractTimeline(text),
    budget:      extractBudgetMxn(text),
    urgency:     extractUrgency(text),
    references:  extractReferences(text),
    intent:      classifyIntent(text),
  };
}

module.exports = { extract, classifyIntent };
