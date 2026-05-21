// backend/src/pipelines/whop-vault.js
//
// WHOP VAULT PIPELINE — Looping ambient video backgrounds for streamers
// and faceless creators. Sold as packs on Whop.
//
//   input:  { topic, count?, duration?, resolution? }
//   output: { ok, pack, topic, videos: [{ prompt, url, jobId, localPath? }] }
//
// Specs:
//   • Aspect ratio: 16:9 (horizontal — YouTube backgrounds, desktop wallpapers)
//   • Duration: 10s loops (seedance_2_0 supports 5 or 10 seconds)
//   • Resolution: 1080p (max via current Higgsfield CLI; 4K not yet exposed)
//   • Pack 1: "Dark Academia Backgrounds" (library, candles, rain, books)
//   • Pack 2: "Cyberpunk Lofi Room" (neon, rain, monitors, plants)
//
// Whop monetization: pack of 8-12 clips, sold once, downloaded as ZIP.

const fs = require('fs');
const path = require('path');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const OUT_DIR = path.join(__dirname, '..', '..', 'output', 'whop-vault');
fs.mkdirSync(OUT_DIR, { recursive: true });

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ── Built-in pack themes (extend freely) ──────────────────────────────────────
const PACK_PRESETS = {
  'dark-academia': {
    name: 'Dark Academia Backgrounds',
    seeds: [
      'Candlelit Victorian library, towering oak bookshelves, leather-bound volumes, golden candle glow, dust motes drifting in shafts of light, slow camera push-in, cinematic.',
      'Rain streaming down a tall arched window at night, a single brass candelabra burning on a wooden desk, vintage books stacked beside it, soft amber light, slow pan.',
      'Close-up of an open antique book, pages turning slowly in a quiet study, ink quill resting in an inkwell, candle flickering, warm tungsten light.',
      'A grand stone fireplace crackling in a wood-paneled study, leather armchair, tall bookshelves in the background, firelight flickering, slow zoom in.',
      'Ornate brass desk lamp glowing on a heavy oak desk, scattered manuscripts and a fountain pen, rain falling beyond a leaded-glass window, slow dolly in.',
      'Wide shot of a gothic university library at night, marble columns, green banker lamps glowing along long reading tables, slow tracking shot.',
      'Steam rising from a porcelain teacup beside an open journal, fountain pen mid-script, warm candlelight, vintage books behind, shallow depth of field.',
      'Heavy wooden door slightly ajar in an old library corridor, golden light spilling through, dust motes, slow approach toward the door.',
    ],
  },
  'cyberpunk-lofi': {
    name: 'Cyberpunk Lofi Room',
    seeds: [
      'A neon-lit lofi bedroom at night, purple and cyan glow, a vinyl record spinning on a turntable, monitor showing slow code scroll, raindrops on the window.',
      'Close-up of a holographic synthwave clock above a desk cluttered with cables and an open laptop, neon reflections, rain outside, slow zoom.',
      'Wide shot of a small Tokyo-style apartment at midnight, glowing neon signs visible through the window, plants softly lit, ambient steam rising.',
      'Rooftop view of a cyberpunk city skyline at night from a desk by a window, holographic billboards, soft rain, slow camera drift left.',
      'A glowing mechanical keyboard typing slowly on its own, ambient RGB lighting, monitor displaying a quiet code editor, dark room mood.',
      'A cat silhouette curled up on a windowsill in a cyberpunk apartment, neon city outside, raindrops on glass, slow gentle camera pull.',
      'Pixel art game running on a CRT monitor in a dark room, lava lamp bubbling beside it, neon poster on the wall, slow dolly back.',
      'Bookshelf with retro tech items — old Walkman, cassette tapes, vintage Polaroid — bathed in pink and blue neon, slow pan right.',
    ],
  },
};

