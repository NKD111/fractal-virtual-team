// backend/src/atlas/synthetic-tester.js
// ATLAS — Synthetic Tester
// Runs every minute via node-cron, tests all active services.
// ZERO AI calls — only HTTP pings and DB count queries.

const cron = require('node-cron');
const axios = require('axios');
const { supabase } = require('../core/supabase');

class SyntheticTester {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastResults = {};
  }

  start() {
    if (this.cronJob) return;

    // Run once immediately, then every minute
    this._runAllTests().catch(err =>
      console.error('[SyntheticTester] Initial run error:', err.message)
    );

    this.cronJob = cron.schedule('* * * * *', async () => {
      if (this.isRunning) return; // skip overlap
      try {
        await this._runAllTests();
      } catch (err) {
        console.error('[SyntheticTester] Cron error:', err.message);
      }
    }, { timezone: 'America/Mexico_City' });

    console.log('[SyntheticTester] Started — testing every 60 seconds');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  async _runAllTests() {
    this.isRunning = true;
    try {
      const { data: services, error } = await supabase
        .from('monitored_services')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('[SyntheticTester] Failed to load services:', error.message);
        return;
      }

      if (!services || services.length === 0) {
        // Nothing to test yet — tables not seeded
        return;
      }

      const results = await Promise.allSettled(
        services.map(svc => this._testService(svc))
      );

      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[SyntheticTester] Test failed for ${services[i].name}:`, r.reason?.message);
        }
      });
    } finally {
      this.isRunning = false;
    }
  }

  async _testService(service) {
    const startTime = Date.now();
    let status = 'healthy';
    let responseTimeMs = null;
    let errorMessage = null;
    let details = {};

    try {
      const result = await this._dispatchTest(service);
      responseTimeMs = Date.now() - startTime;
      status = result.ok ? 'healthy' : 'degraded';
      details = result.details || {};
      if (!result.ok) errorMessage = result.error;
    } catch (err) {
      responseTimeMs = Date.now() - startTime;
      status = 'down';
      errorMessage = err.message;
    }

    this.lastResults[service.service_key] = { status, responseTimeMs, testedAt: new Date().toISOString() };

    // Write test result to synthetic_tests table
    const testRecord = {
      service_id: service.id,
      service_key: service.service_key,
      status,
      response_time_ms: responseTimeMs,
      error_message: errorMessage,
      details,
      tested_at: new Date().toISOString()
    };

    const [insertErr, updateErr] = await Promise.all([
      supabase.from('synthetic_tests').insert(testRecord).then(r => r.error),
      supabase
        .from('monitored_services')
        .update({
          current_status: status,
          last_checked_at: new Date().toISOString(),
          last_response_time_ms: responseTimeMs
        })
        .eq('id', service.id)
        .then(r => r.error)
    ]);

    if (insertErr) console.warn('[SyntheticTester] Insert error:', insertErr.message);
    if (updateErr) console.warn('[SyntheticTester] Update error:', updateErr.message);

    if (status !== 'healthy') {
      console.warn(`[SyntheticTester] ${service.service_key} → ${status} (${responseTimeMs}ms) — ${errorMessage || ''}`);
    }

    return { service: service.service_key, status, responseTimeMs };
  }

  async _dispatchTest(service) {
    switch (service.service_key) {
      case 'supabase':
        return this._testSupabase(service);
      case 'redis':
        return this._testRedis(service);
      case 'railway_backend':
        return this._testBackendHealth(service);
      case 'anthropic_api':
        return this._testAnthropic(service);
      case 'twilio_whatsapp':
        return this._testTwilio(service);
      default:
        return this._testGenericHead(service);
    }
  }

  // Test Supabase with a count query — $0 cost
  async _testSupabase(service) {
    const { count, error } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true });

    if (error) return { ok: false, error: error.message, details: { type: 'db_count' } };
    return { ok: true, details: { type: 'db_count', count } };
  }

  // Test Redis via channel bus PING — $0 cost
  async _testRedis(service) {
    try {
      const { getChannelBus } = require('../nervous-system/channel-bus');
      const bus = getChannelBus();

      if (!bus.isRedisAvailable || !bus.publisher) {
        // Redis not configured — not a failure, just unavailable
        return { ok: true, details: { type: 'redis_ping', mode: 'in-process' } };
      }

      const pong = await bus.publisher.ping();
      const ok = pong === 'PONG';
      return {
        ok,
        error: ok ? null : `Unexpected PING response: ${pong}`,
        details: { type: 'redis_ping', response: pong }
      };
    } catch (err) {
      return { ok: false, error: err.message, details: { type: 'redis_ping' } };
    }
  }

  // Test own backend health endpoint — $0 cost
  async _testBackendHealth(service) {
    const port = process.env.PORT || 3000;
    const url = service.health_url || `http://localhost:${port}/webhook/health`;
    try {
      const { status, data } = await axios.get(url, { timeout: 8000 });
      const ok = status >= 200 && status < 400;
      return { ok, details: { type: 'http_get', status, url } };
    } catch (err) {
      return { ok: false, error: err.message, details: { type: 'http_get', url } };
    }
  }

  // Test Anthropic models endpoint — free, no tokens consumed
  async _testAnthropic(service) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, error: 'No ANTHROPIC_API_KEY configured', details: {} };

    try {
      const { status } = await axios.get('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        timeout: 8000
      });
      return { ok: status === 200, details: { type: 'api_models_list', status } };
    } catch (err) {
      const status = err.response?.status;
      // 401 means key works but not authorized — API is reachable
      if (status === 401) return { ok: true, details: { type: 'api_models_list', status, note: 'key issue not API down' } };
      return { ok: false, error: err.message, details: { type: 'api_models_list', status } };
    }
  }

  // Test Twilio account endpoint — free status check
  async _testTwilio(service) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return { ok: false, error: 'No Twilio credentials configured', details: {} };

    try {
      const { status } = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
        {
          auth: { username: sid, password: token },
          timeout: 8000
        }
      );
      return { ok: status === 200, details: { type: 'twilio_account_check', status } };
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) return { ok: false, error: 'Twilio auth failed', details: { type: 'twilio_account_check', status } };
      return { ok: false, error: err.message, details: { type: 'twilio_account_check', status } };
    }
  }

  // Generic HEAD ping for anything else — $0 cost
  async _testGenericHead(service) {
    const url = service.health_url || service.base_url;
    if (!url) return { ok: true, details: { type: 'no_endpoint', note: 'no health_url configured' } };

    try {
      const { status } = await axios.head(url, { timeout: 8000 });
      const ok = status >= 200 && status < 400;
      return { ok, details: { type: 'head_ping', status, url } };
    } catch (err) {
      // Some services don't allow HEAD — try GET
      try {
        const { status } = await axios.get(url, { timeout: 8000 });
        const ok = status >= 200 && status < 400;
        return { ok, details: { type: 'get_ping', status, url } };
      } catch (err2) {
        return { ok: false, error: err2.message, details: { type: 'head_ping', url } };
      }
    }
  }

  getLastResults() {
    return this.lastResults;
  }
}

module.exports = { SyntheticTester };
