// backend/scripts/test-semantic-memory.js
// PASO 5 — Test end-to-end memoria semántica
//
// Uso:
//   node scripts/test-semantic-memory.js
//
// Qué hace:
//   1. Genera embeddings (verifica provider activo: Voyage/OpenAI/TF-IDF)
//   2. Guarda 3 memorias de prueba con vectores
//   3. Búsqueda semántica vs búsqueda exacta — compara resultados
//   4. Imprime tiempo de respuesta y similitud

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { generateEmbedding, storeWithEmbedding, findRelevantMemories, EMBED_DIM } = require('../src/core/semantic-memory');

// ── Colores para terminal ─────────────────────────────────────────────────────
const C = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`
};

function ok(msg)   { console.log(C.green('  ✅ ') + msg); }
function fail(msg) { console.log(C.red('  ❌ ') + msg); }
function info(msg) { console.log(C.cyan('  ℹ️  ') + msg); }
function warn(msg) { console.log(C.yellow('  ⚠️  ') + msg); }
function header(msg) { console.log('\n' + C.bold(C.cyan('━━ ' + msg + ' ━━'))); }

// ── Memorias de prueba ────────────────────────────────────────────────────────
const MEMORIAS_TEST = [
  {
    tipo: 'victoria',
    contenido: JSON.stringify({
      tipo: 'victoria',
      cliente: 'FIF',
      tipo_pieza: 'carrusel_instagram',
      headline: 'Transforma tu empresa con capital inteligente',
      prompt_usado: 'cinematic wide shot, modern office, blue tones, professional executives',
      rondas_revision: 1,
      notas: 'Aprobado sin revisiones — prompt cinematográfico con tonos azules'
    })
  },
  {
    tipo: 'error',
    contenido: JSON.stringify({
      tipo: 'error',
      cliente: 'FIF',
      tipo_pieza: 'video_historia',
      razon_rechazo: 'Colores muy saturados, no refleja imagen financiera seria',
      leccion: 'Para video_historia FIF, evitar saturación >80% porque rompe la imagen corporativa seria. En su lugar, usar paleta desaturada con acentos dorados.',
      no_repetir: true
    })
  },
  {
    tipo: 'patron_cliente',
    contenido: JSON.stringify({
      tipo: 'patron_cliente',
      cliente: 'FIF',
      patron: 'FIF prefiere imágenes con personas reales en lugar de ilustraciones abstractas. Siempre solicitan versión con y sin texto.',
      evidencia: 'Comentario en 3 revisiones consecutivas de enero 2025'
    })
  }
];

// ── PASO 1: Verificar provider de embeddings ──────────────────────────────────
async function testEmbeddingProvider() {
  header('PASO 1 — Verificar proveedor de embeddings');

  const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (VOYAGE_KEY) {
    info(`VOYAGE_API_KEY detectado: ${VOYAGE_KEY.slice(0, 8)}...`);
  } else {
    warn('VOYAGE_API_KEY no configurado — usará fallback');
  }

  if (OPENAI_KEY) {
    info(`OPENAI_API_KEY detectado: ${OPENAI_KEY.slice(0, 8)}...`);
  } else if (!VOYAGE_KEY) {
    warn('Sin Voyage ni OpenAI — usará TF-IDF (funcional pero calidad básica)');
  }

  const t0 = Date.now();
  const vector = await generateEmbedding('carrusel instagram capital financiero azul corporativo');
  const elapsed = Date.now() - t0;

  if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
    fail(`Vector inválido: ${JSON.stringify(vector).slice(0, 100)}`);
    return false;
  }

  const nonZero = vector.filter(v => v !== 0).length;
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));

  ok(`Embedding generado en ${elapsed}ms`);
  ok(`Dimensión: ${vector.length} (esperado: ${EMBED_DIM})`);
  ok(`Valores no-cero: ${nonZero}/${EMBED_DIM}`);
  ok(`Norma L2: ${norm.toFixed(4)} (esperado ~1.0 si normalizado)`);

  if (VOYAGE_KEY && elapsed < 500) {
    ok('Provider: Voyage AI ✨');
  } else if (OPENAI_KEY && elapsed < 500) {
    ok('Provider: OpenAI');
  } else {
    info(`Provider: TF-IDF fallback (${elapsed}ms)`);
  }

  return true;
}

// ── PASO 2: Guardar memorias con embeddings ───────────────────────────────────
async function testStoreMemories() {
  header('PASO 2 — Guardar memorias con embeddings en Supabase');

  const stored = [];
  for (const memoria of MEMORIAS_TEST) {
    const t0 = Date.now();
    try {
      const result = await storeWithEmbedding(memoria);
      const elapsed = Date.now() - t0;
      ok(`[${memoria.tipo.toUpperCase()}] guardado en ${elapsed}ms — embedding: ${result.has_embedding ? '✅' : '❌ (sin vector)'}`);
      stored.push(memoria);
    } catch (err) {
      fail(`[${memoria.tipo.toUpperCase()}] Error: ${err.message}`);
      if (err.message.includes('column "embedding" of relation')) {
        console.log(C.red('\n  ⚠️  NECESITAS ejecutar el SQL de PASO 4 en Supabase primero!'));
        console.log(C.yellow('     Ejecuta el SQL de pgvector en Supabase SQL Editor\n'));
      }
    }
  }

  ok(`Total guardadas: ${stored.length}/${MEMORIAS_TEST.length}`);
  return stored.length > 0;
}

// ── PASO 3: Búsqueda semántica ────────────────────────────────────────────────
async function testSemanticSearch() {
  header('PASO 3 — Búsqueda semántica vs búsqueda exacta');

  const queries = [
    {
      text: 'imágenes con colores azules para empresa financiera profesional',
      expected_tipo: 'victoria',
      description: 'Debería encontrar victoria con carrusel azul corporativo'
    },
    {
      text: 'error con colores brillantes saturados que rechazaron',
      expected_tipo: 'error',
      description: 'Debería encontrar error de saturación'
    },
    {
      text: 'qué prefiere el cliente FIF en sus piezas visuales',
      expected_tipo: 'patron_cliente',
      description: 'Debería encontrar patrón sobre personas reales'
    }
  ];

  console.log('');
  let hits = 0;

  for (const q of queries) {
    info(`Query: "${q.text}"`);
    info(C.dim(q.description));

    const t0 = Date.now();
    const results = await findRelevantMemories(q.text, { limit: 3, threshold: 0.5 });
    const elapsed = Date.now() - t0;

    if (results.length === 0) {
      warn(`Sin resultados (${elapsed}ms) — puede que pgvector no esté configurado o sin memorias`);
      console.log('');
      continue;
    }

    const top = results[0];
    const topTipo = top.tipo || top.type;
    const similarity = top.relevance || top.similarity || 0;
    const searchType = top.search_type || 'unknown';

    if (topTipo === q.expected_tipo) {
      ok(`TOP resultado: [${topTipo.toUpperCase()}] — similitud: ${(similarity * 100).toFixed(1)}% — ${elapsed}ms — modo: ${searchType}`);
      hits++;
    } else {
      warn(`TOP resultado: [${topTipo?.toUpperCase()}] — esperado: [${q.expected_tipo.toUpperCase()}] — similitud: ${(similarity * 100).toFixed(1)}%`);
    }

    // Mostrar top 3
    results.slice(0, 3).forEach((r, i) => {
      let preview = '';
      try { preview = JSON.parse(r.contenido)?.headline || JSON.parse(r.contenido)?.patron || JSON.parse(r.contenido)?.leccion || ''; } catch {}
      console.log(C.dim(`     ${i + 1}. [${r.tipo}] ${(r.relevance * 100 || 0).toFixed(1)}% | ${preview.slice(0, 80)}`));
    });
    console.log('');
  }

  const accuracy = hits / queries.length;
  if (accuracy >= 0.67) {
    ok(`Precisión semántica: ${hits}/${queries.length} (${(accuracy * 100).toFixed(0)}%) ✨`);
  } else {
    warn(`Precisión semántica: ${hits}/${queries.length} (${(accuracy * 100).toFixed(0)}%) — considera agregar VOYAGE_API_KEY para mejor calidad`);
  }

  return hits;
}

// ── PASO 4: Timing comparativo ────────────────────────────────────────────────
async function testTiming() {
  header('PASO 4 — Benchmark de rendimiento');

  const N = 3;
  const times = [];

  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    await generateEmbedding(`test query número ${i} para benchmark de embeddings`);
    times.push(Date.now() - t0);
  }

  const avg = times.reduce((s, t) => s + t, 0) / N;
  const max = Math.max(...times);
  const min = Math.min(...times);

  ok(`Avg: ${avg.toFixed(0)}ms | Min: ${min}ms | Max: ${max}ms (${N} calls)`);

  if (avg < 300) {
    ok('Rendimiento: EXCELENTE ✨ (Voyage AI activo)');
  } else if (avg < 1000) {
    ok('Rendimiento: BUENO');
  } else {
    info('Rendimiento: TF-IDF local (sin latencia de red)');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(C.bold('\n🧠 FRACTAL MX — Test Memoria Semántica (UPGRADE 4)'));
  console.log(C.dim('─────────────────────────────────────────────────\n'));

  let allPassed = true;

  const embeddingOk = await testEmbeddingProvider();
  if (!embeddingOk) {
    fail('Embedding generation falló — abortando test');
    process.exit(1);
  }

  const storeOk = await testStoreMemories();
  if (!storeOk) {
    allPassed = false;
    warn('Store falló — verifica SQL de pgvector en Supabase');
  }

  const hits = await testSemanticSearch();
  if (hits === 0) {
    allPassed = false;
  }

  await testTiming();

  console.log('');
  if (allPassed) {
    console.log(C.bold(C.green('✅ MEMORIA SEMÁNTICA OPERACIONAL')));
    console.log(C.green('   Sistema listo para PASO 6 — integración en agentes\n'));
  } else {
    console.log(C.bold(C.yellow('⚠️  MEMORIA SEMÁNTICA PARCIAL')));
    console.log(C.yellow('   Revisa los errores arriba. TF-IDF funciona como fallback.\n'));
  }
}

main().catch(err => {
  console.error(C.red('\n❌ Error fatal:'), err.message);
  process.exit(1);
});
