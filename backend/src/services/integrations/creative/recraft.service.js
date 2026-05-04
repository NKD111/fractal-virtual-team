// Recraft V3 — Native SVG vector generation
// Docs: https://www.recraft.ai/docs
// Use when: logos, icons, print materials, anything requiring TRUE vectors (not rasterized)
// Unique capability: generates actual editable SVG files

const axios = require('axios');

class RecraftService {
  constructor() {
    this.apiKey = process.env.RECRAFT_API_KEY;
    this.endpoint = process.env.RECRAFT_ENDPOINT || 'https://external.api.recraft.ai/v1';
    this.available = !!(this.apiKey && this.apiKey !== 'PENDING');
  }

  isAvailable() { return this.available; }

  /**
   * Generate SVG vector image
   * @param {string} prompt
   * @param {object} options - { style, colors }
   */
  async generateVector(prompt, options = {}) {
    if (!this.available) throw new Error('Recraft API key not configured');

    const {
      style = 'vector_illustration',
      colors = [],
      size = '1024x1024'
    } = options;

    console.log(`[Recraft] Generating vector SVG: "${prompt.substring(0, 60)}..."`);

    const response = await axios.post(
      `${this.endpoint}/images/generations`,
      {
        prompt,
        style,
        size,
        response_format: 'url',
        ...(colors.length > 0 && { colors: colors.map(hex => ({ hex })) })
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const imageUrl = response.data?.data?.[0]?.url;
    if (!imageUrl) throw new Error('No URL in Recraft response');

    console.log(`[Recraft] ✅ Vector generated`);
    return { imageUrl, model: 'recraft-v3', provider: 'recraft', format: 'svg' };
  }

  /**
   * Generate raster image (PNG/JPG) via Recraft
   */
  async generateRaster(prompt, options = {}) {
    if (!this.available) throw new Error('Recraft API key not configured');

    const { style = 'realistic_image', size = '1024x1024' } = options;

    const response = await axios.post(
      `${this.endpoint}/images/generations`,
      { prompt, style, size, response_format: 'url' },
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    const imageUrl = response.data?.data?.[0]?.url;
    if (!imageUrl) throw new Error('No URL in Recraft response');
    return { imageUrl, model: 'recraft-v3', provider: 'recraft', format: 'png' };
  }

  /**
   * Available styles in Recraft V3
   */
  getAvailableStyles() {
    return {
      vector: ['vector_illustration', 'vector_illustration/line_art', 'vector_illustration/flat_2'],
      raster: ['realistic_image', 'realistic_image/studio_portrait', 'realistic_image/enterprise'],
      digital_art: ['digital_illustration', 'digital_illustration/pixel_art'],
      logo: ['vector_illustration', 'logo_raster']
    };
  }
}

module.exports = new RecraftService();
