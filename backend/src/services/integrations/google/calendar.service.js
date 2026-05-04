// Google Calendar API — Sofia schedules meetings, Mariana coordinates
const axios = require('axios');
const googleAuth = require('./auth.service');

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

class CalendarService {
  isAvailable() { return googleAuth.isAvailable(); }

  /**
   * List upcoming events
   */
  async listEvents(calendarId = 'primary', maxResults = 10) {
    if (!this.isAvailable()) return [];
    const headers = await googleAuth.authHeaders();
    const response = await axios.get(`${BASE_URL}/calendars/${calendarId}/events`, {
      headers,
      params: {
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      }
    });
    return response.data.items || [];
  }

  /**
   * Create event
   */
  async createEvent(event, calendarId = 'primary') {
    if (!this.isAvailable()) throw new Error('Calendar API not configured');
    const headers = await googleAuth.authHeaders();
    const response = await axios.post(`${BASE_URL}/calendars/${calendarId}/events`, event, { headers });
    console.log(`[Calendar] ✅ Event created: "${event.summary}"`);
    return response.data;
  }

  /**
   * Quick event from natural language description
   */
  async quickEvent(summary, startDateTime, endDateTime, attendees = []) {
    return this.createEvent({
      summary,
      start: { dateTime: startDateTime, timeZone: 'America/Mexico_City' },
      end: { dateTime: endDateTime, timeZone: 'America/Mexico_City' },
      attendees: attendees.map(email => ({ email })),
      reminders: { useDefault: true }
    });
  }
}

module.exports = new CalendarService();
