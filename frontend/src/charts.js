// Charts component using Chart.js
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export class Charts {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.charts = {};
  }

  async load() {
    try {
      const [weightHistory, activityEntries, profile, wellnessHistory] = await Promise.all([
        this.api.getWeightHistory().catch(() => []),
        this.api.getActivityEntries().catch(() => []),
        this.api.getHealthProfile().catch(() => null),
        this.api.getWellnessHistory().catch(() => []),
      ]);

      this.render(weightHistory, activityEntries, profile, wellnessHistory);
    } catch (error) {
      console.error('Failed to load charts:', error);
    }
  }

  render(weightHistory, activityEntries, profile, wellnessHistory) {
    this.container.innerHTML = `
      <div class="charts-section">
        <h2>Progress & Trends</h2>
        
        <div class="chart-grid">
          <div class="chart-card">
            <h3>Weight Progress</h3>
            <canvas id="weight-chart"></canvas>
          </div>

          <div class="chart-card">
            <h3>Weekly Activity Heatmap</h3>
            <div id="activity-heatmap"></div>
          </div>

          <div class="chart-card">
            <h3>Wellness Score History</h3>
            <canvas id="wellness-chart"></canvas>
          </div>
        </div>
      </div>
    `;

    // Render charts
    this.renderWeightChart(weightHistory, profile);
    this.renderActivityHeatmap(activityEntries);
    this.renderWellnessChart(wellnessHistory);
  }

  renderWeightChart(weightHistory, profile) {
    const canvas = document.getElementById('weight-chart');
    if (!canvas) return;

    // Destroy previous chart
    if (this.charts.weight) {
      this.charts.weight.destroy();
      this.charts.weight = null;
    }

    // Sort by date
    const sorted = [...(weightHistory || [])].sort((a, b) => 
      new Date(a.recordedAt) - new Date(b.recordedAt)
    );

    if (sorted.length === 0) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">No weight data yet. Log your first weight entry to see your progress.</p>';
      return;
    }

    const labels = sorted.map(entry => 
      new Date(entry.recordedAt).toLocaleDateString()
    );
    const weights = sorted.map(entry => entry.weightKg);

    // Add target line if available
    const targetWeight = profile?.targetWeightKg;
    const targetLine = targetWeight ? Array(labels.length).fill(targetWeight) : [];

    const ctx = canvas.getContext('2d');
    this.charts.weight = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Weight (kg)',
            data: weights,
            borderColor: 'rgb(106, 27, 154)',
            backgroundColor: 'rgba(106, 27, 154, 0.1)',
            tension: 0.3,
            fill: true,
          },
          ...(targetLine.length > 0 ? [{
            label: 'Target Weight',
            data: targetLine,
            borderColor: 'rgb(255, 107, 107)',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: {
            labels: {
              color: '#e8ecf5',
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          y: {
            ticks: { color: '#9aa0b5' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
          x: {
            ticks: { color: '#9aa0b5' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
        },
      },
    });
  }

  renderActivityHeatmap(activityEntries) {
    const container = document.getElementById('activity-heatmap');
    if (!container) return;

    // Build date → count map
    const activityMap = {};
    (activityEntries || []).forEach(entry => {
      const d = new Date(entry.loggedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      activityMap[key] = (activityMap[key] || 0) + 1;
    });

    const today = new Date();
    const WEEKS = 12;
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    // Start on Monday (WEEKS-1) weeks ago
    const startDate = new Date(today);
    const dow = (startDate.getDay() + 6) % 7; // Mon=0
    startDate.setDate(startDate.getDate() - dow - (WEEKS - 1) * 7);

    const weeksHTML = [];
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const weekLabel = weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' });

      const cells = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(weekStart);
        cellDate.setDate(cellDate.getDate() + d);
        const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
        const count = activityMap[key] || 0;
        const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
        const isFuture = cellDate > today;
        const label = cellDate.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
        cells.push(`<div class="heatmap-cell level-${level}${isFuture ? ' future' : ''}" title="${label}: ${count} activit${count === 1 ? 'y' : 'ies'}"></div>`);
      }
      weeksHTML.push(`<div class="heatmap-week"><div class="week-label">${weekLabel}</div>${cells.join('')}</div>`);
    }

    container.innerHTML = `
      <div class="activity-heatmap">
        <div class="heatmap-inner">
          <div class="heatmap-day-labels">
            <div class="week-label-spacer"></div>
            ${dayNames.map(n => `<div>${n}</div>`).join('')}
          </div>
          <div class="heatmap-weeks">${weeksHTML.join('')}</div>
        </div>
        <div class="heatmap-legend">
          <span class="legend-label">Less</span>
          <div class="heatmap-cell level-0"></div>
          <div class="heatmap-cell level-1"></div>
          <div class="heatmap-cell level-2"></div>
          <div class="heatmap-cell level-3"></div>
          <span class="legend-label">More</span>
        </div>
      </div>
    `;
  }

  renderActivityChart(activityEntries) {
    const canvas = document.getElementById('activity-chart');
    if (!canvas) return;

    if (this.charts.activity) {
      this.charts.activity.destroy();
    }

    // Group by week
    const weeklyData = this.groupByWeek(activityEntries);
    const labels = Object.keys(weeklyData).slice(-8); // Last 8 weeks
    const counts = labels.map(week => weeklyData[week]);

    const ctx = canvas.getContext('2d');
    this.charts.activity = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Activities per week',
          data: counts,
          backgroundColor: 'rgba(106, 27, 154, 0.6)',
          borderColor: 'rgb(106, 27, 154)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: {
            labels: { color: '#e8ecf5' },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { 
              color: '#9aa0b5',
              stepSize: 1,
            },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
          x: {
            ticks: { color: '#9aa0b5' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
        },
      },
    });
  }

  renderWellnessChart(wellnessHistory) {
    const canvas = document.getElementById('wellness-chart');
    if (!canvas) return;

    if (this.charts.wellness) {
      this.charts.wellness.destroy();
      this.charts.wellness = null;
    }

    const sorted = [...(wellnessHistory || [])].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    if (sorted.length === 0) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">No wellness data yet. Update your health profile to start tracking.</p>';
      return;
    }

    const labels = sorted.map(entry =>
      new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
    const scores = sorted.map(entry => entry.wellnessScore);

    const ctx = canvas.getContext('2d');
    this.charts.wellness = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Wellness Score',
          data: scores,
          borderColor: 'rgb(106, 27, 154)',
          backgroundColor: 'rgba(106, 27, 154, 0.1)',
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: {
            labels: { color: '#e8ecf5' },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#9aa0b5' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
          x: {
            ticks: { color: '#9aa0b5' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
        },
      },
    });
  }

  groupByWeek(activities) {
    const weeks = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.loggedAt);
      const week = this.getWeekLabel(date);
      weeks[week] = (weeks[week] || 0) + 1;
    });

    return weeks;
  }

  getWeekLabel(date) {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week}`;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  destroy() {
    Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};
  }
}
