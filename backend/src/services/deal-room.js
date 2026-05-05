// backend/src/services/deal-room.js
const crypto = require('crypto');
const { supabase } = require('../core/supabase');

async function createDealRoom({ task_id = null, client_name, client_email = null, proposal_html, total_usd = null, days = 14 }) {
  const token = crypto.randomBytes(16).toString('hex');
  const expires_at = new Date(Date.now() + days * 86400 * 1000).toISOString();
  await supabase.from('deal_rooms').insert({
    token, task_id, client_name, client_email, proposal_html, total_usd, expires_at, status: 'sent'
  });
  const PUBLIC = process.env.PUBLIC_URL || 'https://fractal-virtual-team.vercel.app';
  return { token, url: `${PUBLIC}/deal/${token}`, expires_at };
}

async function getDealRoom(token) {
  const { data } = await supabase.from('deal_rooms').select('*').eq('token', token).maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { ...data, status: 'expired' };
  // increment views
  supabase.from('deal_rooms').update({ views: (data.views || 0) + 1, status: data.status === 'sent' ? 'viewed' : data.status })
    .eq('token', token).then(() => {}).catch(() => {});
  return data;
}

async function acceptDealRoom(token, signed_name) {
  await supabase.from('deal_rooms').update({
    status: 'accepted', signed_name, signed_at: new Date().toISOString()
  }).eq('token', token);
  // Broadcast a celebration
  try { global.io?.emit('chat_bubble', { agent: 'mariana', text: `🎉 ${signed_name} firmó el deal!`, kind: 'deal-accepted', ts: Date.now() }); } catch {}
  try { global.io?.emit('quote_accepted', { source: 'deal-room', signed_name }); } catch {}
}

module.exports = { createDealRoom, getDealRoom, acceptDealRoom };
