// Higgsfield AI — Commercial photography & cinematic image generation
// Docs: https://api.higgsfield.ai/v1
// Better than DALL-E for: realistic people, commercial scenes, franchise/business photography
// Use when: portrait posts, lifestyle content, professional business scenes

const axios = require('axios');

class HiggsfieldService {
  constructor() {
    this.apiKey = process.env.HIGGSFIELD_API_KEY;
    this.endpoint = process.env.HIGGSFIELD_ENDPOINT || 'https://api.higgsfield.ai/v1';
    this.available = !!(this.apiKey && this.apiKey !== 'PENDING');
  }

  isAvailable() { return this.available; }

  /**
   * Generate image via Higgsfield API
   * @param {string} prompt - Image prompt
   * @param {object} options - { width, height, style, quality }
   * @returns {{ imageUrl, model, provider }}
   */
  async generate(prompt, options = {}) {
    if (!this.available) throw new Error('Higgsfield API key not configured');

    const {
      width = 1080,
      height = 1350,
      style = 'photorealistic',
      quality = 'high',
      negativePrompt = 'text, letters, watermark, logo, low quality, blurry, distorted'
    } = options;

    console.log(`[Higgsfield] Generating ${width}x${height} image...`);

    try {
      const response = await axios.post(
        `${this.endpoint}/images/generate`,
        {
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          style,
          quality,
          num_images: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      const imageUrl = response.data?.images?.[0]?.url || response.data?.url;
      if (!imageUrl) throw new Error('No image URL in Higgsfield response');

      console.log(`[Higgsfield] ✅ Image generated: ${imageUrl.substring(0, 60)}...`);
      return { imageUrl, model: 'higgsfield', provider: 'higgsfield' };

    } catch (err) {
      console.error('[Higgsfield] Error:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Generate with polling (for async APIs)
   */
  async generateWithPolling(prompt, options = {}) {
    const response = await axios.post(
      `${this.endpoint}/images/generate`,
      { prompt, ...options, async: true },
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const jobId = response.data?.job_id;
    if (!jobId) return this.generate(prompt, options);

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const status = await axios.get(`${this.endpoint}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (status.data?.status === 'completed') {
        const imageUrl = status.data?.images?.[0]?.url;
        return { imageUrl, model: 'higgsfield', provider: 'higgsfield' };
      }
      if (status.data?.status === 'failed') throw new Error('Higgsfield job failed');
    }
    throw new Error('Higgsfield timeout after 2 minutes');
  }
}

module.exports = new HiggsfieldService();
