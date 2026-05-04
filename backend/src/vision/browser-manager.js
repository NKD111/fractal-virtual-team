// backend/src/vision/browser-manager.js
// Manages a single shared headless Chromium for the Vision Layer.

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (_) { puppeteer = null; }

const DEFAULT_EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

class BrowserManager {
  constructor() {
    this.browser = null;
    this.isLaunched = false;
    this.lastError = null;
  }

  async launch() {
    if (this.isLaunched) return true;
    if (!puppeteer) {
      this.lastError = 'puppeteer-core not installed';
      return false;
    }
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath: DEFAULT_EXECUTABLE,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1440,900'
        ]
      });
      this.isLaunched = true;
      console.log('🌐 Vision: Browser Manager listo');
      return true;
    } catch (err) {
      this.lastError = err.message;
      console.warn(`[BrowserManager] launch failed: ${err.message}`);
      this.isLaunched = false;
      return false;
    }
  }

  async screenshot(url, options = {}) {
    if (!this.isLaunched) {
      const ok = await this.launch();
      if (!ok) throw new Error(`Browser not launched: ${this.lastError}`);
    }

    const page = await this.browser.newPage();
    try {
      await page.setViewport({
        width: options.width || 1440,
        height: options.height || 900,
        deviceScaleFactor: 1
      });

      // Block heavy/non-essential resources for speed
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const t = req.resourceType();
        if (t === 'media' || t === 'font') req.abort();
        else req.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500)); // settle

      return await page.screenshot({
        type: 'jpeg',
        quality: 85,
        fullPage: !!options.fullPage
      });
    } finally {
      try { await page.close(); } catch (_) {}
    }
  }

  async close() {
    if (this.browser) {
      try { await this.browser.close(); } catch (_) {}
      this.browser = null;
      this.isLaunched = false;
    }
  }

  status() {
    return {
      available: !!puppeteer,
      launched: this.isLaunched,
      executable: DEFAULT_EXECUTABLE,
      last_error: this.lastError
    };
  }
}

module.exports = BrowserManager;
