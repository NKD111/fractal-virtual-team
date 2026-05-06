/**
 * Higgsfield Client — Fractal Virtual Team v4.2
 *
 * Wraps the Higgsfield CLI binary via child_process.
 * The CLI binary handles auth + Cloudflare bypass automatically.
 *
 * Credentials setup:
 *   - Local (Windows): hf.exe auth login (stored in %APPDATA%/higgsfield/credentials.json)
 *   - Railway (Linux): credentials written from HIGGSFIELD_COMBINED env var at init
 *
 * Models:
 *   Images → text2image_soul_v2  (params: aspect_ratio, quality)
 *   Videos → seedance_2_0        (params: aspect_ratio, duration, resolution)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execFileAsync = promisify(execFile);

// ─── Binary resolution ─────────────────────────────────────────────────────────
function getBinaryPath() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'hf.exe' : 'hf';

  // 1. Check vendor/ inside backend (Railway builds download here)
  const vendorPath = path.join(__dirname, '..', '..', 'vendor', binName);
  if (fs.existsSync(vendorPath)) return vendorPath;

  // 2. npm global @higgsfield/cli (node_modules/.bin symlink resolves to vendor/hf)
  const npmGlobalPath = path.join(
    path.dirname(process.execPath), // node binary dir
    isWin ? '' : '../lib',
    'node_modules', '@higgsfield', 'cli', 'vendor', binName
  );
  if (fs.existsSync(npmGlobalPath)) return npmGlobalPath;

  // 3. Project root vendor/ (worktree dev)
  const rootVendorPath = path.join(__dirname, '..', '..', '..', 'vendor', binName);
  if (fs.existsSync(rootVendorPath)) return rootVendorPath;

  // 4. Project root directly (dev: hf.exe at repo root)
  const rootBinPath = path.join(__dirname, '..', '..', '..', binName);
  if (fs.existsSync(rootBinPath)) return rootBinPath;

  // 5. PATH (if hf is globally installed)
  return binName; // let execFile search PATH
}

// ─── Credentials setup ─────────────────────────────────────────────────────────
function ensureCredentials() {
  const combined = process.env.HIGGSFIELD_COMBINED
    || (process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_SECRET
        ? `${process.env.HIGGSFIELD_API_KEY}:${process.env.HIGGSFIELD_SECRET}`
        : null);

  if (!combined) return; // rely on existing local credentials

  // Write to OS-appropriate credentials location
  const credsDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'higgsfield')
    : path.join(os.homedir(), '.higgsfield');

  const credsFile = path.join(credsDir, 'credentials.json');

  // Skip if credentials already present
  if (fs.existsSync(credsFile)) return;

  try {
    fs.mkdirSync(credsDir, { recursive: true });
    fs.writeFileSync(credsFile, JSON.stringify({
      access_token: combined,
      token_type: 'Bearer'
    }), 'utf8');
    console.log('[Higgsfield] Credentials written from env vars');
  } catch (err) {
    console.warn('[Higgsfield] Could not write credentials:', err.message);
  }
}

// ─── CLI helper ────────────────────────────────────────────────────────────────
async function runHF(args, timeoutMs = 120000) {
  const bin = getBinaryPath();
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });
    if (stderr && !stdout) throw new Error(stderr.trim());
    return stdout.trim();
  } catch (err) {
    // execFileAsync rejects with the error message in stderr
    const msg = err.stderr || err.message || String(err);
    throw new Error(`[Higgsfield CLI] ${msg.trim()}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify connection and return account info { email, credits, plan }.
 */
async function verify() {
  ensureCredentials();
  const raw = await runHF(['account', 'status', '--json']);
  return JSON.parse(raw);
}

/**
 * Generate an image.
 *
 * @param {string} prompt
 * @param {object} opts
 *   - model       {string}  default: 'text2image_soul_v2'
 *   - aspectRatio {string}  default: '3:4'  (valid: 1:1 16:9 9:16 4:3 3:4 3:2 2:3)
 *   - quality     {string}  default: '2k'   (valid: 1.5k 2k)
 * @returns {{ jobId, resultUrl, params }}
 */
async function generateImage(prompt, opts = {}) {
  ensureCredentials();

  const model = opts.model || 'text2image_soul_v2';
  const aspectRatio = opts.aspectRatio || '3:4';
  const quality = opts.quality || '2k';

  const args = [
    'generate', 'create', model,
    '--prompt', prompt,
    '--aspect_ratio', aspectRatio,
    '--quality', quality,
    '--wait',
    '--json'
  ];

  const raw = await runHF(args, 120000);
  const results = JSON.parse(raw);
  const job = Array.isArray(results) ? results[0] : results;

  if (!job || job.status !== 'completed') {
    throw new Error(`[Higgsfield] Image job failed or incomplete: ${JSON.stringify(job)}`);
  }

  return {
    jobId: job.id,
    resultUrl: job.result_url,
    params: job.params,
    model: job.job_set_type
  };
}

/**
 * Generate a video.
 *
 * @param {string} prompt
 * @param {object} opts
 *   - model       {string}  default: 'seedance_2_0'
 *   - aspectRatio {string}  default: '9:16'   (valid: auto 16:9 9:16 4:3 3:4 1:1 21:9)
 *   - duration    {number}  default: 10 (seconds, seedance supports 5 or 10)
 *   - resolution  {string}  default: '720p' (valid: 480p 720p 1080p)
 * @returns {{ jobId, resultUrl, params }}
 */
async function generateVideo(prompt, opts = {}) {
  ensureCredentials();

  const model = opts.model || 'seedance_2_0';
  const aspectRatio = opts.aspectRatio || '9:16';
  const duration = opts.duration || 10;
  const resolution = opts.resolution || '720p';

  const args = [
    'generate', 'create', model,
    '--prompt', prompt,
    '--aspect_ratio', aspectRatio,
    '--duration', String(duration),
    '--resolution', resolution,
    '--wait',
    '--json'
  ];

  const raw = await runHF(args, 600000); // 10 min timeout for video
  const results = JSON.parse(raw);
  const job = Array.isArray(results) ? results[0] : results;

  if (!job || job.status !== 'completed') {
    throw new Error(`[Higgsfield] Video job failed or incomplete: ${JSON.stringify(job)}`);
  }

  return {
    jobId: job.id,
    resultUrl: job.result_url,
    params: job.params,
    model: job.job_set_type
  };
}

/**
 * Poll the status of a job by ID.
 * @param {string} jobId
 * @returns {{ jobId, status, resultUrl, params }}
 */
async function pollStatus(jobId) {
  ensureCredentials();

  const raw = await runHF(['generate', 'wait', jobId, '--json'], 300000);
  const job = JSON.parse(raw);

  return {
    jobId: job.id,
    status: job.status,
    resultUrl: job.result_url || null,
    params: job.params
  };
}

/**
 * List recent jobs.
 */
async function listJobs() {
  ensureCredentials();
  const raw = await runHF(['generate', 'list', '--json']);
  return JSON.parse(raw);
}

module.exports = { verify, generateImage, generateVideo, pollStatus, listJobs, ensureCredentials };
