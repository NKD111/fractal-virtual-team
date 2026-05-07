// backend/src/core/task-notifier.js
// Motor de notificación de tareas completadas — Fractal MX v4.3
//
// FLUJO:
//   Neiky pide tarea por WhatsApp
//   → Mariana registra la tarea en DB (tasks table)
//   → Agente ejecuta la tarea en background
//   → notifyTaskComplete() envía resultado a Neiky
//
// CANALES DE NOTIFICACIÓN (en orden de prioridad):
//   1. Meta Cloud API WhatsApp (notifyNeiky)
//   2. Twilio WhatsApp (sendTwilioMessage) — fallback si Meta falla
//   3. Email Resend → nakedgeometry19@gmail.com — fallback si ambos WA fallan

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { supabase } = require('./supabase');

const NEIKY_EMAIL   = process.env.NEIKY_EMAIL   || 'nakedgeometry19@gmail.com';
const NEIKY_PHONE   = process.env.NEIKY_WHATSAPP || '+525534189583';

// ─── Registro de tarea ────────────────────────────────────────────────────────
/**
 * Crea un registro en tasks cuando Neiky asigna una tarea por WhatsApp.
 * @param {string} description  - El mensaje original de Neiky
 * @param {string} assignedTo   - Agente responsable ('MARIANA', 'CARLOS', 'DIEGO', etc.)
 * @param {object} meta         - Metadata adicional (channel, tipo, etc.)
 * @returns {string|null}       - UUID de la tarea, o null si falló
 */
async function registerNeikyTask(description, assignedTo = 'MARIANA', meta = {}) {
  try {
    const { data, error } = await supabase.from('tasks').insert({
      title:       description.substring(0, 200),
      description: description,
      status:      'in_progress',
      metadata: {
        task_source:    'neiky_whatsapp',
        task_type:      'neiky_assignment',
        assigned_agent: assignedTo,
        requested_at:   new Date().toISOString(),
        ...meta
      }
    }).select('id').single();

    if (error) throw error;
    console.log(`[TaskNotifier] Tarea registrada: ${data.id.substring(0, 8)}… → "${description.substring(0, 60)}"`);
    return data.id;
  } catch (err) {
    console.error('[TaskNotifier] registerNeikyTask error:', err.message);
    return null;
  }
}

// ─── Notificación de tarea completada ────────────────────────────────────────
/**
 * Notifica a Neiky que su tarea está lista.
 * Intenta WhatsApp (Meta → Twilio) primero, email como último fallback.
 *
 * @param {string|null} taskId        - UUID del registro en tasks (puede ser null)
 * @param {string}      description   - Descripción corta de la tarea
 * @param {string|object} result      - El entregable: texto, JSON, URLs de imágenes
 * @param {string}      agent         - Quién la completó ('CARLOS', 'MARIANA', etc.)
 * @param {string[]}    mediaUrls     - URLs de imágenes/archivos para adjuntar (opcional)
 */
