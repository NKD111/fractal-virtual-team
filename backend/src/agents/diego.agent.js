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
   * Investiga identidad visual real de FIF usando búsqueda y conocimiento de marca
   */
  async researchFIFSocials() {
    const sources = [
      'https://fifcdmx.com',
      'https://www.vanexpo.mx/fif',
      'https://feriadefranquicias.com.mx',
      'https://vanexpo.mx'
    ];

    const findings = [];
    for (const url of sources) {
      try {
        const { data } = await axios.get(url, {
          timeout: 6000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalBot/1.0)' }
        });
        const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitle = data.match(/property="og:title" content="([^"]+)"/i);
        const ogDesc = data.match(/property="og:description" content="([^"]+)"/i);
        const metaDesc = data.match(/name="description" content="([^"]+)"/i);

        if (titleMatch || ogTitle) {
          findings.push({
            url,
            title: (ogTitle?.[1] || titleMatch?.[1] || '').substring(0, 120),
            description: (ogDesc?.[1] || metaDesc?.[1] || '').substring(0, 250)
          });
        }
      } catch (err) {
        findings.push({ url, error: err.message });
      }
    }

    return findings;
  }

  /**
   * Construye el prompt de DALL-E para arte FIF
   * REGLA CRÍTICA: CERO texto en la imagen — DALL-E falla sistemáticamente al renderizar tipografía.
   * El arte es concepto visual puro; el copy se añade en post-producción.
   */
  _buildDallePrompt(brief, attempt = 1, previousIssues = []) {
    const avoidNote = previousIssues.length > 0
      ? `\n\nATTEMPT ${attempt} SPECIFIC FIXES REQUIRED: ${previousIssues.join(' | ')}`
      : '';

    // FIF = Feria Internacional de Franquicias — corporate B2B trade show
    // Visual identity: executive, geometric, architectural, premium business
    // NOT botanical/wedding — think: Bloomberg summit, luxury business conference, Forbes 500 event
    const compositions = [
      // Intento 1: Franja diagonal geométrica premium
      `Single poster design. A bold deep navy diagonal band cuts from upper-left to lower-right, occupying roughly one-third of the composition. The band has a subtle linen texture. One thin gold line runs precisely parallel to the band edge. Upper-right and lower-left areas remain bright white with very subtle warm paper grain. Small scattered geometric gold accent marks — tiny squares and single dots — float in the white zones, sparse and deliberate. Generous empty white space in center for future typography overlay.`,

      // Intento 2: Marco arquitectónico minimalista
      `Single poster design. Minimal architectural frame: four thin gold lines form an elegant rectangular border inset 6% from each edge, with clean mitered corners. In the upper-right corner of the frame, a small geometric emblem — three concentric thin gold squares rotating slightly, like an abstract growth or expansion symbol. The interior is entirely clean white with faint warm paper texture. Bottom-left corner has a solid deep navy triangle accent, sharp and geometric. Balanced, corporate, executive.`,

      // Intento 3: Banda lateral + acento dorado
      `Single poster design. Left edge: a narrow vertical deep navy column, exactly 12% of width, clean and solid. From it, three evenly-spaced thin horizontal gold lines extend rightward into the white field, fading before reaching center. Right side: completely clean white with subtle warm linen paper texture. Lower-right corner: a small stacked geometric motif — thin navy rectangle over thinner gold rectangle — like an abstract podium or award. Entire composition breathes with white space.`
    ];

    const composition = compositions[Math.min(attempt - 1, 2)];

    return `Professional corporate event poster — single vertical poster design ONLY, one card, not multiple. Portrait orientation tall format. ${composition}

BACKGROUND: Premium off-white, warm paper texture — subtle linen or cotton grain, very fine. NOT botanical paper. Corporate stationery feel. White occupies at least 70% of composition.

COLOR PALETTE (strict):
- Deep navy blue: solid, rich, executive
- Warm gold / champagne gold: thin lines, small accents only — elegant not flashy
- White/off-white: dominant background
- NO green, no teal, no coral, no pastels

VISUAL LANGUAGE: Corporate luxury. Business summit. Executive conference. Think Bloomberg, Davos, Forbes summit branding. Clean geometric shapes, architectural lines, professional grade. Premium business event — franchise industry trade show for entrepreneurs and investors.

ABSOLUTE PROHIBITIONS:
- NO flowers, NO leaves, NO botanical elements, NO plants, NO organic curves
- NO text, NO letters, NO numbers, NO symbols, NO logos, NO watermarks
- NO multiple panels or cards — ONE single poster only
- NO gradients that look cheap or digital — only subtle textures
- NO clipart, NO wedding aesthetic, NO decorative flourishes${avoidNote}`;
  }

  /**
   * QC visual con GPT-4o Vision — revisa la imagen generada antes de aprobar
   */
  async _qcImageWithVision(openai, imageUrl, attempt) {
    console.log(`[Diego QC] Analizando imagen intento ${attempt} con GPT-4o Vision...`);

    const qcPrompt = `Eres el QC visual senior de una agencia de diseño premium en México. Analiza esta imagen generada por IA con criterio profesional estricto.

Devuelve ÚNICAMENTE JSON válido (sin markdown, sin explicación adicional):

{
  "approved": false,
  "score": 0,
  "has_text_artifacts": false,
  "has_ai_distortion": false,
  "style_match": false,
  "is_portrait": false,
  "issues": [],
  "next_prompt_fix": ""
}

CRITERIOS DE EVALUACIÓN:
- "approved": true SOLO si score >= 7 Y has_text_artifacts = false Y has_ai_distortion = false
- "score": del 1-10. Profesional y limpio = 7+. Con problemas = bajo 7.
- "has_text_artifacts": true si hay CUALQUIER letra, número, símbolo, pseudotexto malformado, grafemas, caracteres chinos/árabes de relleno, o cualquier intento de texto aunque sea ilegible
- "has_ai_distortion": true si hay formas que se derriten, anatomía incorrecta, elementos que no tienen sentido visual
- "style_match": true si tiene fondo blanco/claro, elementos orgánicos elegantes, sensación editorial premium
- "is_portrait": true si la proporción es claramente vertical
- "issues": lista específica de problemas encontrados
- "next_prompt_fix": qué cambiar en el prompt para el siguiente intento

Sé extremadamente estricto con texto. Un solo carácter malformado = has_text_artifacts: true = rejected.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            { type: 'text', text: qcPrompt }
          ]
        }],
        max_tokens: 500,
        temperature: 0.1
      });

      const raw = response.choices[0].message.content.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[Diego QC] Intento ${attempt}: score=${result.score}, approved=${result.approved}, text_artifacts=${result.has_text_artifacts}`);
        return result;
      }
    } catch (err) {
      console.error('[Diego QC] Error vision check:', err.message);
    }

    return {
      approved: false, score: 0,
      has_text_artifacts: true, has_ai_distortion: false,
      style_match: false, is_portrait: false,
      issues: ['QC vision check falló — rechazando por precaución'],
      next_prompt_fix: 'Simplificar composición, reducir elementos'
    };
  }

  /**
   * Loop de generación de imagen con QC — hasta 3 intentos
   */
  async _generateImageWithQC(openai, brief, proposal) {
    const MAX_ATTEMPTS = 3;
    let bestResult = null;
    let bestScore = -1;
    let previousIssues = [];
    const attempts = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[Diego] Generando imagen — intento ${attempt}/${MAX_ATTEMPTS}...`);

      const dallePrompt = this._buildDallePrompt(brief, attempt, previousIssues);

      try {
        const imgResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: dallePrompt,
          size: '1024x1792',   // Portrait — el más cercano a 1080x1350
          quality: 'hd',
          style: 'natural',    // 'natural' > 'vivid' para diseño editorial elegante
          n: 1
        });

        const imageUrl = imgResponse.data[0].url;
        console.log(`[Diego] Imagen ${attempt} generada. Iniciando QC...`);

        // QC visual con GPT-4o Vision
        const qcResult = await this._qcImageWithVision(openai, imageUrl, attempt);
        attempts.push({ attempt, imageUrl, qcResult });

        if (qcResult.score > bestScore) {
          bestScore = qcResult.score;
          bestResult = { imageUrl, qcResult, attempt };
        }

        if (qcResult.approved) {
          console.log(`[Diego QC] ✅ Imagen aprobada en intento ${attempt} (score: ${qcResult.score}/10)`);
          break;
        } else {
          console.log(`[Diego QC] ❌ Intento ${attempt} rechazado (score: ${qcResult.score}/10): ${qcResult.issues?.join(', ')}`);
          previousIssues = qcResult.issues || [];
          if (qcResult.next_prompt_fix) previousIssues.push(qcResult.next_prompt_fix);
        }

      } catch (imgErr) {
        console.error(`[Diego] Error imagen intento ${attempt}:`, imgErr.message);
        attempts.push({ attempt, error: imgErr.message });
      }
    }

    return { bestResult, attempts };
  }

  /**
   * Genera propuesta de arte FIF con pipeline completo:
   * Research → Propuesta GPT-4o → Revisión Carlos → Imagen QC loop → Valentina → Email
   */
  async generateFIFProposal(brief) {
    console.log(`[Diego] ══ INICIANDO PIPELINE FIF ══ → ${brief.emailDestino}`);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ─── 1. RESEARCH ───────────────────────────────────────────────────
    console.log('[Diego] Investigando identidad visual FIF CDMX...');
    const socialFindings = await this.researchFIFSocials();
    const socialContext = socialFindings
      .filter(f => !f.error)
      .map(f => `[${f.url}] ${f.title} — ${f.description}`)
      .join('\n') || 'Fuentes con acceso limitado — usando conocimiento de marca previo';

    console.log(`[Diego] Research: ${socialFindings.filter(f => !f.error).length}/${socialFindings.length} fuentes accesibles`);

    // ─── 2. PROPUESTA EDITORIAL (GPT-4o) ───────────────────────────────
    console.log('[Diego] Generando propuesta editorial con GPT-4o...');
    const editorialPrompt = `${this.basePrompt}

═══ ENCARGO DE MARIANA ═══
EVENTO: ${brief.evento}
DESCRIPCIÓN: ${brief.descripcion || 'FIF CDMX — Feria Internacional de Franquicias'}
CONTEXTO: ${brief.contexto || ''}
DEADLINE: ${brief.deadline || 'Hoy'}

═══ RESEARCH DE MARCA REAL ═══
${socialContext}

═══ CONOCIMIENTO PREVIO DE FIF ═══
FIF = Feria Internacional de Franquicias Ciudad de México. El evento más importante de franquicias en México. Conecta franquiciantes, franquiciatarios e inversionistas. Audiencia: emprendedores y empresarios establecidos. Posicionamiento: profesional, aspiracional, dinámico.

IDENTIDAD VISUAL ACTUAL @feriadefranquicias:
- Paleta dominante: azul marino profundo + blanco + acentos dorados
- Tipografía: Gotham Font Family (Bold headlines, Medium subheads, Book body)
- Estilo: CORPORATIVO-EJECUTIVO, geométrico, limpio, alto contraste — tipo summit empresarial, Bloomberg, Forbes
- Formatos habituales: 1080x1350px (portrait feed Instagram/LinkedIn)
- Fondos: blancos o muy claros, textura premium sutil, sin flores ni botánica
- Elementos: GEOMÉTRICOS y arquitectónicos — líneas rectas, marcos finos, ángulos diagonales, formas abstractas de crecimiento/expansión
- NO es evento de bodas ni gala cultural — es FERIA DE NEGOCIOS B2B para franquiciantes e inversionistas
- Referentes correctos: WEF Davos, Bloomberg BusinessWeek, Expo Santa Fe CDMX, Forbes Summit MX

═══ ESTÁNDARES DE ARTE FIF (NO NEGOCIABLES) ═══
1. Formato: 1080x1350px (relación 4:5, portrait)
2. Fondo: blanco o marfil con textura de papel/lino premium — limpio, ejecutivo
3. Elementos decorativos: GEOMÉTRICOS y arquitectónicos — líneas rectas, diagonales, marcos finos, formas angulares
   ❌ PROHIBIDO: flores, hojas, plantas, elementos botánicos, orgánicos o curvos
4. Tipografía: Gotham Bold para titular, Gotham Medium para info secundaria (solo en post-producción)
5. CERO texto en la imagen generada por IA — el copy se integra en post-producción
6. Paleta: azul marino (#1B3A5C) + oro cálido (#C4973A) + blanco (#FFFFFF)
7. Vibe correcto: summit empresarial premium, feria de negocios ejecutiva, Bloomberg/Forbes/Davos — NO boda, NO galería de arte, NO evento cultural

═══ TU MISIÓN ═══
Genera una propuesta editorial EJECUTABLE para el anuncio de próxima edición FIF CDMX.
Debes incluir secciones claras:

## ANÁLISIS VISUAL FIF CDMX
(qué funciona en su identidad actual, qué elevar)

## CONCEPTO CREATIVO
(una frase poderosa que describe la dirección)

## ESPECIFICACIONES TÉCNICAS

### Formato & Canvas
### Sistema Tipográfico (Gotham — jerarquía completa)
### Paleta Cromática (hex codes exactos)
### Layout & Composición
(descripción detallada del layout: qué va dónde, proporciones, flujo visual)
### Copy Sugerido
(headline + fecha o info clave + CTA — copy real, listo para usar)
### Elementos Decorativos
(qué elementos orgánicos específicos, cómo se posicionan)

## RATIONALE
(por qué este concepto eleva la identidad de FIF sin abandonarla)

## NOTA PARA CARLOS
(dirección específica para que Carlos valide el sistema visual desde su perspectiva de branding)

Sé específico. Esto va directo a ejecución.`;

    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 3000,
      temperature: 0.7,
      messages: [{ role: 'user', content: editorialPrompt }]
    });
    const proposal = gptResponse.choices[0].message.content;

    // ─── 3. REVISIÓN DE CARLOS ──────────────────────────────────────────
    console.log('[Diego] Solicitando revisión a Carlos...');
    let carlosReview = '(Carlos no disponible en este momento)';
    try {
      const CarlosAgent = require('./carlos.agent');
      const carlos = new CarlosAgent();
      carlosReview = await carlos.reviewFIFProposal(proposal, brief);
      console.log('[Diego] ✅ Revisión de Carlos recibida');
    } catch (err) {
      console.error('[Diego] Carlos review error:', err.message);
    }

    // ─── 4. GENERACIÓN DE IMAGEN CON QC LOOP ───────────────────────────
    const { bestResult, attempts } = await this._generateImageWithQC(openai, brief, proposal);

    let imageUrl = null;
    let imageSection = '';
    let qcSummary = '';

    if (bestResult) {
      imageUrl = bestResult.imageUrl;
      const qc = bestResult.qcResult;
      const statusIcon = qc.approved ? '✅' : '⚠️';
      const intentLabel = `Intento ${bestResult.attempt}/${attempts.length}`;

      qcSummary = `${statusIcon} QC Visual: ${qc.score}/10 — ${intentLabel} ${qc.approved ? '(APROBADO)' : '(MEJOR DISPONIBLE — revisar antes de usar)'}`;
      if (qc.issues?.length) qcSummary += `\nObservaciones: ${qc.issues.join(' | ')}`;

      imageSection = `
        <div style="margin: 32px 0; text-align: center;">
          <img src="${imageUrl}" alt="Concepto Visual FIF — Arte referencia" style="width: 100%; max-width: 500px; border-radius: 4px; border: 1px solid #ddd;" />
          <p style="font-size: 11px; color: #666; margin-top: 8px; line-height: 1.5;">
            <strong>Concepto visual de referencia</strong> — Generado por Diego · DALL-E 3 HD · ${intentLabel}<br>
            ${qc.approved ? '✅ Aprobado por QC visual' : '⚠️ Mejor disponible — el arte final se ejecuta en Illustrator/Figma'}<br>
            <em>Nota: El copy/tipografía se integra en post-producción sobre el canvas 1080×1350. Este arte es referencia de composición y estilo.</em>
          </p>
        </div>`;
    } else {
      imageSection = `<p style="color:#E07B39; font-size:12px; padding:12px; background:#FFF3EB; border-radius:4px;">⚠️ Generación de imagen no disponible en este momento. La propuesta editorial es válida para ejecutar en Illustrator/Figma.</p>`;
      qcSummary = 'Imagen no generada — ejecutar manualmente';
    }

    // ─── 5. VALIDACIÓN VALENTINA (Art Direction QC) ─────────────────────
    console.log('[Diego] Solicitando validación final a Valentina...');
    let valentinaNote = '(Valentina — revisión pendiente)';
    try {
      const ValentinaAgent = require('./valentina.agent');
      const valentina = new ValentinaAgent();
      const valReview = await valentina.reviewCreativeWork(
        `PROPUESTA DIEGO:\n${proposal}\n\nREVISIÓN CARLOS:\n${carlosReview}\n\nQC IMAGEN:\n${qcSummary}`,
        'Arte para evento / anuncio de edición',
        { client_id: 'FIF_CDMX', evento: brief.evento, formato: '1080x1350 portrait' }
      );
      valentinaNote = valReview;
      console.log('[Diego] ✅ Validación Valentina recibida');
    } catch (err) {
      console.error('[Diego] Valentina review error:', err.message);
    }

    // ─── 6. EMAIL HTML PROFESIONAL ──────────────────────────────────────
    const attemptBadges = attempts.map(a => {
      if (a.error) return `<span style="background:#FFEBEE;color:#C62828;padding:2px 8px;border-radius:10px;font-size:10px;margin-right:4px;">❌ Int.${a.attempt}</span>`;
      const c = a.qcResult;
      const color = c.approved ? '#E8F5E9' : c.score >= 5 ? '#FFF8E1' : '#FFEBEE';
      const textColor = c.approved ? '#2E7D32' : c.score >= 5 ? '#F57F17' : '#C62828';
      return `<span style="background:${color};color:${textColor};padding:2px 8px;border-radius:10px;font-size:10px;margin-right:4px;">${c.approved ? '✅' : '⚠️'} Int.${a.attempt}: ${c.score}/10</span>`;
    }).join('');

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #F8F8F8; color: #2a2a2a; margin: 0; padding: 0; }
    .container { max-width: 700px; margin: 0 auto; background: #fff; }
    .header { background: #1B3A5C; padding: 32px 40px 24px; }
    .logo { font-size: 11px; letter-spacing: 5px; color: #C4973A; font-weight: 700; text-transform: uppercase; }
    .from { font-size: 11px; color: #8fa8c8; margin-top: 4px; }
    h1 { font-size: 20px; color: #fff; font-weight: 700; margin: 16px 0 0; }
    .body { padding: 32px 40px; }
    .badge { display: inline-block; background: #EBF3FB; border: 1px solid #B3D1F0; color: #1B3A5C; font-size: 10px; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; margin-right: 6px; margin-bottom: 16px; font-weight: 600; }
    .qc-bar { background: #F5F5F5; border-radius: 6px; padding: 12px 16px; margin: 20px 0; font-size: 11px; }
    .section-card { border: 1px solid #E8E8E8; border-radius: 6px; margin: 20px 0; overflow: hidden; }
    .section-header { background: #F0F4F8; padding: 10px 16px; font-size: 11px; font-weight: 700; color: #1B3A5C; letter-spacing: 1px; text-transform: uppercase; }
    .section-body { padding: 16px; font-size: 13px; line-height: 1.8; color: #333; white-space: pre-wrap; }
    .footer { background: #F0F4F8; padding: 20px 40px; font-size: 10px; color: #888; border-top: 2px solid #C4973A; }
    .footer strong { color: #1B3A5C; }
    h2 { color: #1B3A5C; font-size: 14px; border-left: 3px solid #C4973A; padding-left: 10px; margin: 20px 0 8px; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">FRACTAL MX</div>
    <div class="from">Propuesta de Diego Ramírez · Senior Designer</div>
    <h1>📐 ${brief.evento}</h1>
  </div>
  <div class="body">
    <span class="badge">PIPELINE COMPLETO</span>
    <span class="badge">GPT-4o + DALL-E 3 + QC VISION</span>
    <span class="badge">REVISADO POR CARLOS + VALENTINA</span>

    <div class="qc-bar">
      <strong>Pipeline QC:</strong> ${attemptBadges || 'Sin intentos registrados'}<br>
      <span style="color:#555;">${qcSummary}</span>
    </div>

    ${imageSection}

    <div class="section-card">
      <div class="section-header">📋 Propuesta Editorial — Diego Ramírez</div>
      <div class="section-body">${proposal.replace(/## /g, '<h2>').replace(/### /g, '<strong>').replace(/\n/g, '<br>')}</div>
    </div>

    <div class="section-card">
      <div class="section-header">🎨 Revisión Carlos Pérez — Perspectiva Branding</div>
      <div class="section-body">${String(carlosReview).replace(/\n/g, '<br>')}</div>
    </div>

    <div class="section-card">
      <div class="section-header">✅ Validación Valentina Cruz — Art Direction</div>
      <div class="section-body">${String(valentinaNote).replace(/\n/g, '<br>')}</div>
    </div>

    <div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:6px;padding:14px;font-size:12px;color:#6D4C00;margin-top:16px;">
      <strong>📌 Nota de producción:</strong> El arte final se ejecuta en Illustrator o Figma a 1080×1350px. La imagen generada es referencia de concepto y composición. El copy y tipografía (Gotham) se integran en software de diseño sobre el canvas definitivo.
    </div>
  </div>
  <div class="footer">
    <strong>Diego Ramírez Salazar</strong> · Senior Graphic Designer<br>
    Revisado por: Carlos Pérez (Branding) · Valentina Cruz (Art Direction)<br>
    Fractal MX Virtual Team v4.2 · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}<br>
    <em>Documento confidencial — uso interno Fractal MX.</em>
  </div>
</div>
</html>`;

    await sendEmail({
      to: brief.emailDestino,
      subject: `📐 Propuesta Arte FIF CDMX — Pipeline Completo | Diego + Carlos + Valentina`,
      html: htmlBody,
      text: `${proposal}\n\n--- CARLOS ---\n${carlosReview}\n\n--- VALENTINA ---\n${valentinaNote}`,
      fromName: 'Diego Ramírez · Fractal MX'
    });

    console.log(`[Diego] ══ PIPELINE COMPLETO ══ Email enviado a ${brief.emailDestino}`);
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

  /**
   * Revisión complementaria de propuesta de Carlos
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
}

module.exports = DiegoAgent;
