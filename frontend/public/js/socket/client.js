/**
 * Socket.io client — manages the single persistent connection.
 *
 * Responsibilities:
 *  1. Connect / authenticate with the backend.
 *  2. Re-emit server events through the event bus so screens stay decoupled.
 *  3. Expose action functions (createRoom, joinRoom …) used by screens.
 */

import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

import { getState, setSocket, getSocket } from '../state/store.js';
import { emit as busEmit }                from '../events/emitter.js';
import { BACKEND_URL }                    from '../config.js';

// ── Connection ────────────────────────────────────────────────────────────────

/** Connect to the server (no-op if already connected). */
export function connectSocket() {
  if (getSocket()?.connected) return;

  const opts = {
    auth:       { token: getState().token },
    // Start with polling so the handshake succeeds before upgrading to WS.
    // This prevents the browser WebSocket error when the token is stale.
    transports: ['polling', 'websocket'],
  };
  const socket = BACKEND_URL ? io(BACKEND_URL, opts) : io(opts);
  setSocket(socket);

  socket.on('connect_error', err => {
    // Socket.io auth middleware rejects with 'Non autorizzato' when the token
    // is no longer in the server's in-memory sessions (e.g. after a restart).
    if (err.message === 'Non autorizzato') {
      import('../events/emitter.js').then(({ emit }) => emit('auth:unauthorized'));
      socket.disconnect();
      return;
    }
    busEmit('socket:error', `Errore connessione: ${err.message}`);
  });

  // ── Room events ─────────────────────────────────────────────────────────────
  socket.on('room_created', room  => busEmit('socket:room_created', room));
  socket.on('room_joined',  room  => busEmit('socket:room_joined',  room));
  socket.on('room_updated', room  => busEmit('socket:room_updated', room));
  socket.on('left_room',    ()    => busEmit('socket:room_left'));
  socket.on('join_error',   msg   => busEmit('socket:join_error',  msg));
  socket.on('error_msg',    msg   => busEmit('socket:error',       msg));

  // ── Draft events ─────────────────────────────────────────────────────────────
  socket.on('draft_started', data => busEmit('socket:draft_started', data));
  socket.on('draft_updated', data => busEmit('socket:draft_updated', data));

  // ── Game events ──────────────────────────────────────────────────────────────
  socket.on('game_started',      gs   => busEmit('socket:game_started',      gs));
  socket.on('turn_changed',      data => busEmit('socket:turn_changed',      data));
  socket.on('card_played',       data => busEmit('socket:card_played',       data));
  socket.on('hand_updated',      data => busEmit('socket:hand_updated',      data));
  socket.on('valid_slots',       data => busEmit('socket:valid_slots',       data));
  socket.on('effects_applied',       data => busEmit('socket:effects_applied',    data));
  socket.on('attack_result',         data => busEmit('socket:attack_result',       data));
  socket.on('card_discarded',        data => busEmit('socket:card_discarded',      data));
  socket.on('left_match',            ()   => busEmit('socket:left_match'));
  socket.on('player_left_match',     data => busEmit('socket:player_left_match',     data));
  socket.on('player_status_changed', data => busEmit('socket:player_status_changed', data));
  socket.on('player_eliminated',     data => busEmit('socket:player_eliminated',     data));
  socket.on('game_over',             data => busEmit('socket:game_over',             data));
  socket.on('manual_edit_applied',   data => busEmit('socket:manual_edit_applied',   data));
  socket.on('gm_note',               data => busEmit('socket:gm_note',               data));
  socket.on('deck_contents',         data => busEmit('socket:deck_contents',          data));
  socket.on('session_saved',         data => busEmit('socket:session_saved',          data));
  socket.on('session_restored',      data => busEmit('socket:session_restored',       data));
  socket.on('gm_random_result',      data => busEmit('socket:gm_random_result',       data));
  socket.on('dice_rolled',           data => busEmit('socket:dice_rolled',            data));
}

// ── Room actions ──────────────────────────────────────────────────────────────

/**
 * @param {string} roomName
 * @param {'rules'|'campaign'} [mode]
 */
export function createRoom(roomName, mode = 'rules') {
  getSocket()?.emit('create_room', { roomName, mode });
}

/** @param {string} roomCode */
export function joinRoom(roomCode) {
  getSocket()?.emit('join_room', { roomCode });
}

export function leaveRoom() {
  getSocket()?.emit('leave_room');
}

export function startGame() {
  getSocket()?.emit('start_game');
}

export function startDebugGame() {
  getSocket()?.emit('start_game', { debug: true });
}

export function disconnectSocket() {
  getSocket()?.disconnect();
  setSocket(null);
}

// ── Game actions ──────────────────────────────────────────────────────────────

export function endTurn() {
  getSocket()?.emit('end_turn');
}

/**
 * @param {string} cardUid
 * @param {number} slotIndex
 */
export function playCard(cardUid, slotIndex) {
  getSocket()?.emit('play_card', { cardUid, slotIndex });
}

/** @param {string} cardUid */
export function requestValidSlots(cardUid) {
  getSocket()?.emit('request_valid_slots', { cardUid });
}

export function leaveMatch() {
  getSocket()?.emit('leave_match');
}

/**
 * @param {string} attackerUid
 * @param {string} targetUsername
 * @param {string} targetUid
 */
export function attack(attackerUid, targetUsername, targetUid) {
  getSocket()?.emit('attack', { attackerUid, targetUsername, targetUid });
}

/** @param {string} cardUid */
export function discardCard(cardUid) {
  getSocket()?.emit('discard_card', { cardUid });
}

export function toggleReady() {
  getSocket()?.emit('toggle_ready');
}

/** @param {string|null} artifactUid */
export function pickArtifact(artifactUid) {
  getSocket()?.emit('pick_artifact', { artifactUid });
}

/**
 * Campaign-mode manual edit.
 * @param {object} payload — { type, cardUid, stat?, delta?, color?, to?, toUsername?, slotIndex? }
 */
export function manualEdit(payload) {
  getSocket()?.emit('manual_edit', payload);
}

/** @param {string} text @param {'note'|'chapter'} [type] */
export function sendGmNote(text, type = 'note') {
  getSocket()?.emit('gm_note', { text, type });
}

export function requestDeck() {
  getSocket()?.emit('request_deck');
}

/** @param {Array} logEntries */
export function saveSession(logEntries) {
  getSocket()?.emit('save_session', { logEntries });
}

export function restoreSession() {
  getSocket()?.emit('restore_session');
}

/** @param {{ action: string, count?: number }} payload */
export function gmRandom(payload) {
  getSocket()?.emit('gm_random', payload);
}

/** @param {number} sides */
export function rollDice(sides) {
  getSocket()?.emit('roll_dice', { sides });
}

export function drawCard() {
  getSocket()?.emit('draw_card');
}

export function getArtifact() {
  getSocket()?.emit('get_artifact');
}
