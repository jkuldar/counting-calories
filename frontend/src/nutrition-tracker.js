// Nutrition Tracker view component
import { showToast } from './utils.js';

export class NutritionTrackerView {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.mode = 'daily'; // daily | weekly
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.dailyData = null;
    this.weeklyData = null;
    this.logs = [];
  }

  async load() {
    this.container.innerHTML = '<div class="loading-spinner">Loading nutrition data...</div>';
    try {
      if (this.mode === 'daily') {
        const [daily, logs] = await Promise.all([
          this.api.getDailyNutrition(this.selectedDate).catch(() => null),
          this.api.getNutritionLogs(this.selectedDate, this.selectedDate).catch(() => []),
        ]);
        this.dailyData = daily;
        this.logs = Array.isArray(logs) ? logs : (logs?.data || []);
      } else {
        this.weeklyData = await this.api.getWeeklyNutrition(this.selectedDate).catch(() => null);
      }
      this.render();
    } catch {
      this.container.innerHTML = '<div class="error-state">Failed to load nutrition data.</div>';
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="nutrition-tracker">
        <div class="section-header">
          <h2>Nutrition Tracker</h2>
          <button class="btn-primary" id="nt-log-btn">Log Food</button>
        </div>

        <div class="nt-tab-bar">
          <button class="tab-btn ${this.mode === 'daily' ? 'active' : ''}" data-mode="daily">Daily</button>
          <button class="tab-btn ${this.mode === 'weekly' ? 'active' : ''}" data-mode="weekly">Weekly</button>
          <input type="date" id="nt-date" value="${this.selectedDate}">
        </div>

        <div class="nt-content">
          ${this.mode === 'daily' ? this.renderDaily() : this.renderWeekly()}
        </div>
      </div>
    `;
    this.attachListeners();
  }

  renderDaily() {
    const d = this.dailyData;
    if (!d) {
      return '<div class="empty-state"><p>No nutrition data for this day.</p></div>';
    }

    const totals = d.totals || d;
    const targets = d.targets || {};

    return `
      <div class="nt-daily">
        <div class="nt-summary-cards">
          ${this.renderMacroCard('Calories', totals.calories, targets.calories, 'kcal', 'cal')}
          ${this.renderMacroCard('Protein', totals.protein, targets.protein, 'g', 'prot')}
          ${this.renderMacroCard('Carbs', totals.carbs, targets.carbs, 'g', 'carb')}
          ${this.renderMacroCard('Fats', totals.fats, targets.fats, 'g', 'fat')}
        </div>

        ${this.renderMacroPieChart(totals)}

        ${d.analysis ? `<div class="nt-ai-analysis"><h3>AI Analysis</h3><p>${this.escapeHtml(d.analysis)}</p></div>` : ''}

        <div class="nt-logs">
          <h3>Food Log</h3>
          ${this.logs.length ? `
            <table class="nt-log-table">
              <thead>
                <tr><th>Food</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fats</th><th>Time</th></tr>
              </thead>
              <tbody>
                ${this.logs.map(log => `
                  <tr>
                    <td>${this.escapeHtml(log.description || log.recipe?.title || '—')}</td>
                    <td>${Math.round(log.calories || 0)}</td>
                    <td>${Math.round(log.protein || 0)}g</td>
                    <td>${Math.round(log.carbs || 0)}g</td>
                    <td>${Math.round(log.fats || 0)}g</td>
                    <td>${log.loggedAt ? new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p>No entries logged today.</p>'}
        </div>
      </div>
    `;
  }

  renderMacroCard(label, value, target, unit, cls) {
    const val = Math.round(value || 0);
    const tgt = target ? Math.round(target) : null;
    const pct = tgt ? Math.min(Math.round((val / tgt) * 100), 100) : 0;
    const barColor = !tgt ? 'var(--color-muted)' : pct > 100 ? 'var(--color-danger)' : pct > 80 ? 'var(--color-success)' : 'var(--color-primary)';

    return `
      <div class="macro-card macro-card--${cls}">
        <div class="macro-card__label">${label}</div>
        <div class="macro-card__value">${val}<span class="macro-card__unit">${unit}</span></div>
        ${tgt ? `
          <div class="macro-card__bar"><div class="macro-card__fill" style="width:${pct}%;background:${barColor}"></div></div>
          <div class="macro-card__target">${val} / ${tgt} ${unit} (${pct}%)</div>
        ` : ''}
      </div>
    `;
  }

  renderMacroPieChart(totals) {
    const protein = Math.round(totals.protein || 0);
    const carbs = Math.round(totals.carbs || 0);
    const fats = Math.round(totals.fats || 0);
    const total = protein + carbs + fats;
    if (total === 0) return '';

    const pPct = Math.round((protein / total) * 100);
    const cPct = Math.round((carbs / total) * 100);
    const fPct = 100 - pPct - cPct;

    // CSS conic gradient pie chart
    const protEnd = pPct;
    const carbEnd = protEnd + cPct;

    return `
      <div class="nt-pie-section">
        <h3>Macro Breakdown</h3>
        <div class="nt-pie-container">
          <div class="nt-pie" style="background: conic-gradient(
            var(--color-protein, #4dabf7) 0% ${protEnd}%,
            var(--color-carbs, #69db7c) ${protEnd}% ${carbEnd}%,
            var(--color-fat, #ffa94d) ${carbEnd}% 100%
          )"></div>
          <div class="nt-pie-legend">
            <span class="legend-item"><span class="legend-dot" style="background:var(--color-protein,#4dabf7)"></span>Protein ${pPct}% (${protein}g)</span>
            <span class="legend-item"><span class="legend-dot" style="background:var(--color-carbs,#69db7c)"></span>Carbs ${cPct}% (${carbs}g)</span>
            <span class="legend-item"><span class="legend-dot" style="background:var(--color-fat,#ffa94d)"></span>Fats ${fPct}% (${fats}g)</span>
          </div>
        </div>
      </div>
    `;
  }

  renderWeekly() {
    const w = this.weeklyData;
    if (!w) {
      return '<div class="empty-state"><p>No nutrition data for this week.</p></div>';
    }

    const days = w.days || w.dailyBreakdown || [];
    const avg = w.averages || w;

    return `
      <div class="nt-weekly">
        <div class="nt-summary-cards">
          ${this.renderMacroCard('Avg Calories', avg.calories, avg.targetCalories, 'kcal', 'cal')}
          ${this.renderMacroCard('Avg Protein', avg.protein, avg.targetProtein, 'g', 'prot')}
          ${this.renderMacroCard('Avg Carbs', avg.carbs, avg.targetCarbs, 'g', 'carb')}
          ${this.renderMacroCard('Avg Fats', avg.fats, avg.targetFats, 'g', 'fat')}
        </div>

        ${days.length ? `
          <div class="nt-weekly-chart">
            <h3>Daily Calories</h3>
            <div class="bar-chart">
              ${days.map(day => {
                const maxCal = Math.max(...days.map(dd => dd.calories || 0), 1);
                const pct = Math.round(((day.calories || 0) / maxCal) * 100);
                const lbl = new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
                return `<div class="bar-chart__col">
                  <div class="bar-chart__bar" style="height:${pct}%"><span>${Math.round(day.calories || 0)}</span></div>
                  <div class="bar-chart__label">${lbl}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${w.analysis ? `<div class="nt-ai-analysis"><h3>Weekly AI Analysis</h3><p>${this.escapeHtml(w.analysis)}</p></div>` : ''}
      </div>
    `;
  }

  attachListeners() {
    // Tab switching
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        this.load();
      });
    });

    // Date change
    this.container.querySelector('#nt-date')?.addEventListener('change', (e) => {
      this.selectedDate = e.target.value;
      this.load();
    });

    // Log food
    this.container.querySelector('#nt-log-btn')?.addEventListener('click', () => this.showLogDialog());
  }

  showLogDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>Log Food</h3><button class="btn-close" id="close-log-modal">&times;</button></div>
        <div class="modal-body">
          <form id="log-food-form">
            <label>Description<input type="text" name="description" required placeholder="e.g. Chicken breast with rice"></label>
            <label>Meal Type
              <select name="mealType">
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </label>
            <div class="form-row">
              <label>Calories (kcal)<input type="number" name="calories" placeholder="Required" required min="0"></label>
              <label>Protein (g)<input type="number" name="protein" placeholder="0" min="0"></label>
              <label>Carbs (g)<input type="number" name="carbs" placeholder="0" min="0"></label>
              <label>Fats (g)<input type="number" name="fats" placeholder="0" min="0"></label>
            </div>
            <label>Date<input type="date" name="date" value="${this.selectedDate}"></label>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="log-cancel">Cancel</button>
          <button class="btn-primary" id="log-submit">Log</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    setTimeout(() => dialog.classList.add('show'), 10);

    dialog.querySelector('#close-log-modal')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#log-cancel')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#log-submit')?.addEventListener('click', async () => {
      const fd = new FormData(dialog.querySelector('#log-food-form'));
      const calories = Number(fd.get('calories'));
      if (!fd.get('date') || !calories) {
        showToast('Date and calories are required', 'error');
        return;
      }
      dialog.remove();
      try {
        await this.api.logNutrition({
          description: fd.get('description'),
          mealType: fd.get('mealType'),
          date: fd.get('date'),
          calories,
          protein: fd.get('protein') ? Number(fd.get('protein')) : 0,
          carbs: fd.get('carbs') ? Number(fd.get('carbs')) : 0,
          fats: fd.get('fats') ? Number(fd.get('fats')) : 0,
        });
        showToast('Food logged!', 'success');
        await this.load();
      } catch {
        showToast('Failed to log food', 'error');
      }
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
