// backend/src/core/context-loader.js
// FASE 1 — Memoria Modular
// Carga contexto específico por agente y cliente desde ~/fractal-os/context/
// En lugar de cargar FRACTAL.md completo (500+ líneas), cada agente
// recibe SOLO los archivos relevantes a su función.

const fs = require('fs');
const path = require('path');

// Base path de los archivos de contexto
// Prioridad:
//   1. CONTEXT_PATH env var (override manual)
//   2. backend/context/ dentro del repo (Railway + local dev)
//   3. ~/fractal-os/context/ (legacy local)
const CONTEXT_BASE = process.env.CONTEXT_PATH
  || path.join(__dirname, '..', '..', 'context')
  || path.join(require('os').homedir(), 'fractal-os', 'context');

// Mapa de contexto por agente — qué archivos carga cada uno
const AGENT_CONTEXT_MAP = {
  carlos: [
    'core/identity.md',
    'core/rules.md',
    'visual/brand-FIF.md',
    'visual/prompt-biblioteca.md',
  ],
  alex: [
    'core/identity.md',
    'core/rules.md',
    'campanas/hooks-probados.md',
    'campanas/copy-que-convierte.md',
    'campanas/estructuras-post.md',
  ],
  mariana: [
    'core/identity.md',
    'core/rules.md',
    'patrones/cliente-dificil.md',
    'patrones/brief-confuso.md',
    'patrones/revision-infinita.md',
    'servicios/parrilla-mensual.md',
    'servicios/auditoria-digital.md',
    'servicios/landing-cinematografica.md',
    'servicios/productos-digitales.md',
  ],
  diana: [
    'core/identity.md',
    'core/rules.md',
    'patrones/cliente-dificil.md',
    'servicios/parrilla-mensual.md',
  ],
  valentina: [
    'core/identity.md',
    'core/rules.md',
    'visual/brand-FIF.md',
    'visual/brand-fractal.md',
    'campanas/artes-aprobados.md',
  ],
  diego: [
    'core/identity.md',
    'core/rules.md',
    'visual/brand-FIF.md',
  ],
  sofia: [
    'core/identity.md',
    'core/rules.md',
  ],
  lucas: [
    'core/identity.md',
    'core/rules.md',
  ],
  max: [
    'core/identity.md',
    'core/rules.md',
    'visual/brand-FIF.md',
  ],
  roberto: [
    'core/identity.md',
    'core/rules.md',
  ],
  qcbot: [
    'core/identity.md',
    'core/rules.md',
    'visual/brand-FIF.md',
  ],
  nexus: [
    'core/identity.md',
    'core/team.md',
    'core/rules.md',
    'core/stack.md',
  ],
  // ORACLE carga TODO — es el único que necesita visión completa
  oracle: [
    'core/identity.md',
    'core/team.md',
    'core/rules.md',
    'core/stack.md',
    'campanas/hooks-probados.md',
    'campanas/copy-que-convierte.md',
    'patrones/cliente-dificil.md',
    'servicios/parrilla-mensual.md',
    'servicios/auditoria-digital.md',
    'servicios/landing-cinematografica.md',
  ],
  atlas: [
    'core/identity.md',
    'core/team.md',
    'core/stack.md',
  ],
};

// Mapa de archivos de cliente por nombre de cliente
const CLIENT_CONTEXT_MAP = {
  fif:         'clientes/FIF.md',
  vanexpo:     'clientes/FIF.md',
  expomobility: 'clientes/ExpoMobility.md',
};

/**
 * Lee un archivo de contexto de forma segura.
 * Retorna su contenido o string vacío si no existe.
 */
function readContextFile(relativePath) {
  try {
    const fullPath = path.join(CONTEXT_BASE, relativePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[context-loader] File not found: ${fullPath}`);
      return '';
    }
    return fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.error(`[context-loader] Error reading ${relativePath}:`, err.message);
    return '';
  }
}

/**
 * loadContext(agente, cliente?)
 *
 * Carga el contexto modular para un agente específico.
 * Si se provee cliente, añade el contexto del cliente.
 *
 * @param {string} agente - Nombre del agente (mariana, carlos, alex, etc.)
 * @param {string} [cliente] - Nombre del cliente (fif, vanexpo, etc.) — opcional
 * @returns {string} Contexto combinado listo para inyectar en el system prompt
 */
function loadContext(agente, cliente = null) {
  const agentKey = (agente || '').toLowerCase();
  const clientKey = (cliente || '').toLowerCase();

  // Archivos del agente
  const agentFiles = AGENT_CONTEXT_MAP[agentKey] || [
    'core/identity.md',
    'core/rules.md',
  ];

  // Leer y combinar archivos del agente
  const agentSections = agentFiles
    .map(f => readContextFile(f))
    .filter(Boolean)
    .join('\n\n---\n\n');

  // Archivo del cliente (si aplica)
  let clientSection = '';
  if (clientKey && CLIENT_CONTEXT_MAP[clientKey]) {
    const clientContent = readContextFile(CLIENT_CONTEXT_MAP[clientKey]);
    if (clientContent) {
      clientSection = `\n\n---\n\n${clientContent}`;
    }
  }

  const fullContext = `${agentSections}${clientSection}`.trim();

  // Log para diagnóstico (solo en dev)
  if (process.env.NODE_ENV !== 'production') {
    const fileCount = agentFiles.length + (clientSection ? 1 : 0);
    console.log(`[context-loader] ${agentKey}${clientKey ? '+'+clientKey : ''} → ${fileCount} archivos`);
  }

  return fullContext;
}

/**
 * loadClientContext(cliente)
 *
 * Carga SOLO el contexto de un cliente específico.
 * Útil cuando el agente ya tiene su contexto base y solo necesita el del cliente.
 */
function loadClientContext(cliente) {
  const clientKey = (cliente || '').toLowerCase();
  if (!clientKey || !CLIENT_CONTEXT_MAP[clientKey]) return '';
  return readContextFile(CLIENT_CONTEXT_MAP[clientKey]);
}

/**
 * loadFile(relativePath)
 *
 * Carga un archivo de contexto específico por ruta relativa.
 * Para casos avanzados donde se necesita granularidad total.
 */
function loadFile(relativePath) {
  return readContextFile(relativePath);
}

/**
 * isAvailable()
 *
 * Verifica que el directorio de contexto existe y tiene archivos.
 */
function isAvailable() {
  try {
    const coreIdentity = path.join(CONTEXT_BASE, 'core', 'identity.md');
    return fs.existsSync(coreIdentity);
  } catch {
    return false;
  }
}

module.exports = {
  loadContext,
  loadClientContext,
  loadFile,
  isAvailable,
  CONTEXT_BASE,
};
