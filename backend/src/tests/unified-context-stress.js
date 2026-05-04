// backend/src/tests/unified-context-stress.js
// Tests UnifiedContextManager — user identification, context loading, message routing.

const { supabase } = require('../core/supabase');
const { getUCM } = require('../unified-context/UnifiedContextManager');

const passSummary = (checks) =>
  Object.entries(checks).filter(([k]) => !k.startsWith('_')).every(([, v]) => v === true);

async function safeDelete(table, column, value) {
  try { await supabase.from(table).delete().eq(column, value); } catch (_) {}
}

// ── 1. UCM initialized + global ─────────────────────────────────────────────
async function test_U1_ucm_loaded() {
  const checks = { ucm_global: false, ucm_instance: false, has_methods: false };
  try {
    const ucm = getUCM();
    checks.ucm_instance = !!ucm;
    checks.ucm_global = !!global.ucm;
    checks.has_methods =
      typeof ucm.identifyUser === 'function' &&
      typeof ucm.processMessage === 'function' &&
      typeof ucm.getFullContext === 'function';
  } catch (err) { checks._error = err.message; }
  return { test: 'U1', name: 'UCM loaded', passed: passSummary(checks), checks };
}

// ── 2. Schema visibility (after PostgREST reload) ───────────────────────────
async function test_U2_users_table_visible() {
  const checks = { table_reachable: false, has_required_cols: false };
  try {
    const { error } = await supabase.from('users').select('id, name, whatsapp, web_session, first_channel').limit(1);
    checks.table_reachable = !error;
    if (error) checks._error = error.message;
    if (!error) checks.has_required_cols = true;
  } catch (err) { checks._error = err.message; }
  return { test: 'U2', name: 'users table visible to PostgREST', passed: passSummary(checks), checks };
}

// ── 3. Identify-or-create user (web channel) ────────────────────────────────
async function test_U3_identify_user_web() {
  const checks = { user_created: false, user_has_id: false, second_call_idempotent: false };
  let userId = null;
  try {
    const ucm = getUCM();
    const session = `verif-web-${Date.now()}`;
    const u1 = await ucm.identifyUser({ channel: 'web', identifier: session });
    userId = u1?.id;
    checks.user_created = !!userId;
    checks.user_has_id = typeof userId === 'string' && userId.length > 10;

    const u2 = await ucm.identifyUser({ channel: 'web', identifier: session });
    checks.second_call_idempotent = u2?.id === u1.id;
  } catch (err) { checks._error = err.message; }
  finally { if (userId) await safeDelete('users', 'id', userId); }
  return { test: 'U3', name: 'identifyUser (web) creates + reuses', passed: passSummary(checks), checks };
}

// ── 4. Identify-or-create user (whatsapp channel) ───────────────────────────
async function test_U4_identify_user_whatsapp() {
  const checks = { user_created: false, has_whatsapp_field: false };
  let userId = null;
  try {
    const ucm = getUCM();
    const phone = `+5255VERIF${Math.floor(Math.random() * 1e6)}`;
    const u = await ucm.identifyUser({ channel: 'whatsapp', identifier: phone });
    userId = u?.id;
    checks.user_created = !!userId;
    checks.has_whatsapp_field = u?.whatsapp === phone;
  } catch (err) { checks._error = err.message; }
  finally { if (userId) await safeDelete('users', 'id', userId); }
  return { test: 'U4', name: 'identifyUser (whatsapp)', passed: passSummary(checks), checks };
}

// ── 5. getFullContext returns coherent shape ────────────────────────────────
async function test_U5_get_full_context() {
  const checks = { context_returned: false, has_shape: false };
  let userId = null;
  try {
    const ucm = getUCM();
    const session = `verif-ctx-${Date.now()}`;
    const u = await ucm.identifyUser({ channel: 'web', identifier: session });
    userId = u.id;
    const ctx = await ucm.getFullContext(u.id);
    checks.context_returned = !!ctx;
    checks.has_shape = ctx
      && Array.isArray(ctx.conversations)
      && Array.isArray(ctx.activeProjects)
      && Array.isArray(ctx.pendingPromises);
  } catch (err) { checks._error = err.message; }
  finally { if (userId) await safeDelete('users', 'id', userId); }
  return { test: 'U5', name: 'getFullContext shape', passed: passSummary(checks), checks };
}

