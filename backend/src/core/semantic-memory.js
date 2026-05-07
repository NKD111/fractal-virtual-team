// backend/src/core/semantic-memory.js
// UPGRADE 4 — Memoria Semántica con Embeddings
// De búsqueda exacta (tipo/cliente) a búsqueda por relevancia semántica.
//
// Providers soportados (en orden de preferencia):
//   1. Voyage AI (voyage-2) — mejor calidad español/inglés, económico
//   2. OpenAI (text-embedding-3-small) — fallback si Voyage no disponible
//   3. Simple TF-IDF fallback — sin API key (búsqueda básica)
//
// Configuración Railway:
//   VOYAGE_API_KEY=... (crear cuenta gratis en voyageai.com)
//
// Supabase — SQL requerido (ejecutar en Supabase SQL Editor):
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  -- Habilitar extensión pgvector (una vez por proyecto)                 │
// │  CREATE EXTENSION IF NOT EXISTS vector;                                  │
// │                                                                          │
// │  -- Agregar columna de embedding                                          │
// │  ALTER TABLE oracle_memory ADD COLUMN IF NOT EXISTS                       │
// │    embedding vector(1024);                                                │
// │                                                                          │
// │  -- Índice para búsqueda rápida                                           │
// │  CREATE INDEX IF NOT EXISTS oracle_memory_embedding_idx                  │
// │    ON oracle_memory USING ivfflat (embedding vector_cosine_ops)          │
// │    WITH (lists = 100);                                                    │
// │                                                                          │
// │  -- Función de búsqueda semántica                                         │
// │  CREATE OR REPLACE FUNCTION match_oracle_memory(                          │
// │    query_embedding vector(1024),                                          │
// │    match_threshold float DEFAULT 0.7,                                     │
// │    match_count int DEFAULT 5,                                             │
// │    filter_tipo text DEFAULT NULL                                           │
// │  ) RETURNS TABLE (id uuid, tipo text, contenido text,                     │
// │                   created_at timestamptz, similarity float)               │
// │  LANGUAGE plpgsql AS $$                                                   │
// │  BEGIN RETURN QUERY                                                        │
// │    SELECT m.id, m.tipo, m.contenido, m.created_at,                        │
// │           1 - (m.embedding <=> query_embedding) AS similarity             │
// │    FROM oracle_memory m                                                    │
// │    WHERE m.embedding IS NOT NULL                                           │
// │      AND (filter_tipo IS NULL OR m.tipo = filter_tipo)                    │
// │      AND 1 - (m.embedding <=> query_embedding) >= match_threshold         │
// │    ORDER BY similarity DESC LIMIT match_count;                            │
// │  END $$;                                                                   │
// └─────────────────────────────────────────────────────────────────────────┘

'use strict';

const { supabase } = require('./supabase');

const VOYAGE_KEY  = process.env.VOYAGE_API_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const EMBED_DIM   = 1024; // voyage-2 dimension

// ── Generación de embeddings ──────────────────────────────────────────────────

/**
 * Genera embedding para un texto.
 * Intenta Voyage AI → OpenAI → fallback TF-IDF simple.
 *
 * @param {string} text
 * @returns {Promise<number[]>} Vector de dimensión 1024
 */
async function generateEmbedding(text) {
  if (!text) return new Array(EMBED_DIM).fill(0);

  // 1. Voyage AI (mejor para bilingüe ES/EN)
  if (VOYAGE_KEY) {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VOYAGE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: [text.slice(0, 2000)], model: 'voyage-2' })
      });
      const data = await res.json();
      if (data?.data?.[0]?.embedding) {
        return data.data[0].embedding;
      }
    } catch (e) {
      console.warn('[SemanticMemory] Voyage AI error:', e.message);
    }
  }

  // 2. OpenAI text-embedding-3-small (dim: 1536, truncate to 1024)
  if (OPENAI_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: text.slice(0, 8000),
          model: 'text-embedding-3-small',
          dimensions: EMBED_DIM
        })
      });
      const data = await res.json();
      if (data?.data?.[0]?.embedding) return data.data[0].embedding;
    } catch (e) {
      console.warn('[SemanticMemory] OpenAI embedding error:', e.message);
    }
  }

  // 3. Fallback: TF-IDF simple (sin API — calidad básica pero funcional)
  return simpleTFIDF(text, EMBED_DIM);
}

/**
 * TF-IDF fallback — genera vector denso sin API externa.
 * No requiere instalación de dependencias. Calidad suficiente para MVP.
 */
function simpleTFIDF(text, dim) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  const vector = new Array(dim).fill(0);
  Object.entries(freq).forEach(([word, count]) => {
    // Hash deterministico de la palabra → índice en el vector
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0x7fffffff;
    }
    const idx = hash % dim;
    vector[idx] += count / Math.sqrt(words.length + 1);
  });

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vector.map(v => v / norm) : vector;
}

