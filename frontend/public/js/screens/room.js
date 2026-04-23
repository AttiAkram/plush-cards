/**
 * Room screen — waiting room, player list, start game trigger.
 */

import { $, el, escHtml }    from '../utils/dom.js';
import { getState, setState } from '../state/store.js';
import { showScreen }         from '../router/index.js';
import { showToast }          from '../components/toast.js';
import { on }                 from '../events/emitter.js';
import { leaveRoom, startGame, startDebugGame, toggleReady } from '../socket/client.js';
import { enterLobby }         from './lobby.js';

// ── Render ─────────────────────────────────────────────────────────────────────

/**
 * Re-render the waiting room for the given room object.
 * @param {object} room
 */
export function renderRoom(room) {
  setState({ room });

  $('room-title').textContent     = room.name;
  $('room-host-name').textContent = room.host;
  $('room-code-text').textContent = room.code;
  $('players-count').textContent  = room.players.length;

  renderPlayerList(room);
  updateControls(room);
}

function renderPlayerList(room) {
  const list = $('players-list');
  list.innerHTML = '';
  const ready = room.ready ?? {};

  for (const player of room.players) {
    const isReady = !!ready[player.username];
    const row = el('div', 'player-row');
    row.innerHTML = `
      <div class="player-avatar">${escHtml(player.username[0].toUpperCase())}</div>
      <div class="player-name">${escHtml(player.username)}</div>
      ${player.username === room.host ? '<span class="player-badge">Host</span>' : ''}
      <span class="ready-badge${isReady ? ' ready-badge--yes' : ' ready-badge--no'}">
        ${isReady ? '✓ Pronto' : '○ Non pronto'}
      </span>`;
    list.appendChild(row);
  }
}

function updateControls(room) {
  const { username, role } = getState();
  const isHost  = room.host === username;
  const isAdmin = role === 'root' || role === 'admin';
  const ready   = room.ready ?? {};
  const iAmReady = !!ready[username];
  const allReady = room.players.every(p => ready[p.username]);

  // Ready button — visible to everyone
  const readyBtn = $('btn-ready');
  if (readyBtn) {
    readyBtn.textContent = iAmReady ? '○ Non pronto' : '✓ Sono pronto!';
    readyBtn.classList.toggle('btn-primary', !iAmReady);
    readyBtn.classList.toggle('btn-outline', iAmReady);
  }

  $('host-controls').classList.toggle('hidden', !isHost);
  $('waiting-msg').classList.toggle('hidden',    isHost);

  if (isHost) {
    const canStart = room.players.length >= 2 && allReady;
    $('btn-start-game').disabled = !canStart;
    $('start-hint').textContent  = room.players.length < 2
      ? `Servono almeno 2 giocatori (${room.players.length}/2)`
      : allReady
        ? 'Tutti pronti! Dai il via alla battaglia.'
        : 'In attesa che tutti i giocatori siano pronti…';

    $('btn-debug-game').classList.toggle('hidden', !(isAdmin && room.players.length < 2));
  }
}

// ── Actions ────────────────────────────────────────────────────────────────────

function initLeaveButton() {
  $('btn-leave-room').addEventListener('click', leaveRoom);
}

function initCopyCode() {
  $('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard
      .writeText($('room-code-text').textContent)
      .then(() => showToast('Codice copiato!'));
  });
}

function initStartButton() {
  $('btn-start-game').addEventListener('click', startGame);
  $('btn-debug-game').addEventListener('click', startDebugGame);
}

function initReadyButton() {
  const btn = $('btn-ready');
  if (btn) btn.addEventListener('click', toggleReady);
}

// ── Socket events ──────────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:room_created', room => { renderRoom(room); showScreen('room'); });
  on('socket:room_joined',  room => { renderRoom(room); showScreen('room'); });
  on('socket:room_updated', room => {
    if (document.getElementById('screen-room').classList.contains('active')) {
      renderRoom(room);
    }
  });
  on('socket:room_left', () => enterLobby());
  on('socket:error',     msg => showToast(msg, true));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Register all room event listeners. Call once at app startup. */
export function initRoomScreen() {
  initLeaveButton();
  initCopyCode();
  initStartButton();
  initReadyButton();
  initSocketListeners();
}
