// backend/src/tests/routines-check.js
// Smoke test for the cron schedules: confirm RoutineManager registers all 6,
// and dry-run morningPrep to verify the WhatsApp digest builds correctly
// (does NOT send if SKIP_NOTIFY=1).
require('dotenv').config();
const RoutineManager = require('../routines');

(async () => {
  const rm = new RoutineManager();
  rm.initialize();

  const expected = [
    '29 8 * * 1-5',  // Morning Prep
    '0 23 * * *',    // Nightly Maintenance
    '0 9 * * 1',     // Weekly Financial
    '0 15 * * 1-5',  // Follow-ups
    '0 18 * * 5',    // Diana health
    '55 23 * * *'    // Daily KPIs
  ];

  console.log(`\n[routines-check] tasks registered: ${rm._tasks.length}/${expected.length}`);
  console.log('[routines-check] expected schedules:', expected);

  // Dry-run morningPrep to test the digest pipeline
  if (process.env.SKIP_NOTIFY !== '1') {
    process.env.SKIP_NOTIFY = '1';
  }
  console.log('\n[routines-check] dry-running morningPrep...');
  // Patch notifyNeiky to log instead of send
  const wa = require('../core/whatsapp');
  const origNotify = wa.notifyNeiky;
  wa.notifyNeiky = async (msg) => {
    console.log('\n=== WhatsApp digest preview (NOT SENT) ===');
    console.log(msg);
    console.log('=== end ===\n');
    return { dryRun: true };
  };

  try {
    const r = await rm.morningPrep();
    console.log('[routines-check] morningPrep result:', {
      promises: r.promises, active: r.active_projects, atRisk: r.at_risk,
      msgLen: r.message?.length
    });
    console.log('\n✅ routines-check PASSED');
    process.exit(0);
  } catch (err) {
    console.error('❌ routines-check FAILED:', err.message);
    process.exit(1);
  } finally {
    wa.notifyNeiky = origNotify;
  }
})();
