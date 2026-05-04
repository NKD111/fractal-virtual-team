// backend/src/agents/diego.agent.js
// Fractal Virtual Team v4.2 — DIEGO (Senior Designer - Editorial & Corporate)

const BaseAgent = require('../core/BaseAgent');
const DIEGO_PROMPT = require('../prompts/diego.prompts');
const { sendEmail } = require('../core/email');
const OpenAI = require('openai');
const axios = require('axios');

class DiegoAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DIEGO',
      fullName: 'Diego Ramírez Salazar',
      role: 'Senior Graphic Designer (Editorial & Corporate Design)',
      area: 'design_senior',
      reportsTo: 'VALENTINA',
      basePrompt: DIEGO_PROMPT,

      personality: {
        with_clients: 'refined attentive',
        with_neiky: 'respectful collaborative',
        with_team: 'mature guiding',
        with_carlos: 'complementary equal debating',
        core_traits: ['refined', 'meticulous', 'thoughtful', 'mature']
      },

      speakingStyle: {
        tone: 'articulado reflexivo',
        typical_phrases: [
          'Si me permites una observación...',
          'Esto está bien, pero podemos elevar',
          'Vignelli decía que...',
          'Lo veo factible',
          '¿Qué está comunicando realmente?'
        ]
      },

      qualityStandards: {
        tolerance_level: 'zero',
        feedback_style: 'precise_constructive_elevated',
        red_lines: [
          'tipografía sin jerarquía',
          'spacing inconsistente',
          'color sin propósito',
          'layout sin ritmo',
          'trabajo apresurado'
        ],
        acceptance_threshold: 97
      }
    });
  }

  /**
   * Genera propuesta editorial para un cliente
   */
  async generateEditorialProposal(brief) {
    const editorialPrompt = `${this.basePrompt}

BRIEF:
${JSON.stringify(brief, null, 2)}

Genera una propuesta editorial detallada. Incluye:
1. Concepto editorial (la gran idea)
2. Sistema tipográfico (fuentes principales, secundarias, jerarquía)
3. Grid y estructura de layout
4. Paleta cromática con temperatura (frío/cálido)
5. Lenguaje fotográfico / ilustración si aplica
6. Ejemplos de aplicación (describe en palabras)
7. Rationale completo

Piensa en trabajo que envejezca bien — atemporal sobre trendy.`;

    return this.think(editorialPrompt, { clientId: brief.client_id });
  }

  /**
   * Revisa trabajo de Carlos (complementariedad)
   */
  async complementCarlosWork(carlosProposal, clientBrief) {
    const complementPrompt = `${this.basePrompt}

Propuesta de Carlos (bold/branding):
"${carlosProposal}"

Brief del cliente:
${JSON.stringify(clientBrief, null, 2)}

Como Diego, complementa la propuesta de Carlos. Tu rol es aportar:
- Refinement donde sea necesario
- Jerarquía tipográfica más clara
- Coherencia editorial
- Balance entre bold y elegancia

Responde constructivamente. Son iguales, buscan lo mejor para el cliente.`;

    return this.think(complementPrompt, { clientId: clientBrief.client_id });
  }

  /**
   * Investiga las redes sociales oficiales de FIF para tener contexto real
   */
  async researchFIFSocials() {
    const sources = [
      'https://www.instagram.com/fifcdmx/',
      'https://fifcdmx.com',
      'https://www.vanexpo.mx/fif',
      'https://www.instagram.com/vanexpomx/'
    ];

    const findings = [];
    for (const url of sources) {
      try {
        const { data } = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalBot/1.0)' }
        });
        // Extraer texto relevante — títulos, meta descripción, textos visibles
        const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = data.match(/content="([^"]{20,200})"/);
        const ogTitle = data.match(/property="og:title" content="([^"]+)"/i);
        const ogDesc = data.match(/property="og:description" content="([^"]+)"/i);

        if (titleMatch || ogTitle) {
          findings.push({
            url,
            title: (ogTitle?.[1] || titleMatch?.[1] || '').substring(0, 100),
            description: (ogDesc?.[1] || descMatch?.[1] || '').substring(0, 200)
          });
        }
      } catch (err) {
        findings.push({ url, error: err.message });
      }
    }

    return findings;
  }

  /**
   * Genera propuesta de arte para FIF CDMX y la envía por email
   * Usa GPT-4o para la propuesta editorial + DALL-E 3 para la imagen
   * @param {object} brief - { evento, descripcion, contexto, emailDestino, deadline }
   */
  async generateFIFProposal(brief) {
    console.log(`[Diego] Generando propuesta FIF para ${brief.emailDestino}...`);

    // 1. Investigar redes sociales oficiales de FIF
    console.log('[Diego] Investigando redes sociales de FIF CDMX...');
    const socialFindings = await this.researchFIFSocials();
    const socialContext = socialFindings
      .filter(f => !f.error)
      .map(f => `[${f.url}] ${f.title} — ${f.description}`)
      .join('\n') || 'No se pudo acceder a las redes en este momento';

    console.log(`[Diego] Research completado: ${socialFindings.length} fuentes revisadas`);

    // 2. Inicializar OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const researchPrompt = `${this.basePrompt}

═══ ENCARGO ═══
Mariana me acaba de delegar un brief de arte para el siguiente evento:

EVENTO: ${brief.evento}
DESCRIPCIÓN: ${brief.descripcion}
CONTEXTO DE MARCA: ${brief.contexto}
DEADLINE ENTREGA: ${brief.deadline}

═══ RESEARCH REAL DE REDES SOCIALES FIF (obtenido ahora mismo) ═══
${socialContext}

═══ LO QUE YA SÉ DE FIF ═══
Trabajo FIF / VANEXPO desde hace tiempo con Fractal MX. El Festival de la Industria del Futuro (FIF) Ciudad de México es un evento de tecnología, innovación e industria. Tiene una identidad visual de vanguardia — tipografías geométricas, paleta oscura con acentos de color eléctrico (cian/magenta/amarillo), lenguaje futurista pero accesible.

TIPOGRAFÍA OFICIAL: Gotham Font Family — usar Gotham Bold para headlines, Gotham Medium para subheads, Gotham Book para cuerpo. Esta es la familia tipográfica de la marca y no se sustituye.

═══ MI MISIÓN ═══
1. Hacer el research de la identidad visual actual de FIF CDMX (redes sociales, ediciones anteriores)
2. Proponer un arte para el anuncio de la próxima edición
3. Ser específico — tipografía real, paleta con hex codes, layout, jerarquía, copy sugerido
4. El arte debe ser para formato feed de Instagram/LinkedIn (1:1 o 4:5)

Genera una propuesta de arte COMPLETA, detallada y lista para ejecutar. Incluye:

## RESEARCH & CONTEXTO FIF CDMX
(lo que sé del evento y su identidad visual)

## CONCEPTO CREATIVO
(la gran idea, no más de 1 línea poderosa)

## ESPECIFICACIONES TÉCNICAS

### Formato & Dimensiones
### Sistema Tipográfico
- Headline: fuente + peso + tamaño + color
- Subhead: fuente + peso + tamaño + color
- Info secundaria: fuente + tamaño
### Paleta Cromática
- Fondo: #HEX (y descripción)
- Primario: #HEX
- Acento: #HEX
### Layout & Composición
(describe la disposición de elementos, jerarquía visual, flujo)
### Copy Sugerido
(headline + subhead + CTA exacto)
### Elementos Gráficos
(texturas, formas, íconos, fotografía si aplica)

## RATIONALE
(por qué este concepto funciona para FIF CDMX y está alineado con su identidad)

## PRÓXIMOS PASOS
(qué necesito del equipo para ejecutar)

Sé específico. Esto es para ejecutar, no para inspirar.`;

    // 3. Generar propuesta editorial con GPT-4o
    console.log('[Diego] Generando propuesta con GPT-4o...');
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 3000,
      messages: [{ role: 'user', content: researchPrompt }]
    });
    const proposal = gptResponse.choices[0].message.content;

    // 4. Generar imagen con DALL-E 3
    let imageUrl = null;
    let imageSection = '';
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('[Diego] Generando imagen con DALL-E 3...');
        const dallePrompt = `Professional event announcement poster for "FIF Ciudad de México" — Festival de la Industria del Futuro, next edition. Dark near-black background (#0a0a0a). Large bold "FIF" text in white at top. "CIUDAD DE MÉXICO" in electric cyan below, wide letter spacing. Center: geometric circuit/grid glowing lines suggesting future technology and innovation industry, in cyan and electric yellow. "PRÓXIMA EDICIÓN" at bottom in white. Magenta accent horizontal lines. Clean Swiss grid layout. Gotham Bold typeface style. Square 1:1 format for Instagram. Sharp professional typography. Futuristic refined aesthetic. No gradients on text. Premium event identity design.`;

        const imgResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: dallePrompt,
          size: '1024x1024',
          quality: 'hd',
          style: 'vivid',
          n: 1
        });
        imageUrl = imgResponse.data[0].url;
        imageSection = `<div style="margin: 32px 0; text-align: center;">
          <img src="${imageUrl}" alt="Arte FIF Ciudad de México" style="width: 100%; max-width: 600px; border-radius: 4px; border: 1px solid #333;" />
          <p style="font-size: 11px; color: #555; margin-top: 8px;">Arte generado por Diego · DALL-E 3 HD · Para revisión editorial</p>
        </div>`;
        console.log('[Diego] Imagen DALL-E 3 generada ✓');
      } catch (imgErr) {
        console.error('[Diego] Error DALL-E 3:', imgErr.message);
        imageSection = `<p style="color:#FF6B6B; font-size: 12px;">⚠️ Imagen no generada: ${imgErr.message}</p>`;
      }
    }

    // 5. Formatear como email HTML profesional
    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #0a0a0a; color: #e0e0e0; margin: 0; padding: 0; }
    .container { max-width: 680px; margin: 0 auto; padding: 40px 20px; }
    .header { border-bottom: 2px solid #7c3aed; padding-bottom: 24px; margin-bottom: 32px; }
    .logo { font-size: 13px; letter-spacing: 4px; color: #7c3aed; font-weight: 700; text-transform: uppercase; }
    .from { font-size: 11px; color: #666; margin-top: 4px; }
    h1 { font-size: 22px; color: #fff; font-weight: 700; margin: 0 0 8px; }
    .badge { display: inline-block; background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa; font-size: 11px; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; margin-bottom: 24px; }
    .content { line-height: 1.8; font-size: 14px; color: #ccc; white-space: pre-wrap; }
    h2 { color: #fff; font-size: 16px; border-left: 3px solid #7c3aed; padding-left: 12px; margin-top: 28px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #222; font-size: 11px; color: #555; }
    .footer strong { color: #7c3aed; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">FRACTAL MX</div>
      <div class="from">Propuesta de Diego Ramírez · Senior Designer</div>
    </div>
    <span class="badge">📐 PROPUESTA DE ARTE · GPT-4o + DALL-E 3</span>
    <h1>${brief.evento}</h1>
    ${imageSection}
    <div class="content">${proposal.replace(/## /g, '<h2>').replace(/\n/g, '<br>')}</div>
    <div class="footer">
      <strong>Diego Ramírez Salazar</strong> · Senior Graphic Designer<br>
      Fractal MX Virtual Team v4.2 · Delegado por Mariana · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}<br>
      <em>Este documento es confidencial y para uso interno de Fractal MX.</em>
    </div>
  </div>
</body>
</html>`;

    // Enviar email
    await sendEmail({
      to: brief.emailDestino,
      subject: `📐 Propuesta de Arte — ${brief.evento} | Diego · Fractal MX`,
      html: htmlBody,
      text: proposal,
      fromName: 'Diego Ramírez · Fractal MX'
    });

    console.log(`[Diego] Propuesta FIF enviada a ${brief.emailDestino}`);
    return proposal;
  }

  /**
   * Revisión tipográfica de piezas
   */
  async typographyReview(pieceDescription) {
    const typoPrompt = `${this.basePrompt}

PIEZA A REVISAR:
${pieceDescription}

Realiza una revisión tipográfica detallada. Evalúa:
- Jerarquía visual (h1, h2, body, caption)
- Pairing de fuentes
- Espaciado (tracking, leading)
- Legibilidad
- Coherencia con sistema de marca

Da feedback específico y accionable.`;

    return this.think(typoPrompt);
  }
}

module.exports = DiegoAgent;