// ── Guardar memoria con embedding ────────────────────────────────────────────

/**
 * Guarda una memoria con embedding para búsqueda semántica futura.
 * Si embedding API no disponible → guarda sin embedding (búsqueda exacta como fallback).
 *
 * @param {Object} memory - { tipo, contenido, ...otros campos de oracle_memory }
 */
async function storeWithEmbedding(memory) {
  let embedding = null;
  try {
    const textForEmbed = typeof memory.contenido === 'string'
      ? memory.contenido
      : JSON.stringify(memory.contenido || '');
    embedding = await generateEmbedding(textForEmbed.slice(0, 2000));
  } catch (e) {
    console.warn('[SemanticMemory] embedding generation failed (storing without):', e.message);
  }

  const { error } = await supabase.from('oracle_memory').insert({
    tipo:      memory.tipo || 'aprendizaje',
    contenido: typeof memory.contenido === 'string' ? memory.contenido : JSON.stringify(memory.contenido),
    ...(memory.contenido_texto ? { contenido_texto: memory.contenido_texto } : {}),
    ...(memory.semana ? { semana: memory.semana } : {}),
    ...(embedding ? { embedding: JSON.stringify(embedding) } : {})
  });

  if (error) throw new Error(error.message);
  return { stored: true, has_embedding: !!embedding };
}

// ── Búsqueda semántica ────────────────────────────────────────────────────────

/**
 * Encuentra memorias relevantes por similitud semántica.
 * Si pgvector no está disponible, cae a búsqueda por tipo.
 *
 * @param {string} query       - Texto de búsqueda (brief, contexto, pregunta)
 * @param {Object} opts        - { tipo, limit, threshold }
 * @returns {Promise<Array>}   - Memorias ordenadas por relevancia
 */
async function findRelevantMemories(query, opts = {}) {
  const { tipo = null, limit = 5, threshold = 0.70 } = opts;

  if (!query) return [];

  // Intentar búsqueda vectorial primero
  try {
    const queryEmbedding = await generateEmbedding(query.slice(0, 2000));

    const { data, error } = await supabase.rpc('match_oracle_memory', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_tipo: tipo
    });

    if (!error && data?.length > 0) {
      console.log(`[SemanticMemory] ${data.length} memorias semánticas encontradas (threshold: ${threshold})`);
      return data.map(m => ({
        ...m,
        relevance: m.similarity,
        search_type: 'semantic'
      }));
    }
  } catch (e) {
    console.warn('[SemanticMemory] vector search failed, falling back to exact:', e.message);
  }

  // Fallback: búsqueda exacta por tipo
  try {
    const q = supabase
      .from('oracle_memory')
      .select('id, tipo, contenido, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (tipo) q.eq('tipo', tipo);
    const { data } = await q;
    return (data || []).map(m => ({ ...m, relevance: 0.5, search_type: 'exact_fallback' }));
  } catch { return []; }
}

// ── buildSemanticContext — para uso en agentes ────────────────────────────────

/**
 * Construye contexto de memoria relevante para incluir en prompts.
 * Reemplaza la búsqueda exacta en memory-engine.buildMemoryContext().
 *
 * @param {string} cliente    - Nombre del cliente
 * @param {string} tipo_pieza - Tipo de pieza
 * @param {string} brief_text - Texto del brief
 * @returns {Promise<string>} - Contexto formateado para insertar en prompt
 */
async function buildSemanticContext(cliente, tipo_pieza, brief_text = '') {
  const query = [tipo_pieza, brief_text, cliente].filter(Boolean).join(' ');
  const memories = await findRelevantMemories(query, { limit: 5, threshold: 0.70 });

  if (memories.length === 0) return '';

  const lines = memories.map(m => {
    let contenido = m.contenido;
    try { if (typeof contenido === 'string') contenido = JSON.parse(contenido); } catch {}
    const text = typeof contenido === 'string' ? contenido : JSON.stringify(contenido).slice(0, 200);
    return `[${(m.tipo || '').toUpperCase()}] relevancia: ${(m.relevance * 100).toFixed(0)}% | ${text}`;
  });

  return `\nMEMORIA RELEVANTE (${memories.length} entradas, por relevancia):\n${lines.join('\n')}\n`;
}

module.exports = {
  generateEmbedding,
  storeWithEmbedding,
  findRelevantMemories,
  buildSemanticContext,
  EMBED_DIM,
  // SQL para setup está en el comentario del archivo
  SETUP_SQL_NOTE: 'Ver comentario al inicio del archivo para SQL de Supabase necesario'
};
