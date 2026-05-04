// backend/src/tests/vision-stress.js
// Stress test for Vision Layer (Fase 6.5).

const { supabase } = require('../core/supabase');
const { getAgent } = require('../core/orchestrator');

const passSummary = (checks) =>
  Object.entries(checks).filter(([k]) => !k.startsWith('_')).every(([, v]) => v === true);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Service initialization ──────────────────────────────────────────────────
async function test_V1_service_initialized() {
  const checks = { service_loaded: false, initialized: false, has_browser_status: false };
  try {
    checks.service_loaded = !!global.visionService;
    if (checks.service_loaded) {
      const status = await global.visionService.getStatus();
      checks.initialized = status?.initialized === true;
      checks.has_browser_status = !!status?.browser;
      checks._browser = status?.browser;
    }
  } catch (err) { checks._error = err.message; }
  return { test: 'V1', name: 'Vision service initialized', passed: passSummary(checks), checks };
}

// ── Browser launches (Chromium installed?) ──────────────────────────────────
async function test_V2_browser_available() {
  const checks = { puppeteer_installed: false, browser_launched: false };
  try {
    const status = await global.visionService.getStatus();
    checks.puppeteer_installed = status?.browser?.available === true;
    checks.browser_launched = status?.browser?.launched === true;
    checks._executable = status?.browser?.executable;
    checks._lastError = status?.browser?.last_error;
  } catch (err) { checks._error = err.message; }
  return { test: 'V2', name: 'Browser available', passed: passSummary(checks), checks };
}

// ── Cache table reachable ───────────────────────────────────────────────────
async function test_V3_cache_table_reachable() {
  const checks = { table_exists: false };
  try {
    const { error } = await supabase.from('vision_cache').select('id', { head: true, count: 'exact' }).limit(1);
    checks.table_exists = !error;
    if (error) checks._error = error.message;
  } catch (err) { checks._error = err.message; }
  return { test: 'V3', name: 'vision_cache table reachable', passed: passSummary(checks), checks };
}

// ── analyzeImage from a URL (no browser needed) — reliable test ────────────
async function test_V4_analyze_image_url() {
  const checks = { analysis_returned: false, has_style: false, has_colors: false };
  try {
    // 1x1 transparent PNG would be too small. Use a real public image.
    // Use a small known image. We rely on Anthropic Vision returning structured JSON.
    const result = await global.visionService.analyzeImage({
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Logo_2013_Google.png/320px-Logo_2013_Google.png',
      agent: { id: null, name: 'tester', role: 'verification' },
      focus: 'general'
    });
    checks.analysis_returned = !!result && !result.error;
    checks.has_style = !!result?.style;
    checks.has_colors = !!result?.colors;
    checks._preview = result?.overview?.substring(0, 100);
  } catch (err) { checks._error = err.message; }
  return { test: 'V4', name: 'analyzeImage(URL)', passed: passSummary(checks), checks };
}

// ── analyzeURL — depends on browser, may be skipped if browser unavailable ─
async function test_V5_analyze_url() {
  const checks = { analysis_returned: false, _browser_required: true };
  try {
    const status = await global.visionService.getStatus();
    if (!status?.browser?.launched) {
      checks._error = 'browser not launched — skipping';
      checks.analysis_returned = false;
      checks._skipped = true;
      return { test: 'V5', name: 'analyzeURL', passed: false, checks };
    }
    const result = await global.visionService.analyzeURL({
      url: 'https://example.com',
      agent: { id: null, name: 'tester', role: 'verification' },
      focus: 'general',
      useCache: false
    });
    checks.analysis_returned = !!result && !result.error;
    checks._preview = result?.overview?.substring(0, 100);
  } catch (err) { checks._error = err.message; }
  return { test: 'V5', name: 'analyzeURL', passed: passSummary(checks), checks };
}

