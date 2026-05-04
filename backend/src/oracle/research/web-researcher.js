// backend/src/oracle/research/web-researcher.js
// Lightweight web research via DuckDuckGo HTML — no API key required.

const axios = require('axios');

class WebResearcher {
  async search(query) {
    try {
      const response = await axios.get(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ORACLE/1.0)' },
          timeout: 10000
        }
      );

      const results = [];
      const regex = /class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = regex.exec(response.data)) !== null && results.length < 10) {
        let url = m[1];
        // DDG sometimes returns redirect URLs — try to extract the real one
        const ddgRedirect = url.match(/uddg=([^&]+)/);
        if (ddgRedirect) {
          try { url = decodeURIComponent(ddgRedirect[1]); } catch (_) {}
        }
        const title = m[2].replace(/<[^>]+>/g, '').trim();
        if (url.startsWith('http') && title) results.push({ url, title });
      }
      return results;
    } catch (err) {
      console.warn('[WebResearcher] search error:', err.message);
      return [];
    }
  }

  async extractContent(sources) {
    const results = await Promise.allSettled(
      sources.slice(0, 5).map(async source => {
        try {
          const response = await axios.get(source.url, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ORACLE/1.0)' },
            maxRedirects: 3
          });
          const text = String(response.data || '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);
          return { url: source.url, title: source.title, summary: text };
        } catch (_) {
          return null;
        }
      })
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }
}

module.exports = WebResearcher;
