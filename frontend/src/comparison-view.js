// Comparison View component
import { calculateBMI, getBMIClass, formatDate } from './utils.js';

export class ComparisonView {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.currentPeriod = 'week'; // 'week' or 'month'
    this.profile = null;
    this.insights = null;
  }

  async load() {
    try {
      this.showSkeleton();
      const [profile, weekSummary, monthSummary, insights] = await Promise.all([
        this.api.getHealthProfile().catch(() => null),
        this.api.getSummary('week').catch(() => null),
        this.api.getSummary('month').catch(() => null),
        this.api.getAIInsights().catch(() => null),
      ]);
      
      this.profile = profile;
      this.weekSummary = weekSummary;
      this.monthSummary = monthSummary;
      this.insights = insights;
      this.render();
    } catch (error) {
      this.showError('Failed to load comparison data');
    }
  }

  showSkeleton() {
    this.container.innerHTML = `
      <div class="comparison-view loading">
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
          <h3>No Profile Data</h3>
          <p>Create your health profile to see detailed comparisons and progress.</p>
        </div>
      `;
      return;
    }

    const currentSummary = this.currentPeriod === 'week' ? this.weekSummary : this.monthSummary;

    this.container.innerHTML = `
      <div class="comparison-view">
        <div class="comparison-header">
          <h2>Progress Comparison</h2>
          <div class="period-selector">
            <button class="period-btn ${this.currentPeriod === 'week' ? 'active' : ''}" data-period="week">
              Weekly
            </button>
            <button class="period-btn ${this.currentPeriod === 'month' ? 'active' : ''}" data-period="month">
              Monthly
            </button>
          </div>
        </div>

        <!-- Current vs Target Metrics -->
        <section class="comparison-section">
          <h3>Current vs Target</h3>
          <div class="metrics-comparison">
            ${this.renderMetricComparison('Weight', 
              this.profile.currentWeightKg, 
              this.profile.targetWeightKg, 
              'kg')}
            ${this.renderMetricComparison('BMI', 
              this.profile.bmi, 
              this.calculateTargetBMI(), 
              '')}
            ${this.renderMetricComparison('Activity Level', 
              this.getActivityLevelValue(this.profile.activityLevel), 
              this.getActivityLevelValue('active'), 
              '', 
              true)}
            ${this.renderMetricComparison('Wellness Score', 
              this.profile.wellnessScore, 
              100, 
              '/100')}
          </div>
        </section>

        <!-- Weekly/Monthly Progress Comparison -->
        <section class="comparison-section">
          <h3>${this.currentPeriod === 'week' ? 'Weekly' : 'Monthly'} Progress</h3>
          ${this.renderPeriodComparison(currentSummary)}
        </section>

        <!-- Health Trend Analysis -->
        <section class="comparison-section">
          <h3>Health Trend Analysis</h3>
          ${this.renderTrendAnalysis()}
        </section>

        <!-- AI Recommendations -->
        <section class="comparison-section">
          <h3>AI Recommendations</h3>
          ${this.renderAIRecommendations()}
        </section>
      </div>
    `;

    this.attachListeners();
  }

  renderMetricComparison(label, current, target, unit, isText = false) {
    if (current === null || current === undefined) {
      return `
        <div class="metric-comparison-card">
          <div class="metric-label">${label}</div>
          <div class="metric-values">
            <div class="metric-value">—</div>
          </div>
          <div class="metric-status">No data</div>
        </div>
      `;
    }

    if (!target && target !== 0) {
      return `
        <div class="metric-comparison-card">
          <div class="metric-label">${label}</div>
          <div class="metric-values">
            <div class="current-value">
              <span class="label">Current</span>
              <span class="value">${isText ? current : current.toFixed(1)}${unit}</span>
            </div>
          </div>
          <div class="metric-status">No target set</div>
        </div>
      `;
    }

    const currentVal = isText ? current : parseFloat(current);
    const targetVal = isText ? target : parseFloat(target);
    const diff = isText ? 0 : Math.abs(currentVal - targetVal);
    const progress = isText ? 
      (currentVal / targetVal * 100) :
      (100 - (diff / Math.abs(targetVal) * 100));
    const progressPercent = Math.max(0, Math.min(100, progress));

    let statusText = '';
    let statusClass = '';
    
    if (isText) {
      statusText = currentVal >= targetVal ? 'On track' : 'Below target';
      statusClass = currentVal >= targetVal ? 'status-good' : 'status-warning';
    } else if (label === 'Weight') {
      const isLosing = this.profile.primaryGoal === 'lose_weight';
      const isGaining = this.profile.primaryGoal === 'gain_weight';
      
      if (Math.abs(diff) < 0.5) {
        statusText = 'At target';
        statusClass = 'status-good';
      } else if (isLosing && currentVal > targetVal) {
        statusText = `${diff.toFixed(1)}kg to lose`;
        statusClass = 'status-warning';
      } else if (isGaining && currentVal < targetVal) {
        statusText = `${diff.toFixed(1)}kg to gain`;
        statusClass = 'status-warning';
      } else {
        statusText = 'At target';
        statusClass = 'status-good';
      }
    } else {
      statusText = diff > 0 ? `${diff.toFixed(1)}${unit} away` : 'At target';
      statusClass = diff > 2 ? 'status-warning' : 'status-good';
    }

    return `
      <div class="metric-comparison-card">
        <div class="metric-label">${label}</div>
        <div class="metric-values">
          <div class="current-value">
            <span class="label">Current</span>
            <span class="value">${isText ? currentVal : currentVal.toFixed(1)}${unit}</span>
          </div>
          <div class="target-value">
            <span class="label">Target</span>
            <span class="value">${isText ? targetVal : targetVal.toFixed(1)}${unit}</span>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="metric-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }

  renderPeriodComparison(summary) {
    if (!summary) {
      return '<div class="no-data">No data available for this period</div>';
    }

    const periodName = this.currentPeriod === 'week' ? 'week' : 'month';
    const activityDays = summary.activity?.days || 0;
    const totalActivityMinutes = summary.activity?.totalMinutes || 0;
    const weightChange = summary.weightChange || 0;
    const wellnessScoreChange = summary.wellnessScoreChange || 0;
    const progressPercent = this.profile?.progressPercent || 0;
    
    return `
      <div class="period-stats">
        <div class="stat-item">
          <div class="stat-icon">⚖️</div>
          <div class="stat-content">
            <div class="stat-label">Weight Change</div>
            <div class="stat-value">${this.formatWeightChange(weightChange)}</div>
            <div class="stat-detail">This ${periodName}</div>
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-icon">🏃</div>
          <div class="stat-content">
            <div class="stat-label">Active Days</div>
            <div class="stat-value">${activityDays}</div>
            <div class="stat-detail">Days with activity</div>
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-label">Total Activity</div>
            <div class="stat-value">${totalActivityMinutes} min</div>
            <div class="stat-detail">Exercise time</div>
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-label">Wellness Score Change</div>
            <div class="stat-value">${this.formatScoreChange(wellnessScoreChange)}</div>
            <div class="stat-detail">Compared to start of ${periodName}</div>
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-icon">🎯</div>
          <div class="stat-content">
            <div class="stat-label">Goal Progress</div>
            <div class="stat-value">${progressPercent.toFixed(0)}%</div>
            <div class="stat-detail">Overall progress</div>
          </div>
        </div>

        <div class="stat-item">
          <div class="stat-icon">🔥</div>
          <div class="stat-content">
            <div class="stat-label">Activity Streak</div>
            <div class="stat-value">${this.profile.activityStreakDays || 0} days</div>
            <div class="stat-detail">Current streak</div>
          </div>
        </div>

        ${(() => {
          const projected = this.calculateProjectedCompletion();
          return projected ? `
            <div class="stat-item">
              <div class="stat-icon">📅</div>
              <div class="stat-content">
                <div class="stat-label">Projected Goal Date</div>
                <div class="stat-value projected-date">${projected}</div>
                <div class="stat-detail">Based on current rate</div>
              </div>
            </div>` : '';
        })()}
      </div>
    `;
  }

  renderTrendAnalysis() {
    const trends = this.analyzeTrends();
    
    return `
      <div class="trend-analysis">
        ${trends.map(trend => `
          <div class="trend-card ${trend.type}">
            <div class="trend-icon">${trend.icon}</div>
            <div class="trend-content">
              <div class="trend-title">${trend.title}</div>
              <div class="trend-description">${trend.description}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  analyzeTrends() {
    const trends = [];
    
    if (!this.profile || !this.weekSummary) {
      return [{
        type: 'neutral',
        icon: 'ℹ️',
        title: 'Insufficient Data',
        description: 'More data needed to analyze trends'
      }];
    }

    // Weight trend
    const weightChange = this.weekSummary.weightChange || 0;
    if (weightChange !== undefined && weightChange !== null) {
      const isLosing = this.profile.primaryGoal === 'lose_weight';
      const isGaining = this.profile.primaryGoal === 'gain_weight';
      
      if (Math.abs(weightChange) < 0.1) {
        trends.push({
          type: 'neutral',
          icon: '⚖️',
          title: 'Weight Stable',
          description: 'Your weight has remained consistent this week'
        });
      } else if ((isLosing && weightChange < 0) || (isGaining && weightChange > 0)) {
        trends.push({
          type: 'positive',
          icon: '✅',
          title: 'On Track',
          description: `Weight ${weightChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(weightChange).toFixed(1)}kg - aligned with your goal`
        });
      } else if ((isLosing && weightChange > 0) || (isGaining && weightChange < 0)) {
        trends.push({
          type: 'warning',
          icon: '⚠️',
          title: 'Off Track',
          description: `Weight ${weightChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(weightChange).toFixed(1)}kg - not aligned with your goal`
        });
      }
    }

    // Activity trend
    const weeklyGoal = this.profile.weeklyActivityGoal || 3;
    const activeDays = this.weekSummary.activity?.days || 0;
    
    if (activeDays >= weeklyGoal) {
      trends.push({
        type: 'positive',
        icon: '🎯',
        title: 'Activity Goal Met',
        description: `You've been active ${activeDays} days this week - exceeding your goal of ${weeklyGoal} days`
      });
    } else if (activeDays > 0) {
      trends.push({
        type: 'neutral',
        icon: '🏃',
        title: 'Building Activity',
        description: `${activeDays}/${weeklyGoal} days of activity this week - keep going!`
      });
    } else {
      trends.push({
        type: 'warning',
        icon: '💤',
        title: 'Low Activity',
        description: 'No activity logged this week - consider adding some movement to your routine'
      });
    }

    // Wellness score trend
    const wellnessChange = this.weekSummary.wellnessScoreChange || 0;
    if (wellnessChange !== undefined) {
      if (wellnessChange > 5) {
        trends.push({
          type: 'positive',
          icon: '📈',
          title: 'Wellness Improving',
          description: `Your wellness score increased by ${wellnessChange.toFixed(0)} points this week`
        });
      } else if (wellnessChange < -5) {
        trends.push({
          type: 'warning',
          icon: '📉',
          title: 'Wellness Declining',
          description: `Your wellness score decreased by ${Math.abs(wellnessChange).toFixed(0)} points this week`
        });
      } else {
        trends.push({
          type: 'neutral',
          icon: '📊',
          title: 'Wellness Stable',
          description: 'Your wellness score has remained relatively stable'
        });
      }
    }

    // Consistency trend
    if (this.profile.activityStreakDays >= 7) {
      trends.push({
        type: 'positive',
        icon: '🔥',
        title: 'Great Consistency',
        description: `${this.profile.activityStreakDays}-day activity streak - excellent commitment!`
      });
    }

    return trends.length > 0 ? trends : [{
      type: 'neutral',
      icon: 'ℹ️',
      title: 'Keep Going',
      description: 'Continue logging your progress to see trend analysis'
    }];
  }

  renderAIRecommendations() {
    const reason = this.insights?.reason;
    if (!this.insights || !this.insights.recommendations?.length) {
      const messages = {
        no_profile: 'Complete your health profile to receive personalized AI insights.',
        no_consent: 'Enable AI insights in Privacy Settings to receive personalized recommendations.',
        no_api_key: 'AI service is not configured. Add <code>OPENAI_API_KEY</code> to the backend <code>.env</code> file.',
        unavailable: 'AI service is temporarily unavailable. Please try again later.',
      };
      const msg = messages[reason] || (reason === 'ok'
        ? 'No recommendations yet – try refreshing or add more data to your profile.'
        : 'Enable AI insights in your privacy settings to receive personalized recommendations.');
      return `<div class="no-data"><p>${msg}</p></div>`;
    }

    const recommendations = this.insights.recommendations;
    
    return `
      <div class="ai-recommendations">
        ${recommendations.map(rec => this.renderRecommendationCard(rec)).join('')}
      </div>
    `;
  }

  renderRecommendationCard(recommendation) {
    const priorityClass = recommendation.priority || 'medium';
    const priorityLabel = {
      high: 'High Priority',
      medium: 'Medium Priority',
      low: 'Low Priority'
    }[priorityClass] || 'Medium Priority';

    const priorityIcon = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    }[priorityClass] || '🟡';

    const text = recommendation.text || recommendation.recommendation || '';
    const preview = text.length > 160 ? text.substring(0, 160).trimEnd() + '…' : text;
    const hasMore = text.length > 160;

    return `
      <details class="recommendation-card priority-${priorityClass}">
        <summary class="recommendation-summary">
          <div class="recommendation-header">
            <span class="priority-indicator">${priorityIcon}</span>
            <span class="priority-label">${priorityLabel}</span>
          </div>
          <div class="recommendation-preview">${preview}</div>
        </summary>
        ${hasMore ? `<div class="recommendation-full-content">${text}</div>` : ''}
        ${recommendation.fromCache ? '<div class="cache-indicator">📦 Cached</div>' : ''}
      </details>
    `;
  }

  calculateProjectedCompletion() {
    if (!this.profile?.currentWeightKg || !this.profile?.targetWeightKg) return null;
    const weeklyChange = this.weekSummary?.weightChange;
    if (!weeklyChange || weeklyChange === 0) return null;
    const diff = this.profile.targetWeightKg - this.profile.currentWeightKg;
    // Only project if change is in the right direction
    if ((diff > 0 && weeklyChange <= 0) || (diff < 0 && weeklyChange >= 0)) return null;
    const weeksNeeded = Math.abs(diff / weeklyChange);
    if (weeksNeeded > 520) return null; // >10 years, skip
    const date = new Date();
    date.setDate(date.getDate() + Math.round(weeksNeeded * 7));
    return date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  calculateTargetBMI() {
    if (!this.profile.targetWeightKg || !this.profile.heightCm) return null;
    const heightM = this.profile.heightCm / 100;
    return this.profile.targetWeightKg / (heightM * heightM);
  }

  getActivityLevelValue(level) {
    const map = {
      'sedentary': 1,
      'light': 2,
      'moderate': 3,
      'active': 4,
      'very_active': 5
    };
    return map[level] || 0;
  }

  formatWeightChange(change) {
    if (change === undefined || change === null) return '—';
    const prefix = change > 0 ? '+' : '';
    return `${prefix}${change.toFixed(1)} kg`;
  }

  formatScoreChange(change) {
    if (change === undefined || change === null) return '—';
    const prefix = change > 0 ? '+' : '';
    return `${prefix}${change.toFixed(0)}`;
  }

  attachListeners() {
    const periodBtns = this.container.querySelectorAll('.period-btn');
    
    periodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentPeriod = btn.dataset.period;
        this.render();
      });
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
