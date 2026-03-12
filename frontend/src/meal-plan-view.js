// Meal Planning view component
import { showToast } from './utils.js';

export class MealPlanView {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.currentPlan = null;
    this.preferences = null;
    this.swapSource = null;
  }

  async load() {
    this.container.innerHTML = '<div class="loading-spinner">Loading meal plans...</div>';
    try {
      const [plans, prefs] = await Promise.all([
        this.api.getMealPlans(true).catch(() => []),
        this.api.getMealPlanPreferences().catch(() => null),
      ]);
      this.preferences = prefs;
      this.currentPlan = Array.isArray(plans) && plans.length > 0 ? plans[0] : null;
      this.render();
    } catch {
      this.container.innerHTML = '<div class="error-state">Failed to load meal plans.</div>';
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="meal-plan-view">
        <div class="section-header">
          <h2>Meal Planning</h2>
          <div class="header-actions">
            <button class="btn-secondary" id="mp-prefs-btn">Preferences</button>
            <button class="btn-primary" id="mp-generate-btn">Generate Plan</button>
          </div>
        </div>

        ${this.currentPlan ? this.renderPlan(this.currentPlan) : this.renderEmpty()}

        <div id="mp-prefs-panel" class="prefs-panel" style="display:none">
          ${this.renderPreferencesForm()}
        </div>
      </div>
    `;
    this.attachListeners();
  }

  renderEmpty() {
    return `
      <div class="empty-state">
        <h3>No Active Meal Plan</h3>
        <p>Generate a personalized meal plan based on your preferences and health profile.</p>
        <button class="btn-primary" id="mp-generate-empty-btn">Create My First Meal Plan</button>
      </div>
    `;
  }

  renderPlan(plan) {
    const meals = plan.meals || [];
    // Group by date
    const days = {};
    for (const meal of meals) {
      const dateKey = meal.date.split('T')[0];
      if (!days[dateKey]) days[dateKey] = [];
      days[dateKey].push(meal);
    }

    const dayEntries = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));

    return `
      <div class="plan-header">
        <div class="plan-meta">
          <span class="plan-badge ${plan.isActive ? 'active' : ''}">${plan.isActive ? 'Active' : 'Inactive'}</span>
          <span class="plan-duration">${plan.duration}</span>
          <span class="plan-dates">${new Date(plan.startDate).toLocaleDateString()} — ${new Date(plan.endDate).toLocaleDateString()}</span>
          <span class="plan-version">v${plan.version}</span>
        </div>
        <div class="plan-actions">
          <button class="btn-secondary btn-sm" id="mp-versions-btn">Version History</button>
          <button class="btn-secondary btn-sm" id="mp-shopping-btn">Shopping List</button>
        </div>
      </div>

      ${dayEntries.map(([date, dayMeals]) => `
        <div class="plan-day">
          <h3 class="day-header">${this.formatDayHeader(date)}</h3>
          <div class="day-summary">
            ${this.renderDaySummary(dayMeals)}
          </div>
          <div class="meals-grid">
            ${dayMeals.sort((a, b) => a.sortOrder - b.sortOrder).map(meal => this.renderMealCard(meal)).join('')}
            <button class="meal-card meal-card--add" data-date="${date}" data-action="add-meal">
              <span class="add-icon">+</span>
              <span>Add Meal</span>
            </button>
          </div>
        </div>
      `).join('')}
    `;
  }

  renderMealCard(meal) {
    const name = meal.recipe?.title || meal.customName || 'Unnamed meal';
    const calories = Math.round(meal.calories || 0);
    const isSwapSource = this.swapSource === meal.id;

    return `
      <div class="meal-card ${isSwapSource ? 'swap-source' : ''}" data-meal-id="${meal.id}">
        <div class="meal-card__header">
          <span class="meal-type-badge meal-type--${meal.mealType}">${meal.mealType}</span>
          ${meal.mealTime ? `<span class="meal-time">${meal.mealTime}</span>` : ''}
        </div>
        <h4 class="meal-card__title">${this.escapeHtml(name)}</h4>
        <div class="meal-card__nutrition">
          <span class="macro-pill cal">${calories} kcal</span>
          <span class="macro-pill prot">${Math.round(meal.protein || 0)}g P</span>
          <span class="macro-pill carb">${Math.round(meal.carbs || 0)}g C</span>
          <span class="macro-pill fat">${Math.round(meal.fats || 0)}g F</span>
        </div>
        <div class="meal-card__actions">
          ${meal.recipeId ? `<button class="btn-xs" data-action="view-recipe" data-recipe-id="${meal.recipeId}">View</button>` : ''}
          <button class="btn-xs" data-action="regenerate" data-meal-id="${meal.id}">Regenerate</button>
          <button class="btn-xs" data-action="swap" data-meal-id="${meal.id}">${isSwapSource ? 'Cancel' : 'Swap'}</button>
          <button class="btn-xs btn-danger-xs" data-action="remove" data-meal-id="${meal.id}">Remove</button>
        </div>
      </div>
    `;
  }

  renderDaySummary(meals) {
    const totals = meals.reduce((sum, m) => ({
      calories: sum.calories + (m.calories || 0),
      protein: sum.protein + (m.protein || 0),
      carbs: sum.carbs + (m.carbs || 0),
      fats: sum.fats + (m.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    const target = this.preferences?.calorieTarget || 2000;
    const pct = Math.round((totals.calories / target) * 100);
    const barColor = pct > 110 ? 'var(--color-danger)' : pct > 90 ? 'var(--color-success)' : 'var(--color-warning)';

    return `
      <div class="day-totals">
        <div class="total-bar">
          <div class="total-bar__fill" style="width: ${Math.min(pct, 100)}%; background: ${barColor}"></div>
        </div>
        <span class="total-label">${Math.round(totals.calories)} / ${target} kcal (${pct}%)</span>
        <span class="macro-summary">P: ${Math.round(totals.protein)}g | C: ${Math.round(totals.carbs)}g | F: ${Math.round(totals.fats)}g</span>
      </div>
    `;
  }

  renderPreferencesForm() {
    const p = this.preferences || {};
    return `
      <h3>Meal Plan Preferences</h3>
      <form id="mp-prefs-form" class="prefs-form">
        <div class="form-row">
          <label>Timezone<input type="text" name="timezone" value="${p.timezone || 'UTC'}" placeholder="e.g. Europe/Berlin"></label>
          <label>Meals/Day<input type="number" name="mealsPerDay" value="${p.mealsPerDay || 3}" min="1" max="6"></label>
          <label>Snacks/Day<input type="number" name="snacksPerDay" value="${p.snacksPerDay || 0}" min="0" max="4"></label>
        </div>
        <div class="form-row">
          <label>Breakfast Time<input type="time" name="breakfastTime" value="${p.breakfastTime || '08:00'}"></label>
          <label>Lunch Time<input type="time" name="lunchTime" value="${p.lunchTime || '12:30'}"></label>
          <label>Dinner Time<input type="time" name="dinnerTime" value="${p.dinnerTime || '19:00'}"></label>
          <label>Snack Time<input type="time" name="snackTime" value="${p.snackTime || '15:00'}"></label>
        </div>
        <div class="form-row">
          <label>Cuisine Preferences<input type="text" name="cuisinePreferences" value="${(p.cuisinePreferences || []).join(', ')}" placeholder="Italian, Mexican, Japanese..."></label>
          <label>Disliked Ingredients<input type="text" name="dislikedIngredients" value="${(p.dislikedIngredients || []).join(', ')}" placeholder="mushrooms, tofu..."></label>
        </div>
        <div class="form-row">
          <label>Calorie Target<input type="number" name="calorieTarget" value="${p.calorieTarget || ''}" placeholder="Auto-calculated"></label>
          <label>Protein (g)<input type="number" name="proteinTarget" value="${p.proteinTarget || ''}" placeholder="Auto"></label>
          <label>Carbs (g)<input type="number" name="carbsTarget" value="${p.carbsTarget || ''}" placeholder="Auto"></label>
          <label>Fats (g)<input type="number" name="fatsTarget" value="${p.fatsTarget || ''}" placeholder="Auto"></label>
        </div>
        <button type="submit" class="btn-primary">Save Preferences</button>
      </form>
    `;
  }

  attachListeners() {
    // Generate plan
    this.container.querySelectorAll('#mp-generate-btn, #mp-generate-empty-btn').forEach(btn => {
      btn?.addEventListener('click', () => this.showGenerateDialog());
    });

    // Preferences toggle
    this.container.querySelector('#mp-prefs-btn')?.addEventListener('click', () => {
      const panel = this.container.querySelector('#mp-prefs-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // Save preferences
    this.container.querySelector('#mp-prefs-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        timezone: fd.get('timezone'),
        mealsPerDay: Number(fd.get('mealsPerDay')),
        snacksPerDay: Number(fd.get('snacksPerDay')),
        breakfastTime: fd.get('breakfastTime'),
        lunchTime: fd.get('lunchTime'),
        dinnerTime: fd.get('dinnerTime'),
        snackTime: fd.get('snackTime'),
        cuisinePreferences: fd.get('cuisinePreferences').split(',').map(s => s.trim()).filter(Boolean),
        dislikedIngredients: fd.get('dislikedIngredients').split(',').map(s => s.trim()).filter(Boolean),
        calorieTarget: fd.get('calorieTarget') ? Number(fd.get('calorieTarget')) : null,
        proteinTarget: fd.get('proteinTarget') ? Number(fd.get('proteinTarget')) : null,
        carbsTarget: fd.get('carbsTarget') ? Number(fd.get('carbsTarget')) : null,
        fatsTarget: fd.get('fatsTarget') ? Number(fd.get('fatsTarget')) : null,
      };
      try {
        await this.api.updateMealPlanPreferences(data);
        this.preferences = data;
        showToast('Preferences saved!', 'success');
        this.container.querySelector('#mp-prefs-panel').style.display = 'none';
      } catch {
        showToast('Failed to save preferences', 'error');
      }
    });

    // Meal card actions (delegation)
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const mealId = btn.dataset.mealId;

      switch (action) {
        case 'regenerate':
          await this.handleRegenerate(mealId);
          break;
        case 'swap':
          this.handleSwap(mealId);
          break;
        case 'remove':
          await this.handleRemove(mealId);
          break;
        case 'view-recipe':
          if (this.onViewRecipe) this.onViewRecipe(btn.dataset.recipeId);
          break;
        case 'add-meal':
          this.showAddMealDialog(btn.dataset.date);
          break;
      }
    });

    // Shopping list
    this.container.querySelector('#mp-shopping-btn')?.addEventListener('click', async () => {
      if (!this.currentPlan) return;
      try {
        await this.api.generateShoppingListFromPlan(this.currentPlan.id);
        showToast('Shopping list created!', 'success');
        if (this.onNavigateShoppingList) this.onNavigateShoppingList();
      } catch {
        showToast('Failed to generate shopping list', 'error');
      }
    });

    // Version history
    this.container.querySelector('#mp-versions-btn')?.addEventListener('click', () => this.showVersionHistory());

    // Handle swap targets (clicking a meal card while in swap mode)
    this.container.querySelectorAll('.meal-card[data-meal-id]').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (!this.swapSource || e.target.closest('[data-action]')) return;
        const targetId = card.dataset.mealId;
        if (targetId === this.swapSource) return;
        try {
          await this.api.swapMeals(this.swapSource, targetId);
          this.swapSource = null;
          showToast('Meals swapped!', 'success');
          await this.load();
        } catch {
          showToast('Failed to swap meals', 'error');
        }
      });
    });
  }

  async handleRegenerate(mealId) {
    try {
      showToast('Regenerating meal...', 'info');
      await this.api.regenerateMeal(mealId);
      showToast('Meal regenerated!', 'success');
      await this.load();
    } catch {
      showToast('Failed to regenerate meal', 'error');
    }
  }

  handleSwap(mealId) {
    if (this.swapSource === mealId) {
      this.swapSource = null;
    } else {
      this.swapSource = mealId;
      showToast('Click another meal to swap with', 'info');
    }
    this.render();
  }

  async handleRemove(mealId) {
    try {
      await this.api.removeMeal(mealId);
      showToast('Meal removed', 'success');
      await this.load();
    } catch {
      showToast('Failed to remove meal', 'error');
    }
  }

  showGenerateDialog() {
    const today = new Date().toISOString().split('T')[0];
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>Generate Meal Plan</h3><button class="btn-close" id="close-gen-modal">&times;</button></div>
        <div class="modal-body">
          <form id="gen-plan-form">
            <label>Duration
              <select name="duration">
                <option value="daily">Daily</option>
                <option value="weekly" selected>Weekly</option>
              </select>
            </label>
            <label>Start Date<input type="date" name="startDate" value="${today}" required></label>
            <label>Meals per day<input type="number" name="mealsPerDay" value="${this.preferences?.mealsPerDay || 3}" min="1" max="6"></label>
            <label>Snacks per day<input type="number" name="snacksPerDay" value="${this.preferences?.snacksPerDay || 0}" min="0" max="4"></label>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="gen-cancel">Cancel</button>
          <button class="btn-primary" id="gen-submit">Generate</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    setTimeout(() => dialog.classList.add('show'), 10);

    dialog.querySelector('#close-gen-modal')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#gen-cancel')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#gen-submit')?.addEventListener('click', async () => {
      const form = dialog.querySelector('#gen-plan-form');
      const fd = new FormData(form);
      dialog.remove();
      try {
        showToast('Generating meal plan... This may take a moment.', 'info');
        const plan = await this.api.generateMealPlan({
          duration: fd.get('duration'),
          startDate: fd.get('startDate'),
          mealsPerDay: Number(fd.get('mealsPerDay')),
          snacksPerDay: Number(fd.get('snacksPerDay')),
        });
        this.currentPlan = plan;
        this.render();
        showToast('Meal plan generated!', 'success');
      } catch {
        showToast('Failed to generate meal plan', 'error');
      }
    });
  }

  showAddMealDialog(date) {
    if (!this.currentPlan) return;
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>Add Meal</h3><button class="btn-close" id="close-add-modal">&times;</button></div>
        <div class="modal-body">
          <form id="add-meal-form">
            <label>Meal Name<input type="text" name="customName" required placeholder="e.g. Greek Yogurt Bowl"></label>
            <label>Type
              <select name="mealType">
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </label>
            <label>Time<input type="time" name="mealTime" value="12:00"></label>
            <label>Calories (kcal)<input type="number" name="calories" placeholder="Optional"></label>
            <label>Protein (g)<input type="number" name="protein" placeholder="Optional"></label>
            <label>Carbs (g)<input type="number" name="carbs" placeholder="Optional"></label>
            <label>Fats (g)<input type="number" name="fats" placeholder="Optional"></label>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="add-cancel">Cancel</button>
          <button class="btn-primary" id="add-submit">Add</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    setTimeout(() => dialog.classList.add('show'), 10);

    dialog.querySelector('#close-add-modal')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#add-cancel')?.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#add-submit')?.addEventListener('click', async () => {
      const fd = new FormData(dialog.querySelector('#add-meal-form'));
      dialog.remove();
      try {
        await this.api.addManualMeal(this.currentPlan.id, {
          date,
          mealType: fd.get('mealType'),
          mealTime: fd.get('mealTime'),
          customName: fd.get('customName'),
          calories: fd.get('calories') ? Number(fd.get('calories')) : undefined,
          protein: fd.get('protein') ? Number(fd.get('protein')) : undefined,
          carbs: fd.get('carbs') ? Number(fd.get('carbs')) : undefined,
          fats: fd.get('fats') ? Number(fd.get('fats')) : undefined,
        });
        showToast('Meal added!', 'success');
        await this.load();
      } catch {
        showToast('Failed to add meal', 'error');
      }
    });
  }

  async showVersionHistory() {
    if (!this.currentPlan) return;
    try {
      const start = this.currentPlan.startDate.split('T')[0];
      const end = this.currentPlan.endDate.split('T')[0];
      const versions = await this.api.getMealPlanVersions(start, end);
      const dialog = document.createElement('div');
      dialog.className = 'modal';
      dialog.innerHTML = `
        <div class="modal-content">
          <div class="modal-header"><h3>Version History</h3><button class="btn-close" id="close-ver-modal">&times;</button></div>
          <div class="modal-body">
            <div class="version-list">
              ${versions.map(v => `
                <div class="version-item ${v.isActive ? 'active' : ''}">
                  <span>v${v.version} — ${new Date(v.createdAt).toLocaleString()}</span>
                  <span class="version-badge">${v.isActive ? 'Active' : ''}</span>
                  ${!v.isActive ? `<button class="btn-xs" data-restore="${v.id}">Restore</button>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);
      setTimeout(() => dialog.classList.add('show'), 10);
      dialog.querySelector('#close-ver-modal')?.addEventListener('click', () => dialog.remove());
      dialog.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', async () => {
          dialog.remove();
          try {
            await this.api.restoreMealPlanVersion(btn.dataset.restore);
            showToast('Version restored!', 'success');
            await this.load();
          } catch {
            showToast('Failed to restore version', 'error');
          }
        });
      });
    } catch {
      showToast('Failed to load version history', 'error');
    }
  }

  formatDayHeader(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
