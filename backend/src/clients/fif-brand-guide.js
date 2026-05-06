// backend/src/clients/fif-brand-guide.js
// BLOQUE R — Sistema de marca completo FIF/EFG
// Disponible para todos los agentes: CARLOS, DIEGO, ALEX, VALENTINA, NEXUS
// Fuente: Brand Guide oficial resultado de meses de trabajo con el cliente

const FIF_BRAND_GUIDE = {

  cliente: {
    eventos: ['FIF', 'Expo Franquicias', 'EFG', 'FIF Summit'],
    concepto: 'Evento profesional de franquicias, inversión, emprendimiento, networking, expansión.',
    slogan_efg: 'Donde las oportunidades se crean',
    slogan_fif: 'Encuentra tu próximo negocio',
    personalidad: 'profesional, aspiracional, confiable, institucional, comercial, moderna, cercana al emprendedor mexicano',
    entrega_a: 'Claudia — Central Interactiva',
    nota_critica: 'NUNCA entregar directamente a Luis Tendero. Solo a Claudia.'
  },

  colores: {
    rojo: '#C8102E',
    rojo_alt: '#D7193F',
    navy: '#1B263B',
    navy_alt: '#243044',
    navy_profundo: '#18233A',
    blanco: '#FFFFFF',
    gris_claro: '#F3F5F7',
    gris_texto: '#6B7280',
    azul_medio: '#2E7DBD',
    azul_modulos: '#2F80C8',
    azul_degradado_start: '#2F9BDA',
    azul_degradado_end: '#2554A4',
    uso: {
      blanco: 'base limpia, banners web, zonas de info',
      rojo: 'acentos fuertes, fechas, CTAs, urgencia',
      navy: 'textos fuertes, fondos premium, estructura',
      azules_medios: 'cápsulas, módulos, badges',
      grises: 'aire, profundidad, limpieza visual'
    }
  },

  tipografia: {
    principal: 'Gotham',
    fallbacks: ['Montserrat', 'Avenir Next', 'Proxima Nova', 'Poppins', 'Inter'],
    uso: {
      headline: 'Gotham Bold / Black / Ultra',
      subtitulo: 'Gotham Medium / Book',
      cuerpo: 'Gotham Book / Regular',
      cta: 'Gotham Bold',
      datos: 'Gotham Bold UPPERCASE'
    },
    reglas: [
      'No mezclar demasiadas fuentes',
      'No usar script, manuscrita, gamer, futurista',
      'Para producción final: montar texto en Photoshop/Canva/Illustrator',
      'No depender 100% del texto generado por IA'
    ]
  },

  tono: {
    general: 'profesional, aspiracional, directo, comercial, dinámico, claro, con autoridad',
    por_publico: {
      visitantes: 'cercano, motivador, aspiracional',
      expositores: 'comercial, estratégico, B2B',
      summit: 'premium, ejecutivo, liderazgo',
      vip: 'exclusivo, sofisticado, alto nivel',
      estudiantes: 'fresco, inspirador, profesional joven',
      prensa: 'dinámico, documental, profesional'
    }
  },

  templates: {
    comercial_conversion: {
      id: 1,
      nombre: 'Template 1: Comercial / Conversión',
      uso: ['registro', 'fases de precio', 'free pass', 'summit', 'aparta stand', 'CTA fuerte'],
      estructura: 'headline fuerte + precio/beneficio destacado + CTA visible + fecha + imagen aspiracional + módulos de info breve',
      ejemplos: ['Ya abrió la Fase 1', 'Aparta tu stand', 'Free Pass acceso general']
    },
    informativo_beneficios: {
      id: 2,
      nombre: 'Template 2: Informativo / Beneficios',
      uso: ['qué encontrarás', 'razones para asistir', 'perfiles', 'sectores', 'beneficios expositores'],
      estructura: 'headline editorial + imagen protagonista + 3-5 bullets con iconos + CTA secundario + fecha o URL',
      ejemplos: ['Lo que encontrarás en FIF', '5 razones para visitar Expo Franquicias']
    },
    editorial_impacto: {
      id: 3,
      nombre: 'Template 3: Editorial / Impacto',
      uso: ['piezas premium', 'storytelling', 'campañas aspiracionales', 'marca'],
      estructura: 'más aire visual + menos texto + headline poderoso + foto protagonista + composición tipo revista',
      ejemplos: ['Las oportunidades no se esperan.', 'El negocio que buscas puede estar aquí.']
    },
    banner_web: {
      id: 4,
      nombre: 'Template 4: Banner Web EFG',
      uso: ['banners horizontales web', 'email marketing', 'redes horizontales'],
      estructura: 'izquierda: zona blanca COMPLETAMENTE limpia | derecha: foto perfil | fade suave',
      reglas: [
        'Lado izquierdo: sin rayas, sin patrones, sin NADA — solo información montada en post-producción',
        'Logos de aval: esquina sup derecha en recuadro translúcido blanco',
        'NO tapar rostros con logos',
        'En speakers: NO colocar cara en esquina superior derecha',
        'Adornos geométricos solo en esquinas secundarias'
      ],
      perfiles: ['estudiantes', 'VIP', 'prensa', 'summit', 'conferencista', 'expositores', 'visitantes', 'franquiciantes']
    }
  },

  formatos: [
    { nombre: 'Post cuadrado', dimensiones: '1080x1080px', ratio: '1:1' },
    { nombre: 'Post vertical', dimensiones: '1080x1350px', ratio: '4:5', principal: true },
    { nombre: 'Story/Reel cover', dimensiones: '1080x1920px', ratio: '9:16' },
    { nombre: 'Banner web horizontal', dimensiones: 'ancho variable', ratio: 'horizontal' },
    { nombre: 'Carrusel informativo', dimensiones: '1080x1350px cada slide', notas: 'serie coherente' },
    { nombre: 'Background sin texto', dimensiones: '1080x1350px', notas: 'para post-producción en Photoshop' }
  ],

  protagonistas: {
    visitantes: 'caminando por pasillos, gafete, tablet, libreta, revisando stands',
    expositores: 'hablando en stands, networking B2B, stand profesional con marca genérica',
    summit: 'speaker en escenario, audiencia profesional, pantalla grande, iluminación',
    conferencista: 'ponente con mic, escenario formal, público secundario',
    vip: 'grupo ejecutivo, vestimenta premium, recorrido expo, networking de alto nivel',
    prensa: 'fotógrafo/videógrafo como protagonista, cámaras profesionales, cobertura activa',
    estudiantes: 'jóvenes profesionales, tablets, mochilas discretas, energía fresca'
  },

  prohibido: [
    'Copiar literalmente Expo Mobility',
    'Verde neón como color principal',
    'Estética biker, gamer, cyberpunk',
    'Motos, scooters o vehículos',
    'Saturar de glows eléctricos',
    'Fondos muy oscuros en piezas institucionales',
    'Encimar texto importante sobre imágenes complejas',
    'Deformar logos o inventar logos raros',
    'Generar texto final con IA si puede quedar mal',
    'Rostros deformes o manos deformes',
    'Repetir personas en la misma escena',
    'Modelos que parezcan extranjeros (no LATAM)',
    'Stock genérico sin intención',
    'Texto encima de caras',
    'Elementos importantes en esquinas reservadas para logos',
    'Diseños tipo flyer barato',
    'Tipografías random',
    'Colores fuera de marca sin justificación',
    'Sobrecargar con rombos o adornos',
    'Perder jerarquía visual'
  ],

  elementos_graficos: {
    permitidos: [
      'Cápsulas redondeadas', 'Badges de fecha', 'Cajas informativas',
      'Tarjetas con borde suave', 'Iconos lineales', 'Separadores horizontales',
      'Líneas curvas', 'Tramas de puntos', 'Rombos institucionales',
      'Degradados suaves', 'Plecas limpias', 'Bloques editoriales',
      'Marcos blancos translúcidos para logos', 'Sombras suaves', 'Fades entre imagen y fondo'
    ],
    iconografia: {
      estilo: 'lineales, simples, funcionales, institucionales — en azul/rojo/blanco',
      temas_utiles: ['personas/networking', 'gráfica crecimiento', 'stand/booth', 'micrófono',
                     'ticket/registro', 'ubicación', 'calendario', 'maletín',
                     'franquicia/tienda', 'handshake', 'cámara/prensa', 'birrete estudiantes']
    }
  },

  jerarquia_obligatoria: ['Logo / marca', 'Headline principal', 'Subheadline / beneficio',
    'Información clave', 'CTA', 'Fecha / sede / URL', 'Logos de respaldo'],

  prompts: {
    base_arte: `Premium editorial-commercial franchise expo campaign design.
Clean white or very light gray background (#F3F5F7). Strong visual hierarchy.
Navy #1B263B and institutional red #C8102E as main brand colors.
White #FFFFFF and light gray #F3F5F7 as backgrounds.
Azul medio #2E7DBD only as secondary accent in modules and badges.
High-end corporate magazine layout, aspirational Mexican franchise business campaign.
Clean modular composition, structured information blocks, rounded icon cards.
Thin separator lines, soft curved lines, subtle dot patterns.
Geometric diamond accents in navy and red. Premium white space.
Strong typographic hierarchy similar to Gotham or Montserrat bold.
NEVER: neon, cyberpunk, biker aesthetics, glitch effects, chaotic compositions,
excessive gradients, dark moody backgrounds, distorted text, fake logos,
messy typography, overlaid text on faces, low-quality stock photo style,
random colors outside brand palette, green neon, motorcycle aesthetics.`,

    fotografia: `Realistic high-quality expo hall photography.
Modern professional franchise expo in Mexico City.
Professional Mexican and Latin American business audience.
Entrepreneurs, investors, franchise owners and consultants networking.
Premium booths in navy, white and red. Warm professional lighting.
Natural faces, no distortions, no deformed hands.
Aspirational commercial photography quality. Sharp details. Cinematic but clean.
No foreigners — Mexican/LATAM protagonists only.`,

    banner_web: `Ultra-wide horizontal website banner for franchise expo.
LEFT 45%: COMPLETELY CLEAN white space. NO text, NO patterns, NO stripes, NO graphic elements.
This left area will have text mounted manually in post-production.
RIGHT 55%: realistic high-quality expo photography of [PROFILE].
Soft fade gradient transition between white and photo.
Important faces must NOT be in upper-right corner (reserved for sponsor logos).
Subtle geometric accents (diamond shapes, thin lines) only in secondary corners.
Clean, professional, premium corporate feel.`,

    carousel_serie: `This is slide [N] of a coordinated [N]-slide Instagram carousel series for FIF.
All slides must share the same visual style and color palette for series coherence.
Clean white background. Navy #1B263B and red #C8102E. Modular composition.
Each slide different composition but unmistakably the same campaign.`
  },

  // Formulario interno que todo agente debe completar antes de diseñar
  formulario_arte: {
    campos: [
      { campo: 'evento', opciones: ['FIF', 'EFG', 'EF', 'Summit', 'otro'] },
      { campo: 'publico', opciones: ['visitante', 'expositor', 'estudiante', 'VIP', 'prensa', 'conferencista', 'inversionista'] },
      { campo: 'objetivo', opciones: ['registro', 'awareness', 'conversión', 'información', 'venta_stand', 'posicionamiento'] },
      { campo: 'formato', opciones: ['post_4x5', 'banner_web', 'story', 'carousel', 'fondo_sin_texto'] },
      { campo: 'mensaje_principal', tipo: 'text' },
      { campo: 'mensaje_secundario', tipo: 'text' },
      { campo: 'datos_obligatorios', tipo: 'text', nota: 'fecha, sede, costo, URL, fase, CTA, logos' },
      { campo: 'imagen_protagonista', tipo: 'text', nota: 'descripción precisa del perfil' },
      { campo: 'estilo', opciones: ['comercial', 'informativo', 'editorial', 'banner_limpio'] },
      { campo: 'template_tipo', opciones: ['Template 1', 'Template 2', 'Template 3', 'Template 4'] },
      { campo: 'elementos_graficos', tipo: 'list', nota: 'badges, cápsulas, iconos, módulos, líneas, rombos' },
      { campo: 'restricciones', tipo: 'list', nota: 'qué no debe aparecer, zonas que deben quedar limpias' },
      { campo: 'salida_esperada', opciones: ['imagen_con_texto', 'sin_texto', 'background_editable', 'prompt_para_ia'] }
    ]
  }
};

// Reglas IA específicas para generación
const FIF_IA_RULES = {
  con_texto: [
    'Poco texto, grande y simple',
    'Revisar errores tipográficos al revisar resultado',
    'Si texto sale raro → pedir versión sin texto y montar en PS'
  ],
  background_editable: [
    'Dejar zonas LIMPIAS para montaje de texto',
    'No poner texto ni logos falsos en la imagen',
    'Mantener composición similar al layout final',
    'Respetar zonas seguras para plecas y logos'
  ],
  banners_web: [
    'Generar imagen BASE sin textos',
    'El texto final se monta manualmente en Photoshop/Canva',
    'Imagen del lado derecho NO invade área izquierda',
    'Fade suave entre blanco e imagen'
  ]
};

module.exports = { FIF_BRAND_GUIDE, FIF_IA_RULES };
