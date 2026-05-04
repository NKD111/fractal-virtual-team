// Cloudinary — Professional media storage & CDN
// Stores generated images permanently (DALL-E URLs expire in 1 hour)
// Also provides transformations: resize, crop, format conversion

const axios = require('axios');

class CloudinaryService {
  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    this.apiKey = process.env.CLOUDINARY_API_KEY;
    this.apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.available = !!(this.cloudName && this.cloudName !== 'PENDING');
  }

  isAvailable() { return this.available; }

  /**
   * Upload image from URL to Cloudinary (saves from expiring URLs)
   */
  async uploadFromUrl(imageUrl, options = {}) {
    if (!this.available) {
      console.warn('[Cloudinary] Not configured — returning original URL');
      return { url: imageUrl, secure_url: imageUrl, provider: 'original' };
    }

    const { folder = 'fractal-mx', publicId, tags = [] } = options;

    const formData = new URLSearchParams();
    formData.append('file', imageUrl);
    formData.append('upload_preset', 'ml_default');
    if (folder) formData.append('folder', folder);
    if (publicId) formData.append('public_id', publicId);
    if (tags.length) formData.append('tags', tags.join(','));

    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      formData,
      {
        auth: { username: this.apiKey, password: this.apiSecret },
        timeout: 60000
      }
    );

    console.log(`[Cloudinary] ✅ Uploaded: ${response.data.secure_url}`);
    return {
      url: response.data.url,
      secure_url: response.data.secure_url,
      public_id: response.data.public_id,
      provider: 'cloudinary'
    };
  }

  /**
   * Upload image from Base64 data URL to Cloudinary
   * Used by design-compositor for composed images
   */
  async uploadFromBase64(base64DataUrl, options = {}) {
    if (!this.available) {
      console.warn('[Cloudinary] Not configured — returning base64 data URL as-is');
      return { url: base64DataUrl, secure_url: base64DataUrl, provider: 'base64' };
    }

    const { folder = 'fractal-mx/composed', tags = [], public_id } = options;

    const formData = new URLSearchParams();
    formData.append('file', base64DataUrl);
    formData.append('upload_preset', 'ml_default');
    if (folder) formData.append('folder', folder);
    if (public_id) formData.append('public_id', public_id);
    if (tags.length) formData.append('tags', tags.join(','));

    try {
      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
        formData,
        {
          auth: { username: this.apiKey, password: this.apiSecret },
          timeout: 90000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      console.log(`[Cloudinary] ✅ Base64 uploaded: ${response.data.secure_url}`);
      return {
        url: response.data.url,
        secure_url: response.data.secure_url,
        public_id: response.data.public_id,
        provider: 'cloudinary'
      };
    } catch (err) {
      console.warn('[Cloudinary] Base64 upload failed:', err.message);
      return { url: base64DataUrl, secure_url: base64DataUrl, provider: 'base64' };
    }
  }

  /**
   * Get optimized URL with transformations
   */
  getOptimizedUrl(publicId, transformations = {}) {
    if (!this.available) return null;
    const { width, height, crop = 'fill', quality = 'auto', format = 'auto' } = transformations;
    const transforms = [
      width && `w_${width}`,
      height && `h_${height}`,
      `c_${crop}`,
      `q_${quality}`,
      `f_${format}`
    ].filter(Boolean).join(',');

    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transforms}/${publicId}`;
  }
}

module.exports = new CloudinaryService();
