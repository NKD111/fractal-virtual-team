// frontend/office/iso/chromaKey.js
// Strips a near-white background from a Texture and returns a new Texture
// with proper transparency. Runs once per source URL (cached).

import { Texture, Assets } from 'pixi.js';

const cache = new Map(); // url → Promise<HTMLCanvasElement>

/**
 * Load a PNG and remove white-ish background pixels (>= threshold).
 * Returns a Texture that uses a Canvas as source (so the alpha is real).
 */
export async function loadWithChromaKey(url, threshold = 240) {
  if (!cache.has(url)) cache.set(url, _process(url, threshold));
  const canvas = await cache.get(url);
  return Texture.from(canvas);
}

function _process(url, threshold) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        // If pixel is near-white, set alpha to 0
        if (px[i] >= threshold && px[i + 1] >= threshold && px[i + 2] >= threshold) {
          px[i + 3] = 0;
        }
      }
      ctx.putImageData(data, 0, 0);
      resolve(c);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}