// ── Cache write/read round-trip ─────────────────────────────────────────────
async function test_V6_cache_roundtrip() {
  const checks = { write_ok: false, read_ok: false, returns_same_data: false };
  const VisionCache = require('../vision/cache/vision-cache');
  const cache = new VisionCache();
  const url = `https://test.local/cache_${Date.now()}`;
  const sample = { overview: 'test', style: { aesthetic: 'test' }, colors: { palette: ['#abcdef'] }, keywords: ['x'], analyzed_by: 'verifier' };
  try {
    const setResult = await cache.set(url, sample);
    checks.write_ok = setResult?.ok === true;
    if (!checks.write_ok) checks._set_error = setResult?.error;
    await sleep(800);
    const got = await cache.get(url);
    checks.read_ok = !!got;
    checks.returns_same_data = got?.overview === 'test';
  } catch (err) { checks._error = err.message; }
  finally {
    try { await cache.invalidate(url); } catch (_) {}
  }
  return { test: 'V6', name: 'Cache roundtrip', passed: passSummary(checks), checks };
}

// ── BaseAgent integration: see() exists on agents ───────────────────────────
async function test_V7_baseagent_methods() {
  const checks = { mariana_has_see: false, mariana_has_analyzeImage: false, mariana_has_compareDesigns: false, mariana_has_seeAndThink: false };
  try {
    const m = getAgent('mariana');
    checks.mariana_has_see = typeof m.see === 'function';
    checks.mariana_has_analyzeImage = typeof m.analyzeImage === 'function';
    checks.mariana_has_compareDesigns = typeof m.compareDesigns === 'function';
    checks.mariana_has_seeAndThink = typeof m.seeAndThink === 'function';
  } catch (err) { checks._error = err.message; }
  return { test: 'V7', name: 'BaseAgent vision methods', passed: passSummary(checks), checks };
}

// ── Non-regression: previous phases still work ──────────────────────────────
async function test_NR_oracle_works() {
  const checks = { oracle_initialized: false, consult_works: false };
  try {
    checks.oracle_initialized = global.oracle?.isInitialized === true;
    if (checks.oracle_initialized) {
      const r = await global.oracle.consult({
        question: 'OK?',
        agent: { id: null, name: 'verification', role: 'test' },
        depth: 'quick'
      });
      checks.consult_works = !!r?.answer;
    }
  } catch (err) { checks._error = err.message; }
  return { test: 'NR-O', name: 'Oracle still works', passed: passSummary(checks), checks };
}

async function test_NR_features_loaded() {
  const checks = { briefGenerator: false, quoteBuilder: false, projectTracker: false, routines: false };
  try {
    checks.briefGenerator = !!global.briefGenerator;
    checks.quoteBuilder = !!global.quoteBuilder;
    checks.projectTracker = !!global.projectTracker;
    checks.routines = !!global.routines && global.routines._initialized === true;
  } catch (err) { checks._error = err.message; }
  return { test: 'NR-F', name: 'Fase 6 features still loaded', passed: passSummary(checks), checks };
}

async function test_NR_guardian_works() {
  const checks = { guardian_init: false, atlas_init: false };
  try {
    checks.guardian_init = !!global.guardian;
    checks.atlas_init = global.guardian?.atlas?._initialized === true;
  } catch (err) { checks._error = err.message; }
  return { test: 'NR-G', name: 'Guardian still works', passed: passSummary(checks), checks };
}

// ── RUN ─────────────────────────────────────────────────────────────────────
async function runVisionStress() {
  const start = Date.now();
  const tests = [
    test_V1_service_initialized,
    test_V2_browser_available,
    test_V3_cache_table_reachable,
    test_V4_analyze_image_url,
    test_V5_analyze_url,
    test_V6_cache_roundtrip,
    test_V7_baseagent_methods,
    test_NR_oracle_works,
    test_NR_features_loaded,
    test_NR_guardian_works
  ];
  const results = [];
  for (const t of tests) {
    try { results.push(await t()); }
    catch (e) { results.push({ test: '?', name: t.name, passed: false, checks: { _crash: e.message } }); }
  }
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const score = Math.round((passed.length / results.length) * 100);
  return {
    score_percent: score,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    duration_ms: Date.now() - start,
    failed_tests: failed.map(f => ({ test: f.test, name: f.name, checks: f.checks })),
    all_results: results
  };
}

module.exports = { runVisionStress };
