// backend/src/meshy/MeshyPipeline.js
// Pipeline for converting agent reference images → 3D GLB models via Meshy API.
//
// Status: ARMED — code is ready, but does not call Meshy until MESHY_API_KEY
// is set in the environment. Without the key, every method returns a structured
// error and the system continues to use VoxelHumanoid.
//
// Meshy API docs: https://docs.meshy.ai/api/image-to-3d/v1
// Endpoint:  POST   https://api.meshy.ai/openapi/v1/image-to-3d
// Endpoint:  GET    https://api.meshy.ai/openapi/v1/image-to-3d/{id}
//
// Typical flow:
//   1. generateModel({ imageUrl, agentSlug })  → returns { task_id }
//   2. pollUntilReady(task_id, opts)           → returns { status, model_urls, ... }
//   3. downloadGLB(task_id, destPath)          → saves GLB to disk / Supabase storage
//   4. Frontend loads GLB via /api/meshy/asset/:agentSlug
//
// All requests are read-only or POST with the user's own image URL.
// Cost guard: opts.maxPollSeconds defaults to 300s (~5 min); abort after that.

const axios = require('axios');
const { supabase } = require('../core/supabase');

const MESHY_BASE = 'https://api.meshy.ai/openapi/v1';

class MeshyPipeline {
  constructor() {
    this.apiKey = process.env.MESHY_API_KEY || null;
    this.armed = !!this.apiKey;
    this.lastError = this.armed ? null : 'MESHY_API_KEY not set';
  }

  status() {
    return {
      armed: this.armed,
      api_base: MESHY_BASE,
      last_error: this.lastError
    };
  }

  _headers() {
    if (!this.armed) throw new Error('Meshy not armed: MESHY_API_KEY missing');
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Submit an image to Meshy for 3D model generation.
   * @param {object} opts
   * @param {string} opts.imageUrl   - Public URL of source image (PNG/JPG)
   * @param {string} opts.agentSlug  - Logical name (mariana, carlos, …)
   * @param {string} [opts.style]    - 'realistic' | 'sculpture' | 'cartoon'
   * @param {boolean} [opts.enable_pbr] - Enable PBR materials (default true)
   * @returns {Promise<{ task_id: string, agent_slug: string }>}
   */
  async generateModel({ imageUrl, agentSlug, style = 'cartoon', enable_pbr = true }) {
    if (!this.armed) return { error: 'Meshy not armed (set MESHY_API_KEY)' };
    if (!imageUrl || !agentSlug) throw new Error('imageUrl and agentSlug required');

    const body = {
      image_url: imageUrl,
      ai_model: 'meshy-4',
      style,
      enable_pbr,
      surface_mode: 'organic',
      topology: 'quad'
    };

    try {
      const r = await axios.post(`${MESHY_BASE}/image-to-3d`, body, { headers: this._headers(), timeout: 30000 });
      const taskId = r.data?.result || r.data?.id || r.data?.task_id;
      if (!taskId) throw new Error('No task_id in Meshy response');

      // Persist a record for tracking
      try {
        await supabase.from('meshy_jobs').insert({
          task_id: taskId,
          agent_slug: agentSlug,
          source_image_url: imageUrl,
          status: 'pending',
          requested_style: style,
          requested_at: new Date().toISOString()
        });
      } catch (_) { /* table optional */ }

      return { task_id: taskId, agent_slug: agentSlug, style };
    } catch (err) {
      this.lastError = err.response?.data?.message || err.message;
      throw new Error(`Meshy generateModel: ${this.lastError}`);
    }
  }

  /**
   * Poll Meshy task until completed or until maxPollSeconds elapsed.
   * @param {string} taskId
   * @param {object} [opts]
   * @param {number} [opts.intervalMs=5000]
   * @param {number} [opts.maxPollSeconds=300]
   * @returns {Promise<{ status, model_urls, progress, ... }>}
   */
  async pollUntilReady(taskId, opts = {}) {
    if (!this.armed) return { error: 'Meshy not armed' };
    const interval = opts.intervalMs || 5000;
    const maxMs = (opts.maxPollSeconds || 300) * 1000;
    const start = Date.now();

    while (Date.now() - start < maxMs) {
      const status = await this.checkStatus(taskId);
      if (status.status === 'SUCCEEDED' || status.status === 'FAILED' || status.status === 'EXPIRED') {
        try {
          await supabase.from('meshy_jobs').update({
            status: status.status,
            model_urls: status.model_urls || null,
            completed_at: new Date().toISOString()
          }).eq('task_id', taskId);
        } catch (_) {}
        return status;
      }
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Meshy poll timeout (${opts.maxPollSeconds || 300}s)`);
  }

  async checkStatus(taskId) {
    if (!this.armed) return { error: 'Meshy not armed' };
    try {
      const r = await axios.get(`${MESHY_BASE}/image-to-3d/${taskId}`, { headers: this._headers(), timeout: 15000 });
      return r.data;
    } catch (err) {
      this.lastError = err.response?.data?.message || err.message;
      throw new Error(`Meshy checkStatus: ${this.lastError}`);
    }
  }

  /**
   * Download the GLB for a completed task. Caches in Supabase Storage if available,
   * otherwise returns the direct Meshy URL (which is signed and time-limited).
   * @param {string} taskId
   * @param {string} agentSlug
   * @returns {Promise<{ glb_url: string, cached?: boolean }>}
   */
  async downloadGLB(taskId, agentSlug) {
    if (!this.armed) return { error: 'Meshy not armed' };
    const status = await this.checkStatus(taskId);
    if (status.status !== 'SUCCEEDED') {
      return { error: `task not succeeded: ${status.status}` };
    }
    const directUrl = status.model_urls?.glb;
    if (!directUrl) return { error: 'no glb url in result' };

    // Try to cache to Supabase Storage. If it fails, return Meshy's signed URL.
    try {
      const r = await axios.get(directUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const buf = Buffer.from(r.data);
      const path = `agents/${agentSlug}.glb`;
      const { error } = await supabase.storage.from('meshy-models').upload(path, buf, {
        contentType: 'model/gltf-binary',
        upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from('meshy-models').getPublicUrl(path);
        return { glb_url: data.publicUrl, cached: true };
      }
    } catch (_) { /* fall through to direct */ }

    return { glb_url: directUrl, cached: false };
  }

  /**
   * Convenience: generate, poll, download in one call.
   * Throws/returns error on failure.
   */
  async fullPipeline({ imageUrl, agentSlug, style }) {
    const { task_id } = await this.generateModel({ imageUrl, agentSlug, style });
    const result = await this.pollUntilReady(task_id);
    if (result.status !== 'SUCCEEDED') return { error: `generation ${result.status}`, task_id };
    const dl = await this.downloadGLB(task_id, agentSlug);
    return { task_id, status: 'SUCCEEDED', ...dl, agent_slug: agentSlug };
  }
}

let _instance = null;
function getMeshy() {
  if (!_instance) _instance = new MeshyPipeline();
  return _instance;
}

module.exports = { MeshyPipeline, getMeshy };
