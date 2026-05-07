// backend/src/services/obsidian-sync.js
// Integración bidireccional con BOVEDA NKD (Obsidian vault)
//
// Arquitectura dual:
//   LOCAL  → escribe directo a C:\Users\naked\Desktop\BOVEDA NKD\
//   RAILWAY → encola en oracle_memory (tipo: obsidian_pending)
//             un pull local o /api/obsidian/pull drena la cola
//
// Estructura del vault respetada:
//   Ideas      → 30 Cerebro Auto/Ideas/YYYY-MM-DD-slug.md
//   Decisiones → 40 Recursos/Segundo Cerebro/Decisiones YYYY-MM-DD.md (append)
//   Learnings  → 30 Cerebro Auto/Insights/YYYY-MM-DD-slug.md
//   Roadmap    → 20 Proyectos/<Proyecto>/Bitácora/YYYY-MM-DD-estado.md

const fs      = require('fs');
const path    = require('path');
const { supabase } = require('../core/supabase');

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const VAULT_PATH = process.env.OBSIDIAN_VAULT
  || 'C:\\Users\\naked\\Desktop\\BOVEDA NKD';

// Rutas relativas dentro del vault (coinciden con estructura existente)
const VAULT_DIRS = {
  ideas:      '30 Cerebro Auto/Ideas',
  insights:   '30 Cerebro Auto/Insights',
  decisiones: '40 Recursos/Segundo Cerebro',
  proyectos:  '20 Proyectos',
  inbox:      '00 Inbox'
};

