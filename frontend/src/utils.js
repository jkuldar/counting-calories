// Utility functions

// BMI calculation
export function calculateBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getBMIClass(bmi) {
  if (!bmi || bmi < 0) return 'Invalid';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

// Date formatting
export function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// Validation
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePositiveNumber(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0;
}

export function validateAge(age) {
  const num = parseInt(age);
  return !isNaN(num) && num >= 13 && num <= 120;
}

// Error handling
export function getErrorMessage(error) {
  if (error.data?.message) return error.data.message;
  if (error.message) return error.message;
  return 'An unexpected error occurred';
}

// Loading state helpers
export function showLoading(element) {
  element.classList.add('loading');
  element.setAttribute('aria-busy', 'true');
}

export function hideLoading(element) {
  element.classList.remove('loading');
  element.removeAttribute('aria-busy');
}

// Debounce
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function getToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'success') {
  if (!message) return;
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

// Custom modal dialogs
export function showConfirm(options) {
  return new Promise((resolve) => {
    const {
      title = 'Confirm',
      message = 'Are you sure?',
      confirmText = 'OK',
      cancelText = 'Cancel',
      type = 'default' // 'default', 'danger', 'warning'
    } = options;

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'modal-title');

    // Create modal content
    const modal = document.createElement('div');
    modal.className = `modal-dialog modal-${type}`;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 id="modal-title" class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">
        <p class="modal-message">${message}</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary modal-cancel" type="button">${cancelText}</button>
        <button class="btn btn-primary modal-confirm ${type === 'danger' ? 'btn-danger' : ''}" type="button">${confirmText}</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Add entrance animation
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
    });

    // Handle actions
    const cleanup = (result) => {
      backdrop.classList.remove('show');
      setTimeout(() => {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
      }, 200);
      resolve(result);
    };

    modal.querySelector('.modal-cancel').addEventListener('click', () => cleanup(false));
    modal.querySelector('.modal-confirm').addEventListener('click', () => cleanup(true));
    
    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup(false);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus the confirm button
    setTimeout(() => {
      modal.querySelector('.modal-confirm').focus();
    }, 100);
  });
}

export function showAlert(options) {
  return new Promise((resolve) => {
    const {
      title = 'Alert',
      message = '',
      confirmText = 'OK',
      type = 'default' // 'default', 'success', 'danger', 'warning'
    } = options;

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'modal-title');

    // Create modal content
    const modal = document.createElement('div');
    modal.className = `modal-dialog modal-${type}`;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 id="modal-title" class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">
        <p class="modal-message">${message}</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary modal-confirm" type="button">${confirmText}</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Add entrance animation
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
    });

    // Handle actions
    const cleanup = () => {
      backdrop.classList.remove('show');
      setTimeout(() => {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
      }, 200);
      resolve();
    };

    modal.querySelector('.modal-confirm').addEventListener('click', cleanup);
    
    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup();
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus the confirm button
    setTimeout(() => {
      modal.querySelector('.modal-confirm').focus();
    }, 100);
  });
}
