// Google OAuth2 Service — shared auth for Gmail, Drive, Calendar
// Setup: https://console.cloud.google.com/apis/credentials
// Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

const axios = require('axios');

class GoogleAuthService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    this.available = !!(this.clientId && this.clientId !== 'PENDING' && this.refreshToken && this.refreshToken !== 'PENDING');
    this._accessToken = null;
    this._tokenExpiry = null;
  }

  isAvailable() { return this.available; }

  /**
   * Get valid access token (auto-refreshes)
   */
  async getAccessToken() {
    if (!this.available) throw new Error('Google credentials not configured');

    if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry - 60000) {
      return this._accessToken;
    }

    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token'
    });

    this._accessToken = response.data.access_token;
    this._tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    console.log('[GoogleAuth] ✅ Token refreshed');
    return this._accessToken;
  }

  /**
   * Authenticated axios headers
   */
  async authHeaders() {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
}

module.exports = new GoogleAuthService();
