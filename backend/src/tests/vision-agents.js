// backend/src/tests/vision-agents.js
// Verifies the 5 per-agent vision methods (Fase 6.5).
//
// Test images use stable, high-availability sources to avoid network flakiness.

const { getAgent } = require('../core/orchestrator');

const passSummary = (checks) =>
  Object.entries(checks).filter(([k]) => !k.startsWith('_')).every(([, v]) => v === true);

// Stable test URLs (gstatic + example.com — both rarely fail)
const REF_URL_A = 'https://www.gstatic.com/webp/gallery/1.jpg';     // landscape
const REF_URL_B = 'https://www.gstatic.com/webp/gallery/2.jpg';     // group photo
const REF_URL_C = 'https://www.gstatic.com/webp/gallery/3.jpg';     // food
const SITE_URL  = 'https://example.com';                            // tiny stable site

async function ensureInit(agent) {
  if (typeof agent.init === 'function' && !agent.id) {
    try { await agent.init(); } catch (_) {}
  }
}

// ── 1. Carlos.analyzeClientReference ────────────────────────────────────────
async function test_carlos_analyze_client_reference() {
  const checks = { method_exists: false, returns_visual: false, returns_brief: false, has_palette: false };
  try {
    const carlos = getAgent('carlos');
    await ensureInit(carlos);
    checks.method_exists = typeof carlos.analyzeClientReference === 'function';
    if (!checks.method_exists) return { test: 'AG1', name: 'Carlos.analyzeClientReference', passed: false, checks };

    const r = await carlos.analyzeClientReference({ url: REF_URL_A, projectId: null });
    checks.returns_visual = !!r?.visual_analysis && !r.visual_analysis.error;
    checks.returns_brief = typeof r?.design_brief === 'string' && r.design_brief.length > 30;
    checks.has_palette = !!r?.color_palette;
    checks._brief_preview = (r?.design_brief || '').substring(0, 120);
  } catch (err) { checks._error = err.message; }
  return { test: 'AG1', name: 'Carlos.analyzeClientReference', passed: passSummary(checks), checks };
}

// ── 2. Diego.reviewBrandConsistency ─────────────────────────────────────────
async function test_diego_review_brand_consistency() {
  const checks = { method_exists: false, website_analyzed: false, comparison_done: false };
  try {
    const diego = getAgent('diego');
    await ensureInit(diego);
    checks.method_exists = typeof diego.reviewBrandConsistency === 'function';
    if (!checks.method_exists) return { test: 'AG2', name: 'Diego.reviewBrandConsistency', passed: false, checks };

    // Without brand guide
    const r1 = await diego.reviewBrandConsistency({ websiteUrl: SITE_URL });
    checks.website_analyzed = !!r1?.website_analysis && !r1.website_analysis.error;

    // With brand guide (compare)
    const r2 = await diego.reviewBrandConsistency({ websiteUrl: SITE_URL, brandGuideUrl: REF_URL_A });
    checks.comparison_done = !!r2?.consistency_report && (typeof r2.consistency_report === 'object');
    checks._verdict = r2?.consistency_report?.verdict?.substring(0, 100);
  } catch (err) { checks._error = err.message; }
  return { test: 'AG2', name: 'Diego.reviewBrandConsistency', passed: passSummary(checks), checks };
}

// ── 3. Valentina.directionFromReferences ────────────────────────────────────
async function test_valentina_direction_from_references() {
  const checks = { method_exists: false, references_analyzed: false, art_direction_returned: false };
  try {
    const valentina = getAgent('valentina');
    await ensureInit(valentina);
    checks.method_exists = typeof valentina.directionFromReferences === 'function';
    if (!checks.method_exists) return { test: 'AG3', name: 'Valentina.directionFromReferences', passed: false, checks };

    const r = await valentina.directionFromReferences({
      referenceUrls: [REF_URL_A, REF_URL_B, REF_URL_C],
      projectBrief: 'Identidad visual para una marca de joyería minimalista en CDMX, target millennials.'
    });
    checks.references_analyzed = Array.isArray(r?.references_analyzed) && r.references_analyzed.length >= 1;
    checks.art_direction_returned = typeof r?.art_direction === 'string' && r.art_direction.length > 100;
    checks._direction_preview = (r?.art_direction || '').substring(0, 150);
  } catch (err) { checks._error = err.message; }
  return { test: 'AG3', name: 'Valentina.directionFromReferences', passed: passSummary(checks), checks };
}