// Mapa de proyectos a carpetas del vault
const PROJECT_MAP = {
  'FIF':         '21 FIF 2025',
  'fif':         '21 FIF 2025',
  'fractal':     'Clientes Mariana',
  'bedding':     '22 Bedding Summit',
  'cultivo':     '23 Cultivo Mental',
  'tendero':     '24 Expo Tendero',
  'expomobility':'25 Expo Mobility 2026',
  'expo':        '25 Expo Mobility 2026',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function isVaultAvailable() {
  try {
    return fs.existsSync(VAULT_PATH) && fs.existsSync(path.join(VAULT_PATH, 'README.md'));
  } catch { return false; }
}

function today() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60)
    .replace(/-+$/, '');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function vaultPath(...parts) {
  return path.join(VAULT_PATH, ...parts.map(p => p.replace(/\//g, path.sep)));
}

/**
 * Convierte array de tags a formato YAML lista
 * ['fractal-mx', 'idea'] → "  - fractal-mx\n  - idea"
 */
function tagsYaml(tags = []) {
  if (!tags.length) return '  - fractal-mx';
  return tags.map(t => `  - ${t.toLowerCase().replace(/\s+/g, '-')}`).join('\n');
}

/**
 * Intenta escribir al vault local.
 * Retorna { written: true, path } o { written: false, reason }
 */
function writeVault(relativePath, content) {
  try {
    if (!isVaultAvailable()) return { written: false, reason: 'vault_not_found' };
    const fullPath = vaultPath(relativePath);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[ObsidianSync] ✅ Escrito: ${relativePath}`);
    return { written: true, path: fullPath };
  } catch (err) {
    console.error(`[ObsidianSync] Error escribiendo ${relativePath}:`, err.message);
    return { written: false, reason: err.message };
  }
}

/**
 * Append a un archivo existente (para Decisiones del mismo día)
 */
function appendVault(relativePath, content) {
  try {
    if (!isVaultAvailable()) return { written: false, reason: 'vault_not_found' };
    const fullPath = vaultPath(relativePath);
    ensureDir(path.dirname(fullPath));
    if (fs.existsSync(fullPath)) {
      fs.appendFileSync(fullPath, '\n\n---\n\n' + content, 'utf8');
      console.log(`[ObsidianSync] ✅ Append: ${relativePath}`);
    } else {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[ObsidianSync] ✅ Creado: ${relativePath}`);
    }
    return { written: true, path: fullPath };
  } catch (err) {
    console.error(`[ObsidianSync] Error en append ${relativePath}:`, err.message);
    return { written: false, reason: err.message };
  }
}

/**
 * Encola una nota pendiente en Supabase para pull posterior.
 * Se usa cuando el vault no está disponible (Railway).
 */
async function queueNote(tipo_nota, payload) {
  try {
    await supabase.from('oracle_memory').insert({
      tipo:      'obsidian_pending',
      contenido: JSON.stringify({ tipo_nota, payload, queued_at: new Date().toISOString() }),
      created_at: new Date().toISOString()
    });
    console.log(`[ObsidianSync] ⏳ Encolado en Supabase: ${tipo_nota} — "${payload.titulo || ''}"`);
  } catch (err) {
    console.error('[ObsidianSync] Error encolando:', err.message);
  }
}

// ─── FUNCIONES PRINCIPALES ────────────────────────────────────────────────────

/**
 * saveIdea(titulo, contenido, tags, origen?)
 *
 * Guarda una idea en 30 Cerebro Auto/Ideas/YYYY-MM-DD-slug.md
 * Formato compatible con la plantilla 99 Plantillas/Idea.md del vault.
 *
 * @param {string} titulo       - Título de la idea
 * @param {string} contenido    - Desarrollo de la idea
 * @param {string[]} tags       - Tags (sin #, se normalizan)
 * @param {string} [origen]     - Quién generó la idea (oracle, diana, etc.)
 * @returns {{ written, path } | { written, reason }}
 */
async function saveIdea(titulo, contenido, tags = [], origen = 'fractal-sistema') {
  const fecha  = today();
  const slug   = slugify(titulo);
  const relPath = `${VAULT_DIRS.ideas}/${fecha}-${slug}.md`;

  const allTags = ['fractal-mx', 'idea', 'pendiente', ...tags.map(t => t.replace(/^#/, ''))];

  const frontmatter = `---
tipo: idea
fecha: ${fecha}
estado: cruda
origen: ${origen}
tags:
${tagsYaml(allTags)}
---`;

  const note = `${frontmatter}

# ${titulo}

## La idea en una frase
${contenido.split('\n')[0] || contenido}

## Desarrollo
${contenido}

## Contexto / por qué surgió
Generado por ${origen.toUpperCase()} — ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}

## Posibles aplicaciones
-

## Conexiones con otras notas
- [[Proyectos activos]]
`;

  if (isVaultAvailable()) {
    return writeVault(relPath, note);
  } else {
    await queueNote('idea', { titulo, contenido, tags: allTags, origen, relPath, note });
    return { written: false, queued: true };
  }
}

/**
 * saveDecision(titulo, contexto, decision, impacto?)
 *
 * Append a 40 Recursos/Segundo Cerebro/Decisiones YYYY-MM-DD.md
 * Mantiene el formato de sesión del vault (secciones ##).
 *
 * @param {string} titulo    - Nombre corto de la decisión
 * @param {string} contexto  - Por qué se llegó a esta decisión
 * @param {string} decision  - Qué se decidió exactamente
 * @param {string} [impacto] - Consecuencia esperada (opcional)
 */
async function saveDecision(titulo, contexto, decision, impacto = '') {
  const fecha    = today();
  const hora     = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
  const relPath  = `${VAULT_DIRS.decisiones}/Decisiones ${fecha}.md`;

  // Si el archivo no existe aún, crear con frontmatter completo
  const fullPath = vaultPath(relPath);
  const needsHeader = !fs.existsSync(fullPath) || !isVaultAvailable();

  const header = needsHeader ? `---
tipo: bitacora
tags:
  - segundo-cerebro
  - decisiones
  - fractal-mx
fecha: ${fecha}
---

# Sesión ${fecha}

> Decisiones del día registradas automáticamente por el sistema Fractal MX.

` : '';

  const block = `## 🎯 ${titulo}
*${hora} CDMX — origen: fractal-sistema*

### Contexto
${contexto}

### Decisión
${decision}
${impacto ? `\n### Impacto esperado\n${impacto}` : ''}

### Notas relacionadas
- [[Proyectos activos]]
`;

  const content = header + block;

  if (isVaultAvailable()) {
    return needsHeader
      ? writeVault(relPath, content)
      : appendVault(relPath, block);
  } else {
    await queueNote('decision', { titulo, contexto, decision, impacto, fecha, relPath, content });
    return { written: false, queued: true };
  }
}

/**
 * saveLearning(titulo, aprendizaje, proyecto, tipo?)
 *
 * Guarda un aprendizaje en 30 Cerebro Auto/Insights/YYYY-MM-DD-slug.md
 * Vinculado al proyecto correspondiente.
 *
 * @param {string} titulo       - Título del aprendizaje
 * @param {string} aprendizaje  - El aprendizaje en detalle
 * @param {string} proyecto     - Proyecto al que pertenece (FIF, fractal, etc.)
 * @param {string} [tipo]       - 'tecnico' | 'estrategico' | 'cliente' | 'proceso'
 */
async function saveLearning(titulo, aprendizaje, proyecto = 'fractal', tipo = 'estrategico') {
  const fecha   = today();
  const slug    = slugify(titulo);
  const relPath = `${VAULT_DIRS.insights}/${fecha}-${slug}.md`;

  // Resolver carpeta del proyecto en el vault
  const proyectoKey   = (proyecto || '').toLowerCase();
  const proyectoDir   = PROJECT_MAP[proyectoKey] || PROJECT_MAP[proyecto] || proyecto;
  const proyectoLink  = `[[20 Proyectos/${proyectoDir}/]]`;

  const tags = ['fractal-mx', 'aprendizaje', tipo, proyectoKey].filter(Boolean);

  const note = `---
tipo: aprendizaje
fecha: ${fecha}
proyecto: ${proyecto}
categoria: ${tipo}
aplicado: false
tags:
${tagsYaml(tags)}
---

# ${titulo}

## El aprendizaje
${aprendizaje}

## Contexto
Proyecto: ${proyectoLink}
Fecha: ${fecha}
Generado por: sistema Fractal MX

## Cómo aplicarlo
-

## Errores que previene
-

## Notas relacionadas
- ${proyectoLink}
- [[Proyectos activos]]
`;

  if (isVaultAvailable()) {
    return writeVault(relPath, note);
  } else {
    await queueNote('learning', { titulo, aprendizaje, proyecto, tipo, relPath, note });
    return { written: false, queued: true };
  }
}

/**
 * saveRoadmap(proyecto, estado, siguiente_paso, blockers?)
 *
 * Actualiza/crea 20 Proyectos/[Proyecto]/Bitácora/YYYY-MM-DD-estado.md
 * Con el estado actual del proyecto y el siguiente paso concreto.
 *
 * @param {string} proyecto       - Nombre del proyecto (FIF, fractal, etc.)
 * @param {string} estado         - Estado actual en 1-2 líneas
 * @param {string} siguiente_paso - Siguiente acción concreta
 * @param {string[]} [blockers]   - Bloqueadores actuales
 */
async function saveRoadmap(proyecto, estado, siguiente_paso, blockers = []) {
  const fecha      = today();
  const hora       = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
  const slug       = slugify(`${proyecto} estado`);
  const proyectoKey = (proyecto || '').toLowerCase();
  const proyectoDir = PROJECT_MAP[proyectoKey] || PROJECT_MAP[proyecto] || proyecto;

  const relPath = `${VAULT_DIRS.proyectos}/${proyectoDir}/Bitácora/${fecha}-${slug}.md`;

  const blockersSection = blockers.length
    ? `\n## 🚧 Bloqueadores\n${blockers.map(b => `- ${b}`).join('\n')}`
    : '';

  const note = `---
tipo: bitacora
fecha: ${fecha}
proyecto: ${proyecto}
estado: activo
tags:
  - fractal-mx
  - roadmap
  - ${proyectoKey}
---

# ${proyecto} — Estado ${fecha}
*Actualizado: ${hora} CDMX*

## 📍 Estado actual
${estado}

## ➡️ Siguiente paso
${siguiente_paso}
${blockersSection}

## 📋 Notas
- Generado automáticamente por Fractal MX sistema

## Notas relacionadas
- [[Proyectos activos]]
`;

  if (isVaultAvailable()) {
    return writeVault(relPath, note);
  } else {
    await queueNote('roadmap', { proyecto, estado, siguiente_paso, blockers, relPath, note });
    return { written: false, queued: true };
  }
}

// ─── PULL DE COLA (para ejecutar localmente) ──────────────────────────────────

/**
 * pullPendingNotes()
 *
 * Drena la cola de oracle_memory (tipo: obsidian_pending) y escribe
 * los archivos al vault local. Llamar desde Claude Code o script local.
 *
 * @returns {{ processed, failed, skipped }}
 */
async function pullPendingNotes() {
  if (!isVaultAvailable()) {
    console.error('[ObsidianSync] pullPendingNotes: vault no disponible en', VAULT_PATH);
    return { processed: 0, failed: 0, skipped: 0, error: 'vault_not_found' };
  }

  const { data: pendientes, error } = await supabase
    .from('oracle_memory')
    .select('id, contenido, created_at')
    .eq('tipo', 'obsidian_pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[ObsidianSync] pullPendingNotes error:', error.message);
    return { processed: 0, failed: 0, skipped: 0, error: error.message };
  }

  let processed = 0, failed = 0;

  for (const row of (pendientes || [])) {
    try {
      const payload = JSON.parse(row.contenido);
      const { tipo_nota, payload: p } = payload;

      let result;
      if (p.note && p.relPath) {
        // Tiene contenido ya renderizado — escribir directo
        if (tipo_nota === 'decision') {
          result = appendVault(p.relPath, p.content || p.note);
        } else {
          result = writeVault(p.relPath, p.note);
        }
      } else {
        // Re-generar desde datos
        switch (tipo_nota) {
          case 'idea':     result = await saveIdea(p.titulo, p.contenido, p.tags, p.origen); break;
          case 'decision': result = await saveDecision(p.titulo, p.contexto, p.decision, p.impacto); break;
          case 'learning': result = await saveLearning(p.titulo, p.aprendizaje, p.proyecto, p.tipo); break;
          case 'roadmap':  result = await saveRoadmap(p.proyecto, p.estado, p.siguiente_paso, p.blockers); break;
          default:         result = { written: false, reason: 'unknown_type' };
        }
      }

      if (result.written) {
        // Marcar como procesado (cambiar tipo para no reprocessar)
        await supabase.from('oracle_memory')
          .update({ tipo: 'obsidian_synced', contenido: JSON.stringify({ ...payload, synced_at: new Date().toISOString() }) })
          .eq('id', row.id)
          .catch(() => {});
        processed++;
        console.log(`[ObsidianSync] ✅ Procesado: ${tipo_nota} — "${p.titulo || p.proyecto || ''}"`);
      } else {
        failed++;
        console.warn(`[ObsidianSync] ⚠️  No escrito: ${result.reason}`);
      }
    } catch (err) {
      failed++;
      console.error('[ObsidianSync] Error procesando nota:', err.message);
    }
  }

  console.log(`[ObsidianSync] Pull completo: ${processed} procesadas, ${failed} fallidas`);
  return { processed, failed, skipped: 0 };
}

// ─── TRIGGER HELPERS (usados por los agentes) ─────────────────────────────────

/**
 * saveEveningReflection(reflection, metrics)
 *
 * Guarda el Evening Reflection de ORACLE como:
 * - Aprendizaje del día en Insights
 * - Decisión/prioridades en Decisiones
 * Llamado automáticamente desde evening-reflection.js
 */
async function saveEveningReflection(reflection, metrics = {}) {
  const fecha = today();

  // Extraer el resumen del reflection (primeras 2 líneas)
  const lines = (reflection || '').split('\n').filter(Boolean);
  const resumen = lines.slice(0, 2).join(' ');

  // Guardar como insight del día
  await saveLearning(
    `Evening Reflection ${fecha}`,
    reflection || 'Sin contenido',
    'fractal',
    'estrategico'
  );

  // Guardar métricas del día como decisión si hay algo notable
  if (metrics.revenue_today > 0 || metrics.arts_created > 0) {
    await saveDecision(
      `Resumen operacional ${fecha}`,
      `Métricas del día: artes=${metrics.arts_created||0}, revenue=$${metrics.revenue_today||0}, mensajes=${metrics.mariana_messages||0}`,
      resumen || 'Sistema operó correctamente',
      `Continuar optimizando el pipeline para el día siguiente`
    );
  }

  console.log(`[ObsidianSync] Evening Reflection guardado en vault — ${fecha}`);
}

/**
 * saveCouncilDecisions(resumen, decisiones_array)
 *
 * Guarda el Business Council semanal en Obsidian.
 * Llamado desde weekly-council.js
 */
async function saveCouncilDecisions(resumen, decisiones = []) {
  const fecha = today();

  // Una nota de decisión por punto del council
  for (const dec of decisiones.slice(0, 5)) {
    if (dec.titulo && dec.accion) {
      await saveDecision(
        `Council: ${dec.titulo}`,
        dec.contexto || resumen.substring(0, 200),
        dec.accion,
        dec.impacto || ''
      );
    }
  }

  // Aprendizaje global del council
  if (resumen) {
    await saveLearning(
      `Business Council ${fecha}`,
      resumen,
      'fractal',
      'estrategico'
    );
  }

  console.log(`[ObsidianSync] Business Council guardado — ${decisiones.length} decisiones`);
}

/**
 * saveNKDApproval(tipo, descripcion, proyecto)
 *
 * Cuando NKD aprueba algo por WhatsApp, registrarlo.
 * Llamado desde rutas de aprobación.
 */
async function saveNKDApproval(tipo, descripcion, proyecto = 'fractal') {
  await saveDecision(
    `NKD aprobó: ${tipo}`,
    `Aprobación recibida via WhatsApp — proyecto: ${proyecto}`,
    descripcion,
    'Proceder con producción según lo aprobado'
  );
  console.log(`[ObsidianSync] ✅ Aprobación NKD registrada: ${tipo}`);
}

// ─── EXPORTAR ─────────────────────────────────────────────────────────────────

module.exports = {
  saveIdea,
  saveDecision,
  saveLearning,
  saveRoadmap,
  saveEveningReflection,
  saveCouncilDecisions,
  saveNKDApproval,
  pullPendingNotes,
  isVaultAvailable,
  VAULT_PATH,
};
