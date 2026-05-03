// backend/src/core/email.js
// Fractal Virtual Team v4.2 — Email delivery via Gmail SMTP

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD  // App Password de Google (16 chars)
  }
});

/**
 * Envía email en nombre del equipo Fractal MX
 * @param {string} to - Destinatario
 * @param {string} subject - Asunto
 * @param {string} html - Cuerpo HTML
 * @param {string} text - Cuerpo plano (fallback)
 * @param {string} fromName - Nombre del agente que envía (ej: "Diego · Fractal MX")
 */
async function sendEmail({ to, subject, html, text, fromName = 'Fractal MX' }) {
  const from = `"${fromName}" <${process.env.GMAIL_USER}>`;

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`[Email] Enviado a ${to} — MessageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Error:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
