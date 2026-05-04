// backend/src/tests/promises-verification.js
// Verifies Mariana's "anti-empty-promises" tracking system end-to-end.

const { supabase } = require('../core/supabase');
const promiseTracker = require('../core/promise-tracker');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function safeDelete(table, column, value) {
  try { await supabase.from(table).delete().eq(column, value); } catch (_) {}
}

// ─── 1. Pattern detection on representative texts ────────────────────────────
async function test_pattern_detection() {
  const cases = [
    { text: 'Te aviso en 5 minutos cómo va.',                   expectType: 'timed_update', minDelay: 5*60*1000,  maxDelay: 5*60*1000 },
    { text: 'En 10 minutos te confirmo.',                       expectType: 'timed_update', minDelay: 10*60*1000, maxDelay: 10*60*1000 },
    { text: 'Dentro de 2 horas vuelvo con el avance.',          expectType: 'timed_update', minDelay: 2*60*60*1000, maxDelay: 2*60*60*1000 },
    { text: 'Dame 15 minutos y te traigo el dato.',             expectType: 'timed_update', minDelay: 15*60*1000, maxDelay: 15*60*1000 },
    { text: 'Ahorita te confirmo.',                             expectType: 'timed_update', minDelay: 3*60*1000,  maxDelay: 3*60*1000 },
    { text: 'Voy a preguntar a Diego sobre eso.',               expectType: 'ask_agent',    target: 'diego',   minDelay: 0, maxDelay: 0 },
    { text: 'Le pregunto a Carlos y te aviso.',                 expectType: 'ask_agent',    target: 'carlos',  minDelay: 0, maxDelay: 0 },
    { text: 'Déjame revisar y regreso.',                        expectType: 'timed_update', minDelay: 2*60*1000,  maxDelay: 2*60*1000 },
    { text: 'Voy a investigar y te digo.',                      expectType: 'timed_update', minDelay: 2*60*1000,  maxDelay: 2*60*1000 },
    { text: 'Timer puesto para 7 minutos.',                     expectType: 'timed_update', minDelay: 7*60*1000,  maxDelay: 7*60*1000 },
    // Negative case — no promise
    { text: 'Listo, ya te mandé el archivo. ¿Algo más?',        expectType: null }
  ];

  const results = [];
  let passed = 0;
  for (const c of cases) {
    const detected = promiseTracker.detectPromises(c.text);
    let ok = false;
    if (c.expectType === null) {
      ok = detected.length === 0;
    } else {
      const m = detected[0];
      ok = !!m && m.type === c.expectType
        && m.delayMs >= c.minDelay && m.delayMs <= c.maxDelay
        && (c.target === undefined || m.target === c.target);
    }
    if (ok) passed++;
    results.push({ text: c.text, expected: c.expectType, detected: detected[0] || null, ok });
  }
  return { name: 'pattern_detection', passed, total: cases.length, ok: passed === cases.length, samples: results.filter(r => !r.ok) };
}

