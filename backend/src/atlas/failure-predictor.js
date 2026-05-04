// backend/src/atlas/failure-predictor.js
// ATLAS — Failure Predictor
// Reads last 100 synthetic tests per service every 5 minutes.
// If degrading 15%+ with 75%+ confidence → saves predictive alert, notifies NEXUS.

const { supabase } = require('../core/supabase');
const { getChannelBus } = require('../nervous-system/channel-bus');

class FailurePredictor {
  constructor() {
    this.intervalHandle = null;
    this.INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    this.DEGRADATION_THRESHOLD = 0.15;  // 15%
    this.CONFIDENCE_THRESHOLD = 0.75;   // 75%
    this.MIN_SAMPLES = 5;               // need at least 5 samples to predict
  }

  start() {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(async () => {
      try {
        await this._analyzeTrends();
      } catch (err) {
        console.error('[FailurePredictor] Analysis error:', err.message);
      }
    }, this.INTERVAL_MS);

    console.log('[FailurePredictor] Started — analyzing trends every 5 minutes');
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async _analyzeTrends() {
    const { data: services, error } = await supabase
      .from('monitored_services')
      .select('id, service_key, name, importance_level')
      .eq('is_active', true);

    if (error || !services || services.length === 0) return;

    for (const service of services) {
      try {
        await this._analyzeServiceTrend(service);
      } catch (err) {
        console.error(`[FailurePredictor] Error analyzing ${service.service_key}:`, err.message);
      }
    }
  }

  async _analyzeServiceTrend(service) {
    // Fetch last 100 tests for this service
    const { data: tests, error } = await supabase
      .from('synthetic_tests')
      .select('status, response_time_ms, tested_at')
      .eq('service_id', service.id)
      .order('tested_at', { ascending: false })
      .limit(100);

    if (error || !tests || tests.length < this.MIN_SAMPLES) return;

    const analysis = this._computeTrend(tests);

    if (analysis.degrading && analysis.confidence >= this.CONFIDENCE_THRESHOLD) {
      console.warn(
        `[FailurePredictor] ${service.service_key} degrading: ` +
        `${(analysis.degradationRate * 100).toFixed(1)}% worse, ` +
        `confidence=${(analysis.confidence * 100).toFixed(0)}%`
      );

      // Save to predictive_alerts table
      const alertPayload = {
        service_id: service.id,
        service_key: service.service_key,
        service_name: service.name,
        degradation_rate: analysis.degradationRate,
        confidence: analysis.confidence,
        predicted_failure_in_minutes: analysis.predictedFailureInMinutes,
        recent_failure_rate: analysis.recentFailureRate,
        historical_failure_rate: analysis.historicalFailureRate,
        avg_response_time_recent: analysis.avgResponseTimeRecent,
        avg_response_time_historical: analysis.avgResponseTimeHistorical,
        sample_count: tests.length,
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase
        .from('predictive_alerts')
        .insert(alertPayload);

      if (insertErr) console.warn('[FailurePredictor] Insert error:', insertErr.message);

      // Notify NEXUS via Channel Bus
      const bus = getChannelBus();
      await bus.emit('urgent:alerts', {
        type: 'atlas:prediction',
        emitted_by: 'atlas:failure_predictor',
        intended_for: 'nexus',
        priority: this._calcPriority(service.importance_level, analysis.confidence),
        payload: alertPayload
      });
    }
  }

  _computeTrend(tests) {
    // Split into two halves: recent (first 50) vs historical (last 50)
    const half = Math.floor(tests.length / 2);
    const recentTests = tests.slice(0, half);        // most recent
    const historicalTests = tests.slice(half);        // older

    const recentFailures = recentTests.filter(t => t.status !== 'healthy').length;
    const historicalFailures = historicalTests.filter(t => t.status !== 'healthy').length;

    const recentFailureRate = recentFailures / recentTests.length;
    const historicalFailureRate = historicalFailures / historicalTests.length;

    const degradationRate = recentFailureRate - historicalFailureRate;
    const degrading = degradationRate >= this.DEGRADATION_THRESHOLD;

    // Compute average response times (ignoring nulls)
    const recentTimes = recentTests.map(t => t.response_time_ms).filter(Boolean);
    const histTimes = historicalTests.map(t => t.response_time_ms).filter(Boolean);
    const avgResponseTimeRecent = recentTimes.length
      ? recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length
      : null;
    const avgResponseTimeHistorical = histTimes.length
      ? histTimes.reduce((a, b) => a + b, 0) / histTimes.length
      : null;

    // Confidence = how consistent the recent failures are (low variance = high confidence)
    let confidence = 0;
    if (degrading) {
      // Simple confidence: based on ratio of recent failures to half window
      confidence = Math.min(1, recentFailureRate / (historicalFailureRate + 0.01) * 0.5);

      // Boost confidence if response times are also degrading
      if (avgResponseTimeRecent && avgResponseTimeHistorical &&
          avgResponseTimeRecent > avgResponseTimeHistorical * 1.2) {
        confidence = Math.min(1, confidence + 0.25);
      }

      // Boost confidence if degradation is severe
      if (degradationRate > 0.40) confidence = Math.min(1, confidence + 0.20);
    }

    // Rough estimate of when it might fail completely
    const predictedFailureInMinutes = degrading && degradationRate > 0
      ? Math.round((1 - recentFailureRate) / degradationRate * 5) // 5-min intervals
      : null;

    return {
      degrading,
      degradationRate,
      confidence,
      recentFailureRate,
      historicalFailureRate,
      avgResponseTimeRecent,
      avgResponseTimeHistorical,
      predictedFailureInMinutes
    };
  }

  _calcPriority(importanceLevel, confidence) {
    const base = importanceLevel >= 5 ? 5 : importanceLevel >= 3 ? 4 : 3;
    return confidence >= 0.90 ? Math.min(5, base + 1) : base;
  }
}

module.exports = { FailurePredictor };
