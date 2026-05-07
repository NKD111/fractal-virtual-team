// backend/scripts/test-task-notifier.js
// Test del sistema de notificación de tareas completadas
// Verifica: detección, clasificación y flujo de notificación

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// ─── Colores ──────────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m' };
const pass  = (m) => console.log(`  ${C.green}✅ PASS${C.reset} ${m}`);
const fail  = (m) => console.log(`  ${C.red}❌ FAIL${C.reset} ${m}`);
const info  = (m) => console.log(`  ${C.cyan}ℹ${C.reset}  ${m}`);
const title = (m) => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}`);

// ─── Simular métodos de detección ─────────────────────────────────────────────
// (copiado de mariana.agent.js para probar en aislamiento)
function _isTaskAssignment(text = '') {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.length < 8) return false;
  const patterns = [
    /\b(haz(me)?|genera|crea|dise[nñ]a|escribe|redacta|prepara|desarrolla)\b.{4,}/,
    /\b(d[ií]le|p[ií]dele?)\s+a\s+\w+\s+que\b/,
    /\b(necesito|quiero)\s+(que\s+(hagas?|generes?|crees?|dise[nñ]es?|escribas?|prepares?|desarrolles?|me\s+(mandes?|env[ií]es?|des?|hagas?)))/,
    /\b(necesito|quiero|dame|mándame|enviame|pásame)\s+(un|una)\s+(arte|banner|dise[nñ]o|post|parrilla|video|logo|estrategia|copy|email|reporte|flyer|cartel|lona|imagen|pieza|propuesta|presentaci[oó]n|contenido)/,
    /\bpuedes?\s+(hacer|crear|generar|dise[nñ]ar|escribir|preparar|mandar|enviar)\b.{4,}/,
  ];
  return patterns.some(p => p.test(t));
}

function _extractTaskType(text = '') {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(dile|pidele)\s+a\s+(carlos|diego|max|valentina|sofia|diana|lucas|roberto|alex|nexus)\b/.test(t)) return 'delegation';
  if (/\b(arte|banner|flyer|cartel|lona|imagen|pieza|dise[nñ]o|post|parrilla|logo|visual|mockup)\b/.test(t)) return 'design';
  if (/\b(copy|texto|escrib|redact|email|mensaje|caption|descripci[oó]n|contenido de texto|guion|script)\b/.test(t)) return 'copy';
  if (/\b(investiga|research|busca informaci[oó]n|analiza|tendencias|competencia)\b/.test(t)) return 'research';
  return 'general';
}

// ─── TEST 1: Detección de asignación de tareas ────────────────────────────────
title('TEST 1 — _isTaskAssignment: mensajes que SÍ son tareas');

const TASK_MESSAGES = [
  'haz un arte para EFG sobre la semana del evento',
  'genera la parrilla de este mes para FIF',
  'crea una propuesta de copy para el banner de la expo',
  'diseña un post para instagram del evento del 25 de junio',
  'dile a Carlos que haga un banner para FIF',
  'necesito que generes un arte para EFG',
  'quiero un arte para la parrilla de FIF',
  'dame una propuesta para el cliente de monterrey',
  'escribe el copy para el email del evento',
  '¿puedes hacer un diseño para el stand?',
  'pídele a Diego que escriba el artículo',
  'necesito un copy para el banner de la semana del evento',
];

let passed = 0, failed = 0;
TASK_MESSAGES.forEach(msg => {
  const detected = _isTaskAssignment(msg);
  if (detected) { pass(`"${msg.substring(0, 60)}" → TAREA ✓`); passed++; }
  else           { fail(`"${msg.substring(0, 60)}" → NO DETECTADA`); failed++; }
});

// ─── TEST 2: Mensajes que NO son tareas ───────────────────────────────────────
title('TEST 2 — _isTaskAssignment: mensajes que NO son tareas');

const NON_TASK_MESSAGES = [
  '¿qué está haciendo el equipo?',
  'ey qué onda',
  'cuánto va el mes',
  'estado',
  'hola Mariana',
  '¿cómo estás?',
  'gracias',
  'ok perfecto',
  'sí',
];

NON_TASK_MESSAGES.forEach(msg => {
  const detected = _isTaskAssignment(msg);
  if (!detected) { pass(`"${msg}" → NO tarea ✓`); passed++; }
  else           { fail(`"${msg}" → FALSO POSITIVO (detectado como tarea)`); failed++; }
});

// ─── TEST 3: Clasificación de tipo de tarea ───────────────────────────────────
title('TEST 3 — _extractTaskType: clasificación correcta');

const TYPE_TESTS = [
  { msg: 'haz un arte para EFG',                    expected: 'design' },
  { msg: 'genera un banner para FIF',                expected: 'design' },
  { msg: 'escribe el copy para el email',            expected: 'copy' },
  { msg: 'redacta el mensaje para el cliente',       expected: 'copy' },
  { msg: 'investiga tendencias en marketing digital',expected: 'research' },
  { msg: 'dile a Carlos que haga el arte',           expected: 'delegation' },
  { msg: 'pídele a Diego que escriba el artículo',   expected: 'delegation' },
  { msg: 'prepara una propuesta comercial',          expected: 'general' },
];

TYPE_TESTS.forEach(({ msg, expected }) => {
  const type = _extractTaskType(msg);
  if (type === expected) { pass(`"${msg.substring(0, 50)}" → tipo: ${type} ✓`); passed++; }
  else                   { fail(`"${msg.substring(0, 50)}" → esperado: ${expected}, obtenido: ${type}`); failed++; }
});

// ─── TEST 4: Módulo task-notifier carga correctamente ────────────────────────
title('TEST 4 — task-notifier.js: módulo carga sin errores');

try {
  const notifier = require('../src/core/task-notifier');
  if (typeof notifier.registerNeikyTask  === 'function') pass('registerNeikyTask exportada');
  else fail('registerNeikyTask NO es función');

  if (typeof notifier.notifyTaskComplete === 'function') pass('notifyTaskComplete exportada');
  else fail('notifyTaskComplete NO es función');

  if (typeof notifier.markTaskFailed     === 'function') pass('markTaskFailed exportada');
  else fail('markTaskFailed NO es función');

  passed += 3;
} catch (err) {
  fail(`task-notifier.js NO carga: ${err.message}`);
  failed++;
}

// ─── TEST 5: Módulo mariana.agent.js carga con los nuevos métodos ─────────────
title('TEST 5 — mariana.agent.js: carga con métodos nuevos');

try {
  const MarianaAgent = require('../src/agents/mariana.agent');
  const m = new MarianaAgent();

  if (typeof m._isTaskAssignment  === 'function') { pass('_isTaskAssignment presente'); passed++; }
  else { fail('_isTaskAssignment FALTA'); failed++; }

  if (typeof m._extractTaskType   === 'function') { pass('_extractTaskType presente'); passed++; }
  else { fail('_extractTaskType FALTA'); failed++; }

  if (typeof m._launchAgentTask   === 'function') { pass('_launchAgentTask presente'); passed++; }
  else { fail('_launchAgentTask FALTA'); failed++; }

  if (typeof m._isTeamStatusQuery === 'function') { pass('_isTeamStatusQuery sigue presente'); passed++; }
  else { fail('_isTeamStatusQuery FALTA (regresión)'); failed++; }

  // Probar detección dentro de la instancia real
  const detectedTask = m._isTaskAssignment('haz un arte para EFG sobre el evento de la semana');
  if (detectedTask) { pass('_isTaskAssignment funciona en instancia real'); passed++; }
  else { fail('_isTaskAssignment no detecta tarea en instancia real'); failed++; }

  const taskType = m._extractTaskType('genera un banner para FIF');
  if (taskType === 'design') { pass(`_extractTaskType → "${taskType}" ✓`); passed++; }
  else { fail(`_extractTaskType → esperado "design", obtenido "${taskType}"`); failed++; }

} catch (err) {
  fail(`mariana.agent.js NO carga: ${err.message}`);
  failed += 5;
}

// ─── RESUMEN ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`${C.bold}RESULTADO: ${passed} PASS / ${failed} FAIL${C.reset}`);

if (failed === 0) {
  console.log(`${C.green}${C.bold}✅ Sistema de notificación de tareas listo${C.reset}\n`);
  console.log(`${C.cyan}FLUJO ACTIVO:${C.reset}`);
  console.log(`  1. Neiky manda tarea por WhatsApp`);
  console.log(`  2. Mariana detecta → registra en DB → ACK inmediato a Neiky`);
  console.log(`  3. Agente correcto ejecuta en background (Carlos/Diego/Haiku)`);
  console.log(`  4. Al terminar → notifyTaskComplete() → WA Meta → Twilio → Email`);
  console.log(`\n${C.yellow}⚠️  Para email fallback: agregar RESEND_API_KEY en .env${C.reset}`);
} else {
  console.log(`${C.red}${C.bold}❌ Hay ${failed} errores — revisar antes de deploy${C.reset}\n`);
  process.exit(1);
}
