/**
 * obsidian-context.js — Lee la bóveda de Obsidian y da contexto a Mariana.
 * Lee proyectos, entidades y notas relevantes del vault de Fer.
 */

const fs   = require('fs');
const path = require('path');

// Rutas del vault (ajusta si cambia)
const VAULT = process.env.OBSIDIAN_VAULT
  || 'C:\\Users\\naked\\Desktop\\BOVEDA NKD';

const SECTIONS = {
  proyectos:  path.join(VAULT, '20 Proyectos'),
  entidades:  path.join(VAULT, '30 Cerebro Auto', 'Entidades'),
  daily:      path.join(VAULT, '30 Cerebro Auto', 'Daily'),
};

let _cache = null;
let _lastLoad = 0;
const CACHE_TTL = 10 * 60 * 1000; // refrescar cada 10 min

// ─── Leer archivos markdown de una carpeta ────────────────────────────────────
function readMarkdownDir(dirPath, maxFiles = 10, maxCharsEach = 800) {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .slice(0, maxFiles)
      .map(f => {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
        return { name: f.replace('.md', ''), content: content.slice(0, maxCharsEach) };
      });
  } catch { return []; }
}

// ─── Leer solo el daily más reciente ─────────────────────────────────────────
function readLatestDaily() {
  const dir = SECTIONS.daily;
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
      .sort()
      .reverse();
    if (!files.length) return null;
    const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    return { date: files[0].replace('.md', ''), content: content.slice(0, 1200) };
  } catch { return null; }
}

// ─── Construir contexto completo ──────────────────────────────────────────────
function loadContext() {
  const now = Date.now();
  if (_cache && now - _lastLoad < CACHE_TTL) return _cache;

  const proyectos = readMarkdownDir(SECTIONS.proyectos, 5, 600);
  const entidades = readMarkdownDir(SECTIONS.entidades, 15, 400);
  const daily     = readLatestDaily();

  let ctx = `\n══ CONTEXTO DE OBSIDIAN (bóveda de Fer) ══\n`;

  if (daily) {
    ctx += `\nDIARIO ${daily.date}:\n${daily.content}\n`;
  }

  if (proyectos.length) {
    ctx += `\nPROYECTOS ACTIVOS:\n`;
    proyectos.forEach(p => { ctx += `• ${p.name}: ${p.content.slice(0, 200)}\n`; });
  }

  if (entidades.length) {
    ctx += `\nENTIDADES / MARCAS CONOCIDAS:\n`;
    entidades.forEach(e => { ctx += `• ${e.name}\n`; });
  }

  ctx += `══════════════════════════════════════════\n`;

  _cache    = ctx;
  _lastLoad = now;

  console.log(`[obsidian] Contexto cargado: ${entidades.length} entidades, ${proyectos.length} proyectos, daily: ${daily ? daily.date : 'no'}`);
  return ctx;
}

// ─── Escribir nota de cliente en Obsidian ─────────────────────────────────────
function writeClientNote(conv) {
  const clientsDir = path.join(VAULT, '20 Proyectos', 'Clientes Mariana');
  try {
    if (!fs.existsSync(clientsDir)) fs.mkdirSync(clientsDir, { recursive: true });

    const p    = conv.profile || {};
    const name = (conv.name || 'cliente').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim();
    const file = path.join(clientsDir, `${name}.md`);

    const content = [
      `# ${name}`,
      `📱 ${(conv.phone || '').replace('whatsapp:', '')}`,
      `📅 Último contacto: ${new Date(conv.lastMsgTs || Date.now()).toLocaleDateString('es-MX')}`,
      `Estado: ${conv.state || 'nuevo'}`,
      ``,
      p.businessType ? `## Negocio\n${p.businessType}` : '',
      p.projectType  ? `## Proyecto\n${p.projectType}` : '',
      p.budget       ? `## Presupuesto\n$${Number(p.budget).toLocaleString('es-MX')} MXN` : '',
      p.timeline     ? `## Fecha\n${p.timeline}` : '',
      p.rawNeed      ? `## Necesidad\n${p.rawNeed}` : '',
      p.concerns && p.concerns.length ? `## Objeciones\n${p.concerns.join(', ')}` : '',
      ``,
      `## Notas`,
      `Conversación con Mariana — ${conv.msgs || 0} mensajes`,
    ].filter(Boolean).join('\n');

    fs.writeFileSync(file, content, 'utf8');
    console.log(`[obsidian] Nota escrita: ${name}`);
  } catch (err) {
    console.error('[obsidian] Error escribiendo nota:', err.message);
  }
}

module.exports = { loadContext, writeClientNote };
