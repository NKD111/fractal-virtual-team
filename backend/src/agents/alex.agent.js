// backend/src/agents/alex.agent.js
// Fractal Virtual Team v4.2 — ALEX (Content Creator & Social Media)

const BaseAgent = require('../core/BaseAgent');
const ALEX_PROMPT = require('../prompts/alex.prompts');

class AlexAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ALEX',
      fullName: 'Alex Torres Medina',
      role: 'Content Creator & Social Media Strategist',
      area: 'content',
      reportsTo: 'VALENTINA',
      basePrompt: ALEX_PROMPT,

      personality: {
        with_clients: 'casual trendy',
        with_neiky: 'entusiasta directo',
        with_team: 'collaborative creative',
        core_traits: ['trendy', 'creative', 'strategic', 'cultural_radar']
      },

      speakingStyle: {
        tone: 'casual espontáneo',
        typical_phrases: [
          'Esto ya está muy dated',
          'El algoritmo está premiando esto ahorita',
          'No mames, esto va a pegar',
          '¿Le damos un vibe más editorial?'
        ]
      },

      qualityStandards: {
        tolerance_level: 'medium',
        red_lines: ['plagiarism', 'generic_content', 'wrong_tone_of_voice'],
        acceptance_threshold: 85
      }
    });
  }

  /**
   * Genera parrilla editorial para un mes
   */
  async generateEditorialGrid(clientData, platforms, month) {
    const gridPrompt = `${this.basePrompt}

CLIENTE: ${clientData.name} (${clientData.company})
PLATAFORMAS: ${platforms.join(', ')}
MES: ${month}

Genera una parrilla editorial de 30 días. Para cada pieza incluye:
- Día y fecha
- Plataforma
- Tipo de contenido (reel, carrusel, historia, post estático)
- Copy principal (máximo 150 chars)
- Hook de apertura
- CTA
- Hashtags (máximo 10, relevantes)
- Visual brief (describe la imagen/video en 2 líneas)

Varía los tipos de contenido. Mix de: educativo, entretenimiento, venta, comunidad.
Mantén el tono de voz de la marca.`;

    return this.think(gridPrompt, { clientId: clientData.id });
  }

  /**
   * Genera copy para una pieza específica
   */
  async generateCopy(brief, platform, type) {
    const copyPrompt = `${this.basePrompt}

BRIEF: ${brief}
PLATAFORMA: ${platform}
TIPO: ${type}

Genera el copy completo para esta pieza. Incluye:
- Hook (primera línea que para el scroll)
- Cuerpo del mensaje
- CTA específico
- Hashtags
- Nota para el diseñador (qué imagen/video necesita)

El copy tiene que sonar HUMANO, no corporativo.`;

    return this.think(copyPrompt);
  }

  /**
   * Analiza tendencias relevantes para un cliente
   */
  async analyzeTrends(industry, currentMonth) {
    const trendsPrompt = `${this.basePrompt}

INDUSTRIA: ${industry}
MES: ${currentMonth}

¿Qué tendencias de contenido son relevantes ahora para esta industria?
Lista 5-7 tendencias con:
- Nombre de la tendencia
- Por qué está pegando
- Cómo aplicarla para este cliente
- Duración estimada (flash/mensual/trimestral)
- Nivel de riesgo (conservador/moderado/experimental)`;

    return this.think(trendsPrompt);
  }

  // ─── BLOQUE R4: Formulario Interno de Arte FIF/EFG ────────────────────────────
  /**
   * Convierte un brief en texto libre al formulario interno estandarizado FIF/EFG.
   * Devuelve JSON con todos los campos necesarios para que Carlos genere la pieza.
   *
   * @param {string} brief_texto - Brief en texto libre del cliente o NKD
   * @returns {object} Formulario interno completo con prompt_higgsfield incluido
   */
  async completarFormularioArte(brief_texto) {
    const formularioPrompt = `${this.basePrompt}

Eres ALEX y debes convertir este brief en el formulario interno de arte FIF/EFG.

BRIEF: ${brief_texto}

Genera un JSON con exactamente estos campos:
{
  "evento": "FIF|EFG|EF|Summit|otro",
  "publico": "visitante|expositor|estudiante|VIP|prensa|conferencista|inversionista",
  "objetivo": "registro|awareness|conversion|informacion|venta_stand|posicionamiento",
  "formato": "post_4x5|banner_web|story|carousel|fondo_sin_texto",
  "headline": "propuesta de headline (máx 6 palabras)",
  "subheadline": "propuesta de subheadline (máx 15 palabras)",
  "datos_obligatorios": "fecha, sede, costo, URL, fase, CTA, logos que deben aparecer",
  "imagen_protagonista": "descripción precisa del perfil visual protagonista",
  "estilo": "comercial|informativo|editorial|banner_limpio",
  "template_tipo": "Template 1|Template 2|Template 3|Template 4",
  "elementos_graficos": ["lista de elementos gráficos a incluir"],
  "restricciones": ["lista de qué NO debe aparecer y zonas que deben quedar limpias"],
  "salida_esperada": "imagen_con_texto|sin_texto|background_editable|prompt_para_ia",
  "prompt_higgsfield": "prompt completo en inglés usando el sistema de prompts FIF premium. Incluir: estilo base FIF, descripción del protagonista, composición, elementos gráficos, colores, qué evitar."
}

Paleta obligatoria: Navy #1B263B, Rojo #C8102E, Blanco #FFFFFF, Gris #F3F5F7
Tipografía: Gotham / Montserrat
NUNCA: neon, cyberpunk, biker, motos, glows excesivos, fondos muy oscuros

Responde SOLO el JSON válido, sin texto adicional.`;

    try {
      const raw = await this.think(formularioPrompt);
      // Limpiar posibles markdown code blocks
      const cleaned = (raw || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.error('[ALEX] completarFormularioArte error:', err.message);
      throw new Error(`Formulario de arte falló: ${err.message}`);
    }
  }

  /**
   * Genera contenido de pre-lanzamiento para un producto digital.
   * Usado por el pipeline de productos digitales (BLOQUE J).
   *
   * @param {object} opts - { producto, cantidad, estilo }
   * @returns {Array} Array de posts generados
   */
  async generatePreLaunchContent({ producto, cantidad = 5, estilo = 'educativo + aspiracional' }) {
    const prompt = `${this.basePrompt}

Genera ${cantidad} posts de pre-lanzamiento para este producto digital:
PRODUCTO: ${producto}
ESTILO: ${estilo}

Para cada post genera:
- texto (copy completo listo para publicar)
- hashtags (8-12 relevantes)
- tipo (carrusel/imagen/reel/historia)
- gancho (primera línea de impacto)

Tono: educativo, aspiracional, sin venta directa hasta el último post.
Los primeros posts educan. Los últimos invitan.

Responde en JSON: { "posts": [...] }`;

    try {
      const raw = await this.think(prompt);
      const cleaned = (raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const data = JSON.parse(cleaned);
      return data.posts || [];
    } catch (err) {
      console.warn('[ALEX] generatePreLaunchContent error:', err.message);
      return [];
    }
  }

  /**
   * Genera secuencia de emails de pre-lanzamiento.
   *
   * @param {object} opts - { producto, cantidad }
   * @returns {Array} Secuencia de emails
   */
  async generateEmailSequence({ producto, cantidad = 5 }) {
    const prompt = `${this.basePrompt}

Genera una secuencia de ${cantidad} emails de pre-lanzamiento y lanzamiento para:
PRODUCTO: ${producto}

Email 1: Problema (educar, no vender)
Email 2: Solución parcial (dar valor)
Email 3: Prueba social / credibilidad
Email 4: Urgencia / lanzamiento
Email 5: Última llamada / cierre

Para cada email:
- asunto (máx 50 chars, alta apertura)
- preview_text (máx 90 chars)
- cuerpo (300-500 palabras, conversacional)
- cta (texto del botón)

Responde en JSON: { "emails": [...] }`;

    try {
      const raw = await this.think(prompt);
      const cleaned = (raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const data = JSON.parse(cleaned);
      return data.emails || [];
    } catch (err) {
      console.warn('[ALEX] generateEmailSequence error:', err.message);
      return [];
    }
  }

  /**
   * Genera metadata completa para un video de YouTube.
   * @param {object} opts - { script }
   * @returns {object} { titulo, descripcion, tags, titulo_corto }
   */
  async generateYouTubeMetadata({ script }) {
    const prompt = `${this.basePrompt}

Basado en este script de YouTube, genera metadata optimizada:
TÍTULO DEL SCRIPT: ${script.titulo || ''}
GANCHO: ${script.gancho || ''}

Genera en JSON:
{
  "titulo": "título final optimizado para CTR (máx 60 chars)",
  "titulo_corto": "versión corta para miniatura (máx 4 palabras impactantes)",
  "descripcion": "descripción YouTube SEO-optimizada (300-500 chars)",
  "tags": ["array de 15 tags relevantes en español e inglés"],
  "capitulos": [{"tiempo": "0:00", "titulo": "Intro"}, ...]
}`;

    try {
      const raw = await this.think(prompt);
      const cleaned = (raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.warn('[ALEX] generateYouTubeMetadata error:', err.message);
      return { titulo: script.titulo, tags: [], descripcion: '' };
    }
  }
}

module.exports = AlexAgent;
