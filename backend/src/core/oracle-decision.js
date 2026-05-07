// backend/src/core/oracle-decision.js
// ORACLE Decision Engine — Fractal MX v4.0
//
// Cuando el sistema encuentra una situación que normalmente requeriría
// intervención de NKD, primero consulta a ORACLE via API. ORACLE analiza
// y decide. Solo escala a NKD si la decisión supera su nivel de autoridad.
//
// NIVELES DE AUTORIDAD:
//   Nivel 1 — ORACLE decide solo y ejecuta
//   Nivel 2 — ORACLE propone + pide aprobación a NKD por WhatsApp
//   Nivel 3 — Siempre escala a NKD (decisiones estratégicas/económicas)
//
// USO:
//   const { oracleDecide } = require('../core/oracle-decision');
//   const decision = await oracleDecide('arte_rechazado', { brief, issues }, 1);
//   // → { accion, razon, instrucciones_agente, nota_para_nkd, nivel_usado, ... }

'use strict';

const { chat }          = require('./anthropic');
const { MODELS }        = require('./model-routing');  // UPGRADE 2: routing por nivel
const memoryEngine      = require('./memory-engine');
const { notifyNeiky }   = require('./whatsapp');
const { supabase }      = require('./supabase');

// UPGRADE 2: mapa de modelo por nivel de autoridad
// Nivel 1 (autónomo)  → Sonnet — suficiente para decisiones operativas
// Nivel 2 (propone)   → Opus   — decisión estratégica con implicaciones de negocio
// Nivel 3 (escala)    → Opus   — siempre máxima inteligencia cuando involucra a NKD
const NIVEL_MODELS = {
  1: MODELS.SONNET,
  2: MODELS.OPUS,
  3: MODELS.OPUS
};

// ── Lazy-load obsidian-sync (no crash si no está en Railway) ──────────────────
let obsidianSync = null;
function getObsidian() {
  if (!obsidianSync) {
    try { obsidianSync = require('../services/obsidian-sync'); } catch { /* skip */ }
  }
  return obsidianSync;
}

// ── Situaciones reconocidas y su nivel por defecto ────────────────────────────
const SITUACION_NIVELES = {
  arte_rechazado:     1,   // QA falló → ORACLE da instrucciones a Carlos
  brief_vago:         1,   // DIANA no pudo interpretar → ORACLE extrae info
  error_sistema:      1,   // Error técnico → ORACLE decide cómo continuar
  qa_loop_infinito:   1,   // 3+ intentos fallidos → ORACLE decide detener
  prospecto_caliente: 2,   // Score > 70 → ORACLE propone, NKD aprueba contacto
  precio_fuera_rango: 2,   // Precio propuesto fuera del rango habitual
  cliente_insatisfecho: 2, // Señal de cliente molesto → ORACLE propone acción
  cambio_alcance:     3,   // Cliente pide cambio de alcance → siempre NKD
  decision_financiera: 3,  // Cualquier cosa con dinero > $500 USD
  conflicto_cliente:  3,   // Problema grave con cliente → siempre NKD
};

