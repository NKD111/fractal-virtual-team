// backend/src/clients/fif-brand-system.js
// Brand System completo para FIF / Vanexpo / EF / EFG.
// Leído por todos los agentes creativos antes de generar cualquier pieza.

const FIF_BRAND_SYSTEM = {

  client: {
    name: 'Feria Internacional de Franquicias',
    family: 'EF / FIF / Expo Franquicias / EFG',
    contact: 'Luis Manuel Díaz (Luis Tendero)',
    account_manager: 'NKD / Fermín Monroy',
    revisions: 'ilimitadas',
    monthly_price_usd: 1000,
    parrilla_delivery_day: 20,
    content_recipient: 'Claudia - Central Interactiva'
  },

  parrilla: {
    pieces_per_month: { min: 8, max: 10 },
    mix: {
      images: '70%',
      videos: '30%'
    },
    types: [
      'Arte publicitario (conversión/registro)',
      'Infografía (educativa/informativa)',
      'Carrusel (educativo/tendencias)',
      'Reel cinematográfico (aspiracional)',
      'Arte de fase de registro (comercial)'
    ],
    distribution: 'Inteligente a lo largo del mes',
    deadline: 'Día 20 de cada mes',
    review_process: 'Doble revisión interna antes de NKD'
  },

  identity: {
    slogan_principal: 'Donde las oportunidades se crean',
    slogan_fif: 'Encuentra tu próximo negocio',
    personality: [
      'Profesional', 'Aspiracional', 'Confiable',
      'Institucional', 'Comercial', 'Moderno',
      'Cercano al emprendedor mexicano'
    ]
  },

  colors: {
    red: '#C8102E',
    red_alt: '#D7193F',
    navy: '#1B263B',
    navy_alt: '#243044',
    white: '#FFFFFF',
    gray_light: '#F3F5F7',
    gray_mid: '#6B7280',
    blue_mid: '#2E7DBD',
    blue_alt: '#2F80C8',
    blue_gradient: 'from #2F9BDA to #2554A4'
  },

  typography: {
    primary: 'Gotham',
    weights: {
      headlines: 'Bold / Black / Ultra',
      subtitles: 'Medium / Book',
      body: 'Book / Regular',
      cta: 'Bold / Black',
      data: 'Bold uppercase'
    },
    fallbacks: ['Montserrat', 'Avenir Next', 'Proxima Nova', 'Poppins', 'Inter'],
    never_use: ['Script', 'Manuscritas', 'Gamer', 'Futuristas', 'Condensadas extremas']
  },

  audiences: [
    'Visitantes', 'Expositores', 'Summit', 'Conferencistas',
    'VIP', 'Prensa', 'Estudiantes', 'Franquiciantes',
    'Inversionistas', 'Emprendedores', 'Proveedores'
  ],

  delivery_types: {
    digital: [
      'Banner web horizontal',
      'Post cuadrado 1080x1080',
      'Post vertical 1080x1350',
      'Story/Reel cover 1080x1920',
      'Mailing',
      'Carrusel informativo',
      'Arte por perfil de visitante',
      'Arte para expositores',
      'Arte fases de registro'
    ],
    print: [
      'Gafetes', 'Lonas', 'Viniles de piso',
      'Áreas de registro', 'Flyers de ventas',
      'Material impreso expo completo'
    ]
  },

  composition_rules: {
    always: [
      'Jerarquía: Logo→Headline→Sub→Info→CTA→Fecha→Logos',
      'Módulos para respirar la información',
      'Cápsulas y badges antes que texto suelto',
      'Separar áreas de texto y áreas de imagen',
      'Espacio seguro para logos y plecas',
      'Fade suave entre imagen y fondo blanco en banners'
    ],
    never: [
      'Verde neón como color principal',
      'Estética biker, gamer, cyberpunk',
      'Motos, scooters o vehículos',
      'Glows excesivos',
      'Texto sobre zonas de imagen compleja',
      'Rostros o manos deformes',
      'Personas que parezcan extranjeras al contexto MX/LATAM',
      'Stock genérico sin intención',
      'Rayas o patrones en área blanca de banners',
      'Logos tapando caras',
      'Tipografías random',
      'Diseño tipo Canva genérico',
      'Flyer barato',
      'Corporativo viejo y aburrido'
    ]
  },

  banner_web_rules: {
    structure: 'Izquierda blanco limpio + Derecha foto realista con fade',
    left_side: [
      'Fondo blanco completamente limpio',
      'Logo EF/EFG grande arriba',
      'Slogan debajo del logo',
      'Fecha en cápsula roja',
      'Cápsula azul degradada con categoría del visitante',
      'CTA inferior con URL completa'
    ],
    right_side: [
      'Fotografía realista de alta calidad',
      'Perfil específico solicitado',
      'Personas mexicanas/LATAM naturales',
      'Ambiente de centro de convenciones profesional'
    ],
    top_right: [
      'Logos de aval en recuadro blanco translúcido',
      'Nunca tapar rostros con logos',
      'Adornos geométricos sutiles en esquinas'
    ]
  },

  quality_standard: {
    price_reference: '$1,000 USD/mes',
    mandatory_question: '¿Esto justifica $1,000 USD/mes?',
    per_piece_standard: '$100-125 USD de valor por pieza',
    if_doubt: 'REHACER - no hay término medio en este cliente'
  },

  master_prompt: `
Eres director de arte y diseñador senior para EF / FIF / Expo Franquicias / EFG.

Este cliente paga $1,000 USD/mes por 8-10 piezas. Cada pieza tiene un valor
de $100-125 USD. El estándar es de agencia creativa premium CDMX.

La línea visual debe ser premium, institucional, comercial, editorial y aspiracional.
Inspirado estructuralmente en Expo Mobility pero SIN copiar su estética.
De Expo Mobility solo se toma la lógica: módulos, badges, iconos, jerarquía, energía.

Paleta obligatoria: rojo #C8102E, azul marino #1B263B, blanco #FFFFFF,
gris #F3F5F7, azul medio #2E7DBD.
Tipografía: Gotham Bold/Black para headlines. Montserrat como fallback.

Protagonistas visuales: empresarios, emprendedores, inversionistas, estudiantes,
expositores, conferencistas dentro de una expo profesional mexicana/LATAM.

NUNCA: verde neón, motos, biker, cyberpunk, glows excesivos, rostros deformes,
stock genérico, diseño corporativo viejo.

Antes de generar CUALQUIER pieza, convertir el brief a este formulario:
- Evento: FIF/EFG/EF/Summit/otro
- Público: visitante/expositor/VIP/prensa/conferencista/estudiante
- Objetivo: registro/awareness/conversión/información
- Formato: dimensiones exactas
- Mensaje principal: headline
- Datos obligatorios: fecha, sede, CTA, URL, logos
- Imagen protagonista: qué debe aparecer
- Estilo: comercial/informativo/editorial/banner web
- Elementos gráficos: badges, cápsulas, iconos, módulos
- Restricciones: qué no debe aparecer
- Salida esperada: con texto / BG editable / prompt para IA
  `
};

module.exports = FIF_BRAND_SYSTEM;
