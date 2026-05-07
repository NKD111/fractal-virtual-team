// backend/src/core/memory-engine.js
// FASE 8 — Memoria Evolutiva
// El sistema aprende de cada aprobación y rechazo.
// Cada ciclo debe ser mejor que el anterior.
// ORACLE consulta esta memoria antes de tomar decisiones creativas.

const { supabase } = require('./supabase');
const { chat } = require('./anthropic');

const MODEL = 'claude-sonnet-4-6';

// ─── TIPOS DE MEMORIA ────────────────────────────────────────────────────────

const MEMORY_TYPES = {
  VICTORIA:        'victoria',         // Arte aprobado sin revisiones
  ERROR:           'error',            // Rechazo documentado con lección
  PATRON_CLIENTE:  'patron_cliente',   // Comportamiento recurrente del cliente
  PROMPT_EXITOSO:  'prompt_exitoso',   // Prompt que generó imagen aprobada
  HOOK_EXITOSO:    'hook_exitoso',     // Copy/headline que generó resultado
  APRENDIZAJE:     'aprendizaje'       // Lección extraída por ORACLE
};

// ─── FUNCIONES PRINCIPALES ───────────────────────────────────────────────────

/**
 * learnFromApproval(brief_id)
 *
 * Después de que NKD aprueba una pieza — registrar como victoria.
 * El sistema aprende: qué prompt, qué headline, qué tipo de pieza funcionó.
 */
async function learnFromApproval(brief_id) {
  try {
    const { data: brief } = await supabase
      .from('parrilla_briefs')
      .select('*')
      .eq('id', brief_id)
      .single();

    if (!brief) return;

    const memoria = {
      tipo: MEMORY_TYPES.VICTORIA,
      cliente: brief.cliente,
      mes: brief.mes,
      tipo_pieza: brief.tipo_pieza,
      prompt_usado: brief.prompt_higgsfield,
      headline: brief.headline,
      estilo_visual: brief.estilo_visual,
      rondas_revision: brief.rondas_revision || 1,
      aprobado_sin_cambios: (brief.rondas_revision || 1) <= 1,
      notas: `Aprobado${(brief.rondas_revision || 1) <= 1 ? ' sin revisiones' : ` en ${brief.rondas_revision} rondas`}`,
      created_at: new Date().toISOString()
    };

    await saveMemory(memoria);

    // Si el prompt fue exitoso, guardarlo también como prompt_exitoso
    if (brief.prompt_higgsfield && (brief.rondas_revision || 1) <= 1) {
      await saveMemory({
        tipo: MEMORY_TYPES.PROMPT_EXITOSO,
        cliente: brief.cliente,
        tipo_pieza: brief.tipo_pieza,
        prompt: brief.prompt_higgsfield,
        headline: brief.headline,
        resultado: 'aprobado_primera_revision',
        created_at: new Date().toISOString()
      });
    }

    console.log(`[MemoryEngine] Victoria registrada: ${brief.headline || brief.id}`);

  } catch (err) {
    console.error('[MemoryEngine] Error en learnFromApproval:', err.message);
  }
}

/**
 * learnFromRejection(brief_id, razon)
 *
 * Después de un rechazo — extraer la lección y documentarla.
 * ORACLE analiza el rechazo y genera una lección accionable.
 */
async function learnFromRejection(brief_id, razon = 'No especificada') {
  try {
    const { data: brief } = await supabase
      .from('parrilla_briefs')
      .select('*')
      .eq('id', brief_id)
      .single();

    if (!brief) return;

    // Extraer lección con Claude
    const leccion = await extractLesson(brief, razon);

    const memoria = {
      tipo: MEMORY_TYPES.ERROR,
      cliente: brief.cliente,
      mes: brief.mes,
      tipo_pieza: brief.tipo_pieza,
      razon_rechazo: razon,
      prompt_usado: brief.prompt_higgsfield,
      headline: brief.headline,
      leccion: leccion,
      no_repetir: true,
      created_at: new Date().toISOString()
    };

    await saveMemory(memoria);
    console.log(`[MemoryEngine] Error documentado: ${razon.substring(0, 60)}`);

  } catch (err) {
    console.error('[MemoryEngine] Error en learnFromRejection:', err.message);
  }
}

/**
 * learnClientPattern(cliente, patron, evidencia)
 *
 * Documenta un patrón de comportamiento del cliente.
 * Se llama cuando se detecta un patrón recurrente.
 */
async function learnClientPattern(cliente, patron, evidencia = '') {
  await saveMemory({
    tipo: MEMORY_TYPES.PATRON_CLIENTE,
    cliente,
    patron,
    evidencia,
    created_at: new Date().toISOString()
  });
  console.log(`[MemoryEngine] Patrón cliente documentado: ${patron.substring(0, 60)}`);
}

/**
 * extractLesson(brief, razon)
 * ORACLE extrae una lección accionable de un rechazo.
 */
async function extractLesson(brief, razon) {
  try {
    const result = await chat({
      model: MODEL,
      system: `Eres el sistema de aprendizaje de Fractal MX.
Extraes lecciones accionables de rechazos para que el sistema no repita errores.
Una buena lección es específica, accionable y aplicable a piezas futuras.`,
      messages: [{
        role: 'user',
        content: `PIEZA RECHAZADA:
Tipo: ${brief.tipo_pieza}
Headline: ${brief.headline}
Prompt usado: ${(brief.prompt_higgsfield || '').substring(0, 300)}
Razón del rechazo: ${razon}

Genera UNA lección específica y accionable en máximo 2 oraciones.
Formato: "Para [tipo de pieza], evitar [elemento específico] porque [razón]. En su lugar, [alternativa concreta]."`
      }],
      maxTokens: 150,
      temperature: 0.3
    });
    return result.content.trim();
  } catch {
    return `Rechazo documentado: ${razon}`;
  }
}

