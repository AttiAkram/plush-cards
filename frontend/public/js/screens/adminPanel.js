/**
 * Admin panel screen — user management, card catalog (placeholder).
 */

import { $, el, escHtml }                              from '../utils/dom.js';
import * as api                                        from '../api/client.js';
import { getState }                                    from '../state/store.js';
import { showScreen }                                  from '../router/index.js';
import { showToast }                                   from '../components/toast.js';
import { openCardEditor, duplicateCardEditor, initCardEditor } from './cardEditor.js';

const ROLE_LABELS = { root: 'AdminRoot', admin: 'Admin', player: 'Player' };

// ── User list ─────────────────────────────────────────────────────────────────

async function loadUsers() {
  const list = $('admin-user-list');
  list.innerHTML = '<div class="admin-loading">Caricamento…</div>';
  const users = await api.get('/api/admin/users');
  if (users.error) { list.innerHTML = `<div class="admin-loading">${escHtml(users.error)}</div>`; return; }
  renderUserList(users);
}

function renderUserList(users) {
  const list   = $('admin-user-list');
  const myRole = getState().role;
  const myName = getState().username?.toLowerCase();
  list.innerHTML = '';

  if (!users.length) {
    list.innerHTML = '<div class="admin-loading">Nessun utente trovato.</div>';
    return;
  }

  for (const u of users) {
    const row = el('div', 'admin-user-row');
    const isMe = u.username.toLowerCase() === myName;

    row.innerHTML = `
      <div class="admin-user-avatar">${escHtml(u.username[0].toUpperCase())}</div>
      <div class="admin-user-info">
        <span class="admin-user-name">${escHtml(u.username)}${isMe ? ' <em class="you-tag">(tu)</em>' : ''}</span>
        <span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] ?? u.role}</span>
      </div>
      <div class="admin-user-status ${u.disabled ? 'status-disabled' : 'status-active'}">
        ${u.disabled ? 'Disabilitato' : 'Attivo'}
      </div>
      <div class="admin-user-actions"></div>`;

    const actions = row.querySelector('.admin-user-actions');

    // Role selector (root only, not for self)
    if (myRole === 'root' && !isMe) {
      const sel = el('select', 'role-select');
      ['root', 'admin', 'player'].forEach(r => {
        const opt = document.createElement('option');
        opt.value    = r;
        opt.text     = ROLE_LABELS[r];
        opt.selected = r === u.role;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', async () => {
        const res = await api.patch(`/api/admin/users/${u.username}/role`, { role: sel.value });
        if (res.error) { showToast(res.error, true); sel.value = u.role; return; }
        u.role = sel.value;
        row.querySelector('.role-badge').textContent = ROLE_LABELS[u.role] ?? u.role;
        row.querySelector('.role-badge').className   = `role-badge role-${u.role}`;
        showToast('Ruolo aggiornato');
      });
      actions.appendChild(sel);
    }

    // Disable/enable button (not for root, not for self)
    if (u.role !== 'root' && !isMe) {
      const canAct = myRole === 'root' || (myRole === 'admin' && u.role === 'player');
      if (canAct) {
        const btn = el('button', `btn btn-sm ${u.disabled ? 'btn-primary' : 'btn-outline'}`);
        btn.textContent = u.disabled ? 'Abilita' : 'Disabilita';
        btn.addEventListener('click', async () => {
          const res = await api.patch(`/api/admin/users/${u.username}/disable`, {});
          if (res.error) { showToast(res.error, true); return; }
          u.disabled = res.disabled;
          row.querySelector('.admin-user-status').textContent = u.disabled ? 'Disabilitato' : 'Attivo';
          row.querySelector('.admin-user-status').className   = `admin-user-status ${u.disabled ? 'status-disabled' : 'status-active'}`;
          btn.textContent  = u.disabled ? 'Abilita' : 'Disabilita';
          btn.className    = `btn btn-sm ${u.disabled ? 'btn-primary' : 'btn-outline'}`;
          showToast(u.disabled ? 'Utente disabilitato' : 'Utente abilitato');
        });
        actions.appendChild(btn);
      }
    }

    list.appendChild(row);
  }
}

// ── Create user modal ─────────────────────────────────────────────────────────

function openNewUserModal() {
  $('new-user-username').value  = '';
  $('new-user-password').value  = '';
  $('new-user-role').value      = 'admin';
  $('new-user-error').textContent = '';

  // Admins can only create players
  const myRole = getState().role;
  if (myRole === 'admin') {
    $('new-user-role').value   = 'player';
    $('new-user-role-group').classList.add('hidden');
  } else {
    $('new-user-role-group').classList.remove('hidden');
  }

  $('modal-new-user').classList.remove('hidden');
  $('new-user-username').focus();
}

function closeNewUserModal() { $('modal-new-user').classList.add('hidden'); }

