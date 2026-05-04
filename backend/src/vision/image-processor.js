// backend/src/vision/image-processor.js
// Optimizes images before sending to Claude Vision.

const sharp = require('sharp');

class ImageProcessor {
  // Resize + JPEG-compress an image buffer; return base64 string.
  async optimize(imageBuffer) {
    const optimized = await sharp(imageBuffer)
      .resize(1280, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return optimized.toString('base64');
  }

  async optimizeBase64(base64String) {
    const buffer = Buffer.from(base64String, 'base64');
    return this.optimize(buffer);
  }

  async cropSection(imageBuffer, section) {
    const sections = {
      header: { top: 0, height: 300 },
      hero: { top: 0, height: 600 },
      footer: { fraction: 0.8 }
    };
    const meta = await sharp(imageBuffer).metadata();
    const cfg = sections[section] || sections.hero;
    return sharp(imageBuffer)
      .extract({
        left: 0,
        top: cfg.top || Math.floor((meta.height || 0) * (cfg.fraction || 0)),
        width: meta.width || 1280,
        height: cfg.height || Math.floor((meta.height || 0) * 0.2)
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
}

module.exports = ImageProcessor;