async function notifyTaskComplete(taskId, description, result, agent = 'MARIANA', mediaUrls = []) {
  // ── 1. Marcar como completada en DB ──────────────────────────────────────
  if (taskId) {
    try {
      const resultText = typeof result === 'object'
        ? JSON.stringify(result, null, 2) : String(result || '');
      await supabase.from('tasks')
        .update({
          status:       'completed',
          result:       resultText.substring(0, 2000),
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);
    } catch (err) {
      console.warn('[TaskNotifier] DB complete error:', err.message);
    }
  }

  // ── 2. Formatear mensaje ──────────────────────────────────────────────────
  const resultText = _formatResult(result);
  const timestamp  = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  const waMessage = `✅ *Tarea lista, nene*

📋 *Pediste:* ${description.substring(0, 120)}

🤖 *Completada por:* ${agent}

📦 *Resultado:*
${resultText}
${mediaUrls.length > 0 ? '\n🖼 *Archivos:*\n' + mediaUrls.map((u, i) => `  ${i + 1}. ${u}`).join('\n') : ''}
⏰ ${timestamp}`;

  // ── 3. Intentar Meta Cloud API ────────────────────────────────────────────
  let notified = false;

  try {
    const { notifyNeiky } = require('./whatsapp');
    await notifyNeiky(waMessage);
    console.log(`[TaskNotifier] ✅ WA Meta enviado — tarea: "${description.substring(0, 50)}"`);
    notified = true;
  } catch (metaErr) {
    console.warn(`[TaskNotifier] Meta WA falló: ${metaErr.message}`);
  }

  // ── 4. Fallback: Twilio WhatsApp ──────────────────────────────────────────
  if (!notified) {
    try {
      const { sendTwilioMessage } = require('./whatsapp');
      await sendTwilioMessage(NEIKY_PHONE, waMessage);
      console.log(`[TaskNotifier] ✅ WA Twilio enviado — tarea: "${description.substring(0, 50)}"`);
      notified = true;
    } catch (twilioErr) {
      console.warn(`[TaskNotifier] Twilio WA falló: ${twilioErr.message}`);
    }
  }

  // ── 5. Fallback final: Email Resend ───────────────────────────────────────
  if (!notified) {
    try {
      const { sendEmail } = require('./email');
      await sendEmail({
        to:       NEIKY_EMAIL,
        subject:  `✅ Tarea lista: ${description.substring(0, 60)}`,
        fromName: `${agent} · Fractal MX`,
        html:     _buildEmailHtml(description, resultText, agent, timestamp, mediaUrls),
        text:     waMessage
      });
      console.log(`[TaskNotifier] ✅ Email enviado a ${NEIKY_EMAIL}`);
      notified = true;
    } catch (emailErr) {
      console.error(`[TaskNotifier] Email también falló: ${emailErr.message}`);
    }
  }

  return notified;
}

// ─── Marca tarea como fallida ────────────────────────────────────────────────
async function markTaskFailed(taskId, errorMsg) {
  if (!taskId) return;
  try {
    await supabase.from('tasks').update({
      status: 'cancelled',
      result: `ERROR: ${errorMsg}`,
      metadata: supabase.rpc ? undefined : undefined // se mantiene el metadata original
    }).eq('id', taskId);
  } catch (err) {
    console.warn('[TaskNotifier] markTaskFailed:', err.message);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _formatResult(result) {
  if (!result) return '_(sin resultado)_';
  if (typeof result === 'string') return result.substring(0, 1200);
  if (Array.isArray(result))     return result.map(String).join('\n').substring(0, 1200);
  // object: pretty-print los campos más relevantes
  const obj = result;
  const lines = [];
  if (obj.headline)      lines.push(`• Headline: ${obj.headline}`);
  if (obj.cta)           lines.push(`• CTA: ${obj.cta}`);
  if (obj.tipo_pieza)    lines.push(`• Tipo: ${obj.tipo_pieza}`);
  if (obj.veredicto)     lines.push(`• QC Valentina: ${obj.veredicto}`);
  if (obj.score)         lines.push(`• Score: ${obj.score}/100`);
  if (obj.pipeline_notes) lines.push(`• Notas: ${String(obj.pipeline_notes).substring(0, 200)}`);
  if (obj.imageUrl || obj.url) lines.push(`• Imagen: ${obj.imageUrl || obj.url}`);
  if (lines.length === 0)      return JSON.stringify(obj, null, 2).substring(0, 800);
  return lines.join('\n');
}

function _buildEmailHtml(description, resultText, agent, timestamp, mediaUrls = []) {
  const imagesHtml = mediaUrls.length > 0
    ? `<div style="margin-top:16px">
        <strong>🖼 Archivos adjuntos:</strong>
        <ul>${mediaUrls.map(u => `<li><a href="${u}">${u}</a></li>`).join('')}</ul>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1B263B;color:white;padding:22px 24px;border-radius:10px 10px 0 0">
    <h2 style="margin:0;font-size:20px">✅ Tarea Completada — Fractal MX</h2>
    <p style="margin:6px 0 0;color:#aab4c4;font-size:13px">${timestamp}</p>
  </div>
  <div style="background:#f9f9fb;padding:22px 24px;border:1px solid #e8e8ec;border-top:0;border-radius:0 0 10px 10px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:6px 0;color:#888;font-size:13px;width:130px">Completada por:</td>
        <td style="padding:6px 0;font-weight:600">${agent}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#888;font-size:13px">Tarea pedida:</td>
        <td style="padding:6px 0">${description}</td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #e8e8ec;margin:16px 0">
    <p style="font-weight:600;margin:0 0 10px">📦 Resultado:</p>
    <div style="background:white;padding:16px;border-radius:6px;border:1px solid #dde;
                white-space:pre-wrap;font-family:monospace;font-size:13px;line-height:1.5">
${resultText}
    </div>
    ${imagesHtml}
    <p style="margin-top:20px;font-size:12px;color:#999">
      Este mensaje fue generado automáticamente por el sistema Fractal MX.<br>
      Ante cualquier duda responde por WhatsApp.
    </p>
  </div>
</body>
</html>`;
}

module.exports = { registerNeikyTask, notifyTaskComplete, markTaskFailed };
