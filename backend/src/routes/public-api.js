// backend/src/routes/public-api.js
// API pública v1 con autenticación por API key + rate limit + webhooks.
// Uso: Authorization: Bearer fxk_<key>

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabase } = require('../core/supabase');
const { runTask } = require('../routines/task-runner');
const { runGroupChat } = require('../routines/group-chat');

function hashKey(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

// Per-key rate limit (in-memory token bucket)
const buckets = new Map();
function consume(keyHash, limitPerMin) {
  const now = Date.now();
  const b = buckets.get(keyHash) || { tokens: limitPerMin, last: now };
  const elapsed = (now - b.last) / 60_000;
  b.tokens = Math.min(limitPerMin, b.tokens + elapsed * limitPerMin);
  b.last = now;
  if (b.tokens < 1) { buckets.set(keyHash, b); return false; }
  b.tokens -= 1; buckets.set(keyHash, b); return true;
}

async function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(fxk_[a-zA-Z0-9_-]{16,})$/);
  if (!m) return res.status(401).json({ error: 'missing or invalid Authorization (expect: Bearer fxk_...)' });
  const keyHash = hashKey(m[1]);
  const t0 = Date.now();
  try {
    const { data: row } = await supabase.from('api_keys').select('*').eq('key_hash', keyHash).maybeSingle();
    if (!row || !row.active) return res.status(403).json({ error: 'key inactive or unknown' });
    if (!consume(keyHash, row.rate_limit || 60)) return res.status(429).json({ error: 'rate limit exceeded' });
    req._apiKey = row;
    // Update last_used + log async
    supabase.from('api_keys').update({ last_used: new Date().toISOString() }).eq('key_hash', keyHash).then(() => {}).catch(() => {});
    res.on('finish', () => {
      supabase.from('api_usage').insert({
        key_hash: keyHash, endpoint: req.path, method: req.method,
        status: res.statusCode, duration_ms: Date.now() - t0
      }).then(() => {}).catch(() => {});
    });
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ── ADMIN: crear API key (sin auth, sólo si tienes ADMIN_TOKEN) ──────────
router.post('/admin/keys', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin only' });
  }
  const { owner_email, owner_name, scopes = ['read', 'write'], rate_limit = 60 } = req.body || {};
  const raw = 'fxk_' + crypto.randomBytes(20).toString('base64url');
  const prefix = raw.slice(0, 12);
  await supabase.from('api_keys').insert({
    key_hash: hashKey(raw), prefix, owner_email, owner_name, scopes, rate_limit
  });
  res.json({ key: raw, prefix, note: 'Guarda esta key — no se podrá ver de nuevo.' });
});

// ── ADMIN: env-fingerprint para debugging (no devuelve la key, solo metadata)
router.get('/admin/env-fingerprint', async (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin only' });
  }
  const fp = (val) => {
    if (!val) return null;
    return {
      length: val.length,
      starts: val.slice(0, 6),
      ends: val.slice(-4),
      has_whitespace: /\s/.test(val),
      has_newline: /\n|\r/.test(val),
      first_char_code: val.charCodeAt(0),
      last_char_code: val.charCodeAt(val.length - 1)
    };
  };
  res.json({
    ELEVENLABS_API_KEY: fp(process.env.ELEVENLABS_API_KEY),
    STRIPE_SECRET_KEY: fp(process.env.STRIPE_SECRET_KEY),
    RESEND_API_KEY: fp(process.env.RESEND_API_KEY),
    META_ACCESS_TOKEN: fp(process.env.META_ACCESS_TOKEN),
    OPENAI_API_KEY: fp(process.env.OPENAI_API_KEY),
    PUBLIC_URL: process.env.PUBLIC_URL || null,
    NODE_VERSION: process.version,
    process_uptime_sec: Math.round(process.uptime())
  });
});

