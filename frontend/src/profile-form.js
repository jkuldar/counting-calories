// Profile form component
import { 
  validatePositiveNumber, 
  validateAge,
  getErrorMessage,
  showLoading,
  hideLoading,
  showToast
} from './utils.js';

export class ProfileForm {
  constructor(container, api, onSave) {
    this.container = container;
    this.api = api;
    this.onSave = onSave;
    this.errors = {};
    this.render();
    this.attachListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="profile-page">
        <h2 class="page-title">Health Profile</h2>
        <div class="profile-form">
          <form id="profile-form">
          <!-- Demographics -->
          <section class="form-section">
            <h3>Demographics</h3>
            <div class="form-grid">
              <label>
                <span>Age *</span>
                <input type="number" name="age" min="13" max="120" required />
                <span class="error" data-field="age"></span>
              </label>
              <label>
                <span>Gender</span>
                <select name="gender">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
            </div>
          </section>

          <!-- Physical Measurements -->
          <section class="form-section">
            <h3>Physical Measurements</h3>
            <div class="form-grid">
              <label class="metric-input">
                <span>Height (cm) *</span>
                <input type="number" name="heightCm" step="0.1" min="50" max="300" required />
                <span class="error" data-field="heightCm"></span>
              </label>
              <label>
                <span>Current Weight (kg) *</span>
                <input type="number" name="currentWeightKg" step="0.1" min="20" max="500" required />
                <span class="error" data-field="currentWeightKg"></span>
              </label>
              <label>
                <span>Target Weight (kg)</span>
                <input type="number" name="targetWeightKg" step="0.1" min="20" max="500" />
                <span class="error" data-field="targetWeightKg"></span>
              </label>
            </div>
          </section>

          <!-- Lifestyle -->
          <section class="form-section">
            <h3>Lifestyle</h3>
            <div class="form-grid">
              <label>
                <span>Activity Level</span>
                <select name="activityLevel">
                  <option value="">Select...</option>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Lightly Active</option>
                  <option value="moderate">Moderately Active</option>
                  <option value="active">Active</option>
                  <option value="very_active">Very Active</option>
                </select>
              </label>
              <label>
                <span>Sleep (hours/day)</span>
                <input type="number" name="sleepHoursPerDay" step="0.5" min="0" max="24" />
              </label>
              <label>
                <span>Stress Level</span>
                <select name="stressLevel">
                  <option value="">Select...</option>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                <span>Fitness Level</span>
                <select name="fitnessLevel">
                  <option value="">Select...</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label>
                <span>Occupation Type</span>
                <select name="occupationType">
                  <option value="">Select...</option>
                  <option value="desk">Desk / Office work</option>
                  <option value="physical">Physical / Manual work</option>
                  <option value="mixed">Mixed</option>
                  <option value="student">Student</option>
                  <option value="retired">Retired / Not working</option>
                </select>
              </label>
            </div>
          </section>

          <!-- Dietary Preferences -->
          <section class="form-section">
            <h3>Dietary Preferences & Restrictions</h3>
            <label>
              <span>Dietary Preferences (comma-separated)</span>
              <input type="text" name="dietaryPreferences" placeholder="e.g., vegetarian, vegan, keto" />
              <small>Examples: vegetarian, vegan, pescatarian, keto, paleo</small>
            </label>
            <label>
              <span>Allergies (comma-separated)</span>
              <input type="text" name="allergies" placeholder="e.g., nuts, dairy, shellfish" />
            </label>
            <label>
              <span>Dietary Restrictions (comma-separated)</span>
              <input type="text" name="restrictions" placeholder="e.g., gluten-free, lactose-free" />
            </label>
          </section>

          <!-- Goals -->
          <section class="form-section">
            <h3>Goals</h3>
            <div class="form-grid">
              <label>
                <span>Primary Goal</span>
                <select name="primaryGoal">
                  <option value="">Select...</option>
                  <option value="lose_weight">Lose Weight</option>
                  <option value="gain_weight">Gain Weight</option>
                  <option value="maintain">Maintain Weight</option>
                  <option value="build_muscle">Build Muscle</option>
                  <option value="improve_fitness">Improve Fitness</option>
                </select>
              </label>
              <label>
                <span>Target Date</span>
                <input type="date" name="targetDate" />
                <span class="error" data-field="targetDate"></span>
              </label>
              <label>
                <span>Weekly Activity Goal (times/week)</span>
                <input type="number" name="weeklyActivityGoal" min="0" max="21" />
              </label>
            </div>
          </section>

          <!-- Fitness Assessment -->
          <section class="form-section">
            <h3>Fitness Assessment</h3>
            <div class="form-grid">
              <label>
                <span>Preferred Exercise Environment</span>
                <select name="exerciseEnvironment">
                  <option value="">Select...</option>
                  <option value="home">Home</option>
                  <option value="gym">Gym</option>
                  <option value="outdoors">Outdoors</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label>
                <span>Preferred Time of Day</span>
                <select name="exerciseTimeOfDay">
                  <option value="">Select...</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="no_preference">No preference</option>
                </select>
              </label>
              <label>
                <span>Typical Session Duration</span>
                <select name="sessionDuration">
                  <option value="">Select...</option>
                  <option value="15-30min">15 – 30 minutes</option>
                  <option value="30-60min">30 – 60 minutes</option>
                  <option value="60+min">60+ minutes</option>
                </select>
              </label>
              <label>
                <span>Endurance (run/walk without stopping, minutes)</span>
                <input type="number" name="enduranceMinutes" min="0" max="600" placeholder="e.g., 20" />
              </label>
              <label>
                <span>Max Push-ups (in one set)</span>
                <input type="number" name="pushUpsCount" min="0" max="500" placeholder="e.g., 15" />
              </label>
              <label>
                <span>Max Squats (in one set)</span>
                <input type="number" name="squatsCount" min="0" max="500" placeholder="e.g., 30" />
              </label>
            </div>
            <label style="margin-top:0.75rem;display:block;">
              <span>Exercise Types (select all that apply)</span>
              <div class="checkbox-group" style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.5rem;">
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="cardio" />
                  <span>Cardio</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="strength" />
                  <span>Strength</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="flexibility" />
                  <span>Flexibility / Yoga</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="sports" />
                  <span>Sports</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="hiit" />
                  <span>HIIT</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="cycling" />
                  <span>Cycling</span>
                </label>
                <label class="checkbox-label checkbox-inline">
                  <input type="checkbox" name="exerciseTypes" value="swimming" />
                  <span>Swimming</span>
                </label>
              </div>
            </label>
          </section>

          <!-- Medical Information -->
          <section class="form-section">
            <h3>Medical Information (Optional)</h3>
            <label>
              <span>Medical Conditions (comma-separated)</span>
              <input type="text" name="medicalConditions" placeholder="e.g., diabetes, hypertension" />
              <small>Stored securely, not shared with AI by default</small>
            </label>
            <label>
              <span>Medications (comma-separated)</span>
              <input type="text" name="medications" placeholder="e.g., metformin, lisinopril" />
              <small>Stored securely, not shared with AI by default</small>
            </label>
          </section>

          <!-- Consent -->
          <section class="form-section">
            <label class="checkbox-label">
              <input type="checkbox" name="consentGiven" required />
              <span>I consent to storing my health data securely (required)</span>
            </label>
          </section>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Save Profile</button>
            <button type="button" class="btn-secondary" id="cancel-profile">Cancel</button>
          </div>
        </form>
        </div>
      </div>
    `;
  }

  attachListeners() {
    const form = this.container.querySelector('#profile-form');
    const unitBtns = this.container.querySelectorAll('.unit-btn');
    const cancelBtn = this.container.querySelector('#cancel-profile');
    const targetDateInput = form.querySelector('[name="targetDate"]');

    if (targetDateInput) {
      targetDateInput.min = this.getTodayDateString();
      targetDateInput.addEventListener('change', () => {
        if (targetDateInput.value && targetDateInput.value < this.getTodayDateString()) {
          this.setFieldError('targetDate', 'Target date cannot be in the past.');
        } else {
          this.clearFieldError('targetDate');
        }
      });
    }

    // Unit toggle
    unitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        this.toggleUnits(unit);
        unitBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Form submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit(form);
    });
  }

  toggleUnits(unit) {
    this.useMetric = unit === 'metric';
    const metricInputs = this.container.querySelectorAll('.metric-input');
    const imperialInputs = this.container.querySelectorAll('.imperial-input');

    if (this.useMetric) {
      metricInputs.forEach(el => {
        el.style.display = '';
        // Enable required for visible inputs
        const inputs = el.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
          if (input.name === 'heightCm' || input.name === 'currentWeightKg') {
            input.required = true;
          }
        });
      });
      imperialInputs.forEach(el => {
        el.style.display = 'none';
        // Disable required for hidden inputs
        const inputs = el.querySelectorAll('input[type="number"]');
        inputs.forEach(input => input.required = false);
      });
    } else {
      metricInputs.forEach(el => {
        el.style.display = 'none';
        // Disable required for hidden inputs
        const inputs = el.querySelectorAll('input[type="number"]');
        inputs.forEach(input => input.required = false);
      });
      imperialInputs.forEach(el => {
        el.style.display = '';
        // Enable required for visible inputs
        const inputs = el.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
          if (input.name === 'heightFeet' || input.name === 'heightInches' || input.name === 'currentWeightLbs') {
            input.required = true;
          }
        });
      });
    }
  }

  async handleSubmit(form) {
    const formData = new FormData(form);
    const data = {};
    
    this.errors = {};
    this.container.querySelectorAll('.error').forEach(el => el.textContent = '');

    // Parse form data
    for (let [key, value] of formData.entries()) {
      if (value === '' && key !== 'consentGiven') continue;
      
      // Boolean (checkbox)
      if (key === 'consentGiven') {
        data[key] = formData.get(key) === 'on' || formData.get(key) === 'true';
      }
      // Multi-value checkboxes (exerciseTypes)
      else if (key === 'exerciseTypes') {
        // handled below
      }
      // Arrays (comma-separated)
      else if (['dietaryPreferences', 'allergies', 'restrictions', 'medicalConditions', 'medications'].includes(key)) {
        data[key] = value.split(',').map(v => v.trim()).filter(v => v);
      }
      // Numbers
      else if (['age', 'heightCm', 'currentWeightKg', 'targetWeightKg', 'sleepHoursPerDay', 'weeklyActivityGoal',
                'enduranceMinutes', 'pushUpsCount', 'squatsCount'].includes(key)) {
        data[key] = parseFloat(value);
      }
      // Strings
      else {
        data[key] = value;
      }
    }

    // Collect exerciseTypes from checkboxes
    data.exerciseTypes = formData.getAll('exerciseTypes');

    // Convert imperial to metric if needed
    if (!this.useMetric) {
      const feet = parseInt(formData.get('heightFeet')) || 0;
      const inches = parseInt(formData.get('heightInches')) || 0;
      if (feet || inches) {
        data.heightCm = feetInchesToCm(feet, inches);
      }

      const weightLbs = parseFloat(formData.get('currentWeightLbs'));
      if (weightLbs) {
        data.currentWeightKg = lbsToKg(weightLbs);
      }

      const targetLbs = parseFloat(formData.get('targetWeightLbs'));
      if (targetLbs) {
        data.targetWeightKg = lbsToKg(targetLbs);
      }
    }

    const targetDateInput = form.querySelector('[name="targetDate"]');
    if (targetDateInput && targetDateInput.value) {
      if (targetDateInput.value < this.getTodayDateString()) {
        this.setFieldError('targetDate', 'Target date cannot be in the past.');
      } else {
        this.clearFieldError('targetDate');
      }
    }

    // Validate required fields
    const hasErrors = Object.values(this.errors).some(e => e);
    if (hasErrors) {
      this.showError('Please fix the errors above');
      return;
    }

    // Check for BMI validity after conversion
    if (data.currentWeightKg && data.heightCm) {
      const heightM = data.heightCm / 100;
      const bmi = data.currentWeightKg / (heightM * heightM);
      if (bmi < 0 || bmi > 100) {
        this.showError('Invalid BMI calculated. Please check your height and weight values.');
        return;
      }
    }

    // Submit
    const submitBtn = form.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      const result = await this.api.updateHealthProfile(data);
      hideLoading(submitBtn);
      this.showSuccess('Profile saved successfully!');
      if (this.onSave) this.onSave(result);
    } catch (error) {
      hideLoading(submitBtn);
      this.showError(getErrorMessage(error));
    }
  }

  async loadProfile() {
    try {
      const [profile, twoFAStatus] = await Promise.all([
        this.api.getHealthProfile().catch(() => null),
        this.api.get2FAStatus().catch(() => ({ enabled: false })),
      ]);
      if (profile) this.fillForm(profile);
      this.renderSecuritySection(twoFAStatus.enabled);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  renderSecuritySection(twoFAEnabled) {
    // Remove any existing security section first
    const existing = this.container.querySelector('.security-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'security-section profile-form';
    section.innerHTML = `
      <section class="form-section">
        <h3>Security</h3>
        <div class="twofa-status" style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
          <span>Two-Factor Authentication (2FA)</span>
          <span class="consent-badge ${twoFAEnabled ? 'active' : 'inactive'}" id="twofa-badge">
            ${twoFAEnabled ? '✓ Enabled' : '✗ Disabled'}
          </span>
        </div>
        <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.9rem;">
          ${twoFAEnabled
            ? 'Your account is protected with an authenticator app.'
            : 'Add an extra layer of security by requiring a code from your authenticator app at login.'}
        </p>
        <div id="twofa-action-area">
          ${twoFAEnabled
            ? `<button class="btn-danger" id="disable-2fa-btn">Disable 2FA</button>`
            : `<button class="btn-primary" id="enable-2fa-btn">Set up 2FA</button>`}
        </div>
        <div id="twofa-setup-area" style="display:none;margin-top:1.5rem;"></div>
      </section>
    `;

    this.container.appendChild(section);
    this.attach2FAListeners(twoFAEnabled);
  }

  attach2FAListeners(twoFAEnabled) {
    if (!twoFAEnabled) {
      this.container.querySelector('#enable-2fa-btn')?.addEventListener('click', () => this.startEnable2FA());
    } else {
      this.container.querySelector('#disable-2fa-btn')?.addEventListener('click', () => this.showDisable2FA());
    }
  }

  async startEnable2FA() {
    const setupArea = this.container.querySelector('#twofa-setup-area');
    const enableBtn = this.container.querySelector('#enable-2fa-btn');
    if (enableBtn) { enableBtn.disabled = true; enableBtn.textContent = 'Loading...'; }

    try {
      const { qrCode, secret } = await this.api.generate2FA();

      setupArea.style.display = 'block';
      setupArea.innerHTML = `
        <div>
          <p style="margin-bottom:0.75rem;font-weight:500;">1. Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):</p>
          <img src="${qrCode}" alt="2FA QR Code" style="display:block;margin:0 auto 1rem;border:4px solid white;border-radius:8px;max-width:200px;" />
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">
            Can't scan? Enter this key manually: <code style="user-select:all;">${secret}</code>
          </p>
          <p style="font-weight:500;">2. Enter the 6-digit code from the app to confirm:</p>
          <div style="display:flex;gap:0.75rem;margin-top:0.75rem;align-items:flex-start;">
            <input
              type="text"
              id="twofa-confirm-token"
              placeholder="000000"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              style="letter-spacing:0.3em;font-size:1.2rem;text-align:center;width:130px;padding:0.5rem;"
            />
            <button class="btn-primary" id="confirm-enable-2fa-btn">Confirm & Enable</button>
            <button class="btn-secondary" id="cancel-enable-2fa-btn">Cancel</button>
          </div>
          <div id="twofa-enable-error" class="auth-error" style="display:none;margin-top:0.5rem;"></div>
        </div>
      `;

      if (enableBtn) { enableBtn.disabled = false; enableBtn.textContent = 'Set up 2FA'; }

      this.container.querySelector('#cancel-enable-2fa-btn').addEventListener('click', () => {
        setupArea.style.display = 'none';
        setupArea.innerHTML = '';
      });

      this.container.querySelector('#confirm-enable-2fa-btn').addEventListener('click', async () => {
        const token = this.container.querySelector('#twofa-confirm-token').value.trim();
        const confirmBtn = this.container.querySelector('#confirm-enable-2fa-btn');
        const errorEl = this.container.querySelector('#twofa-enable-error');
        errorEl.style.display = 'none';

        if (!token || token.length !== 6) {
          errorEl.textContent = 'Please enter the 6-digit code.';
          errorEl.style.display = 'block';
          return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Enabling...';

        try {
          await this.api.enable2FA(token);
          this.showSuccess('2FA enabled successfully!');
          this.renderSecuritySection(true);
        } catch (error) {
          errorEl.textContent = error.message || 'Invalid code. Please try again.';
          errorEl.style.display = 'block';
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm & Enable';
        }
      });
    } catch (error) {
      if (enableBtn) { enableBtn.disabled = false; enableBtn.textContent = 'Set up 2FA'; }
      this.showError(error.message || 'Failed to start 2FA setup');
    }
  }

  showDisable2FA() {
    const setupArea = this.container.querySelector('#twofa-setup-area');
    setupArea.style.display = 'block';
    setupArea.innerHTML = `
      <p style="margin-bottom:0.75rem;">Enter the 6-digit code from your authenticator app to disable 2FA:</p>
      <div style="display:flex;gap:0.75rem;align-items:flex-start;">
        <input
          type="text"
          id="twofa-disable-token"
          placeholder="000000"
          maxlength="6"
          inputmode="numeric"
          autocomplete="one-time-code"
          style="letter-spacing:0.3em;font-size:1.2rem;text-align:center;width:130px;padding:0.5rem;"
        />
        <button class="btn-danger" id="confirm-disable-2fa-btn">Disable 2FA</button>
        <button class="btn-secondary" id="cancel-disable-2fa-btn">Cancel</button>
      </div>
      <div id="twofa-disable-error" class="auth-error" style="display:none;margin-top:0.5rem;"></div>
    `;

    this.container.querySelector('#cancel-disable-2fa-btn').addEventListener('click', () => {
      setupArea.style.display = 'none';
      setupArea.innerHTML = '';
    });

    this.container.querySelector('#confirm-disable-2fa-btn').addEventListener('click', async () => {
      const token = this.container.querySelector('#twofa-disable-token').value.trim();
      const confirmBtn = this.container.querySelector('#confirm-disable-2fa-btn');
      const errorEl = this.container.querySelector('#twofa-disable-error');
      errorEl.style.display = 'none';

      if (!token || token.length !== 6) {
        errorEl.textContent = 'Please enter the 6-digit code.';
        errorEl.style.display = 'block';
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Disabling...';

      try {
        await this.api.disable2FA(token);
        this.showSuccess('2FA disabled.');
        this.renderSecuritySection(false);
      } catch (error) {
        errorEl.textContent = error.message || 'Invalid code. Please try again.';
        errorEl.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Disable 2FA';
      }
    });
  }

  fillForm(profile) {
    const form = this.container.querySelector('#profile-form');

    if (!profile) return; // Handle null profile for new users

    // Some endpoints return { message, profile }
    const resolvedProfile = profile.profile ? profile.profile : profile;

    // Simple fields
    const fields = [
      'age',
      'gender',
      'heightCm',
      'currentWeightKg',
      'targetWeightKg',
      'activityLevel',
      'sleepHoursPerDay',
      'stressLevel',
      'fitnessLevel',
      'occupationType',
      'primaryGoal',
      'weeklyActivityGoal',
      'exerciseEnvironment',
      'exerciseTimeOfDay',
      'sessionDuration',
      'enduranceMinutes',
      'pushUpsCount',
      'squatsCount',
    ];

    fields.forEach(field => {
      const input = form.querySelector(`[name="${field}"]`);
      if (!input) return;
      const value = resolvedProfile[field];
      if (value !== null && value !== undefined) {
        input.value = value;
      }
    });

    const targetDateInput = form.querySelector('[name="targetDate"]');
    if (targetDateInput && resolvedProfile.targetDate) {
      const date = new Date(resolvedProfile.targetDate);
      if (!Number.isNaN(date.getTime())) {
        targetDateInput.value = date.toISOString().split('T')[0];
      }
    }

    const consentInput = form.querySelector('[name="consentGiven"]');
    if (consentInput) {
      consentInput.checked = Boolean(resolvedProfile.consentGiven);
    }

    // Array fields
    const arrayFields = ['dietaryPreferences', 'allergies', 'restrictions', 'medicalConditions', 'medications'];
    arrayFields.forEach(field => {
      const input = form.querySelector(`[name="${field}"]`);
      if (input && Array.isArray(resolvedProfile[field])) {
        input.value = resolvedProfile[field].join(', ');
      }
    });

    // Checkbox array: exerciseTypes
    if (Array.isArray(resolvedProfile.exerciseTypes)) {
      form.querySelectorAll('[name="exerciseTypes"]').forEach(cb => {
        cb.checked = resolvedProfile.exerciseTypes.includes(cb.value);
      });
    }
  }

  showError(message) {
    showToast(message, 'error');
  }

  showSuccess(message) {
    showToast(message, 'success');
  }

  getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  setFieldError(field, message) {
    this.errors[field] = message;
    const errorEl = this.container.querySelector(`.error[data-field="${field}"]`);
    if (errorEl) errorEl.textContent = message;
  }

  clearFieldError(field) {
    this.errors[field] = '';
    const errorEl = this.container.querySelector(`.error[data-field="${field}"]`);
    if (errorEl) errorEl.textContent = '';
  }
}
