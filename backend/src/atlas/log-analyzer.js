// backend/src/atlas/log-analyzer.js
// ATLAS — Log Analyzer
// Detects patterns from system_events table and surfaces them to ATLAS.

const { supabase } = require('../core/supabase');
const { getChannelBus } = require('../nervous-system/channel-bus');

class LogAnalyzer {
  constructor() {
    this.intervalHandle = null;
    this.INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    this.PATTERN_WINDOW_HOURS = 2;
    this.patternThresholds = {
      repeated_failure: 3,    // 3+ failures of same service in window → pattern
      rapid_recovery: 5,      // 5+ quick recoveries → flapping
      cascade_failures: 2     // 2+ different services failing → cascade risk
    };
  }

  start() {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(async () => {
      try {
        await this._analyzePatterns();
      } catch (err) {
        console.error('[LogAnalyzer] Analysis error:', err.message);
      }
    }, this.INTERVAL_MS);

    console.log('[LogAnalyzer] Started — analyzing patterns every 10 minutes');
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async _analyzePatterns() {
    const windowStart = new Date(Date.now() - this.PATTERN_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from('system_events')
      .select('*')
      .gte('started_at', windowStart)
      .order('started_at', { ascending: false });

    if (error || !events || events.length === 0) return;

    const patterns = [];

    // Pattern 1: Repeated failure of same service
    const failuresByService = {};
    for (const ev of events) {
      if (!ev.success) {
        failuresByService[ev.service_key] = (failuresByService[ev.service_key] || 0) + 1;
      }
    }

    for (const [serviceKey, count] of Object.entries(failuresByService)) {
      if (count >= this.patternThresholds.repeated_failure) {
        patterns.push({
          type: 'repeated_failure',
          service_key: serviceKey,
          count,
          severity: count >= 10 ? 'critical' : count >= 5 ? 'high' : 'medium',
          description: `${serviceKey} failed ${count} times in the last ${this.PATTERN_WINDOW_HOURS}h`
        });
      }
    }

    // Pattern 2: Cascade failures (multiple different services failing)
    const failingServices = Object.keys(failuresByService);
    if (failingServices.length >= this.patternThresholds.cascade_failures) {
      patterns.push({
        type: 'cascade_failure',
        service_keys: failingServices,
        count: failingServices.length,
        severity: failingServices.length >= 4 ? 'critical' : 'high',
        description: `${failingServices.length} services failing simultaneously — possible cascade or infra issue`
      });
    }

    // Pattern 3: Flapping — services recovering and failing repeatedly
    const serviceStateChanges = {};
    for (const ev of events) {
      if (!serviceStateChanges[ev.service_key]) serviceStateChanges[ev.service_key] = [];
      serviceStateChanges[ev.service_key].push(ev.success);
    }

    for (const [serviceKey, states] of Object.entries(serviceStateChanges)) {
      let changes = 0;
      for (let i = 1; i < states.length; i++) {
        if (states[i] !== states[i - 1]) changes++;
      }
      if (changes >= this.patternThresholds.rapid_recovery) {
        patterns.push({
          type: 'flapping',
          service_key: serviceKey,
          state_changes: changes,
          severity: 'medium',
          description: `${serviceKey} flapping — ${changes} state changes in ${this.PATTERN_WINDOW_HOURS}h`
        });
      }
    }

    if (patterns.length === 0) return;

    // Save detected patterns
    for (const pattern of patterns) {
      await this._savePattern(pattern);
    }

    // Emit to bus if critical patterns
    const criticalPatterns = patterns.filter(p => p.severity === 'critical');
    if (criticalPatterns.length > 0) {
      const bus = getChannelBus();
      await bus.emitUrgent({
        type: 'atlas:pattern_detected',
        emitted_by: 'atlas:log_analyzer',
        intended_for: 'nexus',
        payload: { patterns: criticalPatterns, window_hours: this.PATTERN_WINDOW_HOURS }
      });
    }
  }

  async _savePattern(pattern) {
    try {
      await supabase.from('system_events').insert({
        event_type: 'pattern_detected',
        service_key: pattern.service_key || pattern.service_keys?.join(',') || 'multiple',
        action_type: pattern.type,
        success: true,
        details: pattern,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[LogAnalyzer] Failed to save pattern:', err.message);
    }
  }

  /**
   * Query recent patterns for a specific service (used by ATLAS diagnosis)
   */
  async getRecentPatterns(serviceKey, limitHours = 24) {
    const windowStart = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('system_events')
      .select('*')
      .eq('event_type', 'pattern_detected')
      .gte('started_at', windowStart)
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) return [];

    return (data || []).filter(ev =>
      !serviceKey ||
      ev.service_key === serviceKey ||
      ev.details?.service_keys?.includes(serviceKey)
    );
  }
}

module.exports = { LogAnalyzer };
