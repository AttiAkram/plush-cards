/**
 * Admin panel screen — user management, card catalog (placeholder).
 */

import { $, el, escHtml }   from '../utils/dom.js';
import * as api              from '../api/client.js';
import { getState }          from '../state/store.js';
import { showScreen }        from '../router/index.js';
import { showToast }         from '../components/toast.js';

const ROLE_LABELS = { root: 'AdminRoot', admin: 'Admin', player: 'Player' };

// ── Tab switching ─────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      $('admin-tab-' + btn.dataset.tab).classList.remove('hidden');
    });
  });
}

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

export function initAdminScreen() {
  initTabs();
  initNewUserModal();

  $('btn-back-admin').addEventListener('click', () => {
    import('./lobby.js').then(({ enterLobby }) => enterLobby());
  });
}
