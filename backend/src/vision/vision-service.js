// backend/src/vision/vision-service.js
// Vision Layer — agents can SEE URLs and images.

const Anthropic = require('@anthropic-ai/sdk');
const BrowserManager = require('./browser-manager');
const ImageProcessor = require('./image-processor');
const VisionCache = require('./cache/vision-cache');
const axios = require('axios');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const VISION_MODEL = 'claude-sonnet-4-6';

// Strip markdown code fences (```json ... ``` or ``` ... ```) before JSON.parse
function parseJsonLoose(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  // Strip leading ```json or ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  // Strip trailing ```
  cleaned = cleaned.replace(/\s*```\s*$/, '');
  try { return JSON.parse(cleaned); }
  catch { return null; }
}

class VisionService {
  constructor() {
    this.browser = new BrowserManager();
    this.processor = new ImageProcessor();
    this.cache = new VisionCache();
    this.isInitialized = false;
    this.startedAt = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    console.log('\n👁️  Vision Layer iniciando...');
    const browserOk = await this.browser.launch();
    // We mark Vision as initialized even if the browser failed — analyzeImage(URL/base64)
    // still works without a browser; only analyzeURL(http://...) needs Chromium.
    this.isInitialized = true;
    this.startedAt = new Date().toISOString();
    if (browserOk) {
      console.log('✅ Vision Layer activo — agentes pueden VER (URLs + imágenes)\n');
    } else {
      console.warn(`⚠️ Vision Layer parcial — sin browser (${this.browser.lastError}). analyzeImage sigue funcionando.\n`);
    }
  }

  // ── analyzeURL: visit + screenshot + analyze ─────────────────────────────────
  async analyzeURL({ url, agent, focus = 'general', useCache = true }) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
    const agentInfo = this._normalizeAgent(agent);

    if (useCache) {
      const cached = await this.cache.get(url);
      if (cached) return { ...cached, _cache_hit: true };
    }

    if (!this.browser.isLaunched) {
      const ok = await this.browser.launch();
      if (!ok) {
        return {
          error: true,
          message: `Browser unavailable: ${this.browser.lastError}`,
          url
        };
      }
    }

    try {
      const screenshot = await this.browser.screenshot(url);
      const optimized = await this.processor.optimize(screenshot);
      const analysis = await this._runAnalysis({
        imageBase64: optimized, url, agent: agentInfo, focus
      });
      await this.cache.set(url, analysis);
      return analysis;
    } catch (err) {
      console.error(`[Vision] analyzeURL error for ${url}:`, err.message);
      return { error: true, message: err.message, url };
    }
  }

  // ── analyzeImage: from URL or base64 (no browser needed) ────────────────────
  async analyzeImage({ imageUrl, imageBase64, agent, focus = 'general' }) {
    const agentInfo = this._normalizeAgent(agent);
    let base64 = imageBase64;
    try {
      if (imageUrl && !imageBase64) {
        const r = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalMX-Vision/1.0)' },
          maxRedirects: 5
        });
        const buf = Buffer.from(r.data);
        base64 = await this.processor.optimize(buf);
      } else if (imageBase64) {
        // Strip data: prefix if present, then re-optimize
        const cleaned = imageBase64.replace(/^data:image\/[a-z]+;base64,/i, '');
        base64 = await this.processor.optimizeBase64(cleaned);
      } else {
        throw new Error('imageUrl or imageBase64 required');
      }
      return this._runAnalysis({ imageBase64: base64, url: imageUrl || null, agent: agentInfo, focus });
    } catch (err) {
      console.error('[Vision] analyzeImage error:', err.message);
      return { error: true, message: err.message };
    }
  }

  // ── compareDesigns: A vs B ──────────────────────────────────────────────────
  async compareDesigns({ sourceA, sourceB, agent, comparisonType = 'style' }) {
    const agentInfo = this._normalizeAgent(agent);
    const isUrl = (s) => typeof s === 'string' && s.startsWith('http');

    const [a, b] = await Promise.all([
      isUrl(sourceA)
        ? this.analyzeURL({ url: sourceA, agent: agentInfo, focus: 'design' })
        : this.analyzeImage({ imageBase64: sourceA, agent: agentInfo, focus: 'design' }),
      isUrl(sourceB)
        ? this.analyzeURL({ url: sourceB, agent: agentInfo, focus: 'design' })
        : this.analyzeImage({ imageBase64: sourceB, agent: agentInfo, focus: 'design' })
    ]);

    if (a.error || b.error) {
      return { error: true, message: 'Could not analyze one or both sources', a_error: a.error ? a.message : null, b_error: b.error ? b.message : null };
    }

    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 2000,
      system: `Eres el sistema de análisis visual de Fractal MX. Agente: ${agentInfo.name} (${agentInfo.role}).
Compara los dos diseños analizados y da feedback específico y accionable.
Responde SOLO con JSON puro — sin markdown, sin code-fences, sin texto antes o después. En español mexicano.`,
      messages: [{
        role: 'user',
        content: `Comparando A vs B (tipo: ${comparisonType})

A: ${JSON.stringify(a).substring(0, 3000)}
B: ${JSON.stringify(b).substring(0, 3000)}

Responde JSON: {
  "similarity_score": 0-100,
  "style_match": "alto|medio|bajo",
  "differences": [],
  "recommendations": [],
  "verdict": "texto corto"
}`
      }]
    });
    const parsed = parseJsonLoose(response.content[0].text);
    if (parsed) return { ...parsed, _a_summary: a.style?.aesthetic, _b_summary: b.style?.aesthetic };
    return { raw: response.content[0].text };
  }

  // ── core analysis with Claude Vision ────────────────────────────────────────
  async _runAnalysis({ imageBase64, url, agent, focus }) {
    const focusPrompts = {
      general:     'Analiza esta imagen/diseño de forma completa.',
      design:      'Analiza este diseño con ojo de director de arte profesional.',
      colors:      'Enfócate en extraer la paleta de colores exacta con códigos HEX.',
      typography:  'Enfócate en identificar tipografías, pesos y usos.',
      composition: 'Analiza la composición, grid, espaciado y jerarquía visual.',
      style:       'Identifica el estilo visual, tendencia y referencias estéticas.',
      branding:    'Analiza la identidad de marca: coherencia, personalidad, valores visuales.',
      qc:          'Revisa calidad: errores, inconsistencias, problemas técnicos.'
    };

    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 3000,
      system: `Eres el sistema de visión de Fractal MX.
Agente: ${agent.name} (${agent.role}).
${url ? `URL: ${url}` : ''}
Responde SIEMPRE en JSON válido sin markdown. En español.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `${focusPrompts[focus] || focusPrompts.general}

Estructura JSON:
{
  "overview": "2 oraciones",
  "style": { "aesthetic": "", "mood": "", "era": "", "references": [] },
  "colors": { "primary": "#HEX", "secondary": "#HEX", "accent": "#HEX", "background": "#HEX", "text": "#HEX", "palette": [], "color_mood": "" },
  "typography": { "primary_font": "", "secondary_font": "", "font_style": "", "hierarchy": "" },
  "composition": { "layout": "", "grid": "", "spacing": "", "hierarchy": "" },
  "technical": { "quality": "alta|media|baja", "issues": [], "format_notes": "" },
  "creative_direction": { "strengths": [], "weaknesses": [], "recommendation": "" },
  "keywords": []
}` }
        ]
      }]
    });

    const analysis = parseJsonLoose(response.content[0].text) || { raw: response.content[0].text };

    return {
      ...analysis,
      url: url || null,
      analyzed_by: agent.name,
      analysis_model: VISION_MODEL,
      analyzed_at: new Date().toISOString(),
      tokens_used: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      }
    };
  }

  _normalizeAgent(agent) {
    if (!agent) return { id: null, name: 'unknown', role: 'unknown' };
    if (agent.agentData) {
      return { id: agent.agentData.id, name: agent.agentData.name || agent.slug, role: agent.agentData.role || '' };
    }
    return { id: agent.id || null, name: agent.name || agent.slug || 'unknown', role: agent.role || '' };
  }

  async getStatus() {
    return {
      initialized: this.isInitialized,
      started_at: this.startedAt,
      browser: this.browser.status(),
      vision_model: VISION_MODEL
    };
  }

  async shutdown() {
    await this.browser.close();
    this.isInitialized = false;
  }
}

let _instance = null;
function getVisionService() {
  if (!_instance) _instance = new VisionService();
  return _instance;
}

module.exports = { VisionService, getVisionService };
