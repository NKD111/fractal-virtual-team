// backend/src/core/nexus-atlas-coordinator.js
// Connects NEXUS (strategic) and ATLAS (technical).
// ATLAS detects → NEXUS evaluates → action decided → ATLAS executes.

const { getChannelBus } = require('../nervous-system/channel-bus');
const { supabase } = require('../core/supabase');

class NexusAtlasCoordinator {
  constructor(nexus, atlas) {
    this.nexus = nexus;
    this.atlas = atlas;
    this._subscribed = false;
  }

  setupCommunication() {
    if (this._subscribed) return;

    const bus = getChannelBus();

    // ATLAS prediction → NEXUS evaluates
    bus.on('urgent:alerts').subscribe(async (event) => {
      try {
        if (event?.type === 'atlas:prediction') {
          await this._handlePrediction(event.payload);
        }
      } catch (err) {
        console.error('[Coordinator] Prediction handler error:', err.message);
      }
    });

    // agent:events → watch for synthetic test failures reported as events
    bus.on('agent:events').subscribe(async (event) => {
      try {
        if (event?.type === 'synthetic_test_failure') {
          await this._handleSyntheticFailure(event);
        }
      } catch (err) {
        console.error('[Coordinator] Event handler error:', err.message);
      }
    });

    this._subscribed = true;
    console.log('[NexusAtlasCoordinator] Communication channels active');
  }

  /**
   * ATLAS predicts degradation → NEXUS evaluates → decide action.
   */
  async _handlePrediction(payload) {
    const { service_key, confidence, predicted_failure_in_minutes, degradation_rate } = payload;

    const decision = await this.nexus.evaluateIssue({
      serviceKey: service_key,
      severity: confidence >= 0.90 ? 'critical' : 'warning',
      predictedFailureInMinutes: predicted_failure_in_minutes,
      consecutiveFailures: 1
    });

    console.log(`[Coordinator] Prediction for ${service_key}: action=${decision.action}`);

    switch (decision.action) {
      case 'notify_critical':
        await this.nexus.alert(decision.alert);
        break;

      case 'auto_repair':
        const result = await this.atlas.repair(service_key, 'degradation');
        console.log(`[Coordinator] Auto-repair ${service_key}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        // If repair failed, escalate to NEXUS alert
        if (!result.success) {
          await this.nexus.alert({
            severity: 'warning',
            service: service_key,
            type: 'repair_failed',
            message: `⚠️ Auto-reparación fallida en ${service_key} — degradación continúa`,
            recommended_action: 'Revisar logs manualmente'
          });
        }
        break;

      case 'monitor_only':
      default:
        console.log(`[Coordinator] Monitoring ${service_key} more closely`);
        break;
    }
  }

  /**
   * Synthetic test failure reported via bus → evaluate & repair if possible.
   */
  async _handleSyntheticFailure(event) {
    const { service_key, consecutive_failures = 1 } = event;

    // Look up service importance
    let service = null;
    try {
      const { data } = await supabase.from('monitored_services').select('importance_level').eq('service_key', service_key).single();
      service = data;
    } catch (_) {}

    const decision = await this.nexus.evaluateIssue({
      serviceKey: service_key,
      severity: consecutive_failures >= 3 ? 'critical' : 'warning',
      consecutiveFailures: consecutive_failures
    });

    if (decision.action === 'auto_repair') {
      await this.atlas.repair(service_key, 'connection_failure');
    } else if (decision.action === 'notify_critical') {
      await this.nexus.alert(decision.alert);
    }
  }
}

module.exports = { NexusAtlasCoordinator };
