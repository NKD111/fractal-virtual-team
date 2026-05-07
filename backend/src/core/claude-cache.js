// backend/src/core/claude-cache.js
// UPGRADE 1 — Response Caching
// Cache en memoria para respuestas Claude repetidas.
// Evita re-llamar la API cuando el prompt es idéntico.
//
// Uso en QA pipeline:
//   const { cachedQACall } = require('../core/claude-cache');
//   const result = await cachedQACall('consistency', brief, () => auditConsistency(brief));
//
// Política de invalidación:
//   QA responses   — TTL 1h (mismo arte, mismo brief)
//   Client context — TTL 24h (cambia raramente)
//   ORACLE decisions — TTL 30min (puede cambiar con nueva memoria)

'use strict';

const NodeCache = require('node-cache');
const crypto    = require('crypto');

// ── Cache instances ────────────────────────────────────────────────────────────
const qaCache      = new NodeCache({ stdTTL: 3600,  checkperiod: 300  }); // 1h
const contextCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // 24h
const oracleCache  = new NodeCache({ stdTTL: 1800,  checkperiod: 120  }); // 30min

// ── Stats en memoria ───────────────────────────────────────────────────────────
let stats = { hits: 0, misses: 0, saves: 0 };

// ── Cache key generation ───────────────────────────────────────────────────────
/**
 * Genera una clave determinística para un brief + agente.
 * Usa los campos más estables (concepto, tipo_pieza, headline, cliente).
 */
function briefCacheKey(agentName, brief) {
  const stable = JSON.stringify({
    a: agentName,
    c: brief.concepto  || brief.intencion_real || '',
    t: brief.tipo_pieza || '',
    h: brief.headline  || brief.brief_carlos?.headline_sugerido || '',
    u: brief.url_arte_final || '',
    k: brief.cliente   || 'FIF'
  });
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 20);
}

/**
 * Genera clave genérica para cualquier prompt string.
 */
function promptCacheKey(prefix, prompt) {
  return prefix + ':' + crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

// ── cachedQACall ──────────────────────────────────────────────────────────────
/**
 * Ejecuta una llamada de QA con cache automático.
 * Si el resultado ya existe en cache, lo devuelve sin llamar a Claude.
 *
 * @param {string} agentName  - Identificador del agente ('consistency', 'emotional', etc.)
 * @param {Object} brief      - El brief del pipeline
 * @param {Function} fn       - Función que hace la llamada real (async)
 * @param {number} [ttl]      - TTL override en segundos (default: 3600)
 * @returns {Promise<*>}      - Resultado del agente
 */
async function cachedQACall(agentName, brief, fn, ttl) {
  const key = briefCacheKey(agentName, brief);
  const cached = qaCache.get(key);

  if (cached !== undefined) {
    stats.hits++;
    console.log(`🎯 [Cache] HIT ${agentName}:${key.slice(0, 8)} — ahorrando llamada a Claude`);
    return cached;
  }

  stats.misses++;
  const result = await fn();

  // Solo cachear si el resultado es válido (evitar cachear errores)
  if (result && !result.error) {
    if (ttl !== undefined) qaCache.set(key, result, ttl);
    else qaCache.set(key, result);
    stats.saves++;
    console.log(`💾 [Cache] SET ${agentName}:${key.slice(0, 8)}`);
  }

  return result;
}

/**
 * Cachea contexto de cliente (más estable que resultados QA)
 */
async function cachedContextCall(contextKey, fn) {
  const cached = contextCache.get(contextKey);
  if (cached !== undefined) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  const result = await fn();
  if (result) {
    contextCache.set(contextKey, result);
    stats.saves++;
  }
  return result;
}

/**
 * Invalida todas las entradas de cache para un brief específico.
 * Llamar cuando se actualiza un arte para forzar re-evaluación.
 */
function invalidateBriefCache(brief) {
  const agents = ['consistency', 'emotional', 'ctr', 'simulator', 'valentina', 'qcbot'];
  let invalidated = 0;
  agents.forEach(a => {
    const key = briefCacheKey(a, brief);
    if (qaCache.del(key)) invalidated++;
  });
  console.log(`🗑️  [Cache] Invalidadas ${invalidated} entradas para brief`);
  return invalidated;
}

/**
 * Estadísticas del cache para el dashboard
 */
function getCacheStats() {
  const hitRate = stats.hits + stats.misses > 0
    ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1) + '%'
    : '0%';

  return {
    hits:             stats.hits,
    misses:           stats.misses,
    saves:            stats.saves,
    hit_rate:         hitRate,
    qa_cache_keys:    qaCache.keys().length,
    context_cache_keys: contextCache.keys().length,
    oracle_cache_keys: oracleCache.keys().length,
    estimated_savings_usd: (stats.hits * 0.003).toFixed(4) // ~$0.003 por llamada ahorrada
  };
}

module.exports = {
  cachedQACall,
  cachedContextCall,
  invalidateBriefCache,
  getCacheStats,
  briefCacheKey,
  promptCacheKey,
  qaCache,
  contextCache,
  oracleCache
};
