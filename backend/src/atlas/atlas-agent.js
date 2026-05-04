// backend/src/atlas/atlas-agent.js
// ATLAS — Technical Engineer
// Orchestrates all ATLAS sub-systems: SyntheticTester, FailurePredictor,
// AutoRepairEngine, LogAnalyzer. Receives commands from NexusAtlasCoordinator.

const { SyntheticTester } = require('./synthetic-tester');
const { FailurePredictor } = require('./failure-predictor');
const { AutoRepairEngine } = require('./auto-repair-engine');
const { LogAnalyzer } = require('./log-analyzer');
const { supabase } = require('../core/supabase');

class AtlasAgent {
  constructor() {
    this.name = 'ATLAS';
    this.role = 'Technical Engineer';

    this.syntheticTester = new SyntheticTester();
    this.failurePredictor = new FailurePredictor();
    this.autoRepairEngine = new AutoRepairEngine();
    this.logAnalyzer = new LogAnalyzer();

    this._initialized = false;
    this.startedAt = null;
  }

  async initialize() {
    if (this._initialized) return;
    console.log('\n🔧 ATLAS — Technical Engineer iniciando...');

    try {
      this.syntheticTester.start();
      console.log('  ✓ Synthetic Tester: pruebas cada minuto ($0 costo)');

      this.failurePredictor.start();
      console.log('  ✓ Failure Predictor: análisis de tendencias cada 5 min');

      this.logAnalyzer.start();
      console.log('  ✓ Log Analyzer: detección de patrones cada 10 min');

      // Auto-repair engine is on-demand (no background loop)
      console.log('  ✓ Auto-Repair Engine: playbooks listo bajo demanda');

      this._initialized = true;
      this.startedAt = new Date().toISOString();
      console.log('🔧 ATLAS operativo\n');
    } catch (err) {
      console.error('[ATLAS] Error en inicialización:', err.message);
      // Don't throw — graceful degradation
    }
  }

  /**
   * Attempt to auto-repair a service issue.
   * Called by NexusAtlasCoordinator when a synthetic test fails.
   */
  async repair(serviceKey, issueType = 'generic') {
    if (!this._initialized) return { attempted: false, reason: 'atlas_not_initialized' };
    return this.autoRepairEngine.attemptRepair(serviceKey, issueType);
  }

  /**
   * Run an immediate synthetic test for a specific service.
   */
  async testNow(serviceKey) {
    const { data: service } = await supabase
      .from('monitored_services')
      .select('*')
      .eq('service_key', serviceKey)
      .single();

    if (!service) return { ok: false, error: `Service ${serviceKey} not found` };
    return this.syntheticTester._testService(service);
  }

  async getStatus() {
    let totalTests = 0, alerts = 0;
    try {
      const r1 = await supabase.from('synthetic_tests').select('*', { count: 'exact', head: true }).gte('tested_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
      totalTests = r1.count || 0;
      const r2 = await supabase.from('predictive_alerts').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      alerts = r2.count || 0;
    } catch (_) {}

    return {
      agent: this.name,
      role: this.role,
      initialized: this._initialized,
      started_at: this.startedAt,
      synthetic_tests_last_hour: totalTests,
      predictive_alerts_last_24h: alerts,
      active_repairs: this.autoRepairEngine.getActiveRepairs(),
      last_test_results: this.syntheticTester.getLastResults()
    };
  }
}

module.exports = { AtlasAgent };
