// backend/src/vision/cache/vision-cache.js
// 7-day cache for vision analysis (DB-backed) — avoid re-analyzing the same URL.

const { supabase } = require('../../core/supabase');

class VisionCache {
  async get(url) {
    if (!url) return null;
    try {
      const { data } = await supabase
        .from('vision_cache')
        .select('analysis')
        .eq('source_url', url)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      return data?.analysis || null;
    } catch (_) {
      return null;
    }
  }

  async set(url, analysis) {
    if (!url || !analysis) return { ok: false, reason: 'missing args' };
    try {
      const { error } = await supabase.from('vision_cache').upsert({
        source_url: url,
        source_type: 'url',
        analysis,
        colors_extracted: analysis.colors?.palette || [],
        style_keywords: analysis.keywords || [],
        analyzed_by: analysis.analyzed_by || null,
        analysis_model: analysis.analysis_model || 'claude-sonnet-4-6',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: 'source_url' });
      if (error) {
        console.warn('[VisionCache] set error:', error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      console.warn('[VisionCache] set exception:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async invalidate(url) {
    try { await supabase.from('vision_cache').delete().eq('source_url', url); }
    catch (_) {}
  }
}

module.exports = VisionCache;
