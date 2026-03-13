// Dashboard component
import { calculateBMI, getBMIClass, formatDate } from './utils.js';

export class Dashboard {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.profile = null;
    this.insights = null;
  }

  async load() {
    try {
      this.showSkeleton();
      const [profile, insights] = await Promise.all([
        this.api.getHealthProfile().catch(() => null),
        this.api.getAIInsights().catch(() => null),
      ]);
      
      this.profile = profile;
      this.insights = insights;
      this.render();
    } catch (error) {
      this.showError('Failed to load dashboard data');
    }
  }

  showSkeleton() {
    this.container.innerHTML = `
      <div class="dashboard loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    `;
  }

  render() {
    if (!this.profile) {
      this.container.innerHTML = `
        <div class="empty-state">
          <h3>Welcome to Counting Calories</h3>
          <p>Complete your health profile to see personalized insights and tracking.</p>
          <button class="btn-primary" id="create-profile-btn">Create Profile</button>
        </div>
      `;
      
      const btn = this.container.querySelector('#create-profile-btn');
      btn?.addEventListener('click', () => {
        if (this.onCreateProfile) this.onCreateProfile();
      });
      return;
    }

    const bmi = this.profile.bmi || calculateBMI(this.profile.currentWeightKg, this.profile.heightCm);
    const bmiClass = this.profile.bmiClass || getBMIClass(bmi);
    const wellnessScore = this.profile.wellnessScore || 0;
    const progressPercent = this.profile.progressPercent || 0;
    const nextMilestonePercent = this.profile.nextMilestonePercent || null;

    this.container.innerHTML = `
      <div class="dashboard">
        <!-- Header Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">BMI</div>
            <div class="stat-value">${bmi ? bmi.toFixed(1) : '—'}</div>
            <div class="stat-class ${this.getBMIClassColor(bmiClass)}">${bmiClass}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Wellness Score</div>
            <div class="stat-value">${wellnessScore}</div>
            <div class="wellness-bar">
              <div class="wellness-fill" style="width: ${wellnessScore}%"></div>
            </div>
            <div class="stat-detail">Out of 100</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Goal Progress</div>
            <div class="stat-value">${progressPercent.toFixed(0)}%</div>
            ${this.renderProgressBar(progressPercent)}
            <div class="stat-detail">${this.getProgressText()}</div>
            ${nextMilestonePercent !== null && nextMilestonePercent > progressPercent ? `<div class="milestone-text">🎯 Next milestone: ${nextMilestonePercent.toFixed(0)}%</div>` : ''}
          </div>

          <div class="stat-card">
            <div class="stat-label">Current / Target</div>
            <div class="stat-value">
              ${this.profile.currentWeightKg?.toFixed(1) || '—'} / 
              ${this.profile.targetWeightKg?.toFixed(1) || '—'} kg
            </div>
            <div class="stat-detail">${this.getWeightDifferenceText()} remaining</div>
          </div>
        </div>

        <!-- Streaks -->
        ${this.renderStreaks()}

        <!-- AI Insights -->
        ${this.renderInsights()}

        <!-- Quick Actions -->
        <div class="quick-actions">
          <button class="action-btn" id="add-weight-btn">Log Weight</button>
          <button class="action-btn" id="add-activity-btn">Log Activity</button>
          <button class="action-btn" id="refresh-insights-btn">Refresh Insights</button>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  renderProgressBar(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    return `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${clamped}%"></div>
      </div>
    `;
  }

  renderInsights() {
    const reason = this.insights?.reason;
    if (!this.insights || !this.insights.recommendations?.length) {
      const messages = {
        no_profile: 'Complete your health profile to receive personalized AI insights.',
        no_consent: 'Grant consent for AI data usage in Privacy Settings to receive personalized insights.',
        no_api_key: 'AI service is not configured. Add <code>OPENAI_API_KEY</code> to the backend <code>.env</code> file.',
        unavailable: 'AI service is temporarily unavailable. Your insights will appear here once the service is back.',
      };
      const msg = messages[reason] || (reason === 'ok'
        ? 'No insights yet – try refreshing or add more data to your profile.'
        : 'Complete your health profile and enable AI insights in Privacy Settings.');
      return `
        <div class="insights-section">
          <h3>AI Insights</h3>
          <div class="insight-placeholder">
            <p>${msg}</p>
          </div>
        </div>
      `;
    }

    const recommendations = this.insights.recommendations.slice(0, 3);
    
    return `
      <div class="insights-section">
        <div class="section-header">
          <h3>AI Insights</h3>
          <span class="insight-badge">${recommendations.length} recommendations</span>
        </div>
        <div class="insights-list">
          ${recommendations.map(rec => this.renderInsightCard(rec)).join('')}
        </div>
      </div>
    `;
  }

  renderInsightCard(recommendation) {
    const priorityClass = recommendation.priority || 'medium';
    const priorityLabel = {
      high: 'High Priority',
      medium: 'Medium Priority',
      low: 'Low Priority'
    }[priorityClass] || 'Medium Priority';

    const text = recommendation.text || recommendation.recommendation || '';
    const preview = text.length > 160 ? text.substring(0, 160).trimEnd() + '…' : text;
    const hasMore = text.length > 160;

    return `
      <details class="insight-card priority-${priorityClass}">
        <summary class="insight-summary">
          <span class="priority-badge">${priorityLabel}</span>
          <span class="insight-preview">${preview}</span>
        </summary>
        ${hasMore ? `<div class="insight-full-content">${text}</div>` : ''}
      </details>
    `;
  }

  renderStreaks() {
    const activityStreak = this.profile.activityStreakDays || 0;
    const habitStreak = this.profile.habitStreakDays || 0;
    if (!activityStreak && !habitStreak) return '';
    return `
      <div class="streaks-row">
        ${activityStreak > 0 ? `<div class="streak-badge">${activityStreak}-day activity streak</div>` : ''}
        ${habitStreak > 0 ? `<div class="streak-badge">${habitStreak}-day habit streak</div>` : ''}
      </div>
    `;
  }

  getBMIClassColor(bmiClass) {
    const map = {
      'Underweight': 'bmi-underweight',
      'Normal weight': 'bmi-normal',
      'Overweight': 'bmi-overweight',
      'Obese': 'bmi-obese',
      'Invalid': 'bmi-invalid'
    };
    return map[bmiClass] || '';
  }

  getProgressText() {
    if (!this.profile.primaryGoal) return '';
    
    const goalMap = {
      lose_weight: 'weight loss',
      gain_weight: 'weight gain',
      maintain: 'maintenance',
      build_muscle: 'muscle building',
      improve_fitness: 'fitness improvement'
    };

    return `toward ${goalMap[this.profile.primaryGoal] || 'your goal'}`;
  }

  getWeightDifferenceText() {
    const current = this.profile.currentWeightKg;
    const target = this.profile.targetWeightKg;
    
    if (!current || !target) return '';
    
    const diff = Math.abs(current - target);
    return `${diff.toFixed(1)} kg`;
  }

  attachListeners() {
    const addWeightBtn = this.container.querySelector('#add-weight-btn');
    const addActivityBtn = this.container.querySelector('#add-activity-btn');
    const refreshBtn = this.container.querySelector('#refresh-insights-btn');

    addWeightBtn?.addEventListener('click', () => {
      if (this.onAddWeight) this.onAddWeight();
    });

    addActivityBtn?.addEventListener('click', () => {
      if (this.onAddActivity) this.onAddActivity();
    });

    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await this.load();
      refreshBtn.disabled = false;
    });
  }

  showError(message) {
    this.container.innerHTML = `
      <div class="error-state">
        <p class="error-message">${message}</p>
        <button class="btn-secondary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
