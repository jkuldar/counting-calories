// Privacy settings and consent component
import { formatDateTime, getErrorMessage, showLoading, hideLoading, showToast, showConfirm } from './utils.js';

export class PrivacySettings {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.settings = null;
    this.profile = null;
  }

  async load() {
    try {
      const [settings, profile] = await Promise.all([
        this.api.getPrivacySettings().catch(() => null),
        this.api.getHealthProfile().catch(() => null),
      ]);

      this.settings = settings;
      this.profile = profile;
      this.render();
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
      this.showError('Failed to load privacy settings');
    }
  }

  render() {
    const consentGiven = this.profile?.consentGiven || false;
    const consentTimestamp = this.profile?.consentTimestamp;

    this.container.innerHTML = `
      <div class="privacy-settings">
        <h2>Privacy & Data Usage</h2>
        
        <!-- Consent Section -->
        <section class="settings-section">
          <div class="section-header">
            <h3>AI Data Usage Consent</h3>
            <span class="consent-badge ${consentGiven ? 'active' : 'inactive'}">
              ${consentGiven ? '✓ Consent Active' : '✗ Consent Not Given'}
            </span>
          </div>

          <div class="consent-info">
            <p>
              We use AI to provide personalized health insights and recommendations. 
              Your data is always <strong>anonymized</strong> and <strong>encrypted</strong>. 
              Personally identifiable information (PII) is removed before being sent to AI services.
            </p>
            
            ${consentTimestamp ? `
              <p class="consent-timestamp">
                Last updated: ${formatDateTime(consentTimestamp)}
              </p>
            ` : ''}
          </div>

          <div class="consent-actions">
            ${!consentGiven ? `
              <button class="btn-primary" id="grant-consent-btn">
                Give Consent
              </button>
            ` : `
              <button class="btn-danger" id="revoke-consent-btn">
                Revoke Consent
              </button>
            `}
          </div>

          <details class="consent-details">
            <summary>What data is sent to AI?</summary>
            <ul>
              <li>Demographics (age, gender) - <strong>not</strong> your name or email</li>
              <li>Physical measurements (height, weight, BMI)</li>
              <li>Lifestyle information (activity level, sleep, stress)</li>
              <li>Goals and preferences</li>
              <li>Progress metrics</li>
            </ul>
            <p><strong>Never sent:</strong> Email, name, exact medical conditions, or any PII.</p>
          </details>
        </section>

        <!-- Privacy Settings -->
        <section class="settings-section">
          <h3>Privacy Preferences</h3>
          
          <form id="privacy-form">
            <label class="checkbox-label">
              <input type="checkbox" name="shareWithAI" ${this.settings?.shareWithAI ? 'checked' : ''} />
              <span>
                <strong>Share data with AI for insights</strong>
                <small>Enable personalized recommendations</small>
              </span>
            </label>

            <label class="checkbox-label">
              <input type="checkbox" name="shareAnonymousData" ${this.settings?.shareAnonymousData ? 'checked' : ''} />
              <span>
                <strong>Share anonymous usage data</strong>
                <small>Help improve the platform (no personal information)</small>
              </span>
            </label>

            <label class="checkbox-label">
              <input type="checkbox" name="allowDataExport" ${this.settings?.allowDataExport !== false ? 'checked' : ''} />
              <span>
                <strong>Allow data export</strong>
                <small>Enable downloading your data</small>
              </span>
            </label>

            <h4>AI Prompt Inclusions</h4>
            <p class="setting-description">Choose what data to include in AI analysis:</p>

            <label class="checkbox-label">
              <input type="checkbox" name="includeWeight" ${this.settings?.includeWeight !== false ? 'checked' : ''} />
              <span>Include weight data</span>
            </label>

            <label class="checkbox-label">
              <input type="checkbox" name="includeActivity" ${this.settings?.includeActivity !== false ? 'checked' : ''} />
              <span>Include activity data</span>
            </label>

            <label class="checkbox-label">
              <input type="checkbox" name="includeDietary" ${this.settings?.includeDietary !== false ? 'checked' : ''} />
              <span>Include dietary preferences</span>
            </label>

            <label class="checkbox-label">
              <input type="checkbox" name="includeGoals" ${this.settings?.includeGoals !== false ? 'checked' : ''} />
              <span>Include goals and targets</span>
            </label>

            <div class="form-actions">
              <button type="submit" class="btn-primary">Save Preferences</button>
            </div>
          </form>
        </section>

        <!-- Data Export -->
        <section class="settings-section">
          <h3>Data Export</h3>
          <p>Download all your health data in JSON format.</p>
          
          <button class="btn-secondary" id="export-data-btn">
            📥 Export My Data
          </button>
        </section>

        <!-- Data Deletion (Placeholder) -->
        <section class="settings-section danger-zone">
          <h3>Danger Zone</h3>
          <p>Permanently delete your account and all associated data.</p>
          
          <button class="btn-danger" id="delete-account-btn">
            🗑️ Delete Account
          </button>
        </section>
      </div>
    `;

    this.attachListeners();
  }

  attachListeners() {
    const grantBtn = this.container.querySelector('#grant-consent-btn');
    const revokeBtn = this.container.querySelector('#revoke-consent-btn');
    const exportBtn = this.container.querySelector('#export-data-btn');
    const privacyForm = this.container.querySelector('#privacy-form');

    if (grantBtn) {
      grantBtn.addEventListener('click', () => this.handleConsent(true, grantBtn));
    }

    if (revokeBtn) {
      revokeBtn.addEventListener('click', () => this.handleConsent(false, revokeBtn));
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport(exportBtn));
    }

    const deleteBtn = this.container.querySelector('#delete-account-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDeleteAccount(deleteBtn));
    }

    if (privacyForm) {
      privacyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handlePrivacyUpdate(privacyForm);
      });
    }
  }

  async handleConsent(grant, button) {
    const action = grant ? 'grant' : 'revoke';
    const confirmMsg = grant 
      ? 'Are you sure you want to grant consent for AI data usage?'
      : 'Are you sure you want to revoke consent? You will no longer receive AI insights.';

    const confirmed = await showConfirm({
      title: grant ? 'Grant AI Consent' : 'Revoke AI Consent',
      message: confirmMsg,
      confirmText: grant ? 'Grant' : 'Revoke',
      cancelText: 'Cancel',
      type: grant ? 'default' : 'warning'
    });

    if (!confirmed) return;

    showLoading(button);

    try {
      if (grant) {
        await this.api.grantConsent();
      } else {
        await this.api.revokeConsent();
      }

      hideLoading(button);
      this.showSuccess(`Consent ${grant ? 'granted' : 'revoked'} successfully`);
      
      // Reload to update UI
      await this.load();
    } catch (error) {
      hideLoading(button);
      this.showError(getErrorMessage(error));
    }
  }

  async handlePrivacyUpdate(form) {
    const formData = new FormData(form);
    const settings = {};

    // Checkboxes
    const checkboxes = ['shareWithAI', 'shareAnonymousData', 'allowDataExport', 
                        'includeWeight', 'includeActivity', 'includeDietary', 'includeGoals'];
    
    checkboxes.forEach(name => {
      settings[name] = formData.has(name);
    });

    const submitBtn = form.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      await this.api.updatePrivacySettings(settings);
      hideLoading(submitBtn);
      this.showSuccess('Privacy preferences updated');
    } catch (error) {
      hideLoading(submitBtn);
      this.showError(getErrorMessage(error));
    }
  }

  async handleExport(button) {
    showLoading(button);

    try {
      const data = await this.api.exportData();
      hideLoading(button);

      // Create downloadable file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `health-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showSuccess('Data exported successfully');
    } catch (error) {
      hideLoading(button);
      this.showError(getErrorMessage(error));
    }
  }

  async handleDeleteAccount(button) {
    const confirmed = await showConfirm({
      title: 'Delete Account',
      message: 'Are you sure? This will permanently delete your account and ALL your health data. This cannot be undone.',
      confirmText: 'Delete My Account',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;

    const secondConfirm = await showConfirm({
      title: 'Final Confirmation',
      message: 'This action is irreversible. All your data will be permanently deleted. Continue?',
      confirmText: 'Yes, Delete Everything',
      cancelText: 'Keep My Account',
      type: 'warning',
    });
    if (!secondConfirm) return;

    showLoading(button);
    try {
      await this.api.deleteAccount();
      this.api.setToken('');
      window.location.reload();
    } catch (error) {
      hideLoading(button);
      this.showError(getErrorMessage(error));
    }
  }

  showError(message) {
    showToast(message, 'error');
  }

  showSuccess(message) {
    showToast(message, 'success');
  }
}