/**
 * getRelevantMemory(agent, cliente, tipo_pieza, limit)
 * Recupera memorias relevantes para una tarea específica.
 * ORACLE y agentes la consultan antes de tomar decisiones creativas.
 */
async function getRelevantMemory(agent, cliente, tipo_pieza = null, limit = 5) {
  try {
    let query = supabase
      .from('oracle_memory')
      .select('tipo, contenido, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filtrar por cliente si se especifica
    // Nota: el campo contenido es JSON serializado, filtrar en aplicación
    const { data } = await query;

    if (!data) return [];

    // Deserializar y filtrar por cliente/tipo si aplica
    return (data || [])
      .map(m => {
        try {
          return { ...m, type: m.tipo, content: m.contenido,
                   data: typeof m.contenido === 'string' ? JSON.parse(m.contenido) : m.contenido };
        } catch { return { ...m, type: m.tipo }; }
      })
      .filter(m => !cliente || (m.data?.cliente || '').toUpperCase() === cliente.toUpperCase())
      .slice(0, limit);

  } catch (err) {
    console.error('[MemoryEngine] Error en getRelevantMemory:', err.message);
    return [];
  }
}

/**
 * getMemoryCount(tipo)
 * Cuenta memorias por tipo para el dashboard.
 */
async function getMemoryCount(tipo) {
  try {
    const { count } = await supabase
      .from('oracle_memory')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', tipo);
    return count || 0;
  } catch { return 0; }
}

/**
 * saveMemory(data)
 * Guarda un registro en oracle_memory.
 */
async function saveMemory(data) {
  try {
    await supabase.from('oracle_memory').insert({
      tipo:      data.tipo || data.type || 'aprendizaje',
      contenido: typeof data === 'string' ? data : JSON.stringify(data),
      created_at: data.created_at || new Date().toISOString()
    });
  } catch (err) {
    console.error('[MemoryEngine] Error guardando memoria:', err.message);
  }
}

/**
 * buildMemoryContext(cliente, tipo_pieza)
 * Construye un bloque de contexto con memorias relevantes para inyectar en prompts.
 * Los agentes llaman esto antes de generar contenido.
 */
async function buildMemoryContext(cliente, tipo_pieza = null, brief_text = '') {
  // UPGRADE 4: Intentar búsqueda semántica primero
  // Si semantic-memory está disponible y Voyage/OpenAI key configurada → resultados mejores
  try {
    const { buildSemanticContext } = require('./semantic-memory');
    const semanticCtx = await buildSemanticContext(cliente, tipo_pieza, brief_text);
    if (semanticCtx && semanticCtx.length > 50) {
      return semanticCtx; // Usar contexto semántico si tiene contenido
    }
  } catch { /* fallback a búsqueda exacta */ }

  const memorias = await getRelevantMemory(null, cliente, tipo_pieza, 8);

  if (!memorias.length) return '';

  const victorias = memorias.filter(m => (m.tipo||m.type) === MEMORY_TYPES.VICTORIA || m.data?.tipo === MEMORY_TYPES.VICTORIA);
  const errores   = memorias.filter(m => (m.tipo||m.type) === MEMORY_TYPES.ERROR || m.data?.tipo === MEMORY_TYPES.ERROR);
  const patrones  = memorias.filter(m => (m.tipo||m.type) === MEMORY_TYPES.PATRON_CLIENTE || m.data?.tipo === MEMORY_TYPES.PATRON_CLIENTE);
  const prompts   = memorias.filter(m => (m.tipo||m.type) === MEMORY_TYPES.PROMPT_EXITOSO || m.data?.tipo === MEMORY_TYPES.PROMPT_EXITOSO);

  let ctx = '=== MEMORIA DEL SISTEMA ===\n';

  if (victorias.length) {
    ctx += `\nQUÉ HA FUNCIONADO (${cliente}):\n`;
    ctx += victorias.slice(0, 3).map(v => `• ${v.data?.headline || ''} — ${v.data?.tipo_pieza || ''}`).join('\n');
  }
  if (errores.length) {
    ctx += `\nNO REPETIR:\n`;
    ctx += errores.slice(0, 3).map(e => `• ${e.data?.leccion || e.data?.razon_rechazo || ''}`).join('\n');
  }
  if (patrones.length) {
    ctx += `\nPATRONES DEL CLIENTE:\n`;
    ctx += patrones.slice(0, 2).map(p => `• ${p.data?.patron || ''}`).join('\n');
  }
  if (prompts.length) {
    ctx += `\nPROMPTS EXITOSOS (usar como base):\n`;
    ctx += prompts.slice(0, 2).map(p => `• ${(p.data?.prompt || '').substring(0, 150)}`).join('\n');
  }

  return ctx + '\n=== FIN MEMORIA ===';
}

module.exports = {
  learnFromApproval,
  learnFromRejection,
  learnClientPattern,
  extractLesson,
  getRelevantMemory,
  getMemoryCount,
  buildMemoryContext,
  saveMemory,
  MEMORY_TYPES
};