// ── Prompts por situación ─────────────────────────────────────────────────────
const SITUACION_PROMPTS = {
  arte_rechazado: (ctx) => `
El QA pipeline rechazó un arte de producción. Tu trabajo: analizar las fallas
y generar instrucciones exactas y accionables para que Carlos (diseñador) corrija
el arte en el siguiente intento. Sin ambigüedad.

BRIEF ORIGINAL:
${JSON.stringify(ctx.brief || ctx, null, 2)}

CAPA QA QUE FALLÓ: ${ctx.capa || 'no especificada'}
PROBLEMAS ENCONTRADOS:
${Array.isArray(ctx.issues) ? ctx.issues.join('\n') : ctx.issues || 'ver contexto'}

Genera instrucciones precisas para Carlos. Enumera cada cambio.`,

  brief_vago: (ctx) => `
DIANA intentó traducir un brief del cliente pero la confianza fue muy baja (${ctx.confidence || '< 70'}%).
Tu trabajo: analizar el brief vago y decidir:
  a) Si hay suficiente info para proceder con suposiciones razonables, genera el brief completo.
  b) Si falta información crítica, lista exactamente qué preguntar (máximo 3 preguntas).

BRIEF VAGO ORIGINAL: "${ctx.brief_raw || ctx.brief || JSON.stringify(ctx)}"
CLIENTE: ${ctx.cliente || 'no especificado'}
CONFIANZA DIANA: ${ctx.confidence || 'baja'}%

Decide si proceder o preguntar. Sé práctico.`,

  error_sistema: (ctx) => `
Ocurrió un error en el sistema de Fractal MX. Analiza el error y decide
el mejor curso de acción para mantener la continuidad operativa.

ERROR: ${ctx.error || JSON.stringify(ctx)}
AGENTE/MÓDULO: ${ctx.agente || 'desconocido'}
OPERACIÓN: ${ctx.operacion || 'no especificada'}

¿Reintentar? ¿Fallback? ¿Notificar a NKD? Decide y explica.`,

  qa_loop_infinito: (ctx) => `
Un arte lleva ${ctx.intentos || 3}+ intentos de rework sin aprobar QA.
Evalúa si el brief original es el problema (reformularlo) o si el arte
tiene una falla fundamental. Decide si detener el ciclo y escalar.

BRIEF: ${JSON.stringify(ctx.brief || ctx, null, 2)}
INTENTOS: ${ctx.intentos || '3+'}
ÚLTIMAS NOTAS DE REVISIÓN: ${ctx.ultimas_notas || 'ver historial'}`,

  prospecto_caliente: (ctx) => `
AXIOM detectó un prospecto de alto valor. Score: ${ctx.score || '>70'}/100.
Tu trabajo: generar una recomendación ejecutiva para NKD.
Incluye: empresa, por qué es momento ideal, servicio recomendado, precio,
y el mensaje de WhatsApp a enviar (si NKD aprueba).

DATOS DEL PROSPECTO:
${JSON.stringify(ctx, null, 2)}`,

  precio_fuera_rango: (ctx) => `
Se detectó un precio propuesto que está fuera del rango habitual de Fractal MX.
Analiza si es justificable y qué recomendación darle a NKD.

CONTEXTO: ${JSON.stringify(ctx, null, 2)}`,

  cliente_insatisfecho: (ctx) => `
Hay señales de que un cliente está insatisfecho. Analiza la situación y
genera un plan de acción para recuperar la relación.

CLIENTE: ${ctx.cliente || 'no especificado'}
SEÑALES: ${ctx.señales || JSON.stringify(ctx)}`,

  cambio_alcance: (ctx) => `
El cliente está pidiendo un cambio de alcance. Esto siempre requiere aprobación
de NKD. Prepara un resumen ejecutivo de lo que está pidiendo y el impacto.

CLIENTE: ${ctx.cliente || 'no especificado'}
SOLICITUD: ${JSON.stringify(ctx)}`,

  decision_financiera: (ctx) => `
Hay una decisión financiera que supera el umbral autónomo. Prepara el
análisis para NKD.

CONTEXTO: ${JSON.stringify(ctx, null, 2)}`,

  conflicto_cliente: (ctx) => `
Conflicto activo con cliente. Prepara resumen ejecutivo y opciones para NKD.

CLIENTE: ${ctx.cliente || 'no especificado'}
SITUACIÓN: ${JSON.stringify(ctx)}`,
};

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * oracleDecide(situacion, contexto, nivel_override?)
 *
 * @param {string} situacion  - Clave de situación (ver SITUACION_NIVELES)
 * @param {object} contexto   - Datos relevantes para la decisión
 * @param {number} [nivel]    - Override de nivel (1|2|3). Default: auto por situación
 * @returns {Promise<OracleDecision>}
 */
