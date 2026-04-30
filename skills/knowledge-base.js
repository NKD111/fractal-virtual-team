/**
 * Base de conocimiento de Fractal MX.
 * Mariana usa esto para resolver dudas sin tener que escalar a Fer.
 */

// ─── Servicios y precios aproximados ─────────────────────────────────────────
const SERVICES = {
  branding: {
    label:       'Branding & Identidad Visual',
    description: 'Logo, paleta de color, tipografía, manual de marca, papelería y aplicaciones. Desde cero o renovación.',
    includes:    ['Investigación de mercado', 'Naming (si se necesita)', 'Logo + variaciones', 'Manual de marca', 'Aplicaciones (redes, plantillas, merch)'],
    price_range: { min: 15000, max: 80000 },
    timeline:    '2 a 4 semanas según alcance',
    best_for:    'Negocios que arrancan, marcas que quieren renovar, empresas que buscan profesionalizarse',
  },
  reels: {
    label:       'Reels & Contenido Corto',
    description: 'Producción, edición y estrategia de reels para Instagram y TikTok.',
    includes:    ['Guión o concepto', 'Filmación (si aplica)', 'Edición profesional', 'Captions y hashtags', 'Calendario de publicación'],
    price_range: { min: 8000, max: 28000 },
    timeline:    '3 a 7 días por pieza',
    best_for:    'Marcas con producto o servicio visual, restaurantes, moda, lifestyle, coaches',
  },
  web: {
    label:       'Página Web & Landing Pages',
    description: 'Diseño y desarrollo de sitios web, landings de conversión y e-commerce básico.',
    includes:    ['Diseño UX/UI', 'Desarrollo responsive', 'SEO básico', 'Integración de formularios/pagos', 'Capacitación para editar'],
    price_range: { min: 20000, max: 120000 },
    timeline:    '3 a 6 semanas',
    best_for:    'Negocios sin presencia digital, marcas que quieren vender en línea, profesionistas independientes',
  },
  social_media: {
    label:       'Manejo de Redes Sociales',
    description: 'Gestión mensual de Instagram, TikTok o LinkedIn. Contenido, publicación y comunidad.',
    includes:    ['Estrategia mensual', 'Diseño de posts y stories', 'Reels incluidos', 'Gestión de comentarios', 'Reporte mensual de resultados'],
    price_range: { min: 12000, max: 35000 },
    timeline:    'Inicio en 7 días, contrato mensual',
    best_for:    'Negocios que no tienen tiempo de manejar sus redes, marcas que quieren crecer orgánico',
  },
  ads: {
    label:       'Campañas Publicitarias',
    description: 'Meta Ads (Facebook/Instagram) y Google Ads. Estrategia, configuración, optimización y reportes.',
    includes:    ['Estrategia de campaña', 'Diseño de creativos', 'Configuración y segmentación', 'Optimización semanal', 'Reporte mensual'],
    price_range: { min: 8000, max: 22000 },
    note:        'El presupuesto de pauta va aparte (mínimo recomendado $5,000 MXN/mes)',
    timeline:    'Primera campaña en 5-7 días',
    best_for:    'Negocios que quieren resultados rápidos, lanzamientos, e-commerce',
  },
  strategy: {
    label:       'Estrategia de Marketing Digital',
    description: 'Diagnóstico completo + plan de acción para posicionar la marca en digital.',
    includes:    ['Análisis de competencia', 'Definición de buyer persona', 'Estrategia de contenido', 'Plan de medios', 'Roadmap de 3-6 meses'],
    price_range: { min: 12000, max: 40000 },
    timeline:    '1 a 2 semanas',
    best_for:    'Negocios que no saben por dónde empezar, marcas que quieren escalar',
  },
  photography: {
    label:       'Fotografía Profesional',
    description: 'Sesiones de producto, lifestyle, gastronomía o marca personal.',
    includes:    ['Concepto y moodboard', 'Sesión (medio día o día completo)', 'Edición profesional', '30-60 fotos entregables'],
    price_range: { min: 5000, max: 25000 },
    timeline:    '3 a 5 días de entrega post-sesión',
    best_for:    'Restaurantes, marcas de producto, marcas personales, e-commerce',
  },
};