// ── 4. QC-Bot.visualQCReview ────────────────────────────────────────────────
async function test_qcbot_visual_qc_review() {
  const checks = { method_exists: false, returns_result: false, has_passed_field: false };
  try {
    const qcbot = getAgent('qcbot');
    await ensureInit(qcbot);
    checks.method_exists = typeof qcbot.visualQCReview === 'function';
    if (!checks.method_exists) return { test: 'AG4', name: 'QC-Bot.visualQCReview', passed: false, checks };

    const r = await qcbot.visualQCReview({
      deliverableImageUrl: REF_URL_A,
      referenceUrl: REF_URL_B,
      projectId: null
    });
    checks.returns_result = !!r;
    checks.has_passed_field = typeof r?.passed === 'boolean';
    checks._verdict = r?.verdict?.substring(0, 100);
    checks._score = r?.visual_score;
  } catch (err) { checks._error = err.message; }
  return { test: 'AG4', name: 'QC-Bot.visualQCReview', passed: passSummary(checks), checks };
}

// ── 5. Mariana.extractBriefFromReference ────────────────────────────────────
async function test_mariana_extract_brief_from_reference() {
  const checks = { method_exists: false, visual_returned: false, smart_questions_returned: false, auto_detected_present: false };
  try {
    const mariana = getAgent('mariana');
    await ensureInit(mariana);
    checks.method_exists = typeof mariana.extractBriefFromReference === 'function';
    if (!checks.method_exists) return { test: 'AG5', name: 'Mariana.extractBriefFromReference', passed: false, checks };

    const r = await mariana.extractBriefFromReference({
      referenceUrl: REF_URL_A,
      contactPhone: null,
      conversationId: null
    });
    checks.visual_returned = !!r?.visual_reference && !r.visual_reference.error;
    checks.smart_questions_returned = typeof r?.smart_questions === 'string' && r.smart_questions.length > 20;
    checks.auto_detected_present = !!r?.auto_detected
      && (Array.isArray(r.auto_detected.colors) || Array.isArray(r.auto_detected.keywords));
    checks._questions_preview = (r?.smart_questions || '').substring(0, 200);
  } catch (err) { checks._error = err.message; }
  return { test: 'AG5', name: 'Mariana.extractBriefFromReference', passed: passSummary(checks), checks };
}

// ── RUN ─────────────────────────────────────────────────────────────────────
async function runVisionAgentsStress() {
  const start = Date.now();
  const tests = [
    test_carlos_analyze_client_reference,
    test_diego_review_brand_consistency,
    test_valentina_direction_from_references,
    test_qcbot_visual_qc_review,
    test_mariana_extract_brief_from_reference
  ];
  const results = [];
  for (const t of tests) {
    try { results.push(await t()); }
    catch (e) { results.push({ test: '?', name: t.name, passed: false, checks: { _crash: e.message } }); }
  }
  const passed = results.filter(r => r.passed);
  return {
    score_percent: Math.round((passed.length / results.length) * 100),
    total: results.length,
    passed: passed.length,
    failed: results.length - passed.length,
    duration_ms: Date.now() - start,
    failed_tests: results.filter(r => !r.passed).map(f => ({ test: f.test, name: f.name, checks: f.checks })),
    all_results: results
  };
}

module.exports = { runVisionAgentsStress };