async function oracleDecide(situacion, contexto, nivel) {
  const nivelFinal = nivel ?? SITUACION_NIVELES[situacion] ?? 1;
  const timestamp  = new Date().toISOString();
  const decisionId = `oracle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  console.log(`[ORACLE] decisión iniciada — situacion: ${situacion}, nivel: ${nivelFinal}, id: ${decisionId}`);

  // ── 1. Generar análisis con Claude ───────────────────────────────────────────
  const promptFn   = SITUACION_PROMPTS[situacion] || ((ctx) => `Analiza esta situación y decide la mejor acción:\n${JSON.stringify(ctx, null, 2)}`);
  const promptBody = promptFn(contexto);

  const system = `Eres ORACLE, el motor de decisión autónomo de Fractal MX.
Fractal MX es una agencia creativa AI-powered en CDMX. Tu dueña es Neiky Valentina Domínguez (NKD).

Tu trabajo: tomar decisiones operativas rápidas y precisas.
Nivel de autoridad actual: ${nivelFinal} (${nivelFinal === 1 ? 'AUTÓNOMO — decides y ejecutas' : nivelFinal === 2 ? 'PROPONE — generas propuesta para aprobación NKD' : 'ESCALACIÓN — siempre a NKD'}).

Responde SOLO en JSON válido, sin markdown, sin explicaciones fuera del JSON:
{
  "accion": "acción concreta y específica a tomar",
  "razon": "por qué esta es la mejor decisión (2-3 oraciones)",
  "instrucciones_agente": "instrucciones exactas para el agente que ejecutará (si aplica). Null si no hay agente.",
  "mensaje_carlos": "instrucciones específicas de diseño para Carlos (null si no aplica)",
  "preguntas_cliente": ["pregunta 1", "pregunta 2"] || null,
  "nota_para_nkd": "resumen ejecutivo para NKD si necesita saber (null si es nivel 1 sin impacto estratégico)",
  "requiere_aprobacion_nkd": ${nivelFinal >= 2 ? 'true' : 'false'},
  "confianza": 0-100,
  "urgencia": "baja|media|alta|critica",
  "metricas_seguimiento": ["qué medir después para saber si la decisión fue correcta"]
}`;

  let decision;
  try {
    // UPGRADE 2: nivel 1 → Sonnet (ahorro ~40%), nivel 2+ → Opus
    const modelToUse = NIVEL_MODELS[nivelFinal] || MODELS.SONNET;
    const response = await chat({
      model: modelToUse,
      system,
      messages: [{ role: 'user', content: promptBody }],
      maxTokens: 800
    });
    console.log(`[ORACLE] modelo usado: ${modelToUse} (nivel ${nivelFinal})`)

    const raw = (response.content || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    decision = JSON.parse(raw);
  } catch (parseErr) {
    console.warn('[ORACLE] JSON parse fallback:', parseErr.message);
    decision = {
      accion: `Escalar situación "${situacion}" a revisión manual`,
      razon: 'ORACLE no pudo generar decisión estructurada. Se recomienda revisión.',
      instrucciones_agente: null,
      mensaje_carlos: null,
      preguntas_cliente: null,
      nota_para_nkd: `ORACLE necesita revisión manual para: ${situacion}`,
      requiere_aprobacion_nkd: true,
      confianza: 20,
      urgencia: 'alta',
      metricas_seguimiento: ['resolver situación manualmente']
    };
  }

  // Enriquecer con metadatos
  const resultado = {
    ...decision,
    decision_id: decisionId,
    situacion,
    nivel_usado: nivelFinal,
    timestamp,
    contexto_recibido: contexto
  };

  // ── 2. Guardar en memoria (siempre) ──────────────────────────────────────────
  try {
    await memoryEngine.saveMemory({
      tipo: 'oracle_decision',
      situacion,
      nivel: nivelFinal,
      decision_id: decisionId,
      accion: decision.accion,
      confianza: decision.confianza,
      urgencia: decision.urgencia
    });
  } catch (memErr) {
    console.warn('[ORACLE] memory save error (non-fatal):', memErr.message);
  }

  // ── 3. Guardar en Obsidian (non-blocking) ────────────────────────────────────
  const obs = getObsidian();
  if (obs) {
    obs.saveDecision(
      `ORACLE: ${situacion}`,
      `Nivel ${nivelFinal} — confianza ${decision.confianza}%\n\nContexto: ${JSON.stringify(contexto).slice(0, 300)}`,
      decision.accion,
      decision.razon
    ).catch(e => console.warn('[ORACLE] Obsidian skip:', e.message));
  }

  // ── 4. Notificar a NKD si nivel >= 2 ────────────────────────────────────────
  if (nivelFinal >= 2) {
    const msgNKD = buildNKDMessage(situacion, nivelFinal, decision, contexto);
    try {
      await notifyNeiky(msgNKD);
      resultado.nkd_notificado = true;
      resultado.nkd_mensaje = msgNKD;
      console.log(`[ORACLE] NKD notificada — nivel ${nivelFinal}, situación: ${situacion}`);
    } catch (waErr) {
      console.warn('[ORACLE] WhatsApp NKD error (non-fatal):', waErr.message);
      resultado.nkd_notificado = false;
      resultado.nkd_error = waErr.message;
    }

    // Guardar pendiente de aprobación en Supabase para nivel 3
    if (nivelFinal === 3) {
      try {
        await supabase.from('oracle_memory').insert({
          tipo: 'oracle_pending_approval',
          contenido: JSON.stringify({
            decision_id: decisionId,
            situacion,
            resumen: decision.nota_para_nkd || decision.accion,
            accion_propuesta: decision.accion,
            timestamp
          })
        });
      } catch { /* non-fatal */ }
    }
  }

  console.log(`[ORACLE] decisión completada — acción: "${decision.accion.slice(0, 80)}..." confianza: ${decision.confianza}%`);
  return resultado;
}

// ── WhatsApp message builder ──────────────────────────────────────────────────
function buildNKDMessage(situacion, nivel, decision, contexto) {
  const emoji = nivel === 2 ? '🟡' : '🔴';
  const urgencia = decision.urgencia === 'critica' ? '⚠️ CRÍTICO' : decision.urgencia === 'alta' ? '🔔 URGENTE' : '📋';

  const lines = [
    `${emoji} ORACLE — Nivel ${nivel} | ${urgencia}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 Situación: ${situacion.replace(/_/g, ' ').toUpperCase()}`,
    ``,
    `💡 Acción propuesta:`,
    decision.accion,
    ``,
    `📝 Razón:`,
    decision.razon,
  ];

  if (decision.nota_para_nkd) {
    lines.push('', '👁 Nota para NKD:', decision.nota_para_nkd);
  }

  if (nivel === 2) {
    lines.push('', '✅ Responde SÍ para aprobar, NO para rechazar');
  } else {
    lines.push('', '⚡ Requiere tu decisión — sin acción automática');
  }

  lines.push(``, `🤖 ORACLE | Confianza: ${decision.confianza}%`);

  return lines.join('\n');
}

// ── Helpers especializados (para integración limpia) ─────────────────────────

/**
 * Decide sobre arte rechazado por QA
 * @param {object} brief - brief del pipeline
 * @param {string} capa - nombre de la capa QA que falló
 * @param {Array|string} issues - lista de problemas encontrados
 * @returns {Promise<OracleDecision>}
 */
async function decideArteRechazado(brief, capa, issues) {
  return oracleDecide('arte_rechazado', { brief, capa, issues }, 1);
}

/**
 * Decide sobre brief vago de DIANA
 * @param {string} brief_raw - brief original del cliente
 * @param {string} cliente - nombre del cliente
 * @param {number} confidence - confianza de DIANA (0-100)
 * @returns {Promise<OracleDecision>}
 */
async function decideBriefVago(brief_raw, cliente, confidence) {
  return oracleDecide('brief_vago', { brief_raw, cliente, confidence }, 1);
}

/**
 * Decide sobre prospecto caliente (score > 70)
 * @param {object} prospecto - datos del prospecto de AXIOM
 * @returns {Promise<OracleDecision>}
 */
async function decideProspectoCaliente(prospecto) {
  return oracleDecide('prospecto_caliente', prospecto, 2);
}

/**
 * Decide sobre error de sistema
 * @param {Error} error - el error ocurrido
 * @param {string} agente - nombre del agente/módulo
 * @param {string} operacion - qué estaba haciendo
 * @returns {Promise<OracleDecision>}
 */
async function decideErrorSistema(error, agente, operacion) {
  return oracleDecide('error_sistema', {
    error: error?.message || String(error),
    agente,
    operacion
  }, 1);
}

module.exports = {
  oracleDecide,
  decideArteRechazado,
  decideBriefVago,
  decideProspectoCaliente,
  decideErrorSistema,
  SITUACION_NIVELES,
};
