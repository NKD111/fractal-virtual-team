// backend/src/services/integrations/gcal.js
// Google Calendar para Sofia. Usa OAuth refresh token guardado en
// integration_tokens (provider='google'). Si no configurado, devuelve
// graceful fallback con mock event.

const axios = require('axios');
const { supabase } = require('../../core/supabase');

async function getAccessToken() {
  const { data } = await supabase.from('integration_tokens')
    .select('*').eq('provider', 'google').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error('Google not connected — POST /api/integrations/google/connect first');

  // Refresh si está vencido
  const expires = data.expires_at ? new Date(data.expires_at) : null;
  if (expires && expires.getTime() - Date.now() < 60_000) {
    const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: data.refresh,
      grant_type: 'refresh_token'
    }));
    const newAccess = r.data.access_token;
    const newExp = new Date(Date.now() + (r.data.expires_in || 3600) * 1000).toISOString();
    await supabase.from('integration_tokens').update({ access: newAccess, expires_at: newExp }).eq('id', data.id);
    return newAccess;
  }
  return data.access;
}

/**
 * Crea evento en el calendario primario.
 * @param {object} args { summary, description, start_iso, end_iso, attendees? }
 */
async function createEvent({ summary, description, start_iso, end_iso, attendees = [] }) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return { ok: false, mock: true, error: 'GOOGLE_CLIENT_ID not configured', would_create: { summary, start_iso, end_iso } };
  }
  try {
    const token = await getAccessToken();
    const body = {
      summary, description,
      start: { dateTime: start_iso, timeZone: 'America/Mexico_City' },
      end:   { dateTime: end_iso,   timeZone: 'America/Mexico_City' },
      attendees: attendees.map(email => ({ email }))
    };
    const r = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      body,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return { ok: true, event_id: r.data.id, html_link: r.data.htmlLink };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

async function listUpcoming(maxResults = 10) {
  if (!process.env.GOOGLE_CLIENT_ID) return { ok: false, mock: true, events: [] };
  try {
    const token = await getAccessToken();
    const r = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      params: { maxResults, orderBy: 'startTime', singleEvents: true, timeMin: new Date().toISOString() },
      headers: { Authorization: `Bearer ${token}` }
    });
    return { ok: true, events: r.data.items || [] };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

function getOAuthUrl() {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) return null;
  const redirect = `${process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app'}/api/integrations/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', cid);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
  return url.toString();
}

async function handleOAuthCallback(code) {
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app'}/api/integrations/google/callback`,
    grant_type: 'authorization_code'
  }));
  const exp = new Date(Date.now() + (r.data.expires_in || 3600) * 1000).toISOString();
  await supabase.from('integration_tokens').insert({
    provider: 'google', access: r.data.access_token, refresh: r.data.refresh_token,
    expires_at: exp, scopes: r.data.scope?.split(' ') || []
  });
  return { ok: true };
}

module.exports = { createEvent, listUpcoming, getOAuthUrl, handleOAuthCallback };