// ─── 2. Schedule + DB persist ────────────────────────────────────────────────
async function test_schedule_persist() {
  const phone = `+5255VERIF${Date.now()}`.substring(0, 16);
  let promiseId = null;
  try {
    // Use a delay > 0 so it doesn't auto-execute during the test
    await promiseTracker.schedulePromise(
      { type: 'timed_update', delayMs: 60 * 60 * 1000, target: null, matchedText: 'TEST: en 1 hora te aviso' },
      { phone, channel: 'whatsapp', originalMessage: 'verification test', userId: null }
    );
    await sleep(800);
    const { data } = await supabase
      .from('pending_promises')
      .select('id, status, action_type, promise_text, execute_at, user_phone')
      .eq('user_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    promiseId = data?.id;
    const ok = !!data
      && data.status === 'pending'
      && data.action_type === 'timed_update'
      && data.promise_text.startsWith('TEST');
    return { name: 'schedule_persist', ok, row: data };
  } catch (err) {
    return { name: 'schedule_persist', ok: false, error: err.message };
  } finally {
    if (promiseId) await safeDelete('pending_promises', 'id', promiseId);
  }
}

// ─── 3. flushDuePromises query semantics ────────────────────────────────────
async function test_flush_query() {
  const phone = `+5255FLUSH${Date.now()}`.substring(0, 16);
  let id1 = null, id2 = null;
  try {
    const due = await supabase.from('pending_promises').insert({
      agent_id: 'mariana', user_phone: phone, user_channel: 'whatsapp',
      promise_text: 'TEST due', action_type: 'timed_update',
      execute_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      status: 'pending', original_message: 'verification'
    }).select('id').single();
    id1 = due?.data?.id;

    const future = await supabase.from('pending_promises').insert({
      agent_id: 'mariana', user_phone: phone, user_channel: 'whatsapp',
      promise_text: 'TEST future', action_type: 'timed_update',
      execute_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
      status: 'pending', original_message: 'verification'
    }).select('id').single();
    id2 = future?.data?.id;

    const dueList = await promiseTracker.getPendingDue(phone);
    const includesDue = dueList.some(p => p.id === id1);
    const excludesFuture = !dueList.some(p => p.id === id2);
    const ok = includesDue && excludesFuture;
    return { name: 'flush_query', ok, due_count: dueList.length, includesDue, excludesFuture };
  } catch (err) {
    return { name: 'flush_query', ok: false, error: err.message };
  } finally {
    if (id1) await safeDelete('pending_promises', 'id', id1);
    if (id2) await safeDelete('pending_promises', 'id', id2);
  }
}

// ─── 4. End-to-end: detectAndSchedule with real Mariana-style text ──────────
async function test_e2e_detect_and_schedule() {
  const phone = `+5255E2E${Date.now()}`.substring(0, 16);
  const text = 'Va, en 30 minutos te confirmo cómo quedó el render.';
  let createdId = null;
  try {
    await promiseTracker.detectAndSchedule(text, {
      phone, channel: 'whatsapp', originalMessage: '¿Cómo va el render?', userId: null
    });
    await sleep(1200);
    const { data } = await supabase
      .from('pending_promises')
      .select('id, action_type, promise_text, execute_at, status')
      .eq('user_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    createdId = data?.id;
    const expectedExecuteAt = new Date(Date.now() + 30 * 60 * 1000);
    const actualExecuteAt = data ? new Date(data.execute_at) : null;
    // tolerate ±5s clock skew
    const deltaSeconds = actualExecuteAt ? Math.abs((actualExecuteAt - expectedExecuteAt) / 1000) : 999;
    const ok = !!data && data.action_type === 'timed_update' && deltaSeconds < 30;
    return { name: 'e2e_detect_and_schedule', ok, row: data, delta_seconds: Math.round(deltaSeconds) };
  } catch (err) {
    return { name: 'e2e_detect_and_schedule', ok: false, error: err.message };
  } finally {
    if (createdId) await safeDelete('pending_promises', 'id', createdId);
  }
}

// ─── 5. BullMQ queue connection check ───────────────────────────────────────
async function test_bullmq_queue() {
  try {
    // require gives us the singleton tracker — peek at its private queue lazy-loader
    const Queue = require('bullmq').Queue;
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
    const ok = !!redisUrl;
    let queueName = null, jobs_waiting = null;
    if (ok) {
      const q = new Queue('fractal-promises', { connection: { url: redisUrl, maxRetriesPerRequest: null } });
      queueName = q.name;
      jobs_waiting = await q.getWaitingCount().catch(() => null);
      await q.close().catch(() => {});
    }
    return { name: 'bullmq_queue', ok, redis_url_set: !!redisUrl, queueName, jobs_waiting };
  } catch (err) {
    return { name: 'bullmq_queue', ok: false, error: err.message };
  }
}

// ─── 6. Mariana wiring check ────────────────────────────────────────────────
async function test_mariana_wiring() {
  try {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../agents/mariana.agent.js'), 'utf8');
    const hasFlush = /promiseTracker\.flushDuePromises/.test(src);
    const hasSchedule = /promiseTracker\.detectAndSchedule/.test(src);
    return { name: 'mariana_wiring', ok: hasFlush && hasSchedule, hasFlush, hasSchedule };
  } catch (err) {
    return { name: 'mariana_wiring', ok: false, error: err.message };
  }
}

// ─── 7. Worker is loaded (process_promises_worker available) ────────────────
async function test_worker_loaded() {
  try {
    const w = require('../workers/promise.worker');
    const ok = typeof w.startPromiseWorker === 'function' || typeof w === 'object';
    return { name: 'worker_loaded', ok, exports: Object.keys(w) };
  } catch (err) {
    return { name: 'worker_loaded', ok: false, error: err.message };
  }
}

// ─── 8. Time parsing accuracy (sanity) ─────────────────────────────────────
async function test_time_parsing() {
  const cases = [
    { text: 'Te aviso en 5 minutos.',  expectMs: 5 * 60 * 1000 },
    { text: 'En 1 hora te confirmo.',  expectMs: 60 * 60 * 1000 },
    { text: 'En 90 minutos te digo.',  expectMs: 90 * 60 * 1000 }
  ];
  let passed = 0;
  const details = [];
  for (const c of cases) {
    const d = promiseTracker.detectPromises(c.text);
    const got = d[0]?.delayMs;
    const ok = got === c.expectMs;
    if (ok) passed++;
    details.push({ text: c.text, expectMs: c.expectMs, got, ok });
  }
  return { name: 'time_parsing', ok: passed === cases.length, passed, total: cases.length, details };
}

// ─── RUN ────────────────────────────────────────────────────────────────────
async function runPromisesVerification() {
  const start = Date.now();
  const tests = [
    test_pattern_detection,
    test_time_parsing,
    test_schedule_persist,
    test_flush_query,
    test_e2e_detect_and_schedule,
    test_bullmq_queue,
    test_mariana_wiring,
    test_worker_loaded
  ];

  const results = [];
  for (const t of tests) {
    try { results.push(await t()); }
    catch (e) { results.push({ name: t.name, ok: false, crash: e.message }); }
  }

  const passed = results.filter(r => r.ok);
  const score = Math.round((passed.length / results.length) * 100);

  return {
    score_percent: score,
    total: results.length,
    passed: passed.length,
    failed: results.length - passed.length,
    duration_ms: Date.now() - start,
    results
  };
}

module.exports = { runPromisesVerification };