// ── Step 1: Generate prompts (use preset or LLM) ──────────────────────────────
async function generatePrompts({ topic, count }) {
  const presetKey = slug(topic);
  if (PACK_PRESETS[presetKey]) {
    const p = PACK_PRESETS[presetKey];
    const seeds = p.seeds.slice(0, count || 8);
    return { packName: p.name, prompts: seeds };
  }

  // LLM-generated prompts for arbitrary topics
  if (!anthropic) {
    return {
      packName: topic,
      prompts: Array.from({ length: count || 8 }, (_, i) =>
        `${topic}, cinematic ambient scene #${i + 1}, slow camera motion, 16:9 horizontal, no text, loopable.`
      ),
    };
  }

  try {
    const userPrompt = `Generate ${count || 8} cinematic video prompts for an ambient looping background pack.
Pack theme: "${topic}"
Audience: streamers, faceless YouTube creators, desktop wallpaper enthusiasts.

Each prompt must:
- describe one self-contained 10-second scene
- specify slow, looping camera motion (drift, zoom, pan — never cuts)
- be 16:9 horizontal framing
- have NO text, NO faces, NO logos
- be visually distinct from the others (different angle, time of day, focal point)
- read like a film cinematography note (~30-50 words)

Return STRICT JSON only:
{ "pack_name": "...", "prompts": ["prompt 1", "prompt 2", ...] }`;

    const res = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('no json');
    const parsed = JSON.parse(json);
    return {
      packName: parsed.pack_name || topic,
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, count || 8) : [],
    };
  } catch (err) {
    console.warn('[whop-vault] prompt gen failed, using generic:', err.message);
    return {
      packName: topic,
      prompts: Array.from({ length: count || 8 }, (_, i) =>
        `${topic}, cinematic ambient scene #${i + 1}, slow camera motion, 16:9 horizontal, no text, loopable.`
      ),
    };
  }
}

// ── Step 2: Download a remote URL to a local file ─────────────────────────────
function downloadTo(localPath, url) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(localPath);
        return downloadTo(localPath, response.headers.location).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(localPath);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(localPath)));
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(localPath); } catch {}
      reject(err);
    });
  });
}

// ── Step 3: Generate one video via Higgsfield ─────────────────────────────────
async function renderVideo(prompt, { duration, resolution } = {}) {
  const { generateVideoWithFallback, generateVideo } =
    require('../core/higgsfield-client');
  const fn = generateVideoWithFallback || generateVideo;
  return fn(prompt, {
    aspectRatio: '16:9',
    duration: duration || 10,
    resolution: resolution || '1080p',
  });
}

// ── Main: orchestrator ────────────────────────────────────────────────────────
async function runWhopVault({ topic, count, duration, resolution, download } = {}) {
  if (!topic) throw new Error('topic is required');
  console.log(`[whop-vault] start topic="${topic}" count=${count || 8}`);

  const { packName, prompts } = await generatePrompts({ topic, count });
  if (!prompts.length) throw new Error('no prompts generated');

  const packDir = path.join(OUT_DIR, `${slug(packName)}-${Date.now()}`);
  fs.mkdirSync(packDir, { recursive: true });

  const videos = [];
  // Render serially to respect Higgsfield rate limits / credit budgeting
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`[whop-vault] (${i + 1}/${prompts.length}) rendering…`);
    try {
      const job = await renderVideo(prompt, { duration, resolution });
      const entry = {
        index: i + 1,
        prompt,
        jobId: job.jobId,
        url: job.resultUrl,
        params: job.params,
      };

      if (download && job.resultUrl) {
        const localPath = path.join(packDir, `clip-${String(i + 1).padStart(2, '0')}.mp4`);
        try {
          await downloadTo(localPath, job.resultUrl);
          entry.localPath = localPath;
        } catch (dErr) {
          console.warn(`[whop-vault] download failed for clip ${i + 1}:`, dErr.message);
        }
      }
      videos.push(entry);
    } catch (err) {
      console.error(`[whop-vault] clip ${i + 1} failed:`, err.message);
      videos.push({ index: i + 1, prompt, error: err.message });
    }
  }

  // Persist manifest
  const manifest = {
    pack: packName,
    topic,
    aspect_ratio: '16:9',
    duration: duration || 10,
    resolution: resolution || '1080p',
    created_at: new Date().toISOString(),
    videos,
  };
  fs.writeFileSync(path.join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const ok = videos.filter((v) => !v.error).length;
  console.log(`[whop-vault] done → ${packDir} (${ok}/${videos.length} clips)`);

  return {
    ok: ok > 0,
    pack: packName,
    topic,
    packDir,
    videos,
    success_count: ok,
    fail_count: videos.length - ok,
  };
}

module.exports = { runWhopVault, generatePrompts, PACK_PRESETS };
