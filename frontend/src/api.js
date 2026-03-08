// API communication module
export class API {
  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    this.token = localStorage.getItem('ndli_access_token') || '';
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('ndli_access_token', token);
  }

  getToken() {
    return this.token;
  }

  setBaseURL(url) {
    this.baseURL = url;
  }

  async request(endpoint, options = {}, _isRetry = false) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
      credentials: 'include',
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, config);

    if (response.status === 401 && !_isRetry) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.request(endpoint, options, true);
      }
      this.clearAuth();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw Object.assign(new Error('Session expired'), { status: 401 });
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      try {
        error.data = await response.json();
      } catch {}
      throw error;
    }

    return response.json();
  }

  async refreshTokens() {
    const refreshToken = localStorage.getItem('ndli_refresh_token');
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        credentials: 'include',
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (data.accessToken) {
        this.setToken(data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  clearAuth() {
    this.token = '';
    localStorage.removeItem('ndli_access_token');
    localStorage.removeItem('ndli_refresh_token');
  }

  async exchangeOAuthCode(code) {
    const response = await fetch(
      `${this.baseURL}/auth/oauth/exchange?code=${encodeURIComponent(code)}`,
      { credentials: 'include' },
    );
    if (!response.ok) throw new Error('OAuth code exchange failed');
    return response.json();
  }

  // Health check
  async checkHealth() {
    const response = await fetch(`${this.baseURL}/health`);
    return response.json();
  }

  // Health profile endpoints
  async getHealthProfile() {
    return this.request('/health-profile');
  }

  async updateHealthProfile(data) {
    return this.request('/health-profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async grantConsent() {
    return this.request('/health-profile/consent', { method: 'POST' });
  }

  async revokeConsent() {
    return this.request('/health-profile/revoke-consent', { method: 'POST' });
  }

  // Privacy settings
  async getPrivacySettings() {
    return this.request('/privacy-settings');
  }

  async updatePrivacySettings(data) {
    return this.request('/privacy-settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Export data
  async exportData() {
    return this.request('/health-profile/export');
  }

  // Weight history
  async getWeightHistory() {
    return this.request('/health-profile/weight-history');
  }

  async addWeightEntry(weightKg) {
    return this.request('/health-profile/weight', {
      method: 'POST',
      body: JSON.stringify({ weightKg }),
    });
  }

  // Activity
  async getActivityEntries() {
    return this.request('/health-profile/activity-entries');
  }

  async addActivityEntry(data) {
    return this.request('/health-profile/activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Wellness history
  async getWellnessHistory(days = 30) {
    const safeDays = Number.isFinite(days) ? days : 30;
    return this.request(`/health-profile/wellness-history?days=${encodeURIComponent(safeDays)}`);
  }

  // Summary (weekly/monthly)
  async getSummary(period = 'week') {
    return this.request(`/health-profile/summary?period=${encodeURIComponent(period)}`);
  }

  // AI insights – fetches the latest single insight and parses the free-form
  // text into individual recommendation objects that the dashboard/comparison
  // view components expect under the `recommendations` key.
  async getAIInsights() {
    const data = await this.request('/ai/insight');
    if (!data.success || !data.insight) {
      return { recommendations: [], reason: data.reason || 'unavailable', message: data.message || '' };
    }
    const { response, priority, fromCache, createdAt } = data.insight;
    return {
      recommendations: this._parseInsightRecommendations(response, priority, fromCache, createdAt),
      fromCache,
      createdAt,
      reason: 'ok',
    };
  }

  // Parse numbered or paragraph-separated AI response into individual cards.
  _parseInsightRecommendations(text, priority, fromCache, createdAt) {
    if (!text) return [];
    // Try numbered items like "1. ...\n2. ...\n3. ..."
    const sections = [];
    const regex = /(?:^|\n)\d+\.\s+([\s\S]*?)(?=\n\d+\.|$)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const s = match[1].trim();
      if (s) sections.push(s);
    }
    if (sections.length >= 2) {
      const priorities = ['high', 'medium', 'low'];
      return sections.map((s, i) => ({
        text: s,
        priority: priorities[i] || 'low',
        fromCache,
        createdAt,
      }));
    }
    // Fallback: split by double newlines (paragraphs)
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length >= 2) {
      const priorities = ['high', 'medium', 'low'];
      return paragraphs.slice(0, 3).map((p, i) => ({
        text: p,
        priority: priorities[i] || priority || 'medium',
        fromCache,
        createdAt,
      }));
    }
    // Last resort: whole text as a single card
    return [{ text, priority: priority || 'medium', fromCache, createdAt }];
  }

  // Delete the authenticated user's account and all associated data
  async deleteAccount() {
    return this.request('/auth/account', { method: 'DELETE' });
  }

  // Two-Factor Authentication
  async get2FAStatus() {
    return this.request('/auth/2fa/status');
  }

  async generate2FA() {
    return this.request('/auth/2fa/generate', { method: 'POST' });
  }

  async enable2FA(token) {
    return this.request('/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async disable2FA(token) {
    return this.request('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async verify2FALogin(email, password, token) {
    const response = await fetch(`${this.baseURL}/auth/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, token }),
      credentials: 'include',
    });
    if (!response.ok) {
      let errorMessage = '2FA verification failed';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    const data = await response.json();
    if (data.accessToken) {
      this.setToken(data.accessToken);
    }
    if (data.refreshToken) {
      localStorage.setItem('ndli_refresh_token', data.refreshToken);
    }
    return data;
  }

  // Authentication endpoints
  async register(email, password) {
    // Use fetch directly since we don't have a token yet
    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Registration failed';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use default error
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async login(email, password) {
    // Use fetch directly since we don't have a token yet
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use default error
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.accessToken) {
      this.setToken(data.accessToken);
    }
    if (data.refreshToken) {
      localStorage.setItem('ndli_refresh_token', data.refreshToken);
    }
    return data;
  }

  async resendVerification(email) {
    const response = await fetch(`${this.baseURL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to resend verification email';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async verifyEmail(code) {
    const response = await fetch(`${this.baseURL}/auth/verify-email?code=${code}`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Verification failed';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use default error
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async forgotPassword(email) {
    const response = await fetch(`${this.baseURL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send reset email';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async resetPassword(token, newPassword) {
    const response = await fetch(`${this.baseURL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Password reset failed';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }

    return response.json();
  }
}