// ─── Proceso de trabajo ────────────────────────────────────────────────────────
const PROCESS = [
  '1. Llamada de kick-off con Fer para entender a fondo el proyecto',
  '2. Propuesta personalizada en 24-48 horas',
  '3. Aprobación y firma de brief',
  '4. Producción / desarrollo según tiempos pactados',
  '5. Revisiones (2 rondas incluidas en todos los proyectos)',
  '6. Entrega final y seguimiento post-entrega',
];

// ─── FAQ — preguntas más comunes y sus respuestas ────────────────────────────
const FAQ = {
  pago: `Manejamos 50% de anticipo y 50% a la entrega. Para proyectos grandes podemos armar un plan de pagos. Aceptamos transferencia y tarjeta.`,
  contrato: `Sí, siempre manejamos un brief/contrato donde quedan claros alcances, tiempos y entregables. Nada queda en el aire.`,
  revisiones: `Todos los proyectos incluyen 2 rondas de revisión sin costo adicional. Revisiones extra se cotizan aparte.`,
  archivos: `Entregamos todo en los formatos que necesites — AI, PDF, PNG, MP4. Los archivos fuente son tuyos.`,
  garantia: `Si no quedas satisfecho en la primera revisión, lo vemos juntos hasta que quede bien. Nuestro objetivo es que salgas feliz.`,
  urgente: `Manejamos proyectos urgentes con un cargo extra por fast track. Depende de la disponibilidad del equipo, pero generalmente sí podemos.`,
  referencias: `Sí, tenemos portafolio de proyectos anteriores. Fer te lo puede mandar directo con casos de tu industria.`,
  paquetes: `No manejamos paquetes fijos — todo es a la medida según lo que necesita cada cliente. Así nos aseguramos de no cobrar de más ni de menos.`,
  equipo: `Somos un equipo pequeño pero muy especializado. Diseñadores, videógrafos, estrategas y desarrolladores, todos coordinados por Fer.`,
  redes_que_manejan: `Principalmente Instagram, TikTok y LinkedIn. También Facebook y YouTube según el proyecto.`,
};

// ─── Resolver duda del cliente ────────────────────────────────────────────────
function resolveQuestion(text) {
  const t = text.toLowerCase();

  if (/pago|pagar|anticipo|abono|transfer|tarjeta|cuotas|plan de pago/i.test(t))        return FAQ.pago;
  if (/contrato|brief|acuerdo|firmamos|legal|documento/i.test(t))                        return FAQ.contrato;
  if (/revision|cambio|modificar|ajuste|no me gust/i.test(t))                            return FAQ.revisiones;
  if (/archivo|formato|ai\b|pdf|png|fuente|editable/i.test(t))                           return FAQ.archivos;
  if (/garant[ií]a|si no me gusta|si queda mal|si no funciona/i.test(t))                 return FAQ.garantia;
  if (/urgente|r[aá]pido|express|fast|ahorita|ya|cuanto antes/i.test(t))                 return FAQ.urgente;
  if (/portafolio|portfolio|ejemplos|trabajos|casos|referencias/i.test(t))               return FAQ.referencias;
  if (/paquete|plan|combo|todo incluido/i.test(t))                                        return FAQ.paquetes;
  if (/equipo|qui[eé]nes son|cu[aá]ntos son|tienen dise[nñ]ador|tienen equipo/i.test(t)) return FAQ.equipo;
  if (/qu[eé] redes|instagram|tiktok|linkedin|facebook|youtube/i.test(t))                return FAQ.redes_que_manejan;

  return null;
}

// ─── Obtener info de un servicio ──────────────────────────────────────────────
function getServiceInfo(projectType) {
  return SERVICES[projectType] || null;
}

// ─── Rango de precio legible ──────────────────────────────────────────────────
function priceRange(projectType) {
  const s = SERVICES[projectType];
  if (!s) return null;
  return `$${s.price_range.min.toLocaleString('es-MX')} a $${s.price_range.max.toLocaleString('es-MX')} MXN`;
}

module.exports = { SERVICES, PROCESS, FAQ, resolveQuestion, getServiceInfo, priceRange };
