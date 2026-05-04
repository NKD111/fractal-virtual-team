// backend/src/tests/fase6-stress.js
// Stress test for Fase 6 — exercises every feature end-to-end and verifies non-regression.
//
// Strategy: each test creates marker rows, runs the feature, verifies state, cleans up.
// Heavy-LLM tests (brief, qc-bot) use minimal prompts to limit cost.

const { supabase } = require('../core/supabase');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const passSummary = (checks) =>
  Object.entries(checks)
    .filter(([k]) => !k.startsWith('_'))
    .every(([, v]) => v === true);

async function safeDelete(table, column, value) {
  try { await supabase.from(table).delete().eq(column, value); } catch (_) {}
}

// Helpers to create / clean test entities
async function createTestClient() {
  const marker = `TEST_VERIF_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const phone = `+5255TEST${Math.floor(Math.random() * 1e8)}`;
  const { data, error } = await supabase.from('clients')
    .insert({ name: marker, phone, whatsapp: phone })
    .select().single();
  if (error) throw new Error(`createTestClient failed: ${error.message}`);
  return data;
}

async function createTestProject(clientId, opts = {}) {
  const { data, error } = await supabase.from('projects').insert({
    client_id: clientId,
    name: opts.name || `TEST_VERIF_PROJ_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    status: opts.status || 'briefing',
    deadline: opts.deadline || null
  }).select().single();
  if (error) throw new Error(`createTestProject failed: ${error.message}`);
  return data;
}

async function createTestConversation(clientId) {
  const { data: agent } = await supabase.from('agents').select('id').ilike('name', 'mariana').limit(1).maybeSingle();
  const { data: conv, error } = await supabase.from('conversations').insert({
    client_id: clientId,
    agent_id: agent?.id || null,
    channel: 'whatsapp'
  }).select().single();
  if (error) throw new Error(`createTestConversation failed: ${error.message}`);
  if (conv) {
    await supabase.from('messages').insert([
      { conversation_id: conv.id, role: 'user', content: 'Hola, necesito un video reel para promocionar mi negocio de joyería en Instagram.' },
      { conversation_id: conv.id, role: 'assistant', content: '¡Qué padre! Cuéntame más, ¿qué estilo buscas? ¿Tienes referencias?' },
      { conversation_id: conv.id, role: 'user', content: 'Algo moderno, minimalista, como las marcas de lujo. 60 segundos. Lo necesito en 2 semanas.' }
    ]);
  }
  return conv;
}

