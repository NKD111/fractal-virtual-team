// MODEL ROUTER — Intelligent model selection for image generation
//
// Decides which AI model to use based on:
// - Project type (social media, print, vector, video)
// - Required format (PNG, SVG, PDF)
// - Available API keys
// - Quality requirements
//
// Priority order:
//   Social/Photography: Higgsfield > DALL-E 3
//   Vectors/Print: Recraft V3 > (fallback description only)
//   Fallback: DALL-E 3 always available (we have the key)

const higgsfield = require('../integrations/creative/higgsfield.service');
const recraft = require('../integrations/creative/recraft.service');
const cloudinary = require('../integrations/creative/cloudinary.service');
const OpenAI = require('openai');

class ModelRouter {

  /**
   * Analyze project type and determine best model
   * @param {object} brief - { type, format, purpose, deliverable, hasRealPeople }
   * @returns {{ model, provider, reasoning }}
   */
  analyzeProjectType(brief) {
    const desc = JSON.stringify(brief).toLowerCase();

    // VECTOR needed: logos, icons, print, SVG, AI file, EPS
    const needsVector = ['logo', 'vector', 'svg', 'eps', 'ai file', 'illustrator', 'icono', 'icon', 'imprimir', 'impresion', 'impresión', 'print', 'lona', 'banner impres']
      .some(k => desc.includes(k));

    // PHOTO needed: people, faces, lifestyle, cinematic, social media posts
    const needsPhoto = ['persona', 'gente', 'personas', 'emprendedor', 'empresario', 'chef', 'fotografia', 'fotografía', 'cinematic', 'lifestyle', 'post', 'instagram', 'reel', 'social']
      .some(k => desc.includes(k));

    // PRINT quality needed
    const needsPrint = ['cmyk', '300dpi', 'bleed', 'lona', 'cartel', 'imprimir', 'print']
      .some(k => desc.includes(k));

    if (needsVector) {
      if (recraft.isAvailable()) {
        return {
          model: 'recraft-v3',
          provider: 'recraft',
          format: 'svg',
          reasoning: 'Proyecto requiere vectores reales — Recraft V3 genera SVG nativos editables'
        };
      }
      return {
        model: 'dalle-3',
        provider: 'openai',
        format: 'png',
        reasoning: 'Vector solicitado pero Recraft no disponible — DALL-E 3 como fallback (no produce SVG real)',
        warning: 'Para vectores reales configurar RECRAFT_API_KEY'
      };
    }

    if (needsPhoto || needsPrint) {
      if (higgsfield.isAvailable()) {
        return {
          model: 'higgsfield',
          provider: 'higgsfield',
          format: 'png',
          reasoning: 'Higgsfield: superior para fotografía comercial cinemática con personas reales'
        };
      }
    }

    // Default: DALL-E 3 (always available)
    return {
      model: 'dalle-3',
      provider: 'openai',
      format: 'png',
      reasoning: 'DALL-E 3: modelo default — calidad editorial, sin personas fotorrealistas'
    };
  }

  /**
   * Generate image using the best available model
   * Returns { imageUrl, model, provider, format, reasoning }
   */
  async generate(prompt, brief = {}, dalleOptions = {}) {
    const selection = this.analyzeProjectType(brief);
    console.log(`[ModelRouter] Selected: ${selection.model} — ${selection.reasoning}`);

    try {
      if (selection.provider === 'higgsfield') {
        const result = await higgsfield.generate(prompt, {
          width: 1080,
          height: 1350,
          style: 'photorealistic'
        });
        return { ...result, ...selection };
      }

      if (selection.provider === 'recraft') {
        const result = await recraft.generateVector(prompt, {
          style: 'vector_illustration',
          size: '1024x1024',
          colors: brief.colors || []
        });
        return { ...result, ...selection };
      }

      // DALL-E 3 fallback
      return await this._generateDalle(prompt, dalleOptions, selection);

    } catch (err) {
      console.error(`[ModelRouter] ${selection.model} failed:`, err.message);
      // Cascade fallback to DALL-E 3
      if (selection.provider !== 'openai') {
        console.log('[ModelRouter] Falling back to DALL-E 3...');
        return await this._generateDalle(prompt, dalleOptions, {
          ...selection,
          model: 'dalle-3 (fallback)',
          reasoning: `${selection.reasoning} — fallback por error en ${selection.provider}`
        });
      }
      throw err;
    }
  }

  /**
   * Generate with DALL-E 3
   */
  async _generateDalle(prompt, options = {}, meta = {}) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const imgResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      size: options.size || '1024x1792',
      quality: options.quality || 'hd',
      style: options.style || 'natural',
      n: 1
    });

    const imageUrl = imgResponse.data[0].url;
    console.log(`[ModelRouter] DALL-E 3 generated: ${imageUrl.substring(0, 60)}...`);
    return {
      imageUrl,
      model: meta.model || 'dalle-3',
      provider: 'openai',
      format: 'png',
      reasoning: meta.reasoning || 'DALL-E 3 generación directa'
    };
  }

  /**
   * Persist image to Cloudinary (DALL-E URLs expire in 1 hour)
   */
  async persistToCloudinary(imageUrl, tags = []) {
    if (!cloudinary.isAvailable()) return imageUrl;
    try {
      const stored = await cloudinary.uploadFromUrl(imageUrl, {
        folder: 'fractal-mx/generated',
        tags: ['ai-generated', ...tags]
      });
      return stored.secure_url;
    } catch (err) {
      console.warn('[ModelRouter] Cloudinary upload failed, using original URL:', err.message);
      return imageUrl;
    }
  }

  /**
   * Status report of all available models
   */
  getModelStatus() {
    return {
      'DALL-E 3': { available: !!process.env.OPENAI_API_KEY, use_for: 'Editorial, geometric, abstract' },
      'Higgsfield': { available: higgsfield.isAvailable(), use_for: 'Cinematic photography, people, lifestyle' },
      'Recraft V3': { available: recraft.isAvailable(), use_for: 'SVG vectors, logos, print-ready' },
      'Cloudinary': { available: cloudinary.isAvailable(), use_for: 'Persistent storage, CDN, transformations' }
    };
  }
}

module.exports = new ModelRouter();
