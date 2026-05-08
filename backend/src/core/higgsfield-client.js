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

// UPGRADE 3: Circuit breaker para Higgsfield
// Si falla 3 veces consecutivas → OPEN, usa fallback textual
const { breakers } = require('./circuit-breaker');

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
// FIX: siempre sobreescribir desde env vars — Railway containers son efímeros
// y el archivo puede quedar inválido/vacío de runs anteriores.
function ensureCredentials() {
  const combined = process.env.HIGGSFIELD_COMBINED
    || (process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_SECRET
        ? `${process.env.HIGGSFIELD_API_KEY}:${process.env.HIGGSFIELD_SECRET}`
        : null);

  if (!combined) return; // sin env vars → confiar en credenciales locales existentes

  // Formato nuevo del hf CLI: { access_token: "hf_xxx", refresh_token: "hfr_xxx" }
  // (token_type ya no se usa; refresh_token opcional para auto-renovación)
  const credsObj = { access_token: combined };
  const refreshToken = process.env.HIGGSFIELD_REFRESH_TOKEN;
  if (refreshToken) credsObj.refresh_token = refreshToken;
  const credsContent = JSON.stringify(credsObj);

  // Write to ALL possible credential locations the hf binary might read from
  const credsDirs = process.platform === 'win32'
    ? [ path.join(process.env.APPDATA || os.homedir(), 'higgsfield') ]
    : [
        path.join(os.homedir(), '.higgsfield'),                          // original
        path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'higgsfield'), // XDG standard
        path.join(os.homedir(), '.config', 'higgsfield'),                // explicit fallback
      ];

  let written = 0;
  for (const credsDir of credsDirs) {
    try {
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, 'credentials.json'), credsContent, 'utf8');
      written++;
    } catch (err) {
      console.warn(`[Higgsfield] Could not write credentials to ${credsDir}:`, err.message);
    }
  }
  console.log(`[Higgsfield] Credentials written to ${written} location(s): ${credsDirs.join(', ')}`);
}

// Escribir credenciales al cargar el módulo (no lazy) para que Railway
// tenga auth lista antes de cualquier request.
ensureCredentials();

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
 *   - timeoutMs   {number}  default: 180000 (3 min)
 * @returns {{ jobId, resultUrl, params }}
 */
