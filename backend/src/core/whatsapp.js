require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID;
const META_API_URL = `https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`;

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

module.exports = { sendMetaMessage, sendMetaTemplate, sendMetaImage, notifyNeiky };
