// Recipe Browser view component
import { showToast } from './utils.js';

export class RecipeBrowserView {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.recipes = [];
    this.selectedRecipe = null;
    this.filters = { query: '', cuisine: '', mealType: '', maxTime: '', maxCalories: '', dietaryTags: '' };
  }

  async load(recipeId) {
    this.container.innerHTML = '<div class="loading-spinner">Loading recipes...</div>';
    if (recipeId) {
      await this.loadRecipe(recipeId);
    } else {
      await this.search();
    }
  }

  async search() {
    try {
      const params = {};
      if (this.filters.query) params.query = this.filters.query;
      if (this.filters.cuisine) params.cuisine = this.filters.cuisine;
      if (this.filters.mealType) params.mealType = this.filters.mealType;
      if (this.filters.maxTime) params.maxPrepTime = Number(this.filters.maxTime);
      if (this.filters.maxCalories) params.maxCalories = Number(this.filters.maxCalories);
      if (this.filters.dietaryTags) params.dietaryTags = this.filters.dietaryTags;
      this.recipes = await this.api.searchRecipes(params);
      this.selectedRecipe = null;
      this.renderList();
    } catch {
      this.container.innerHTML = '<div class="error-state">Failed to load recipes.</div>';
    }
  }

  async loadRecipe(id) {
    try {
      this.selectedRecipe = await this.api.getRecipe(id);
      this.renderDetail();
    } catch {
      showToast('Failed to load recipe', 'error');
      await this.search();
    }
  }

  renderList() {
    this.container.innerHTML = `
      <div class="recipe-browser">
        <div class="section-header">
          <h2>Recipes</h2>
          <button class="btn-primary" id="rb-generate-btn">AI Generate Recipe</button>
        </div>

        <div class="recipe-filters">
          <input type="text" id="rb-search" class="filter-input" placeholder="Search recipes..." value="${this.escapeAttr(this.filters.query)}">
          <select id="rb-cuisine" class="filter-select">
            <option value="">All Cuisines</option>
            ${['Italian', 'Mexican', 'Japanese', 'Chinese', 'Indian', 'Mediterranean', 'Thai', 'American', 'French', 'Korean', 'Vietnamese', 'Middle Eastern', 'Greek', 'Spanish', 'Brazilian', 'Ethiopian', 'Turkish', 'Caribbean', 'British', 'German'].map(c =>
              `<option value="${c}" ${this.filters.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <select id="rb-meal-type" class="filter-select">
            <option value="">All Types</option>
            ${['breakfast', 'lunch', 'dinner', 'snack'].map(t =>
              `<option value="${t}" ${this.filters.mealType === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}
          </select>
          <input type="number" id="rb-max-time" class="filter-input filter-input--sm" placeholder="Max mins" value="${this.filters.maxTime}">
          <input type="number" id="rb-max-cal" class="filter-input filter-input--sm" placeholder="Max kcal" value="${this.filters.maxCalories}">
          <input type="text" id="rb-tags" class="filter-input" placeholder="Tags: vegan, gluten-free..." value="${this.escapeAttr(this.filters.dietaryTags)}">
          <button class="btn-secondary" id="rb-filter-btn">Filter</button>
        </div>

        <div class="recipe-grid">
          ${this.recipes.length ? this.recipes.map(r => this.renderRecipeCard(r)).join('') : '<p class="no-results">No recipes found. Try adjusting filters or generate one with AI.</p>'}
        </div>
      </div>
    `;
    this.attachListListeners();
  }

  renderRecipeCard(recipe) {
    return `
      <div class="recipe-card" data-recipe-id="${recipe.id}">
        <div class="recipe-card__header">
          <span class="recipe-card__cuisine">${this.escapeHtml(recipe.cuisine || '')}</span>
          <span class="recipe-card__type meal-type--${recipe.mealType}">${recipe.mealType || ''}</span>
        </div>
        <h4 class="recipe-card__title">${this.escapeHtml(recipe.title)}</h4>
        <p class="recipe-card__desc">${this.escapeHtml((recipe.description || '').slice(0, 100))}</p>
        <div class="recipe-card__meta">
          <span>${recipe.prepTime || '?'} + ${recipe.cookTime || '?'} min</span>
          <span>${recipe.servings} servings</span>
        </div>
        <div class="recipe-card__nutrition">
          <span class="macro-pill cal">${Math.round(recipe.caloriesPerServing || 0)} kcal</span>
          <span class="macro-pill prot">${Math.round(recipe.proteinPerServing || 0)}g P</span>
        </div>
        ${recipe.dietaryTags?.length ? `<div class="recipe-card__tags">${recipe.dietaryTags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  renderDetail() {
    const r = this.selectedRecipe;
    const ingredients = r.ingredients || [];
    const steps = (r.preparation || []).sort((a, b) => a.stepNumber - b.stepNumber);

    this.container.innerHTML = `
      <div class="recipe-detail">
        <button class="btn-secondary btn-back" id="rb-back">&larr; Back to Recipes</button>

        <div class="recipe-detail__header">
          <h2>${this.escapeHtml(r.title)}</h2>
          <div class="recipe-detail__badges">
            ${r.cuisine ? `<span class="recipe-card__cuisine">${this.escapeHtml(r.cuisine)}</span>` : ''}
            ${r.mealType ? `<span class="meal-type--${r.mealType}">${r.mealType}</span>` : ''}
            ${r.difficulty ? `<span class="difficulty-badge">${r.difficulty}</span>` : ''}
          </div>
        </div>

        ${r.description ? `<p class="recipe-detail__desc">${this.escapeHtml(r.description)}</p>` : ''}

        <div class="recipe-detail__meta-bar">
          <div class="meta-item"><strong>Prep</strong>${r.prepTime || '?'} min</div>
          <div class="meta-item"><strong>Cook</strong>${r.cookTime || '?'} min</div>
          <div class="meta-item"><strong>Servings</strong>
            <select id="rb-servings">
              ${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(s => `<option value="${s}" ${s === r.servings ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="recipe-detail__nutrition-bar">
          <div class="nutrition-circle cal"><span>${Math.round(r.caloriesPerServing || 0)}</span>kcal</div>
          <div class="nutrition-circle prot"><span>${Math.round(r.proteinPerServing || 0)}g</span>Protein</div>
          <div class="nutrition-circle carb"><span>${Math.round(r.carbsPerServing || 0)}g</span>Carbs</div>
          <div class="nutrition-circle fat"><span>${Math.round(r.fatsPerServing || 0)}g</span>Fat</div>
          ${r.fiberPerServing ? `<div class="nutrition-circle fib"><span>${Math.round(r.fiberPerServing)}g</span>Fiber</div>` : ''}
        </div>

        ${r.dietaryTags?.length ? `<div class="recipe-detail__tags">${r.dietaryTags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}

        <div class="recipe-detail__columns">
          <div class="recipe-detail__ingredients">
            <h3>Ingredients</h3>
            <ul>
              ${ingredients.map(ri => `
                <li class="ingredient-item" data-ingredient-id="${ri.ingredientId}">
                  <span>${ri.quantity} ${ri.unit} ${this.escapeHtml(ri.ingredient?.name || 'Unknown')}</span>
                  <button class="btn-xs" data-action="substitute" data-ingredient="${this.escapeAttr(ri.ingredient?.name || '')}">Substitute</button>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="recipe-detail__steps">
            <h3>Instructions</h3>
            <ol>
              ${steps.map(s => `
                <li>
                  <p>${this.escapeHtml(s.instruction)}</p>
                  ${s.duration ? `<span class="step-duration">${s.duration} min</span>` : ''}
                  ${s.temperature ? `<span class="step-temp">${s.temperature}°${s.temperatureUnit || 'C'}</span>` : ''}
                </li>
              `).join('')}
            </ol>
          </div>
        </div>

        <div class="recipe-detail__actions">
          <button class="btn-primary" id="rb-analyze-nutrition">Analyze Nutrition (AI)</button>
        </div>
      </div>
    `;
    this.attachDetailListeners();
  }

  attachListListeners() {
    this.container.querySelector('#rb-filter-btn')?.addEventListener('click', () => {
      this.filters.query = this.container.querySelector('#rb-search')?.value || '';
      this.filters.cuisine = this.container.querySelector('#rb-cuisine')?.value || '';
      this.filters.mealType = this.container.querySelector('#rb-meal-type')?.value || '';
      this.filters.maxTime = this.container.querySelector('#rb-max-time')?.value || '';
      this.filters.maxCalories = this.container.querySelector('#rb-max-cal')?.value || '';
      this.filters.dietaryTags = this.container.querySelector('#rb-tags')?.value || '';
      this.search();
    });

    // Enter key triggers search
    this.container.querySelector('#rb-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.container.querySelector('#rb-filter-btn')?.click();
    });

    // Click recipe card
    this.container.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', () => this.loadRecipe(card.dataset.recipeId));
    });

    // AI Generate
    this.container.querySelector('#rb-generate-btn')?.addEventListener('click', () => this.showGenerateDialog());
  }

  attachDetailListeners() {
    this.container.querySelector('#rb-back')?.addEventListener('click', () => this.search());

    // Portion adjustment
    this.container.querySelector('#rb-servings')?.addEventListener('change', async (e) => {
      const servings = Number(e.target.value);
      try {
        const adjusted = await this.api.adjustPortions(this.selectedRecipe.id, servings);
        this.selectedRecipe = adjusted;
        this.renderDetail();
        showToast('Portions adjusted', 'success');
      } catch {
        showToast('Failed to adjust portions', 'error');
      }
    });

    // Ingredient substitution
    this.container.querySelectorAll('[data-action="substitute"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.ingredient;
        const reason = prompt(`Why substitute ${name}? (e.g. allergy, preference, availability)`);
        if (!reason) return;
        try {
          showToast('Finding substitute...', 'info');
          const result = await this.api.substituteIngredient(this.selectedRecipe.id, name, reason);
          alert(`Substitute: ${result.substitute}\n\nNotes: ${result.notes || ''}`);
        } catch {
          showToast('Failed to find substitute', 'error');
        }
      });
    });

    // Analyze nutrition
    this.container.querySelector('#rb-analyze-nutrition')?.addEventListener('click', async () => {
      try {
        showToast('Analyzing nutrition...', 'info');
        const result = await this.api.analyzeNutrition(this.selectedRecipe.id);
        this.showNutritionAnalysis(result);
      } catch {
        showToast('Failed to analyze nutrition', 'error');
      }
    });
  }

  showGenerateDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>AI Recipe Generator</h3><button class="btn-close" id="close-gen-modal">&times;</button></div>
        <div class="modal-body">
          <form id="gen-recipe-form">
            <label>What would you like to eat?<textarea name="prompt" rows="3" required placeholder="e.g. A high-protein Mediterranean lunch that's easy to meal prep"></textarea></label>
            <label>Dietary Preferences<input type="text" name="dietary" placeholder="vegan, gluten-free, low-carb..."></label>
            <div class="form-row">
              <label>Cuisine<input type="text" name="cuisine" placeholder="e.g. Japanese"></label>
              <label>Max Calories<input type="number" name="maxCalories" placeholder="Optional"></label>
              <label>Max Prep Time (min)<input type="number" name="maxTime" placeholder="Optional"></label>
            </div>
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
      const fd = new FormData(dialog.querySelector('#gen-recipe-form'));
      dialog.remove();
      try {
        showToast('Generating recipe with AI... This may take a moment.', 'info');
        const recipe = await this.api.generateRecipe({
          prompt: fd.get('prompt'),
          dietary: fd.get('dietary') || undefined,
          cuisine: fd.get('cuisine') || undefined,
          maxCalories: fd.get('maxCalories') ? Number(fd.get('maxCalories')) : undefined,
          maxPrepTime: fd.get('maxTime') ? Number(fd.get('maxTime')) : undefined,
        });
        this.selectedRecipe = recipe;
        this.renderDetail();
        showToast('Recipe generated!', 'success');
      } catch {
        showToast('Failed to generate recipe', 'error');
      }
    });
  }

  showNutritionAnalysis(result) {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    let body = '';
    if (result.perServing) {
      const n = result.perServing;
      body += `<h4>Per Serving</h4><div class="nutrition-grid">
        <div class="nutrition-item"><strong>${Math.round(n.calories || 0)}</strong>kcal</div>
        <div class="nutrition-item"><strong>${Math.round(n.protein || 0)}g</strong>Protein</div>
        <div class="nutrition-item"><strong>${Math.round(n.carbs || 0)}g</strong>Carbs</div>
        <div class="nutrition-item"><strong>${Math.round(n.fats || 0)}g</strong>Fat</div>
        <div class="nutrition-item"><strong>${Math.round(n.fiber || 0)}g</strong>Fiber</div>
        <div class="nutrition-item"><strong>${Math.round(n.sugar || 0)}g</strong>Sugar</div>
        <div class="nutrition-item"><strong>${Math.round(n.sodium || 0)}mg</strong>Sodium</div>
      </div>`;
    }
    if (result.analysis) {
      body += `<div class="nutrition-analysis"><h4>AI Analysis</h4><p>${this.escapeHtml(result.analysis)}</p></div>`;
    }

    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>Nutrition Analysis</h3><button class="btn-close" id="close-nutr-modal">&times;</button></div>
        <div class="modal-body">${body}</div>
      </div>
    `;
    document.body.appendChild(dialog);
    setTimeout(() => dialog.classList.add('show'), 10);
    dialog.querySelector('#close-nutr-modal')?.addEventListener('click', () => dialog.remove());
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