async function generateImage(prompt, opts = {}) {
  ensureCredentials();

  const model = opts.model || 'text2image_soul_v2';
  const aspectRatio = opts.aspectRatio || '3:4';
  const quality = opts.quality || '2k';
  const timeoutMs = opts.timeoutMs || 180000; // 3 min default (was 120s — too short for some models)

  // Mapeo de quality legacy (2k/1.5k) → formato nuevo (high/medium/low)
  // gpt_image_2 acepta: low, medium, high
  // nano_banana_2: no acepta --quality (se omite)
  const QUALITY_MAP = { '2k': 'high', '1.5k': 'medium', 'high': 'high', 'medium': 'medium', 'low': 'low' };
  const MODELS_WITH_QUALITY = ['gpt_image_2', 'text2image_soul_v2'];
  const mappedQuality = QUALITY_MAP[quality] || 'high';

  const args = ['generate', 'create', model, '--prompt', prompt, '--aspect_ratio', aspectRatio];
  if (MODELS_WITH_QUALITY.includes(model)) {
    args.push('--quality', mappedQuality);
  }
  args.push('--wait', '--json');

  const raw = await runHF(args, timeoutMs);
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

// ─── BLOQUE Q: Prioridad de modelos y fallback inteligente ─────────────────────
//
// Orden de prioridad para imágenes:
//   1. Nano Banana 2 vía CLI (modelo primario — rápido ~40s, estable)
//   2. GPT Image 2 vía CLI (fallback — calidad máxima, timeout 5 min)
//
// Orden de prioridad para videos:
//   1. Seedance 2.0 vía CLI (reels, FIF)
//   2. Veo 3.1 vía CLI (landing cinematográfica — si disponible)
//
// MCP (https://mcp.higgsfield.ai/mcp):
//   Disponible para Claude Code/Desktop — no para el backend en Railway.
//   Permite referenciar generaciones anteriores por job_id (consistencia visual).
//   Para activarlo en Claude Desktop: agregar MCP server con URL arriba.

const MODELS = {
  images: {
    primary: 'gpt_image_2',
    fallback: 'nano_banana_2',
    ratios: {
      post: '3:4',     // 4:5 Instagram → gpt_image_2 usa 3:4
      banner: '16:9',
      story: '9:16',
      cuadrado: '1:1',
      cover: '2:3'
    }
  },
  videos: {
    primary: 'seedance_2_0',
    cinematic: 'veo_3_1'   // para landing cinematográfica
  }
};

/**
 * Genera imagen con fallback automático GPT Image 2 → Nano Banana 2.
 * Usar esta función en lugar de generateImage() directamente para producción.
 *
 * @param {string} prompt
 * @param {object} opts - { aspectRatio, quality, forceModel }
 * @returns {{ jobId, resultUrl, params, model }}
 */
async function generateImageWithFallback(prompt, opts = {}) {
  const { aspectRatio = MODELS.images.ratios.post, quality = '2k', forceModel = null } = opts;

  // Ajuste de ratio: gpt_image_2 no soporta 4:5 nativo → usar 3:4
  const primaryRatio = aspectRatio === '4:5' ? '3:4' : aspectRatio;

  // Si forzamos modelo específico
  if (forceModel) {
    return generateImage(prompt, { model: forceModel, aspectRatio, quality });
  }

  // UPGRADE 3: Circuit breaker envuelve todos los intentos de imagen
  // OPEN → fallback textual inmediato (no esperar timeouts)
  return breakers.higgsfield.execute(
    // ── Intento principal: Nano Banana 2 → GPT Image 2 (si falla) ───────────
    // Nano Banana 2 es más rápido y estable (~40s). GPT Image 2 puede tardar
    // más de 2 min en Railway → se intenta como fallback con timeout 5 min.
    async () => {
      // 1. Nano Banana 2 (rápido, estable, no acepta --quality)
      try {
        const result = await generateImage(prompt, {
          model: MODELS.images.fallback,  // nano_banana_2
          aspectRatio,
          timeoutMs: 120000  // 2 min para nano banana
        });
        return { ...result, model: MODELS.images.fallback };
      } catch (err) {
        console.warn(`[Higgsfield] Nano Banana 2 falló: ${err.message} — probando GPT Image 2`);
      }

      // 2. GPT Image 2 (calidad máxima, más lento — timeout extendido)
      const result = await generateImage(prompt, {
        model: MODELS.images.primary,  // gpt_image_2
        aspectRatio: primaryRatio,
        quality,
        timeoutMs: 300000  // 5 min para gpt_image_2
      });
      return { ...result, model: MODELS.images.primary };
    },

    // ── Fallback final: descripción textual (pipeline continúa) ──────────────
    async () => {
      console.warn('[Higgsfield] circuit OPEN — retornando arte en descripción textual');
      return {
        jobId:      null,
        resultUrl:  null,
        model:      'text_fallback',
        fallback:   true,
        description: `ARTE PENDIENTE — Higgsfield no disponible.\n` +
                     `Prompt para producción manual: ${prompt.slice(0, 300)}\n` +
                     `Specs: ${aspectRatio}, ${quality}`,
        message: 'Higgsfield temporalmente no disponible. Arte descrito para producción manual.'
      };
    }
  );
}

/**
 * Genera video con fallback automático Seedance 2.0 → Veo 3.1.
 *
 * @param {string} prompt
 * @param {object} opts - { aspectRatio, duration, resolution, useCinematic }
 * @returns {{ jobId, resultUrl, params, model }}
 */
async function generateVideoWithFallback(prompt, opts = {}) {
  const {
    aspectRatio = '9:16',
    duration = 10,
    resolution = '720p',
    useCinematic = false
  } = opts;

  const primaryModel = useCinematic ? MODELS.videos.cinematic : MODELS.videos.primary;

  // 1. Modelo primario
  try {
    const result = await generateVideo(prompt, {
      model: primaryModel,
      aspectRatio,
      duration,
      resolution
    });
    return { ...result, model: primaryModel };
  } catch (err) {
    console.warn(`[Higgsfield] ${primaryModel} falló: ${err.message}`);
  }

  // 2. Fallback: si era cinematográfico → Seedance 2.0; si era Seedance → sin fallback (error real)
  if (useCinematic) {
    return generateVideo(prompt, {
      model: MODELS.videos.primary,
      aspectRatio,
      duration,
      resolution
    });
  }

  throw new Error('[Higgsfield] Seedance 2.0 no disponible y no hay fallback de video configurado');
}

/**
 * Obtiene el job_id del último arte aprobado de un cliente.
 * Permite referenciar generaciones anteriores para consistencia visual entre meses.
 * (Con MCP: higgsfield.mcp.generate({ reference_generation_id: lastJobId }))
 * (Con CLI: este dato se usa como referencia manual en prompts)
 *
 * @param {string} cliente - nombre del cliente (ej: 'FIF')
 * @returns {string|null} higgsfield_job_id del último arte entregado
 */
async function getLastApprovedJobId(cliente) {
  try {
    const { supabase } = require('./supabase');
    const { data } = await supabase
      .from('parrilla_briefs')
      .select('higgsfield_job_id')
      .eq('cliente', cliente)
      .eq('status', 'entregado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.higgsfield_job_id || null;
  } catch {
    return null;
  }
}

module.exports = {
  verify, generateImage, generateVideo, pollStatus, listJobs, ensureCredentials,
  // BLOQUE Q: funciones nuevas
  generateImageWithFallback, generateVideoWithFallback, getLastApprovedJobId,
  MODELS
};
