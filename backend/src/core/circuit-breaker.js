// backend/src/core/circuit-breaker.js
// UPGRADE 3 — Circuit Breaker Pattern
// El sistema nunca se congela. Degrada graciosamente.
//
// Estados:
//   CLOSED   — normal, todas las llamadas pasan
//   OPEN     — servicio caído, llamadas van directo al fallback
//   HALF_OPEN — testing si el servicio se recuperó
//
// Uso:
//   const { breakers } = require('../core/circuit-breaker');
//   const result = await breakers.higgsfield.execute(
//     () => generateImage(params),
//     () => ({ fallback: true, description: '...' })
//   );

'use strict';

class CircuitBreaker {
  /**
   * @param {string} name - Nombre del servicio (para logs y alertas)
   * @param {Object} opts
   * @param {number} opts.threshold     - Fallos consecutivos antes de OPEN (default: 3)
   * @param {number} opts.timeout       - ms en estado OPEN antes de HALF_OPEN (default: 60000)
   * @param {number} opts.successThreshold - Éxitos en HALF_OPEN para volver a CLOSED (default: 2)
   * @param {boolean} opts.notifyNKD    - Enviar WhatsApp cuando el circuito se abre (default: true)
   */
  constructor(name, opts = {}) {
    this.name             = name;
    this.state            = 'CLOSED';
    this.failureCount     = 0;
    this.successCount     = 0;
    this.lastFailureTime  = null;
    this.lastError        = null;
    this.totalCalls       = 0;
    this.totalFailures    = 0;
    this.totalFallbacks   = 0;

    this.threshold        = opts.threshold        || 3;
    this.timeout          = opts.timeout          || 60_000;
    this.successThreshold = opts.successThreshold || 2;
    this.notifyOnOpen     = opts.notifyNKD !== false; // default true
  }

  /**
   * Ejecuta fn con fallback automático según estado del circuito.
   * @param {Function} fn       - Función principal (puede ser async)
   * @param {Function} fallback - Función fallback (puede ser async)
   * @returns {Promise<*>}
   */
  async execute(fn, fallback) {
    this.totalCalls++;

    // ── OPEN: comprobar si ya pasó el timeout ─────────────────────────────────
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.timeout) {
        this.state        = 'HALF_OPEN';
        this.successCount = 0;
        console.log(`⚡ [CB:${this.name}] HALF_OPEN — probando recuperación (${Math.round(elapsed/1000)}s en OPEN)`);
      } else {
        console.log(`🔴 [CB:${this.name}] OPEN — usando fallback (${Math.round((this.timeout - elapsed)/1000)}s restantes)`);
        this.totalFallbacks++;
        return fallback ? fallback() : null;
      }
    }

    // ── CLOSED / HALF_OPEN: intentar la llamada principal ────────────────────
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      console.log(`⚠️  [CB:${this.name}] fallo → usando fallback: ${err.message}`);
      this.totalFallbacks++;
      if (fallback) return fallback();
      throw err; // re-throw si no hay fallback definido
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state        = 'CLOSED';
        this.successCount = 0;
        console.log(`✅ [CB:${this.name}] CLOSED — servicio recuperado`);
      }
    }
  }

  _onFailure(err) {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.lastError       = err?.message || String(err);

    if (this.failureCount >= this.threshold) {
      const wasAlreadyOpen = this.state === 'OPEN';
      this.state = 'OPEN';
      if (!wasAlreadyOpen) {
        console.error(`🔴 [CB:${this.name}] ABIERTO — ${this.failureCount} fallos consecutivos. Sistema en modo degradado.`);
        if (this.notifyOnOpen) this._alertNKD(err);
      }
    }
  }

  _alertNKD(err) {
    // No-blocking — no importa si falla
    try {
      const { notifyNeiky } = require('./whatsapp');
      notifyNeiky(
        `⚠️ CIRCUIT BREAKER: ${this.name} CAÍDO\n` +
        `Error: ${err?.message || 'desconocido'}\n` +
        `Sistema usando fallback automáticamente.\n` +
        `Se reintentará en ${Math.round(this.timeout/1000)}s.`
      ).catch(() => {});
    } catch { /* WhatsApp no disponible — no bloquear */ }
  }

  /**
   * Estado actual del circuito para dashboards y health checks
   */
  getStatus() {
    return {
      name:            this.name,
      state:           this.state,
      failure_count:   this.failureCount,
      last_failure:    this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
      last_error:      this.lastError,
      total_calls:     this.totalCalls,
      total_failures:  this.totalFailures,
      total_fallbacks: this.totalFallbacks,
      error_rate:      this.totalCalls > 0
        ? (this.totalFailures / this.totalCalls * 100).toFixed(1) + '%'
        : '0%',
      timeout_remaining_ms: this.state === 'OPEN'
        ? Math.max(0, this.timeout - (Date.now() - this.lastFailureTime))
        : 0
    };
  }

  /** Forzar reset (para testing o intervención manual) */
  reset() {
    this.state        = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastError = null;
    console.log(`🔄 [CB:${this.name}] reset manual`);
  }
}

// ── Instancias para cada servicio externo de Fractal MX ───────────────────────
// Ajustar thresholds según SLA de cada servicio:
//   - Higgsfield: 3 fallos / 2min (genera imágenes — puede tardar)
//   - Claude API: 5 fallos / 30s (falla rápido, recupera rápido)
//   - Supabase:   3 fallos / 60s (crítico — muchos agentes dependen)
//   - Twilio/WA:  3 fallos / 60s (no bloquear por WhatsApp)
//   - Railway:    usado internamente para crons

const breakers = {
  higgsfield: new CircuitBreaker('Higgsfield', {
    threshold: 3,
    timeout: 120_000,  // 2 min — imagen puede tardar
    successThreshold: 2
  }),

  claudeAPI: new CircuitBreaker('Claude API', {
    threshold: 5,
    timeout: 30_000,   // 30s — API se recupera rápido
    successThreshold: 3,
    notifyNKD: false   // silencioso — muy frecuente, ruido en WhatsApp
  }),

  supabase: new CircuitBreaker('Supabase', {
    threshold: 3,
    timeout: 60_000,   // 1 min
    successThreshold: 2
  }),

  twilio: new CircuitBreaker('Twilio', {
    threshold: 3,
    timeout: 60_000,
    successThreshold: 2,
    notifyNKD: false   // no puede notificar via WhatsApp si Twilio está caído
  }),

  metaWA: new CircuitBreaker('Meta WhatsApp', {
    threshold: 5,
    timeout: 120_000,
    successThreshold: 2,
    notifyNKD: false
  })
};

module.exports = { CircuitBreaker, breakers };
