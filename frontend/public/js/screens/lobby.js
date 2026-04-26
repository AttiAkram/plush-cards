/**
 * Lobby screen — room list, create room, join by code.
 */

import { $, el, escHtml }             from '../utils/dom.js';
import * as api                        from '../api/client.js';
import { getState, setState }          from '../state/store.js';
import { showScreen }                  from '../router/index.js';
import { showToast }                   from '../components/toast.js';
import { on }                          from '../events/emitter.js';
import { connectSocket, createRoom, joinRoom, disconnectSocket } from '../socket/client.js';
import { clearSession }                from './auth.js';

const REFRESH_INTERVAL_MS = 10_000;
let _refreshTimer = null;

// ── Room list ──────────────────────────────────────────────────────────────────

async function loadRooms() {
  const rooms = await api.get('/api/rooms');
  renderRoomList(Array.isArray(rooms) ? rooms : []);
}

function renderRoomList(rooms) {
  const grid  = $('rooms-grid');
  const empty = $('rooms-empty');

  grid.innerHTML = '';

  if (!rooms.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  for (const room of rooms) {
    const card = el('div', 'room-card');

    const modeBadge = room.mode === 'campaign'
      ? '<span class="room-mode-badge">Campagna</span>'
      : '';
    card.innerHTML = `
      <div class="room-card-name">${escHtml(room.name)}${modeBadge}</div>
      <div class="room-card-meta">Host: ${escHtml(room.host)}</div>
      <div class="room-card-slots">
        ${Array.from({ length: 4 }, (_, i) =>
          `<div class="slot-dot ${i < room.players.length ? 'filled' : ''}"></div>`
        ).join('')}
        <span>${room.players.length}/4 giocatori</span>
      </div>`;

    card.addEventListener('click', () => joinRoom(room.code));
    grid.appendChild(card);
  }
}

// ── Create room modal ──────────────────────────────────────────────────────────

function openCreateModal() {
  $('create-mode-row').classList.remove('hidden');
  $('create-mode-campaign').checked = false;
  $('modal-create').classList.remove('hidden');
  $('room-name-input').focus();
}

function closeCreateModal() { $('modal-create').classList.add('hidden'); }

function initCreateModal() {
  $('btn-open-create').addEventListener('click', openCreateModal);
  $('btn-cancel-create').addEventListener('click', closeCreateModal);
  $('modal-overlay').addEventListener('click', closeCreateModal);

  $('btn-confirm-create').addEventListener('click', () => {
    const name = $('room-name-input').value.trim() || `Stanza di ${getState().username}`;
    const mode = $('create-mode-campaign').checked ? 'campaign' : 'rules';
    $('room-name-input').value = '';
    closeCreateModal();
    createRoom(name, mode);
  });
}

// ── Join by code ───────────────────────────────────────────────────────────────

function initJoinByCode() {
  const doJoin = () => {
    const code = $('join-code-input').value.trim().toUpperCase();
    if (!code || code.length < 4) return showToast('Inserisci un codice valido', true);
    joinRoom(code);
  };

  $('btn-join-code').addEventListener('click', doJoin);
  $('join-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
}

// ── Profile dropdown ───────────────────────────────────────────────────────────

function initProfileDropdown() {
  const btn  = $('profile-btn');
  const menu = $('profile-menu');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!$('profile-dropdown').contains(e.target)) menu.classList.add('hidden');
  });

  $('pm-item-profile').addEventListener('click', () => {
    menu.classList.add('hidden');
    import('./profile.js').then(({ enterProfile }) => enterProfile());
  });

  $('pm-item-admin').addEventListener('click', () => {
    menu.classList.add('hidden');
    import('./adminPanel.js').then(({ enterAdmin }) => enterAdmin());
  });
}

// ── Logout ─────────────────────────────────────────────────────────────────────

function initLogout() {
  $('btn-logout').addEventListener('click', async () => {
    await api.post('/api/logout');
    clearSession();
    disconnectSocket();
    clearInterval(_refreshTimer);
    showScreen('auth');
  });
}

// ── Socket events ──────────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:join_error', msg => showToast(msg, true));
  on('socket:error',      msg => showToast(msg, true));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Register all lobby event listeners. Call once at app startup. */
export function initLobbyScreen() {
  $('btn-refresh-rooms').addEventListener('click', loadRooms);
  initCreateModal();
  initJoinByCode();
  initProfileDropdown();
  initLogout();
  initSocketListeners();
}

/** Navigate to the lobby, connect socket, start room polling. */
export function enterLobby() {
  const { username, role } = getState();

  connectSocket();
  $('nav-username').textContent = username ?? '';

  // Profile avatar initial
  $('profile-avatar-nav').textContent = (username?.[0] ?? '?').toUpperCase();

  // Role badge in dropdown
  const ROLE_LABELS = { root: 'AdminRoot', admin: 'Admin', player: 'Player' };
  $('nav-role-badge').textContent = ROLE_LABELS[role] ?? role ?? 'Player';
  $('nav-role-badge').className   = `pm-role-badge role-${role ?? 'player'}`;

  // Show admin menu item only for admin/root
  const isAdmin = role === 'root' || role === 'admin';
  $('pm-item-admin').classList.toggle('hidden', !isAdmin);

  showScreen('lobby');
  loadRooms();

  clearInterval(_refreshTimer);
  _refreshTimer = setInterval(loadRooms, REFRESH_INTERVAL_MS);
}
