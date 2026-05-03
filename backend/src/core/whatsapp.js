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

// Notify Fermín (Neiky) directly
async function notifyNeiky(message) {
  const neikyPhone = process.env.NEIKY_WHATSAPP;
  return sendMetaMessage(neikyPhone, message);
}

module.exports = { sendMetaMessage, sendMetaTemplate, sendMetaImage, notifyNeiky, sendTwilioMessage };