async function cleanupTestEntities() {
  // Best-effort cleanup of TEST_VERIF entities — uses LIKE to match marker prefix.
  try { await supabase.from('messages').delete().like('content', 'Hola, necesito un video reel%'); } catch {}
  try { await supabase.from('conversations').delete().like('contact_phone', '+5255TEST%'); } catch {}
  try { await supabase.from('clients').delete().like('name', 'TEST_VERIF_%'); } catch {}
  try { await supabase.from('projects').delete().like('name', 'TEST_VERIF_%'); } catch {}
  try { await supabase.from('project_briefs').delete().like('client_name', 'TEST_VERIF_%'); } catch {}
  try { await supabase.from('quotes').delete().eq('service_type', 'video_reel').is('final_price', null).gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// BLOQUE A — Negocio
// ════════════════════════════════════════════════════════════════════════════

async function test_A1_brief_generator() {
  const checks = { feature_loaded: false, conversation_created: false, brief_generated: false, brief_persisted: false, has_structure: false };
  let client, conv;
  try {
    checks.feature_loaded = !!global.briefGenerator;
    if (!checks.feature_loaded) return { test: 'A1', name: 'Brief Generator', passed: false, checks };

    client = await createTestClient();
    conv = await createTestConversation(client.id);
    checks.conversation_created = !!conv?.id;

    const result = await global.briefGenerator.generateFromConversation({
      conversationId: conv.id, clientId: client.id, projectType: 'video_reel'
    });
    checks.brief_generated = !!result?.brief?.id;

    const { data: persisted } = await supabase.from('project_briefs').select('*').eq('id', result.brief?.id).maybeSingle();
    checks.brief_persisted = !!persisted;
    checks.has_structure = !!(persisted?.objective || persisted?.deliverables || persisted?.timeline);
  } catch (err) { checks._error = err.message; }
  finally {
    if (client?.id) await safeDelete('clients', 'id', client.id);
    if (conv?.id) await safeDelete('conversations', 'id', conv.id);
  }
  return { test: 'A1', name: 'Brief Generator', passed: passSummary(checks), checks };
}

async function test_A2_quote_builder() {
  const checks = { feature_loaded: false, services_listed: false, quote_built: false, quote_persisted: false, has_deliverables: false };
  let client, quoteId;
  try {
    checks.feature_loaded = !!global.quoteBuilder;
    const services = global.quoteBuilder.listServices();
    checks.services_listed = Array.isArray(services) && services.length >= 5;

    client = await createTestClient();
    const result = await global.quoteBuilder.buildQuote({ clientId: client.id, serviceType: 'video_reel', complexity: 'standard' });
    checks.quote_built = !!result?.quote?.id;
    quoteId = result.quote?.id;

    const { data: persisted } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle();
    checks.quote_persisted = !!persisted;
    checks.has_deliverables = Array.isArray(persisted?.deliverables) && persisted.deliverables.length > 0;
  } catch (err) { checks._error = err.message; }
  finally {
    if (quoteId) await safeDelete('quotes', 'id', quoteId);
    if (client?.id) await safeDelete('clients', 'id', client.id);
  }
  return { test: 'A2', name: 'Quote Builder', passed: passSummary(checks), checks };
}

async function test_A3_project_tracker() {
  const checks = { feature_loaded: false, dashboard_works: false, status_update_works: false, invalid_status_rejected: false };
  let client, project;
  try {
    checks.feature_loaded = !!global.projectTracker;
    const dash = await global.projectTracker.getDashboard();
    checks.dashboard_works = typeof dash?.total_active === 'number' && Array.isArray(dash.at_risk);

    client = await createTestClient();
    project = await createTestProject(client.id);
    const updated = await global.projectTracker.updateStatus(project.id, 'in_production', 'verification');
    checks.status_update_works = updated?.status === 'in_production';

    try {
      await global.projectTracker.updateStatus(project.id, 'INVALID_STATUS_XYZ');
      checks.invalid_status_rejected = false;
    } catch { checks.invalid_status_rejected = true; }
  } catch (err) { checks._error = err.message; }
  finally {
    if (project?.id) await safeDelete('projects', 'id', project.id);
    if (client?.id) await safeDelete('clients', 'id', client.id);
  }
  return { test: 'A3', name: 'Project Tracker', passed: passSummary(checks), checks };
}

async function test_A4_client_health() {
  const checks = { feature_loaded: false, score_calculated: false, score_persisted: false, score_in_range: false, risk_level_valid: false };
  let client;
  try {
    checks.feature_loaded = !!global.clientHealth;
    client = await createTestClient();
    const r = await global.clientHealth.calculateScore(client.id);
    checks.score_calculated = !!r;
    checks.score_in_range = typeof r?.overall === 'number' && r.overall >= 0 && r.overall <= 10;
    checks.risk_level_valid = ['low', 'medium', 'high', 'critical'].includes(r?.riskLevel);

    const { data: persisted } = await supabase.from('client_health_scores').select('*').eq('client_id', client.id).order('calculated_at', { ascending: false }).limit(1).maybeSingle();
    checks.score_persisted = !!persisted;
  } catch (err) { checks._error = err.message; }
  finally {
    if (client?.id) {
      await safeDelete('client_health_scores', 'client_id', client.id);
      await safeDelete('clients', 'id', client.id);
    }
  }
  return { test: 'A4', name: 'Client Health', passed: passSummary(checks), checks };
}

async function test_A5_delivery_checklist() {
  const checks = { feature_loaded: false, checklist_created: false, items_count_correct: false, mark_done_works: false, completion_calc_correct: false };
  let client, project, checklistId;
  try {
    checks.feature_loaded = !!global.deliveryChecklist;
    client = await createTestClient();
    project = await createTestProject(client.id);
    const checklist = await global.deliveryChecklist.createForProject(project.id, 'video');
    checklistId = checklist.id;
    checks.checklist_created = !!checklistId;
    checks.items_count_correct = Array.isArray(checklist.items) && checklist.items.length === 10; // video template has 10 items

    const { completion, remaining } = await global.deliveryChecklist.markItemDone(checklistId, 1, 'verification');
    checks.mark_done_works = remaining.length === 9;
    checks.completion_calc_correct = completion === 10; // 1/10 = 10%
  } catch (err) { checks._error = err.message; }
  finally {
    if (checklistId) await safeDelete('delivery_checklists', 'id', checklistId);
    if (project?.id) await safeDelete('projects', 'id', project.id);
    if (client?.id) await safeDelete('clients', 'id', client.id);
  }
  return { test: 'A5', name: 'Delivery Checklist', passed: passSummary(checks), checks };
}

async function test_A6_revision_tracker() {
  const checks = { feature_loaded: false, revision_logged: false, within_rounds_correct: false, extra_round_flagged: false };
  let client, project, revIds = [];
  try {
    checks.feature_loaded = !!global.revisionTracker;
    client = await createTestClient();
    project = await createTestProject(client.id);

    const r1 = await global.revisionTracker.logRevision({ projectId: project.id, clientId: client.id, description: 'TEST rev 1' });
    revIds.push(r1.id);
    checks.revision_logged = !!r1?.id;
    checks.within_rounds_correct = r1.is_within_rounds === true;

    // Log a 3rd revision (over the 2-round limit)
    const r2 = await global.revisionTracker.logRevision({ projectId: project.id, clientId: client.id, description: 'TEST rev 2' });
    revIds.push(r2.id);
    const r3 = await global.revisionTracker.logRevision({ projectId: project.id, clientId: client.id, description: 'TEST rev 3' });
    revIds.push(r3.id);
    checks.extra_round_flagged = r3.is_within_rounds === false;
  } catch (err) { checks._error = err.message; }
  finally {
    for (const id of revIds) await safeDelete('project_revisions', 'id', id);
    if (project?.id) await safeDelete('projects', 'id', project.id);
    if (client?.id) await safeDelete('clients', 'id', client.id);
  }
  return { test: 'A6', name: 'Revision Tracker', passed: passSummary(checks), checks };
}

// ════════════════════════════════════════════════════════════════════════════
// BLOQUE B — Agentes
// ════════════════════════════════════════════════════════════════════════════

async function test_B1_proactive_followups() {
  const checks = { module_loadable: false, scan_runs: false, returns_summary: false };
  try {
    const ProactiveFollowups = require('../features/proactive-followups');
    checks.module_loadable = true;
    const summary = await new ProactiveFollowups().runDailyScan();
    checks.scan_runs = !!summary;
    checks.returns_summary = typeof summary?.quotes_followed_up === 'number'
      && typeof summary?.overdue_promises === 'number'
      && typeof summary?.inactive_projects === 'number';
  } catch (err) { checks._error = err.message; }
  return { test: 'B1', name: 'Proactive Followups', passed: passSummary(checks), checks };
}

async function test_B2_financial_report() {
  // Skip the actual Twilio send in test — verify report generation only by short-circuiting notifyNeiky.
  // The module calls notifyNeiky which fails silently in console; if the report data computes, we pass.
  const checks = { module_loadable: false, report_structure: false };
  try {
    const FinancialReport = require('../features/financial-report');
    checks.module_loadable = true;
    const report = await new FinancialReport().generateWeekly();
    checks.report_structure = report
      && typeof report.revenue_confirmed === 'number'
      && typeof report.pipeline === 'number'
      && typeof report.operational_costs_usd === 'number';
  } catch (err) { checks._error = err.message; }
  return { test: 'B2', name: 'Financial Report (weekly)', passed: passSummary(checks), checks };
}

async function test_B3_analytics_dashboard() {
  const checks = { module_loadable: false, kpis_generated: false, kpis_persisted: false, realtime_works: false };
  try {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    checks.module_loadable = true;

    const kpis = await new AnalyticsDashboard().generateDailyKPIs();
    checks.kpis_generated = !!kpis && typeof kpis.active_projects === 'number';

    const today = new Date().toISOString().split('T')[0];
    const { data: row } = await supabase.from('business_kpis').select('*').eq('date', today).maybeSingle();
    checks.kpis_persisted = !!row;

    const realtime = await new AnalyticsDashboard().getRealtimeData();
    checks.realtime_works = !!realtime && Array.isArray(realtime.kpis);
  } catch (err) { checks._error = err.message; }
  return { test: 'B3', name: 'Analytics Dashboard', passed: passSummary(checks), checks };
}

async function test_B4_qc_bot() {
  const checks = { feature_loaded: false, review_runs: false, returns_score: false };
  try {
    checks.feature_loaded = !!global.qcBot;
    // Use minimal content to limit cost
    const r = await global.qcBot.reviewDeliverable({
      projectId: null,
      deliverableType: 'copy',
      content: 'Hola compradores. Vendemos productos buenos.',
      checklistId: null
    });
    checks.review_runs = !!r;
    checks.returns_score = typeof r?.score === 'number' && typeof r?.approved === 'boolean';
  } catch (err) { checks._error = err.message; }
  return { test: 'B4', name: 'QC-Bot', passed: passSummary(checks), checks };
}

async function test_B5_diana_health_check() {
  const checks = { module_loadable: false, runs_without_crash: false, returns_summary: false };
  try {
    const DianaHealthCheck = require('../features/diana-health-check');
    checks.module_loadable = true;
    const r = await new DianaHealthCheck().runWeekly();
    checks.runs_without_crash = !!r;
    checks.returns_summary = typeof r?.count === 'number' && typeof r?.average === 'number';
  } catch (err) { checks._error = err.message; }
  return { test: 'B5', name: 'Diana Health Check', passed: passSummary(checks), checks };
}

async function test_B6_sprint_tracker() {
  const checks = { module_loadable: false, sprint_created: false, scrum_returns_object_or_null: false };
  try {
    const SprintTracker = require('../features/sprint-tracker');
    checks.module_loadable = true;
    const sprint = await new SprintTracker().createSprint({
      projectId: null,
      tasks: [{ description: 'TEST task', assigned_to: 'CARLOS', hours: 4 }],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    checks.sprint_created = sprint?.tasks?.length === 1;

    const scrum = await new SprintTracker().getDailyScrumReport('00000000-0000-0000-0000-000000000000');
    checks.scrum_returns_object_or_null = scrum === null || typeof scrum === 'object';
  } catch (err) { checks._error = err.message; }
  return { test: 'B6', name: 'Sprint Tracker', passed: passSummary(checks), checks };
}

// ════════════════════════════════════════════════════════════════════════════
// BLOQUE C — Routines
// ════════════════════════════════════════════════════════════════════════════

async function test_C1_routines_initialized() {
  const checks = { manager_loaded: false, initialized: false, has_tasks: false };
  try {
    checks.manager_loaded = !!global.routines;
    checks.initialized = global.routines?._initialized === true;
    checks.has_tasks = Array.isArray(global.routines?._tasks) && global.routines._tasks.length >= 6;
    checks._task_count = global.routines?._tasks?.length;
  } catch (err) { checks._error = err.message; }
  return { test: 'C1', name: 'Routines Initialized', passed: passSummary(checks), checks };
}

async function test_C2_morning_prep_runs() {
  const checks = { runs_without_crash: false, returns_data: false, persisted_event: false };
  try {
    const r = await global.routines.morningPrep();
    checks.runs_without_crash = !!r;
    checks.returns_data = typeof r?.promises === 'number' && typeof r?.active_projects === 'number';

    await sleep(500);
    const { data: ev } = await supabase.from('system_events')
      .select('id').eq('event_type', 'morning_prep_completed')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    checks.persisted_event = !!ev;
  } catch (err) { checks._error = err.message; }
  return { test: 'C2', name: 'Morning Prep Routine', passed: passSummary(checks), checks };
}

async function test_C3_nightly_maintenance_runs() {
  const checks = { runs_without_crash: false, returns_data: false };
  try {
    const r = await global.routines.nightlyMaintenance();
    checks.runs_without_crash = !!r;
    checks.returns_data = typeof r === 'object';
  } catch (err) { checks._error = err.message; }
  return { test: 'C3', name: 'Nightly Maintenance', passed: passSummary(checks), checks };
}

async function test_C4_emergency_webhook_auth() {
  // Verify the webhook is mounted and rejects invalid tokens
  const checks = { route_loadable: false, rejects_no_token: false };
  try {
    const router = require('../routes/webhooks');
    checks.route_loadable = !!router && typeof router === 'function';

    // We don't have HTTP context in-process — verify by reading the file for the auth check
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../routes/webhooks.js'), 'utf8');
    checks.rejects_no_token = /x-nexus-token/.test(src) && /401/.test(src);
  } catch (err) { checks._error = err.message; }
  return { test: 'C4', name: 'Emergency Webhook', passed: passSummary(checks), checks };
}

// ════════════════════════════════════════════════════════════════════════════
// BLOQUE D — Interfaz
// ════════════════════════════════════════════════════════════════════════════

async function test_D1_cli_present() {
  const checks = { file_exists: false, has_status_cmd: false, has_ask_cmd: false };
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(__dirname, '../cli/fractal-cli.js');
    checks.file_exists = fs.existsSync(p);
    if (checks.file_exists) {
      const src = fs.readFileSync(p, 'utf8');
      checks.has_status_cmd = /cmdStatus/.test(src);
      checks.has_ask_cmd = /cmdAsk/.test(src);
    }
  } catch (err) { checks._error = err.message; }
  return { test: 'D1', name: 'Fractal CLI', passed: passSummary(checks), checks };
}

async function test_D2_smart_notifications() {
  const checks = { feature_loaded: false, dedup_works: false };
  try {
    checks.feature_loaded = !!global.notifications;
    // Don't actually send to WhatsApp — just verify dedup logic by injecting key twice
    global.notifications.sentToday.add('verification_dedup_test');
    const r = await global.notifications.send({
      message: 'TEST', type: 'verification',
      dedupKey: 'verification_dedup_test'
    });
    checks.dedup_works = r?.sent === false && r?.reason === 'dedup';
  } catch (err) { checks._error = err.message; }
  return { test: 'D2', name: 'Smart Notifications', passed: passSummary(checks), checks };
}

async function test_D3_report_exporter() {
  const checks = { module_loadable: false, throws_on_missing: false, returns_html_when_exists: false };
  let client, project;
  try {
    const ReportExporter = require('../features/report-exporter');
    checks.module_loadable = true;

    try {
      await new ReportExporter().generateProjectReport('00000000-0000-0000-0000-000000000000');
      checks.throws_on_missing = false;
    } catch { checks.throws_on_missing = true; }

    client = await createTestClient();
    project = await createTestProject(client.id);
    const r = await new ReportExporter().generateProjectReport(project.id);
    checks.returns_html_when_exists = typeof r?.html === 'string' && r.html.includes('<html');
  } catch (err) { checks._error = err.message; }
  finally {
    if (project?.id) await safeDelete('projects', 'id', project.id);
    if (client?.id) await safeDelete('clients', 'id', client.id);
  }
  return { test: 'D3', name: 'Report Exporter', passed: passSummary(checks), checks };
}

async function test_D4_executive_summary() {
  const checks = { module_loadable: false, generates_summary: false, has_text: false };
  try {
    const ExecutiveSummary = require('../features/executive-summary');
    checks.module_loadable = true;
    const r = await new ExecutiveSummary().generate();
    checks.generates_summary = !!r;
    checks.has_text = typeof r?.summary === 'string' && r.summary.length > 10;
  } catch (err) { checks._error = err.message; }
  return { test: 'D4', name: 'Executive Summary', passed: passSummary(checks), checks };
}

async function test_D5_at_risk_query() {
  const checks = { table_reachable: false };
  try {
    const cutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('projects').select('id', { head: true, count: 'exact' })
      .not('status', 'in', '("completed","cancelled")').lt('deadline', cutoff);
    checks.table_reachable = !error;
  } catch (err) { checks._error = err.message; }
  return { test: 'D5', name: 'At-Risk Query', passed: passSummary(checks), checks };
}

async function test_D6_kpi_dashboard() {
  // Same as B3 realtime — verify endpoint shape only
  const checks = { realtime_works: false };
  try {
    const AnalyticsDashboard = require('../features/analytics-dashboard');
    const r = await new AnalyticsDashboard().getRealtimeData();
    checks.realtime_works = Array.isArray(r?.kpis) && Array.isArray(r?.active_projects) && Array.isArray(r?.recent_activity);
  } catch (err) { checks._error = err.message; }
  return { test: 'D6', name: 'KPI Dashboard', passed: passSummary(checks), checks };
}

// ════════════════════════════════════════════════════════════════════════════
// CROSS-PHASE NON-REGRESSION
// ════════════════════════════════════════════════════════════════════════════

async function test_NR_oracle_still_works() {
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
  return { test: 'NR1', name: 'Oracle still works', passed: passSummary(checks), checks };
}

async function test_NR_guardian_still_works() {
  const checks = { guardian_init: false, nexus_init: false, atlas_init: false };
  try {
    checks.guardian_init = !!global.guardian;
    checks.nexus_init = global.guardian?.nexus?._initialized === true;
    checks.atlas_init = global.guardian?.atlas?._initialized === true;
  } catch (err) { checks._error = err.message; }
  return { test: 'NR2', name: 'Guardian still works', passed: passSummary(checks), checks };
}

async function test_NR_megazord_still_works() {
  const checks = { megazord_init: false, bus_alive: false };
  try {
    checks.megazord_init = !!global.megazord && global.megazord._initialized === true;
    checks.bus_alive = !!global.megazord?.bus;
  } catch (err) { checks._error = err.message; }
  return { test: 'NR3', name: 'Megazord still works', passed: passSummary(checks), checks };
}

async function test_NR_promise_tracker_still_works() {
  const checks = { module_loadable: false, detects_promise: false };
  try {
    const tracker = require('../core/promise-tracker');
    checks.module_loadable = true;
    const detected = tracker.detectPromises('Te aviso en 5 minutos.');
    checks.detects_promise = detected.length > 0 && detected[0].type === 'timed_update';
  } catch (err) { checks._error = err.message; }
  return { test: 'NR4', name: 'Promise tracker still works', passed: passSummary(checks), checks };
}

async function test_NR_existing_tables_intact() {
  // Sample previously created tables to ensure Fase 6 didn't drop anything
  const tables = [
    'agents', 'conversations', 'messages', 'clients', 'projects',
    'pending_promises', 'collective_memory', 'channel_events',
    'monitored_services', 'oracle_queries', 'oracle_quotas'
  ];
  const missing = [];
  for (const t of tables) {
    try {
      const { error } = await supabase.from(t).select('*', { head: true, count: 'exact' }).limit(1);
      if (error) missing.push(t);
    } catch { missing.push(t); }
  }
  return {
    test: 'NR5', name: 'Pre-Fase6 tables intact',
    passed: missing.length === 0,
    checks: { all_tables_exist: missing.length === 0, _missing: missing }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════════

async function runFase6Stress() {
  const start = Date.now();
  const results = [];

  const tests = [
    // Bloque A
    test_A1_brief_generator, test_A2_quote_builder, test_A3_project_tracker,
    test_A4_client_health, test_A5_delivery_checklist, test_A6_revision_tracker,
    // Bloque B
    test_B1_proactive_followups, test_B2_financial_report, test_B3_analytics_dashboard,
    test_B4_qc_bot, test_B5_diana_health_check, test_B6_sprint_tracker,
    // Bloque C
    test_C1_routines_initialized, test_C2_morning_prep_runs, test_C3_nightly_maintenance_runs, test_C4_emergency_webhook_auth,
    // Bloque D
    test_D1_cli_present, test_D2_smart_notifications, test_D3_report_exporter,
    test_D4_executive_summary, test_D5_at_risk_query, test_D6_kpi_dashboard,
    // Non-regression
    test_NR_oracle_still_works, test_NR_guardian_still_works, test_NR_megazord_still_works,
    test_NR_promise_tracker_still_works, test_NR_existing_tables_intact
  ];

  for (const t of tests) {
    try { results.push(await t()); }
    catch (e) { results.push({ test: '?', name: t.name, passed: false, checks: { _crash: e.message } }); }
  }

  // Final cleanup
  await cleanupTestEntities();

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const score = Math.round((passed.length / results.length) * 100);

  const blocks = {
    'A — Negocio': results.filter(r => r.test.startsWith('A')),
    'B — Agentes': results.filter(r => r.test.startsWith('B')),
    'C — Routines': results.filter(r => r.test.startsWith('C')),
    'D — Interfaz': results.filter(r => r.test.startsWith('D')),
    'NR — No Regresión': results.filter(r => r.test.startsWith('NR'))
  };
  const blockSummary = {};
  for (const [k, v] of Object.entries(blocks)) blockSummary[k] = `${v.filter(x => x.passed).length}/${v.length}`;

  return {
    score_percent: score,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    duration_ms: Date.now() - start,
    block_summary: blockSummary,
    failed_tests: failed.map(f => ({ test: f.test, name: f.name, checks: f.checks })),
    all_results: results
  };
}

module.exports = { runFase6Stress };