function initNewUserModal() {
  $('btn-new-user').addEventListener('click', openNewUserModal);
  $('btn-cancel-new-user').addEventListener('click', closeNewUserModal);
  $('modal-new-user-overlay').addEventListener('click', closeNewUserModal);

  $('btn-confirm-new-user').addEventListener('click', async () => {
    const username = $('new-user-username').value.trim();
    const password = $('new-user-password').value;
    const role     = $('new-user-role').value;
    const errorEl  = $('new-user-error');
    errorEl.textContent = '';

    if (!username || !password) { errorEl.textContent = 'Compila tutti i campi'; return; }

    const btn = $('btn-confirm-new-user');
    btn.disabled = true;
    try {
      const res = await api.post('/api/admin/users', { username, password, role });
      if (res.error) { errorEl.textContent = res.error; return; }
      closeNewUserModal();
      showToast(`Utente "${username}" creato`);
      loadUsers();
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Card list ─────────────────────────────────────────────────────────────────

const RARITY_LABELS_CARD = {
  c: 'C', r: 'R', m: 'M', s: 'S', ss: 'SS',
};

let _allCards    = [];
let _selectedIds = new Set();   // set of card IDs currently checked

function updateBulkBar() {
  const n        = _selectedIds.size;
  const bar      = $('bulk-action-bar');
  const countEl  = $('bulk-count');
  if (!bar) return;
  bar.classList.toggle('hidden', n === 0);
  if (countEl) countEl.textContent = `${n} selezionat${n === 1 ? 'a' : 'e'}`;
}

function updateSelectAllCheckbox(filteredCards) {
  const cb = $('card-select-all');
  if (!cb) return;
  const all = filteredCards.length > 0 && filteredCards.every(c => _selectedIds.has(c.id));
  cb.checked       = all;
  cb.indeterminate = !all && filteredCards.some(c => _selectedIds.has(c.id));
}

async function bulkToggleActive(activate) {
  const ids = Array.from(_selectedIds);
  if (!confirm(`${activate ? 'Attivare' : 'Disattivare'} ${ids.length} carte selezionate?`)) return;
  for (const id of ids) {
    const card = _allCards.find(c => c.id === id);
    if (!card || card.active === activate) continue;
    const res = await api.patch(`/api/admin/cards/${id}/toggle`, {});
    if (!res.error) card.active = res.active;
  }
  showToast(`${ids.length} carte ${activate ? 'attivate' : 'disattivate'}`);
  _selectedIds.clear();
  applyCardFilters();
}

async function bulkDuplicate() {
  const ids = Array.from(_selectedIds);
  if (!confirm(`Duplicare ${ids.length} carte selezionate?`)) return;
  let count = 0;
  for (const id of ids) {
    const card = _allCards.find(c => c.id === id);
    if (!card) continue;
    const suffix = `_copy${Date.now() % 100000}`;
    const body = { ...card, id: `${id}${suffix}`, name: `${card.name} (copia)`, active: false };
    const res = await api.post('/api/admin/cards', body);
    if (!res.error) count++;
  }
  showToast(`${count} carte duplicate`);
  _selectedIds.clear();
  loadCards();
}

function bulkExport() {
  const ids      = Array.from(_selectedIds);
  const toExport = _allCards.filter(c => ids.includes(c.id));
  const json     = JSON.stringify(toExport, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `plush-cards-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`${ids.length} carte esportate`);
}

async function loadCards() {
  const list = $('admin-card-list');
  list.innerHTML = '<div class="admin-loading">Caricamento…</div>';
  const cards = await api.get('/api/admin/cards');
  if (cards.error) { list.innerHTML = `<div class="admin-loading">${escHtml(cards.error)}</div>`; return; }
  _allCards = cards;
  _selectedIds.clear();
  updateBulkBar();
  applyCardFilters();
}

function applyCardFilters() {
  const search  = ($('card-filter-search')?.value  ?? '').toLowerCase();
  const type    =  $('card-filter-type')?.value    ?? '';
  const rarity  =  $('card-filter-rarity')?.value  ?? '';
  const active  =  $('card-filter-active')?.value  ?? '';

  const filtered = _allCards.filter(c => {
    if (search && !c.name.toLowerCase().includes(search)) return false;
    if (type   && c.type    !== type)                      return false;
    if (rarity && c.rarity  !== rarity)                    return false;
    if (active === 'active' && !c.active)                  return false;
    if (active === 'draft'  &&  c.active)                  return false;
    return true;
  });

  renderCardList(filtered);
}

let _filteredCards = [];   // current visible card set (used for select-all)

function renderCardList(cards) {
  _filteredCards = cards;
  const list = $('admin-card-list');
  list.innerHTML = '';

  updateSelectAllCheckbox(cards);

  if (!cards.length) {
    list.innerHTML = '<div class="admin-loading">Nessuna carta trovata.</div>';
    return;
  }

  for (const card of cards) {
    const tagsHtml = (card.tags ?? []).length
      ? card.tags.map(t => `<span class="admin-card-tag">${escHtml(t)}</span>`).join('')
      : '';

    const isSelected = _selectedIds.has(card.id);
    const row = el('div', `admin-card-row${isSelected ? ' row-selected' : ''}`);
    row.innerHTML = `
      <div class="admin-card-check">
        <input type="checkbox" class="admin-row-cb" data-id="${escHtml(card.id)}" aria-label="Seleziona ${escHtml(card.name)}"${isSelected ? ' checked' : ''}>
      </div>
      <div class="admin-card-rarity-badge rarity-${card.rarity}">${RARITY_LABELS_CARD[card.rarity] ?? '?'}</div>
      <div class="admin-card-info">
        <span class="admin-card-name">${escHtml(card.name)}</span>
        <span class="admin-card-meta">${escHtml(card.type)} · ATK ${card.damage} · HP ${card.hp} · ${card.effects?.length ?? 0} effett${card.effects?.length === 1 ? 'o' : 'i'}${card.role && card.role !== 'neutro' ? ` · <em>${escHtml(card.role)}</em>` : ''}</span>
        ${tagsHtml ? `<div class="admin-card-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="admin-card-status ${card.active ? 'status-active' : 'status-disabled'}">${card.active ? 'Attiva' : 'Bozza'}</div>
      <div class="admin-card-actions"></div>`;

    // Checkbox behaviour
    const cb = row.querySelector('.admin-row-cb');
    cb.addEventListener('change', () => {
      if (cb.checked) _selectedIds.add(card.id); else _selectedIds.delete(card.id);
      row.classList.toggle('row-selected', cb.checked);
      updateBulkBar();
      updateSelectAllCheckbox(_filteredCards);
    });

    const actions = row.querySelector('.admin-card-actions');

    // Toggle active
    const toggleBtn = el('button', `btn btn-sm ${card.active ? 'btn-outline' : 'btn-primary'}`);
    toggleBtn.textContent = card.active ? 'Disattiva' : 'Attiva';
    toggleBtn.addEventListener('click', async () => {
      const res = await api.patch(`/api/admin/cards/${card.id}/toggle`, {});
      if (res.error) { showToast(res.error, true); return; }
      card.active = res.active;
      row.querySelector('.admin-card-status').textContent = card.active ? 'Attiva' : 'Bozza';
      row.querySelector('.admin-card-status').className   = `admin-card-status ${card.active ? 'status-active' : 'status-disabled'}`;
      toggleBtn.textContent = card.active ? 'Disattiva' : 'Attiva';
      toggleBtn.className   = `btn btn-sm ${card.active ? 'btn-outline' : 'btn-primary'}`;
      showToast(card.active ? 'Carta attivata' : 'Carta disattivata');
    });

    const editBtn = el('button', 'btn btn-sm btn-outline');
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => openCardEditor(card, loadCards));

    const dupBtn = el('button', 'btn btn-sm btn-outline');
    dupBtn.textContent = 'Duplica';
    dupBtn.title = 'Crea una copia di questa carta';
    dupBtn.addEventListener('click', () => duplicateCardEditor(card, loadCards));

    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(dupBtn);
    list.appendChild(row);
  }
}

function initCardFilters() {
  [$('card-filter-search'), $('card-filter-type'), $('card-filter-rarity'), $('card-filter-active')]
    .forEach(el => el?.addEventListener('input', applyCardFilters));
}

// ── Tab switching (extended to load data) ─────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      const pane = $('admin-tab-' + btn.dataset.tab);
      pane.classList.remove('hidden');
      if (btn.dataset.tab === 'cards') loadCards();
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function enterAdmin() {
  // Reset to users tab
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
  document.querySelector('.admin-tab[data-tab="users"]')?.classList.add('active');
  $('admin-tab-users').classList.remove('hidden');

  loadUsers();
  showScreen('admin');
}

function initBulkActions() {
  // Select-all checkbox
  $('card-select-all')?.addEventListener('change', e => {
    if (e.target.checked) {
      _filteredCards.forEach(c => _selectedIds.add(c.id));
    } else {
      _filteredCards.forEach(c => _selectedIds.delete(c.id));
    }
    updateBulkBar();
    // Re-render so checkboxes reflect state
    renderCardList(_filteredCards);
  });

  // Bulk bar actions
  $('btn-bulk-activate')?.addEventListener('click',   () => bulkToggleActive(true));
  $('btn-bulk-deactivate')?.addEventListener('click', () => bulkToggleActive(false));
  $('btn-bulk-duplicate')?.addEventListener('click',  () => bulkDuplicate());
  $('btn-bulk-export')?.addEventListener('click',     () => bulkExport());
  $('btn-bulk-deselect')?.addEventListener('click', () => {
    _selectedIds.clear();
    updateBulkBar();
    renderCardList(_filteredCards);
  });
}

export function initAdminScreen() {
  initTabs();
  initNewUserModal();
  initCardEditor();
  initCardFilters();
  initBulkActions();

  $('btn-new-card').addEventListener('click', () => openCardEditor(null, loadCards));

  $('btn-back-admin').addEventListener('click', () => {
    import('./lobby.js').then(({ enterLobby }) => enterLobby());
  });
}
