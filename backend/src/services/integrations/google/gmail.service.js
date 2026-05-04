// Gmail API Service — Send/receive on proyectosfractalmx@gmail.com
// Scopes needed: gmail.send, gmail.readonly, gmail.modify

const axios = require('axios');
const googleAuth = require('./auth.service');

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const USER_ID = 'me';

class GmailService {
  isAvailable() { return googleAuth.isAvailable(); }

  /**
   * Send email via Gmail API (bypasses SMTP restrictions)
   */
  async sendEmail({ to, subject, html, text, fromName = 'Fractal MX' }) {
    if (!this.isAvailable()) throw new Error('Gmail API not configured');

    const from = `"${fromName}" <${process.env.PROYECTOS_GMAIL || 'proyectosfractalmx@gmail.com'}>`;
    const emailContent = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html || text
    ].join('\n');

    const encoded = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const headers = await googleAuth.authHeaders();
    const response = await axios.post(`${BASE_URL}/users/${USER_ID}/messages/send`, { raw: encoded }, { headers });

    console.log(`[Gmail] ✅ Sent to ${to} — ID: ${response.data.id}`);
    return { ok: true, messageId: response.data.id };
  }

  /**
   * Search emails by query
   */
  async searchEmails(query, maxResults = 10) {
    if (!this.isAvailable()) return [];
    const headers = await googleAuth.authHeaders();
    const response = await axios.get(`${BASE_URL}/users/${USER_ID}/messages`, {
      headers,
      params: { q: query, maxResults }
    });
    return response.data.messages || [];
  }

  /**
   * Get full email with attachments info
   */
  async getMessage(messageId) {
    if (!this.isAvailable()) return null;
    const headers = await googleAuth.authHeaders();
    const response = await axios.get(`${BASE_URL}/users/${USER_ID}/messages/${messageId}`, {
      headers,
      params: { format: 'full' }
    });

    const msg = response.data;
    const headerMap = Object.fromEntries((msg.payload.headers || []).map(h => [h.name.toLowerCase(), h.value]));

    // Extract attachments
    const attachments = [];
    const findAttachments = (parts) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            name: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size
          });
        }
        if (part.parts) findAttachments(part.parts);
      }
    };
    findAttachments(msg.payload.parts);

    return {
      id: msg.id,
      from: headerMap.from,
      subject: headerMap.subject,
      date: headerMap.date,
      snippet: msg.snippet,
      attachments
    };
  }

  /**
   * Download attachment data
   */
  async getAttachment(messageId, attachmentId) {
    if (!this.isAvailable()) return null;
    const headers = await googleAuth.authHeaders();
    const response = await axios.get(
      `${BASE_URL}/users/${USER_ID}/messages/${messageId}/attachments/${attachmentId}`,
      { headers }
    );
    return Buffer.from(response.data.data, 'base64');
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId) {
    if (!this.isAvailable()) return;
    const headers = await googleAuth.authHeaders();
    await axios.post(`${BASE_URL}/users/${USER_ID}/messages/${messageId}/modify`, {
      removeLabelIds: ['UNREAD']
    }, { headers });
  }
}

module.exports = new GmailService();
