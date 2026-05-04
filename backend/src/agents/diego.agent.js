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
   * Scrape artículos recientes de franquiciashoy.com
   */
  async researchFranquiciasHoy() {
    const sources = [
      'https://franquiciashoy.com.mx',
      'https://www.franquiciashoy.com.mx/noticias',
      'https://www.franquiciashoy.com.mx/articulos'
    ];

    const findings = [];
    for (const url of sources) {
      try {
        const { data } = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' }
        });
        const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitle = data.match(/property="og:title" content="([^"]+)"/i);
        const ogDesc = data.match(/property="og:description" content="([^"]+)"/i);
        const metaDesc = data.match(/name="description" content="([^"]+)"/i);

        // Extraer artículos del HTML
        const articleMatches = [...data.matchAll(/<h[23][^>]*>([^<]{20,120})<\/h[23]>/gi)];
        const articles = articleMatches.slice(0, 6).map(m => m[1].trim());

        findings.push({
          url,
          siteTitle: (ogTitle?.[1] || titleMatch?.[1] || '').substring(0, 120),
          siteDesc: (ogDesc?.[1] || metaDesc?.[1] || '').substring(0, 250),
          articles
        });
      } catch (err) {
        findings.push({ url, error: err.message });
      }
    }
    return findings;
  }

  /**
   * Investiga identidad visual real de FIF
   */
  async researchFIFSocials() {
    const sources = [
      'https://fifcdmx.com',
      'https://www.vanexpo.mx/fif',
      'https://feriadefranquicias.com.mx'
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
   * Construye prompt DALL-E para fotografía cinemática aspiracional.
   *
   * APRENDIZAJE CLAVE de referencias Expo Franquicias:
   * - El DALL-E genera la ESCENA FOTOGRÁFICA (personaje + situación narrativa)
   * - El diseño gráfico (logos, texto, rombos, tipografía) va en post-producción
   * - Estilo: fotografía comercial de alto presupuesto, personajes mexicanos, fondo limpio
   * - Ejemplos reales: emprendedor caminando sobre monedas, chef vs robot de pizzas, apretón de manos expo
   *
   * CERO texto en imagen — DALL-E sistemáticamente falla al renderizar tipografía
   */
  _buildDallePrompt(brief, attempt = 1, previousIssues = []) {
    const concept = brief.imageConcept || brief.descripcion || '';
    const avoidNote = previousIssues.length > 0
      ? `\n\nATTEMPT ${attempt} — MANDATORY FIXES: ${previousIssues.join(' | ')}`
      : '';

    // Ángulos cinematográficos: misma narrativa, diferente composición
    const cameraAngles = [
      `Medium shot, subject at center-left third, looking toward camera with confident expression. Background slightly out of focus.`,
      `3/4 angle shot from slightly below, subject appears powerful and aspirational. Clean background, dramatic but soft lighting.`,
      `Wide establishing shot showing full environment context. Subject is in foreground, setting tells the story.`
    ];

    const angle = cameraAngles[Math.min(attempt - 1, 2)];

    return `Cinematic commercial photography for Mexican franchise industry magazine. ${angle}

SCENE CONCEPT: ${concept}

PHOTOGRAPHY STYLE:
- High-end advertising photography, CGI/3D render quality or real photography aesthetic
- Warm professional studio lighting with soft shadows — NOT harsh flash
- Background: clean white, very light warm gray, or minimal contextual setting (office, expo floor, modern workspace)
- Color grade: slightly warm, professional, aspirational
- Production value: equivalent to Forbes Mexico, Entrepreneur en Español, Bloomberg Businessweek covers

SUBJECT (if people appear):
- Mexican or Latin American appearance, professional, 28-45 years old
- Business casual to formal attire — entrepreneur energy, not corporate stiffness
- Confident, aspirational expression — success within reach
- If multiple people: interaction feels natural and positive (handshake, collaboration, celebration)

COMPOSITION:
- Upper 35-40% of image: intentionally clean — slightly lighter area for future text overlay
- Lower 60-65%: main visual scene
- Leave bottom-right corner slightly free (geometric brand element added in post)
- Vertical portrait format — all action within single frame

ABSOLUTE PROHIBITIONS:
- NO text, letters, numbers, symbols, logos, watermarks, signs with readable text
- NO visible brand names on objects (blur or avoid showing labels)
- NO wedding, botanical, or decorative design elements
- NO abstract geometric backgrounds or patterns
- ONE single image only — not a collage or split design${avoidNote}`;
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
- "style_match": true si tiene estilo fotográfico comercial/cinemático: personaje o escena clara, fondo limpio/profesional, iluminación cálida y uniforme, sensación aspiracional
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
   * Extrae el copy del proposal de GPT-4o y compósita texto sobre la imagen base.
   * Devuelve URL de la imagen compuesta (con texto real encima).
   *
   * SOLUCIÓN AL PROBLEMA: DALL-E genera la foto → compositor añade texto/copy
   * Resultado: entrega completa con copy visible, no una foto en blanco.
   *
   * @param {string} aiImageUrl - URL de la imagen base de DALL-E
   * @param {string} proposal   - Texto de la propuesta de GPT-4o (con copy extraíble)
   * @param {object} brief      - Brief original del proyecto
   * @returns {{ composedUrl, buffer, source }}
   */
  async _compositeWithCopy(aiImageUrl, proposal, brief) {
    try {
      const compositor = require('../services/workflows/design-compositor');

      // Extraer copy del proposal generado por GPT-4o
      const ex = (pattern, fallback = '') => {
        const m = proposal.match(pattern);
        return m ? m[1].replace(/\*\*/g, '').trim().split('\n')[0].trim() : fallback;
      };

      const compositionBrief = {
        // Campos del brief base
        evento:    brief.evento || 'FIF 2025',
        formato:   brief.formato || 'story',
        marca:     brief.marca || 'FIF',

        // Copy extraído del proposal
        titulo:    ex(/##\s*(?:HEADLINE DEL POST|TITULAR?|TÍTULO)\s*\n+([\s\S]+?)(?=##|$)/i) ||
                   ex(/HEADLINE[:\s]+([\S ]+)/i) ||
                   brief.evento || 'FIF 2025',

        subtitulo: ex(/##\s*(?:SUB[- ]?COPY|SUBTÍTULO?|SUBHEADLINE)\s*\n+([\s\S]+?)(?=##|$)/i) ||
                   ex(/SUB-?COPY[:\s]+([\S ]+)/i) || '',

        fecha:     brief.fecha || ex(/FECHA[:\s]+([\S ]+)/i, ''),
        lugar:     brief.lugar || ex(/LUGAR[:\s]+([\S ]+)/i, ''),

        cta:       ex(/##\s*(?:URL|CTA BADGE|CTA)\s*\n+([\s\S]+?)(?=##|$)/i) ||
                   ex(/CTA[:\s]+([\S ]+)/i) || 'Más info →',

        hashtag:   ex(/(#\w+(?:\s+#\w+)*)/),
        badge:     brief.badge || ex(/BADGE[:\s]+([\S ]+)/i, ''),
        logo_text: brief.logo_text || 'FRACTAL MX'
      };

      console.log(`[Diego Compositor] Compositing con copy: "${compositionBrief.titulo.substring(0, 40)}"...`);
      const result = await compositor.compositeAndUpload(aiImageUrl, compositionBrief, ['composed', 'diego']);
      console.log(`[Diego Compositor] ✅ Imagen compuesta lista — fuente: ${result.source}`);
      return result;

    } catch (err) {
      console.error('[Diego Compositor] Error compositing:', err.message);
      return { url: aiImageUrl, buffer: null, source: 'original' };
    }
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
        const modelRouter = require('../services/workflows/model-router');
        const routeResult = await modelRouter.generate(dallePrompt, brief, {
          size: '1024x1792',
          quality: 'hd',
          style: 'natural'
        });
        const imageUrl = await modelRouter.persistToCloudinary(routeResult.imageUrl, ['fif', 'fractal-mx']);
        console.log(`[Diego] Modelo usado: ${routeResult.model} — ${routeResult.reasoning}`);
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
      const rawImageUrl = bestResult.imageUrl;
      const qc = bestResult.qcResult;
      const statusIcon = qc.approved ? '✅' : '⚠️';
      const intentLabel = `Intento ${bestResult.attempt}/${attempts.length}`;

      qcSummary = `${statusIcon} QC Visual: ${qc.score}/10 — ${intentLabel} ${qc.approved ? '(APROBADO)' : '(MEJOR DISPONIBLE)'}`;
      if (qc.issues?.length) qcSummary += `\nObservaciones: ${qc.issues.join(' | ')}`;

      // ── COMPOSITOR: añadir copy/texto encima de la foto ─────────────────
      console.log('[Diego] Compositing texto y copy sobre la imagen...');
      const compBrief = {
        ...brief,
        formato: brief.formato || 'story',
        marca: 'FIF',
        logo_text: 'FRACTAL MX',
        badge: 'FIF 2025'
      };
      const composed = await this._compositeWithCopy(rawImageUrl, proposal, compBrief);
      imageUrl = composed.url;

      const isComposed = composed.source !== 'original';
      imageSection = `
        <div style="margin: 32px 0; text-align: center;">
          <img src="${imageUrl}" alt="Arte FIF — con copy composited" style="width: 100%; max-width: 500px; border-radius: 4px; border: 1px solid #ddd;" />
          <p style="font-size: 11px; color: #666; margin-top: 8px; line-height: 1.5;">
            <strong>${isComposed ? '🎨 Arte compuesto con copy' : 'Concepto visual base'}</strong> — Diego · DALL-E 3 HD + Compositor · ${intentLabel}<br>
            ${qc.approved ? '✅ Aprobado por QC visual' : '⚠️ Mejor disponible'} ${isComposed ? '· Copy y branding integrados programáticamente' : ''}<br>
            ${isComposed ? '<em>Este arte ya incluye texto. Para ajustar copy exacto o tipografía Gotham, abrir en Figma/Illustrator.</em>' : '<em>Arte base — integrar copy en Figma/Illustrator.</em>'}
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
   * Genera post para artículo de FranquiciasHoy.com
   * Pipeline: Research artículo → Copy GPT-4o → Carlos review → Imagen cinemática QC → Valentina → Email
   *
   * Sistema visual de referencia (Expo Franquicias / FIF):
   * - Foto: escena cinemática aspiracional, personaje mexicano, fondo limpio
   * - Copy: headline rojo bold arriba, URL en pill, logo arriba derecha
   * - Acento: rombo geométrico azul/rojo/cyan abajo derecha (post-producción)
   * - Paleta: #E31837 rojo + #1B2F5C navy + blanco
   */
  async generateArticlePost(brief) {
    console.log(`[Diego] ══ PIPELINE ARTICLE POST ══ → ${brief.emailDestino}`);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ─── 1. RESEARCH ─────────────────────────────────────────────────────────
    console.log('[Diego] Investigando FranquiciasHoy.com...');
    const siteFindings = await this.researchFranquiciasHoy();
    const siteContext = siteFindings
      .filter(f => !f.error)
      .map(f => `[${f.url}]\nSitio: ${f.siteTitle}\nDesc: ${f.siteDesc}\nArtículos encontrados: ${(f.articles || []).join(' | ')}`)
      .join('\n\n') || 'Sin acceso directo al sitio — usando conocimiento del medio';

    // ─── 2. COPY + CONCEPTO DE IMAGEN (GPT-4o) ────────────────────────────────
    console.log('[Diego] Generando copy e imagen concept con GPT-4o...');
    const copyPrompt = `${this.basePrompt}

═══ ENCARGO ═══
Crear un post de Instagram/LinkedIn para FranquiciasHoy.com promoviendo un artículo.

═══ RESEARCH DEL SITIO ═══
${siteContext}

═══ CONTEXTO DEL CLIENTE ═══
Tema del post: ${brief.tema || 'artículo de tendencias en el mundo de las franquicias'}
Descripción: ${brief.descripcion || ''}
Audiencia: emprendedores mexicanos, inversionistas, franquiciatarios potenciales

═══ SISTEMA VISUAL DE REFERENCIA (cómo se hacen estos posts) ═══
El formato que usan medios como Expo Franquicias, FranquiciasHoy, FIF:
- Fondo superior: BLANCO limpio (aquí va el copy/texto)
- Zona inferior: foto cinemática aspiracional con personaje en situación narrativa
- Paleta: ROJO #E31837 + Navy #1B2F5C + Blanco
- Tipografía: Gotham / Montserrat Bold para headlines
- Headline: pregunta o dato impactante en rojo bold
- Sub-copy: frase explicativa en navy
- Badge URL: pill button con la web
- Acento esquina: rombo geométrico abstracto (lo añade el diseñador)

═══ LO QUE NECESITO ═══

## ARTÍCULO SUGERIDO
(título que encaje perfectamente con el medio y la audiencia)

## HEADLINE DEL POST
(máx 8 palabras, en rojo, estilo pregunta o dato impactante — como "¿Sin capital suficiente?" o "¡Reserva tu stand hoy mismo!")

## SUB-COPY
(1-2 líneas en navy, explicación o complemento del headline)

## URL / CTA BADGE
(texto corto para el pill button, ej: "FranquiciasHoy.com")

## CONCEPTO DE IMAGEN CINEMÁTICA
(describe en inglés la escena fotográfica que debe generar DALL-E — personaje mexicano, situación narrativa aspiracional relacionada con el artículo, fondo limpio, sin texto. Máx 50 palabras. SOLO la escena, sin mencionar logos ni texto)

## COPY PARA CAPTION INSTAGRAM
(150-200 palabras, con hashtags relevantes del sector franquicias MX)

## RATIONALE
(por qué este concepto funciona para la audiencia de FranquiciasHoy)

Sé específico y ejecutable. El copy tiene que ser lo suficientemente fuerte para parar el scroll.`;

    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2500,
      temperature: 0.75,
      messages: [{ role: 'user', content: copyPrompt }]
    });
    const proposal = gptResponse.choices[0].message.content;

    // Extraer concepto de imagen del proposal para usarlo en DALL-E
    const imageConceptMatch = proposal.match(/## CONCEPTO DE IMAGEN CINEMÁTICA\s*([\s\S]+?)(?=##|$)/i);
    const imageConcept = imageConceptMatch?.[1]?.trim() || brief.descripcion || 'Mexican entrepreneur in aspirational business moment, clean studio background';
    const enrichedBrief = { ...brief, imageConcept };

    // ─── 3. REVISIÓN CARLOS ────────────────────────────────────────────────────
    console.log('[Diego] Solicitando revisión a Carlos...');
    let carlosReview = '(Carlos no disponible)';
    try {
      const CarlosAgent = require('./carlos.agent');
      const carlos = new CarlosAgent();
      carlosReview = await carlos.reviewFIFProposal(proposal, brief);
      console.log('[Diego] ✅ Revisión Carlos recibida');
    } catch (err) {
      console.error('[Diego] Carlos error:', err.message);
    }

    // ─── 4. IMAGEN CINEMÁTICA CON QC LOOP ────────────────────────────────────
    const { bestResult, attempts } = await this._generateImageWithQC(openai, enrichedBrief, proposal);

    let imageUrl = null;
    let imageSection = '';
    let qcSummary = '';

    if (bestResult) {
      const rawImageUrl = bestResult.imageUrl;
      const qc = bestResult.qcResult;
      const statusIcon = qc.approved ? '✅' : '⚠️';
      const intentLabel = `Intento ${bestResult.attempt}/${attempts.length}`;
      qcSummary = `${statusIcon} QC: ${qc.score}/10 — ${intentLabel} ${qc.approved ? '(APROBADO)' : '(MEJOR DISPONIBLE)'}`;
      if (qc.issues?.length) qcSummary += `\nNotas: ${qc.issues.join(' | ')}`;

      // ── COMPOSITOR: headline + sub-copy + URL sobre la foto ─────────────
      console.log('[Diego] Compositing copy sobre imagen de artículo...');
      const compBrief = {
        ...brief,
        formato: 'story',
        marca: 'FRANQUICIASHOY',
        logo_text: 'FranquiciasHoy.com',
        cta: 'Leer artículo →'
      };
      const composed = await this._compositeWithCopy(rawImageUrl, proposal, compBrief);
      imageUrl = composed.url;

      const isComposed = composed.source !== 'original';
      imageSection = `
        <div style="margin: 24px 0; text-align: center;">
          <img src="${imageUrl}" alt="Post artículo con copy" style="width: 100%; max-width: 480px; border-radius: 6px; border: 1px solid #eee;" />
          <p style="font-size: 11px; color: #666; margin-top: 8px; line-height: 1.5; text-align:center;">
            <strong>${isComposed ? '🎨 Post compuesto con headline y copy' : 'Escena cinemática base'}</strong> — DALL-E 3 HD + Compositor · ${intentLabel}<br>
            ${qc.approved ? '✅ QC aprobado' : '⚠️ Mejor disponible'} ${isComposed ? '· Copy integrado programáticamente' : ''}<br>
            ${isComposed ? '<em>Copy incluido. Para ajuste fino de tipografía o brand elements, abrir en Figma.</em>' : '<em>Base sin texto — integrar copy en Figma/Illustrator.</em>'}
          </p>
        </div>`;
    } else {
      imageSection = `<p style="color:#E07B39;font-size:12px;padding:12px;background:#FFF3EB;border-radius:4px;">⚠️ Imagen no generada. Ejecutar concepto manualmente.</p>`;
      qcSummary = 'Sin imagen generada';
    }

    // ─── 5. VALENTINA ──────────────────────────────────────────────────────────
    console.log('[Diego] Validación Valentina...');
    let valentinaNote = '(Valentina — pendiente)';
    try {
      const ValentinaAgent = require('./valentina.agent');
      const valentina = new ValentinaAgent();
      valentinaNote = await valentina.reviewCreativeWork(
        `POST ARTICLE DIEGO:\n${proposal}\n\nCARLOS:\n${carlosReview}\n\nQC:\n${qcSummary}`,
        'Post editorial para medio de franquicias',
        { client_id: 'FRANQUICIASHOY', formato: '1080x1350 portrait' }
      );
      console.log('[Diego] ✅ Valentina OK');
    } catch (err) {
      console.error('[Diego] Valentina error:', err.message);
    }

    // ─── 6. EMAIL ────────────────────────────────────────────────────────────
    const attemptBadges = attempts.map(a => {
      if (a.error) return `<span style="background:#FFEBEE;color:#C62828;padding:2px 8px;border-radius:10px;font-size:10px;margin-right:4px;">❌ Int.${a.attempt}</span>`;
      const c = a.qcResult;
      const color = c.approved ? '#E8F5E9' : c.score >= 5 ? '#FFF8E1' : '#FFEBEE';
      const textColor = c.approved ? '#2E7D32' : c.score >= 5 ? '#F57F17' : '#C62828';
      return `<span style="background:${color};color:${textColor};padding:2px 8px;border-radius:10px;font-size:10px;margin-right:4px;">${c.approved ? '✅' : '⚠️'} Int.${a.attempt}: ${c.score}/10</span>`;
    }).join('');

    // Extraer headline del proposal para el subject
    const headlineMatch = proposal.match(/## HEADLINE DEL POST\s*([\s\S]+?)(?=##|$)/i);
    const headline = headlineMatch?.[1]?.trim().substring(0, 60) || brief.tema || 'Post FranquiciasHoy';

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #F5F5F5; color: #2a2a2a; margin: 0; padding: 0; }
    .container { max-width: 700px; margin: 0 auto; background: #fff; }
    .header { background: #1B2F5C; padding: 28px 40px 20px; }
    .logo-line { font-size: 10px; letter-spacing: 5px; color: #E31837; font-weight: 700; text-transform: uppercase; }
    .from { font-size: 11px; color: #8fa8c8; margin-top: 3px; }
    h1 { font-size: 19px; color: #fff; font-weight: 700; margin: 14px 0 0; }
    .body { padding: 28px 40px; }
    .pill { display: inline-block; background: #FEF0F0; border: 1px solid #FABBBB; color: #C62828; font-size: 10px; padding: 3px 12px; border-radius: 20px; letter-spacing: 1px; margin-right: 6px; margin-bottom: 14px; font-weight: 700; }
    .pill-blue { background: #EBF3FB; border-color: #B3D1F0; color: #1B2F5C; }
    .qc-bar { background: #F5F5F5; border-radius: 6px; padding: 10px 14px; margin: 16px 0; font-size: 11px; }
    .card { border: 1px solid #E8E8E8; border-radius: 6px; margin: 18px 0; overflow: hidden; }
    .card-hdr { background: #F0F4F8; padding: 9px 14px; font-size: 10px; font-weight: 700; color: #1B2F5C; letter-spacing: 1px; text-transform: uppercase; border-bottom: 2px solid #E31837; }
    .card-body { padding: 14px; font-size: 13px; line-height: 1.8; color: #333; white-space: pre-wrap; }
    .footer { background: #F0F4F8; padding: 18px 40px; font-size: 10px; color: #888; border-top: 3px solid #E31837; }
    h2 { color: #1B2F5C; font-size: 13px; border-left: 3px solid #E31837; padding-left: 10px; margin: 18px 0 6px; font-weight: 700; }
    .layout-guide { background: #FFFDE7; border: 1px solid #FDD835; border-radius: 6px; padding: 14px; font-size: 12px; margin: 16px 0; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo-line">FRACTAL MX</div>
    <div class="from">Post editorial · Diego Ramírez · FranquiciasHoy.com</div>
    <h1>📰 ${brief.tema || 'Post Artículo FranquiciasHoy'}</h1>
  </div>
  <div class="body">
    <span class="pill">ARTICLE POST</span>
    <span class="pill pill-blue">GPT-4o + DALL-E 3 HD</span>
    <span class="pill pill-blue">CARLOS + VALENTINA</span>

    <div class="qc-bar">
      <strong>QC Pipeline:</strong> ${attemptBadges || '—'}<br>
      <span style="color:#555;">${qcSummary}</span>
    </div>

    <div class="layout-guide">
      <strong>📐 Guía de layout para producción en Figma/Illustrator:</strong><br>
      Canvas: 1080×1350px · Fondo: blanco superior (#FFFFFF) · Foto: zona inferior 60%<br>
      Copy: Gotham/Montserrat Bold · Headline: <span style="color:#E31837">#E31837</span> · Sub-copy: <span style="color:#1B2F5C">#1B2F5C</span><br>
      Logo FranquiciasHoy: arriba derecha · Acento rombo geométrico: abajo derecha · Pill URL: navy o rojo
    </div>

    ${imageSection}

    <div class="card">
      <div class="card-hdr">📋 Propuesta Diego — Copy + Concepto</div>
      <div class="card-body">${proposal.replace(/## /g, '<h2>').replace(/### /g, '<strong>').replace(/\n/g, '<br>')}</div>
    </div>

    <div class="card">
      <div class="card-hdr">🎨 Revisión Carlos — Sistema Visual</div>
      <div class="card-body">${String(carlosReview).replace(/\n/g, '<br>')}</div>
    </div>

    <div class="card">
      <div class="card-hdr">✅ Validación Valentina — Art Direction</div>
      <div class="card-body">${String(valentinaNote).replace(/\n/g, '<br>')}</div>
    </div>
  </div>
  <div class="footer">
    <strong>Diego Ramírez Salazar</strong> · Senior Graphic Designer — Editorial & Corporate<br>
    Revisado: Carlos Pérez (Branding) · Valentina Cruz (Art Direction)<br>
    Fractal MX Virtual Team v4.2 · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}<br>
    <em>Uso interno — activos de producción pendientes de ejecución en Figma.</em>
  </div>
</div>
</html>`;

    await sendEmail({
      to: brief.emailDestino,
      subject: `📰 Post FranquiciasHoy — "${headline}" | Diego + Carlos + Valentina`,
      html: htmlBody,
      text: `${proposal}\n\n--- CARLOS ---\n${carlosReview}\n\n--- VALENTINA ---\n${valentinaNote}`,
      fromName: 'Diego Ramírez · Fractal MX'
    });

    console.log(`[Diego] ══ ARTICLE POST COMPLETO ══ → ${brief.emailDestino}`);
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

  // ─── VISION (Fase 6.5) ─────────────────────────────────────────────────
  // Diego reviews brand consistency: website vs (optional) brand guide.
  async reviewBrandConsistency({ websiteUrl, brandGuideUrl = null }) {
    if (!websiteUrl) throw new Error('reviewBrandConsistency: websiteUrl required');
    console.log(`📐 DIEGO: revisando consistencia de marca para ${websiteUrl}...`);

    const [website, brandGuide] = await Promise.all([
      this.see(websiteUrl, 'branding'),
      brandGuideUrl ? this.see(brandGuideUrl, 'branding') : Promise.resolve(null)
    ]);

    if (!website || website.error) {
      return { error: true, message: website?.message || 'website_analysis_failed' };
    }

    if (brandGuide && !brandGuide.error) {
      const comparison = await this.compareDesigns(websiteUrl, brandGuideUrl, 'branding');
      return {
        website_analysis: website,
        brand_guide_analysis: brandGuide,
        consistency_report: comparison
      };
    }

    return { website_analysis: website, brand_guide_analysis: null, consistency_report: null };
  }
}

module.exports = DiegoAgent;
