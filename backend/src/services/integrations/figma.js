// backend/src/services/integrations/figma.js
// Carlos/Diego/Valentina pueden interactuar con Figma vía Personal Access Token.
// FIGMA_TOKEN env. Sin token: graceful mock.

const axios = require('axios');

function client() {
  if (!process.env.FIGMA_TOKEN) return null;
  return axios.create({
    baseURL: 'https://api.figma.com/v1',
    headers: { 'X-FIGMA-TOKEN': process.env.FIGMA_TOKEN }
  });
}

async function getFile(file_key) {
  const c = client();
  if (!c) return { ok: false, mock: true };
  try {
    const r = await c.get(`/files/${file_key}`);
    return { ok: true, name: r.data.name, lastModified: r.data.lastModified, version: r.data.version };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

async function postComment({ file_key, message, x = 100, y = 100 }) {
  const c = client();
  if (!c) return { ok: false, mock: true };
  try {
    const r = await c.post(`/files/${file_key}/comments`, {
      message, client_meta: { x, y }
    });
    return { ok: true, comment_id: r.data.id };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

async function exportImage({ file_key, node_ids = [], format = 'png', scale = 2 }) {
  const c = client();
  if (!c) return { ok: false, mock: true };
  try {
    const r = await c.get(`/images/${file_key}`, {
      params: { ids: node_ids.join(','), format, scale }
    });
    return { ok: true, images: r.data.images };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

module.exports = { getFile, postComment, exportImage };
