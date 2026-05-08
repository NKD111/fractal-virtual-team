require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID;
const META_API_URL = `https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`;

// ─── TWILIO ───────────────────────────────────────────────────────────────────
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

async function sendTwilioMessage(to, text) {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn('[Twilio] No credentials — mensaje no enviado');
    return;
  }
  // Asegurar formato whatsapp:+XXXXXXXXXX
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    const twilio = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
    const msg = await twilio.messages.create({
      from: TWILIO_FROM,
      to: toFormatted,
      body: text
    });
    console.log(`[Twilio] Enviado a ${toFormatted} — SID: ${msg.sid}`);
    return msg;
  } catch (err) {
    console.error('[Twilio] Error enviando mensaje:', err.message);
    throw err;
  }
}

// Send text via Meta Cloud API (production WhatsApp)
async function sendMetaMessage(to, text) {
  const phone = to.replace('whatsapp:', '').replace('+', '');
  try {
    const { data } = await axios.post(META_API_URL, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text }
    }, {
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return data;
  } catch (err) {
    console.error('Meta WA error:', err.response?.data || err.message);
    throw err;
  }
}

// Send template via Meta (for first-time outbound)
async function sendMetaTemplate(to, templateName, languageCode = 'es_MX', components = []) {
  const phone = to.replace('whatsapp:', '').replace('+', '');
  const { data } = await axios.post(META_API_URL, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components }
  }, {
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return data;
}

// Send image via Meta
async function sendMetaImage(to, imageUrl, caption = '') {
  const phone = to.replace('whatsapp:', '').replace('+', '');
  const { data } = await axios.post(META_API_URL, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'image',
    image: { link: imageUrl, caption }
  }, {
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return data;
}

// ─── PAUSA GLOBAL DEL SISTEMA ────────────────────────────────────────────────
// Cuando SYSTEM_PAUSED=true en Railway, NINGÚN mensaje sale por WhatsApp.
// Para reactivar: cambiar a false o eliminar la var en Railway y redeploy.
// ─────────────────────────────────────────────────────────────────────────────

// Notify Fermín (Neiky) directly.
// Canal 1: Meta Cloud API; Canal 2: Twilio (fallback si Meta falla).
// Trunca a 4096 chars (límite WhatsApp).
async function notifyNeiky(message) {
  // 🛑 PAUSA TOTAL HARDCODEADA — NKD ordenó detener TODO hasta nuevo aviso
  // Para reactivar: eliminar estas 3 líneas y hacer push
  console.log('[notifyNeiky] 🛑 PAUSA TOTAL — mensaje bloqueado:', (message || '').substring(0, 80));
  return null;
  const neikyPhone = process.env.NEIKY_WHATSAPP || '+525534189583';
  const MAX_WA_LEN = 4096;
  const safeMsg = message && message.length > MAX_WA_LEN
    ? message.substring(0, MAX_WA_LEN - 40) + '\n…_(mensaje truncado)_'
    : message;

  // Intentar Meta primero
  try {
    const result = await sendMetaMessage(neikyPhone, safeMsg);
    return result;
  } catch (metaErr) {
    console.warn('[notifyNeiky] Meta falló, intentando Twilio:', metaErr.message);
  }

  // Fallback Twilio
  try {
    const result = await sendTwilioMessage(neikyPhone, safeMsg);
    console.log('[notifyNeiky] Enviado via Twilio (fallback)');
    return result;
  } catch (twilioErr) {
    console.error('[notifyNeiky] Twilio también falló:', twilioErr.message);
    throw new Error(`notifyNeiky: ambos canales fallaron. Meta+Twilio down.`);
  }
}

module.exports = { sendMetaMessage, sendMetaTemplate, sendMetaImage, notifyNeiky, sendTwilioMessage };
