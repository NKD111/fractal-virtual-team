// backend/src/core/email.js
// Fractal Virtual Team v4.2 — Email delivery via Gmail SMTP

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const nodemailer = require('nodemailer');
const dns = require('dns');

// Railway no soporta IPv6 outbound — forzar IPv4 en toda resolución DNS
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS (Railway-compatible, evita IPv6 port 465)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD  // App Password de Google (16 chars)
  },
  tls: { rejectUnauthorized: false }
});

/**
 * Envía email en nombre del equipo Fractal MX
 * Siempre manda CC a FRACTAL_EMAIL_CC (proyectosfractalmx@gmail.com) si está configurado
 * @param {string} to - Destinatario principal
 * @param {string} subject - Asunto
 * @param {string} html - Cuerpo HTML
 * @param {string} text - Cuerpo plano (fallback)
 * @param {string} fromName - Nombre del agente que envía (ej: "Diego · Fractal MX")
 * @param {string|null} cc - CC adicional (opcional, se suma al FRACTAL_EMAIL_CC)
 */
async function sendEmail({ to, subject, html, text, fromName = 'Fractal MX', cc = null }) {
  const from = `"${fromName}" <${process.env.GMAIL_USER}>`;

  // CC siempre incluye proyectosfractalmx si está configurado
  const ccAddresses = [
    process.env.FRACTAL_EMAIL_CC,
    cc
  ].filter(Boolean).join(', ') || undefined;

  try {
    const info = await transporter.sendMail({ from, to, cc: ccAddresses, subject, html, text });
    console.log(`[Email] Enviado a ${to}${ccAddresses ? ` (CC: ${ccAddresses})` : ''} — MessageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Error:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