// ── 6. processMessage end-to-end ────────────────────────────────────────────
async function test_U6_process_message_e2e() {
  const checks = { has_response: false, has_text: false, response_in_spanish: false };
  let userId = null;
  try {
    const ucm = getUCM();
    const session = `verif-msg-${Date.now()}`;
    const u = await ucm.identifyUser({ channel: 'web', identifier: session });
    userId = u.id;

    const result = await ucm.processMessage({
      channel: 'web',
      identifier: u.id,
      message: 'Hola, ¿qué onda? Solo te estoy probando.',
      agentName: 'mariana'
    });
    checks.has_response = !!result;
    checks.has_text = typeof result?.text === 'string' && result.text.length > 5;
    checks.response_in_spanish = /[áéíóúñ¡¿]/i.test(result?.text || '') ||
                                  /\b(hola|chido|nene|oye|órale)\b/i.test(result?.text || '');
  } catch (err) { checks._error = err.message; }
  finally {
    if (userId) {
      await safeDelete('messages', 'user_id', userId);
      await safeDelete('users', 'id', userId);
    }
  }
  return { test: 'U6', name: 'processMessage e2e (web→Mariana)', passed: passSummary(checks), checks };
}

// ── 7. Message persistence with new columns ─────────────────────────────────
async function test_U7_message_persistence() {
  const checks = { user_msg_persisted: false, agent_msg_persisted: false, has_source_channel: false };
  let userId = null;
  try {
    const ucm = getUCM();
    const session = `verif-pers-${Date.now()}`;
    const u = await ucm.identifyUser({ channel: 'web', identifier: session });
    userId = u.id;
    await ucm.processMessage({ channel: 'web', identifier: u.id, message: 'Test persist', agentName: 'mariana' });

    // Wait for async write
    await new Promise(r => setTimeout(r, 800));

    const { data } = await supabase
      .from('messages').select('role, agent_name, source_channel, content')
      .eq('user_id', userId);

    const userMsg = (data || []).find(m => m.role === 'user');
    const agentMsg = (data || []).find(m => m.role === 'assistant' && m.agent_name === 'mariana');
    checks.user_msg_persisted = !!userMsg;
    checks.agent_msg_persisted = !!agentMsg;
    checks.has_source_channel = userMsg?.source_channel === 'web';
  } catch (err) { checks._error = err.message; }
  finally {
    if (userId) {
      await safeDelete('messages', 'user_id', userId);
      await safeDelete('users', 'id', userId);
    }
  }
  return { test: 'U7', name: 'message persistence (user_id/source_channel/agent_name)', passed: passSummary(checks), checks };
}

// ── 8. Non-regression: existing routes still work ───────────────────────────
async function test_U8_no_regression() {
  const checks = { oracle_init: false, guardian_init: false, vision_init: false, megazord_init: false };
  try {
    checks.oracle_init = global.oracle?.isInitialized === true;
    checks.guardian_init = !!global.guardian;
    checks.vision_init = global.visionService?.isInitialized === true;
    checks.megazord_init = !!global.megazord && global.megazord._initialized === true;
  } catch (err) { checks._error = err.message; }
  return { test: 'U8', name: 'No regression on prior phases', passed: passSummary(checks), checks };
}

// ── RUN ─────────────────────────────────────────────────────────────────────
async function runUnifiedContextStress() {
  const start = Date.now();
  const tests = [
    test_U1_ucm_loaded,
    test_U2_users_table_visible,
    test_U3_identify_user_web,
    test_U4_identify_user_whatsapp,
    test_U5_get_full_context,
    test_U6_process_message_e2e,
    test_U7_message_persistence,
    test_U8_no_regression
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

module.exports = { runUnifiedContextStress };
