// backend/src/core/email.js
// Fractal Virtual Team v4.2 — Email delivery via Resend API (HTTP, Railway-compatible)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envía email en nombre del equipo Fractal MX
 * Siempre manda CC a FRACTAL_EMAIL_CC si está configurado
 * @param {string} to - Destinatario principal
 * @param {string} subject - Asunto
 * @param {string} html - Cuerpo HTML
 * @param {string} text - Cuerpo plano (fallback)
 * @param {string} fromName - Nombre del agente que envía (ej: "Diego · Fractal MX")
 * @param {string|null} cc - CC adicional (opcional)
 */
async function sendEmail({ to, subject, html, text, fromName = 'Fractal MX', cc = null }) {
  // Resend free tier permite enviar desde onboarding@resend.dev sin dominio verificado
  const from = process.env.RESEND_FROM_EMAIL || `"${fromName}" <onboarding@resend.dev>`;

  // CC siempre incluye proyectosfractalmx si está configurado
  const ccList = [process.env.FRACTAL_EMAIL_CC, cc].filter(Boolean);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      html,
      text
    });

    if (error) {
      console.error('[Email] Error Resend:', error.message);
      throw new Error(error.message);
    }

    console.log(`[Email] Enviado a ${to}${ccList.length ? ` (CC: ${ccList.join(', ')})` : ''} — ID: ${data.id}`);
    return { ok: true, messageId: data.id };
  } catch (err) {
    console.error('[Email] Error:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
