// Main application
import { API } from './api.js';
import { Auth } from './auth.js';
import { Dashboard } from './dashboard.js';
import { ProfileForm } from './profile-form.js';
import { Charts } from './charts.js';
import { ComparisonView } from './comparison-view.js';
import { PrivacySettings } from './privacy-settings.js';
import { MealPlanView } from './meal-plan-view.js';
import { RecipeBrowserView } from './recipe-browser.js';
import { NutritionTrackerView } from './nutrition-tracker.js';
import { ShoppingListView } from './shopping-list-view.js';
import { showToast, showConfirm } from './utils.js';

class App {
  constructor() {
    this.api = new API();
    this.currentView = 'dashboard';
    this.components = {};
    
    this.init();
  }

  init() {
    this.initDarkMode();
    this.renderNav();
    this.checkAuth();
    this.attachGlobalListeners();
  }

  renderNav() {
    const nav = document.getElementById('app-nav');
    nav.innerHTML = `
      <nav class="main-nav">
        <div class="nav-brand">
          <h1><span class="brand-thin">COUNTING</span> <span class="brand-bold">CALORIES</span></h1>
        </div>
        <button class="burger-menu" id="burger-menu" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="nav-links">
          <button class="nav-link active" data-view="dashboard">Dashboard</button>
          <button class="nav-link" data-view="profile">Profile</button>
          <button class="nav-link" data-view="charts">Charts</button>
          <button class="nav-link" data-view="comparison">Compare</button>
          <button class="nav-link" data-view="meals">Meals</button>
          <button class="nav-link" data-view="recipes">Recipes</button>
          <button class="nav-link" data-view="nutrition">Nutrition</button>
          <button class="nav-link" data-view="shopping">Shopping</button>
          <button class="nav-link" data-view="privacy">Privacy</button>
        </div>
        <div class="nav-actions">
          <button class="btn-icon btn-darkmode" id="darkmode-btn" title="Toggle dark mode" aria-label="Toggle dark mode">Dark</button>
          <button class="btn-icon btn-logout" id="logout-btn" title="Logi välja" aria-label="Logi välja">
            <span class="btn-icon__glyph">⏻</span>
            <span class="btn-icon__label">Logi välja</span>
          </button>
        </div>
      </nav>
    `;

    // Handle mobile menu structure
    const handleMobileMenu = () => {
      const navLinksContainer = nav.querySelector('.nav-links');
      const navActions = nav.querySelector('.nav-actions');
      const isMobile = window.innerWidth <= 1200;

      if (isMobile) {
        // On mobile, move actions inside nav-links if not already there
        if (navActions && navActions.parentElement?.classList.contains('main-nav')) {
          navLinksContainer.appendChild(navActions);
        }
      } else {
        // On desktop, move actions back to main nav if not already there
        if (navActions && !navActions.parentElement?.classList.contains('main-nav')) {
          nav.querySelector('.main-nav').appendChild(navActions);
        }
      }
    };

    // Initial setup
    handleMobileMenu();
    
    // Handle resize
    window.addEventListener('resize', handleMobileMenu);

    // Burger menu toggle
    const burgerMenu = document.getElementById('burger-menu');
    const navLinksContainer = nav.querySelector('.nav-links');
    
    burgerMenu?.addEventListener('click', () => {
      burgerMenu.classList.toggle('active');
      navLinksContainer.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });

    // Nav click handlers
    const navLinks = nav.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        const view = link.dataset.view;
        this.navigateTo(view);
        
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Close mobile menu on navigation
        burgerMenu?.classList.remove('active');
        navLinksContainer?.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });

    // Dark mode toggle button
    const darkModeBtn = document.getElementById('darkmode-btn');
    this.updateDarkModeBtn(darkModeBtn);
    darkModeBtn?.addEventListener('click', () => {
      this.toggleDarkMode();
      this.updateDarkModeBtn(darkModeBtn);
      // Close mobile menu
      burgerMenu?.classList.remove('active');
      navLinksContainer?.classList.remove('active');
      document.body.classList.remove('menu-open');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      const confirmed = await showConfirm({
        title: 'Logout',
        message: 'Are you sure you want to logout?',
        confirmText: 'Logout',
        cancelText: 'Cancel',
        type: 'warning'
      });
      
      if (confirmed) {
        localStorage.removeItem('ndli_access_token');
        location.reload();
      }
    });
  }

  async checkAuth() {
    const token = this.api.getToken();
    
    // Check for email verification
    const urlParams = new URLSearchParams(window.location.search);
    const verificationCode = urlParams.get('code');
    
    if (verificationCode) {
      // Email verification callback
      this.handleEmailVerification(verificationCode);
      return;
    }
    
    // Check for OAuth callback (one-time code — never raw tokens in URL)
    const oauthCode = urlParams.get('oauthCode');

    if (oauthCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      try {
        const tokens = await this.api.exchangeOAuthCode(oauthCode);
        this.api.setToken(tokens.accessToken);
        if (tokens.refreshToken) {
          localStorage.setItem('ndli_refresh_token', tokens.refreshToken);
        }
      } catch {
        // Exchange failed – fall through to show auth screen
        this.showAuthScreen();
        return;
      }
      this.navigateTo('dashboard');
      return;
    }

    // Check for password reset callback
    const resetToken = urlParams.get('token');
    if (resetToken && window.location.pathname.includes('reset-password')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      this.handlePasswordReset(resetToken);
      return;
    }
    
    if (!token) {
      this.showAuthScreen();
    } else {
      this.navigateTo('dashboard');
    }
  }

  async handleEmailVerification(code) {
    const container = document.getElementById('app-content');
    container.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1>E-maili kinnitamine</h1>
          </div>
          <div class="auth-body">
            <div class="verification-status">
              <div class="loading-spinner">Verifying your email...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    try {
      await this.api.verifyEmail(code);
      
      // Success - show message and redirect to login
      container.innerHTML = `
        <div class="auth-container">
          <div class="auth-card">
            <div class="auth-header">
              <h1>Email Verification</h1>
            </div>
            <div class="auth-body">
              <div class="verification-notice">
                <div class="verification-icon">✅</div>
                <h3>Suurepärane!</h3>
                <p>Your email has been verified successfully.</p>
                <p>Nüüd saad sisse logida.</p>
                <button class="btn-primary" id="goto-login">
                  Logi sisse
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Attach login button handler
      document.getElementById('goto-login')?.addEventListener('click', () => {
        this.showAuthScreen();
      });

    } catch (error) {
      // Error - show message
      container.innerHTML = `
        <div class="auth-container">
          <div class="auth-card">
            <div class="auth-header">
              <h1>Verification Failed</h1>
            </div>
            <div class="auth-body">
              <div class="verification-notice">
                <div class="verification-icon">❌</div>
                <h3>Something went wrong</h3>
                <p>${error.message || 'The verification code is invalid or has expired.'}</p>
                <button class="btn-primary" id="goto-login">
                  Back to sign in
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Attach login button handler
      document.getElementById('goto-login')?.addEventListener('click', () => {
        this.showAuthScreen();
      });
    }
  }

  handlePasswordReset(resetToken) {
    // Hide nav during reset flow
    const nav = document.getElementById('app-nav');
    if (nav) nav.style.display = 'none';

    const container = document.getElementById('app-content');
    container.innerHTML = `
      <div class="auth-page">
        <div class="auth-container">
          <div class="auth-card">
            <div class="auth-header">
              <h2>Counting Calories</h2>
              <p class="auth-subtitle">Create a new password</p>
            </div>
            <div class="auth-body">
              <form id="reset-password-form" class="auth-form">
                <div class="form-group">
                  <label>New password</label>
                  <input
                    type="password"
                    name="newPassword"
                    placeholder="At least 8 characters"
                    required
                    autocomplete="new-password"
                    minlength="8"
                  />
                  <small class="form-hint">At least 8 characters</small>
                </div>
                <div class="form-group">
                  <label>Confirm new password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="••••••••"
                    required
                    autocomplete="new-password"
                  />
                </div>
                <div id="reset-error" class="auth-error" style="display:none;"></div>
                <div id="reset-success" class="auth-success" style="display:none;"></div>
                <button type="submit" class="btn-primary btn-block">Set new password</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#reset-password-form');
    const errorEl = container.querySelector('#reset-error');
    const successEl = container.querySelector('#reset-success');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = form.newPassword.value;
      const confirmPassword = form.confirmPassword.value;
      const submitBtn = form.querySelector('button[type="submit"]');

      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      if (newPassword !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.style.display = 'block';
        return;
      }

      if (newPassword.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters';
        errorEl.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        await this.api.resetPassword(resetToken, newPassword);
        successEl.textContent = 'Password changed! You can now sign in with your new password.';
        successEl.style.display = 'block';
        form.reset();
        form.style.display = 'none';

        setTimeout(() => {
          if (nav) nav.style.display = '';
          this.renderNav();
          this.showAuthScreen();
        }, 2500);
      } catch (error) {
        errorEl.textContent = error.message || 'Password reset failed. The link may have expired.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Set new password';
      }
    });
  }

  showAuthScreen() {
    // Hide nav while user is not logged in
    const nav = document.getElementById('app-nav');
    if (nav) nav.style.display = 'none';

    const container = document.getElementById('app-content');
    container.innerHTML = '<div id="auth-container"></div>';
    
    const authContainer = document.getElementById('auth-container');
    const auth = new Auth(authContainer, this.api, () => {
      // Show nav again after successful login
      if (nav) nav.style.display = '';
      this.renderNav();
      this.navigateTo('dashboard');
    });
    
    auth.render();
  }

  initDarkMode() {
    const saved = localStorage.getItem('ndli_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ndli_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('ndli_theme', 'dark');
    }
  }

  updateDarkModeBtn(btn) {
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? 'Light' : 'Dark';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  async navigateTo(view) {
    // Guard: redirect to auth if not logged in
    if (!this.api.getToken()) {
      this.showAuthScreen();
      return;
    }

    this.currentView = view;
    const container = document.getElementById('app-content');
    container.innerHTML = '<div class="loading-spinner">Loading...</div>';

    // Update active navigation link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      if (link.dataset.view === view) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    try {
      switch (view) {
        case 'dashboard':
          await this.renderDashboard(container);
          break;
        case 'profile':
          await this.renderProfile(container);
          break;
        case 'charts':
          await this.renderCharts(container);
          break;
        case 'comparison':
          await this.renderComparison(container);
          break;
        case 'privacy':
          await this.renderPrivacy(container);
          break;
        case 'meals':
          await this.renderMealPlan(container);
          break;
        case 'recipes':
          await this.renderRecipes(container);
          break;
        case 'nutrition':
          await this.renderNutrition(container);
          break;
        case 'shopping':
          await this.renderShopping(container);
          break;
      }
    } catch (error) {
      container.innerHTML = `<div class="error-state">Failed to load view: ${error.message}</div>`;
    }
  }

  async renderDashboard(container) {
    container.innerHTML = '<div id="dashboard-container"></div>';
    const dashboardEl = document.getElementById('dashboard-container');
    
    const dashboard = new Dashboard(dashboardEl, this.api);
    dashboard.onCreateProfile = () => this.navigateTo('profile');
    dashboard.onAddWeight = () => this.showAddWeightModal();
    dashboard.onAddActivity = () => this.showAddActivityModal();
    
    await dashboard.load();
    this.components.dashboard = dashboard;
  }

  async renderProfile(container) {
    container.innerHTML = '<div id="profile-container"></div>';
    const profileEl = document.getElementById('profile-container');
    
    const profileForm = new ProfileForm(profileEl, this.api, () => {
      this.navigateTo('dashboard');
    });
    
    await profileForm.loadProfile();
    this.components.profileForm = profileForm;
  }

  async renderCharts(container) {
    container.innerHTML = '<div id="charts-container"></div>';
    const chartsEl = document.getElementById('charts-container');
    
    const charts = new Charts(chartsEl, this.api);
    await charts.load();
    this.components.charts = charts;
  }

  async renderComparison(container) {
    container.innerHTML = '<div id="comparison-container"></div>';
    const comparisonEl = document.getElementById('comparison-container');
    
    const comparison = new ComparisonView(comparisonEl, this.api);
    await comparison.load();
    this.components.comparison = comparison;
  }

  async renderPrivacy(container) {
    container.innerHTML = '<div id="privacy-container"></div>';
    const privacyEl = document.getElementById('privacy-container');
    
    const privacy = new PrivacySettings(privacyEl, this.api);
    await privacy.load();
    this.components.privacy = privacy;
  }

  async renderMealPlan(container) {
    container.innerHTML = '<div id="meal-plan-container"></div>';
    const el = document.getElementById('meal-plan-container');
    const view = new MealPlanView(el, this.api);
    view.onViewRecipe = (recipeId) => {
      this.currentView = 'recipes';
      this.navigateToRecipe(recipeId);
    };
    view.onNavigateShoppingList = () => this.navigateTo('shopping');
    await view.load();
    this.components.mealPlan = view;
  }

  async renderRecipes(container, recipeId) {
    container.innerHTML = '<div id="recipe-container"></div>';
    const el = document.getElementById('recipe-container');
    const view = new RecipeBrowserView(el, this.api);
    await view.load(recipeId);
    this.components.recipes = view;
  }

  navigateToRecipe(recipeId) {
    const container = document.getElementById('app-content');
    container.innerHTML = '<div class="loading-spinner">Loading...</div>';
    this.renderRecipes(container, recipeId);
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === 'recipes'));
  }

  async renderNutrition(container) {
    container.innerHTML = '<div id="nutrition-container"></div>';
    const el = document.getElementById('nutrition-container');
    const view = new NutritionTrackerView(el, this.api);
    await view.load();
    this.components.nutrition = view;
  }

  async renderShopping(container) {
    container.innerHTML = '<div id="shopping-container"></div>';
    const el = document.getElementById('shopping-container');
    const view = new ShoppingListView(el, this.api);
    await view.load();
    this.components.shopping = view;
  }

  showAddWeightModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Log Weight</h3>
          <button class="btn-close" id="close-modal">×</button>
        </div>
        <div class="modal-body">
          <form id="add-weight-form">
            <label>
              <span>Weight (kg) *</span>
              <input type="number" name="weightKg" step="0.1" min="20" max="500" required />
            </label>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn-primary" id="modal-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => document.body.removeChild(modal), 300);
    };

    modal.querySelector('#close-modal').addEventListener('click', close);
    modal.querySelector('#modal-cancel').addEventListener('click', close);

    modal.querySelector('#modal-save').addEventListener('click', async () => {
      const form = modal.querySelector('#add-weight-form');
      const weightKg = parseFloat(form.weightKg.value);
      
      if (weightKg) {
        try {
          await this.api.addWeightEntry(weightKg);
          close();
          this.navigateTo('dashboard');
        } catch (error) {
          showToast(`Failed to save weight: ${error.message}`, 'error');
        }
      }
    });
  }

  showAddActivityModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Log Activity</h3>
          <button class="btn-close" id="close-modal">×</button>
        </div>
        <div class="modal-body">
          <form id="add-activity-form">
            <label>
              <span>Type *</span>
              <input type="text" name="type" placeholder="Running, yoga, cycling" required />
            </label>
            <label>
              <span>Duration (minutes)</span>
              <input type="number" name="durationMin" min="1" max="1440" step="1" />
            </label>
            <label>
              <span>Intensity</span>
              <select name="intensity">
                <option value="">Select</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              <span>Steps</span>
              <input type="number" name="steps" min="0" max="200000" step="1" />
            </label>
            <label>
              <span>Calories</span>
              <input type="number" name="calories" min="0" max="10000" step="1" />
            </label>
            <label>
              <span>When</span>
              <input type="datetime-local" name="loggedAt" />
            </label>
            <label>
              <span>Note</span>
              <input type="text" name="note" maxlength="120" />
            </label>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn-primary" id="modal-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => document.body.removeChild(modal), 300);
    };

    modal.querySelector('#close-modal').addEventListener('click', close);
    modal.querySelector('#modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector('#modal-save').addEventListener('click', async () => {
      const form = modal.querySelector('#add-activity-form');
      const type = form.type.value.trim();
      const durationMin = form.durationMin.value ? Number(form.durationMin.value) : undefined;
      const intensity = form.intensity.value || undefined;
      const steps = form.steps.value ? Number(form.steps.value) : undefined;
      const calories = form.calories.value ? Number(form.calories.value) : undefined;
      const loggedAt = form.loggedAt.value ? new Date(form.loggedAt.value).toISOString() : undefined;
      const note = form.note.value.trim() || undefined;

      if (!type) {
        showToast('Activity type is required.', 'error');
        return;
      }

      try {
        await this.api.addActivityEntry({
          type,
          durationMin,
          intensity,
          steps,
          calories,
          loggedAt,
          note,
        });
        close();
        this.navigateTo('dashboard');
      } catch (error) {
        showToast(`Failed to save activity: ${error.message}`, 'error');
      }
    });
  }

  attachGlobalListeners() {
    // Session expired – refresh token rotation failed, show login screen
    window.addEventListener('auth:expired', () => {
      this.showAuthScreen();
    });

    // Handle API errors globally
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
      const nav = document.querySelector('.main-nav');
      const burgerMenu = document.getElementById('burger-menu');
      const navLinks = document.querySelector('.nav-links');
      
      if (nav && burgerMenu && navLinks && 
          !nav.contains(e.target) && 
          navLinks.classList.contains('active')) {
        burgerMenu.classList.remove('active');
        navLinks.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });

    // Close mobile menu on scroll
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const burgerMenu = document.getElementById('burger-menu');
      const navLinks = document.querySelector('.nav-links');
      
      if (burgerMenu && navLinks && navLinks.classList.contains('active')) {
        if (Math.abs(window.scrollY - lastScrollY) > 50) {
          burgerMenu.classList.remove('active');
          navLinks.classList.remove('active');
          document.body.classList.remove('menu-open');
        }
      }
      lastScrollY = window.scrollY;
    });
  }
}

// Initialize app
new App();
