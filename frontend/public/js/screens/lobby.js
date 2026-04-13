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

    card.innerHTML = `
      <div class="room-card-name">${escHtml(room.name)}</div>
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
    $('room-name-input').value = '';
    closeCreateModal();
    createRoom(name);
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
  initLogout();
  initSocketListeners();
}

/** Navigate to the lobby, connect socket, start room polling. */
export function enterLobby() {
  connectSocket();
  $('nav-username').textContent = getState().username;
  showScreen('lobby');
  loadRooms();

  clearInterval(_refreshTimer);
  _refreshTimer = setInterval(loadRooms, REFRESH_INTERVAL_MS);
}
