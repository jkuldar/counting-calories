// Shopping List view component
import { showToast } from './utils.js';

export class ShoppingListView {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.lists = [];
    this.selectedList = null;
  }

  async load() {
    this.container.innerHTML = '<div class="loading-spinner">Loading shopping lists...</div>';
    try {
      this.lists = await this.api.getShoppingLists().catch(() => []);
      if (this.selectedList) {
        const fresh = this.lists.find(l => l.id === this.selectedList.id);
        this.selectedList = fresh || null;
      }
      this.render();
    } catch {
      this.container.innerHTML = '<div class="error-state">Failed to load shopping lists.</div>';
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="shopping-list-view">
        <div class="section-header">
          <h2>Shopping Lists</h2>
        </div>

        ${this.selectedList ? this.renderDetail() : this.renderListOverview()}
      </div>
    `;
    this.attachListeners();
  }

  renderListOverview() {
    if (!this.lists.length) {
      return `
        <div class="empty-state">
          <h3>No Shopping Lists</h3>
          <p>Generate a shopping list from your meal plan.</p>
        </div>
      `;
    }

    return `
      <div class="sl-grid">
        ${this.lists.map(list => {
          const items = list.items || [];
          const checked = items.filter(i => i.isChecked).length;
          const total = items.length;
          const pct = total ? Math.round((checked / total) * 100) : 0;
          return `
            <div class="sl-card" data-list-id="${list.id}">
              <h4>${this.escapeHtml(list.name || 'Shopping List')}</h4>
              <div class="sl-card__meta">
                <span>${new Date(list.createdAt).toLocaleDateString()}</span>
                <span>${checked}/${total} items</span>
              </div>
              <div class="sl-card__bar"><div class="sl-card__fill" style="width:${pct}%"></div></div>
              <div class="sl-card__actions">
                <button class="btn-xs" data-action="view" data-list-id="${list.id}">Open</button>
                <button class="btn-xs btn-danger-xs" data-action="delete" data-list-id="${list.id}">Delete</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderDetail() {
    const list = this.selectedList;
    const items = list.items || [];

    // Group by category
    const categories = {};
    for (const item of items) {
      const cat = item.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    }

    const catOrder = ['Produce', 'Protein', 'Dairy', 'Grains', 'Nuts & Seeds', 'Oils & Fats', 'Condiments', 'Spices', 'Baking', 'Beverages', 'Other'];
    const sortedCats = Object.entries(categories).sort(([a], [b]) => {
      const ai = catOrder.indexOf(a);
      const bi = catOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const checked = items.filter(i => i.isChecked).length;
    const total = items.length;

    return `
      <button class="btn-secondary btn-back" id="sl-back">&larr; All Lists</button>

      <div class="sl-detail-header">
        <h3>${this.escapeHtml(list.name || 'Shopping List')}</h3>
        <span class="sl-progress">${checked}/${total} items checked</span>
      </div>

      <div class="sl-categories">
        ${sortedCats.map(([cat, catItems]) => `
          <div class="sl-category">
            <h4 class="sl-category__title">${this.escapeHtml(cat)}</h4>
            <ul class="sl-items">
              ${catItems.map(item => `
                <li class="sl-item ${item.isChecked ? 'checked' : ''}">
                  <label class="sl-item__check">
                    <input type="checkbox" ${item.isChecked ? 'checked' : ''} data-item-id="${item.id}" data-action="toggle">
                    <span class="sl-item__name">${this.escapeHtml(item.name)}</span>
                  </label>
                  <span class="sl-item__qty" data-item-id="${item.id}" data-action="edit-qty" title="Click to edit">
                    ${item.quantity} ${item.unit || ''}
                  </span>
                  <button class="btn-xs btn-danger-xs" data-action="remove-item" data-item-id="${item.id}">&times;</button>
                </li>
              `).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    `;
  }

  attachListeners() {
    // Back
    this.container.querySelector('#sl-back')?.addEventListener('click', () => {
      this.selectedList = null;
      this.render();
    });

    // Open list card
    this.container.querySelectorAll('.sl-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        this.selectedList = this.lists.find(l => l.id === card.dataset.listId);
        this.render();
      });
    });

    // Delegated actions
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const listId = btn.dataset.listId;
      const itemId = btn.dataset.itemId;

      switch (action) {
        case 'view':
          this.selectedList = this.lists.find(l => l.id === listId);
          this.render();
          break;
        case 'delete':
          await this.handleDelete(listId);
          break;
        case 'remove-item':
          await this.handleRemoveItem(itemId);
          break;
      }
    });

    // Toggle item
    this.container.addEventListener('change', async (e) => {
      const cb = e.target.closest('[data-action="toggle"]');
      if (!cb) return;
      try {
        await this.api.toggleShoppingItem(cb.dataset.itemId);
        await this.load();
      } catch {
        showToast('Failed to update item', 'error');
      }
    });

    // Edit quantity
    this.container.querySelectorAll('[data-action="edit-qty"]').forEach(el => {
      el.addEventListener('click', async () => {
        const newQty = prompt('New quantity:', el.textContent.trim());
        if (newQty === null) return;
        try {
          await this.api.updateShoppingItemQuantity(el.dataset.itemId, newQty);
          await this.load();
          showToast('Quantity updated', 'success');
        } catch {
          showToast('Failed to update quantity', 'error');
        }
      });
    });
  }

  async handleDelete(listId) {
    if (!confirm('Delete this shopping list?')) return;
    try {
      await this.api.deleteShoppingList(listId);
      showToast('Shopping list deleted', 'success');
      this.selectedList = null;
      await this.load();
    } catch {
      showToast('Failed to delete shopping list', 'error');
    }
  }

  async handleRemoveItem(itemId) {
    try {
      await this.api.removeShoppingItem(itemId);
      showToast('Item removed', 'success');
      await this.load();
    } catch {
      showToast('Failed to remove item', 'error');
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