// ── ADMIN: setup-check via HTTP (?token=ADMIN_TOKEN) ─────────────────────
router.get('/admin/setup-check', async (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin only' });
  }
  const REQUIRED_ENVS = {
    SUPABASE_URL: { required: true }, SUPABASE_SERVICE_KEY: { required: true },
    ANTHROPIC_API_KEY: { required: true }, NEIKY_PHONE: { required: true },
    TWILIO_ACCOUNT_SID: { required: false }, TWILIO_AUTH_TOKEN: { required: false },
    WHATSAPP_PHONE_NUMBER_ID: { required: false }, WHATSAPP_ACCESS_TOKEN: { required: false },
    STRIPE_SECRET_KEY: { required: false }, RESEND_API_KEY: { required: false },
    ELEVENLABS_API_KEY: { required: false }, OPENAI_API_KEY: { required: false },
    GOOGLE_CLIENT_ID: { required: false }, GOOGLE_CLIENT_SECRET: { required: false },
    FIGMA_TOKEN: { required: false }, CLOUDINARY_URL: { required: false },
    ADMIN_TOKEN: { required: false }, PUBLIC_URL: { required: false },
  };
  const REQUIRED_TABLES = [
    'clients','projects','daily_context','tasks','task_events',
    'audit_log','cost_log','qc_reviews','agent_state',
    'insights','embed_leads','voice_cache',
    'deal_rooms','case_studies','api_keys','webhook_subs','agent_baseline',
    'revenue_products','council_votes','revenue_campaigns','revenue_metrics_daily','revenue_events',
    'funnels','subscribers','email_drips','email_drip_sent','blog_posts','product_subscriptions',
    'pending_promises','system_events',
  ];
  const out = { envs: { ok: [], missing_required: [], optional_missing: [] }, tables: { exists: [], missing: [], errored: [] } };
  for (const [name, m] of Object.entries(REQUIRED_ENVS)) {
    const v = process.env[name];
    if (v && v.length > 3) out.envs.ok.push(name);
    else if (m.required) out.envs.missing_required.push(name);
    else out.envs.optional_missing.push(name);
  }
  for (const t of REQUIRED_TABLES) {
    try {
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true }).limit(1);
      if (error) {
        if (/does not exist|42P01/i.test(error.message || '')) out.tables.missing.push(t);
        else out.tables.errored.push({ t, err: error.message });
      } else out.tables.exists.push(t);
    } catch (e) { out.tables.errored.push({ t, err: e.message }); }
  }
  out.ready_for_production = out.envs.missing_required.length === 0 && out.tables.missing.length === 0;
  res.json(out);
});

// ── Public endpoints (require auth) ──────────────────────────────────────
router.use('/v1', authenticate);

router.get('/v1/agents', (req, res) => {
  res.json({
    agents: ['mariana','diana','carlos','diego','alex','sofia','lucas','max','valentina','roberto','qcbot']
      .map(slug => ({ slug, role: roleOf(slug) }))
  });
});

router.post('/v1/task', async (req, res) => {
  const { message, email = null } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  runTask({ message, userEmail: email || req._apiKey.owner_email, source: `api-${req._apiKey.prefix}` })
    .catch(err => console.error('[api/v1/task]', err.message));
  res.json({ accepted: true });
});

router.post('/v1/conversation', async (req, res) => {
  const { theme, replies = 8, gapMs = 6000 } = req.body || {};
  if (!theme) return res.status(400).json({ error: 'theme required' });
  runGroupChat({ topics: 1, repliesPerTopic: replies, gapMs, theme })
    .catch(err => console.error('[api/v1/conversation]', err.message));
  res.json({ accepted: true, theme });
});

router.get('/v1/tasks', async (req, res) => {
  const { data } = await supabase.from('tasks').select('id, brief, status, agent_assigned, image_url, completed_at')
    .order('created_at', { ascending: false }).limit(20);
  res.json({ tasks: data || [] });
});

router.post('/v1/webhooks', async (req, res) => {
  const { url, events = ['*'] } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const secret = crypto.randomBytes(16).toString('base64url');
  const { data } = await supabase.from('webhook_subscriptions').insert({
    key_hash: req._apiKey.key_hash, url, events, secret
  }).select().single();
  res.json({ id: data?.id, secret, note: 'Firma HMAC-SHA256 con secret + body en header X-Fractal-Signature' });
});

function roleOf(slug) {
  return ({
    mariana: 'Hub Coordinator', diana: 'Senior Client Manager',
    carlos: 'Senior Designer (Branding)', diego: 'Senior Designer Editorial',
    alex: 'Content Creator', sofia: 'Project Manager',
    lucas: 'Analytics Lead', max: 'AI Video Editor',
    valentina: 'Art Director', roberto: 'CFO', qcbot: 'Quality Control Bot'
  })[slug] || slug;
}

// ── WEBHOOK DISPATCH (used by other modules) ─────────────────────────────
async function dispatchWebhookEvent(event, payload) {
  try {
    const { data: subs } = await supabase.from('webhook_subscriptions')
      .select('url, secret, events').eq('active', true);
    if (!subs?.length) return;
    const axios = require('axios');
    const matching = subs.filter(s => Array.isArray(s.events) && (s.events.includes('*') || s.events.includes(event)));
    for (const sub of matching) {
      const body = JSON.stringify({ event, payload, ts: Date.now() });
      const sig = crypto.createHmac('sha256', sub.secret || '').update(body).digest('hex');
      axios.post(sub.url, body, {
        headers: { 'Content-Type': 'application/json', 'X-Fractal-Signature': `sha256=${sig}`, 'X-Fractal-Event': event },
        timeout: 5000
      }).catch(err => console.warn('[webhook]', sub.url, err.message));
    }
  } catch (e) { /* silent */ }
}

module.exports = router;
module.exports.dispatchWebhookEvent = dispatchWebhookEvent;
