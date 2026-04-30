/**
 * Persistent JSON store para conversaciones.
 * Reemplaza el Map() en memoria — sobrevive reinicios.
 *
 * Escribe debounced (200ms) para no martillar el disco.
 * Sets (escalationsSent) se serializan como arrays.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'clients.json');

let cache = new Map();
let writeTimer = null;
let loaded = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  if (loaded) return;
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) {
    cache = new Map();
    loaded = true;
    return;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    cache = new Map();
    for (const [k, v] of Object.entries(obj)) {
      // Restaurar Set
      v.escalationsSent = new Set(v.escalationsSent || []);
      cache.set(k, v);
    }
    console.log(`[store] Cargadas ${cache.size} conversaciones de ${STORE_FILE}`);
  } catch (err) {
    console.error('[store] Error cargando, empezando vacío:', err.message);
    cache = new Map();
  }
  loaded = true;
}

function persistNow() {
  ensureDir();
  const obj = {};
  for (const [k, v] of cache.entries()) {
    obj[k] = {
      ...v,
      escalationsSent: Array.from(v.escalationsSent || []),
    };
  }
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[store] Error escribiendo:', err.message);
  }
}

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, 200);
}

function get(from) {
  load();
  return cache.get(from);
}

function set(from, conv) {
  load();
  cache.set(from, conv);
  scheduleWrite();
}

function has(from) {
  load();
  return cache.has(from);
}

function size() {
  load();
  return cache.size;
}

function entries() {
  load();
  return cache.entries();
}

// Flush sincrónico al cerrar el proceso
function flush() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  persistNow();
}

process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

module.exports = { get, set, has, size, entries, flush };
