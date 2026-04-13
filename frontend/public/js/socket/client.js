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

  const socket = BACKEND_URL
    ? io(BACKEND_URL, { auth: { token: getState().token } })
    : io({ auth: { token: getState().token } });
  setSocket(socket);

  socket.on('connect_error', err => {
    busEmit('socket:error', `Errore connessione: ${err.message}`);
  });

  // ── Room events ─────────────────────────────────────────────────────────────
  socket.on('room_created', room  => busEmit('socket:room_created', room));
  socket.on('room_joined',  room  => busEmit('socket:room_joined',  room));
  socket.on('room_updated', room  => busEmit('socket:room_updated', room));
  socket.on('left_room',    ()    => busEmit('socket:room_left'));
  socket.on('join_error',   msg   => busEmit('socket:join_error',  msg));
  socket.on('error_msg',    msg   => busEmit('socket:error',       msg));

  // ── Game events ──────────────────────────────────────────────────────────────
  socket.on('game_started',      gs   => busEmit('socket:game_started',      gs));
  socket.on('turn_changed',      data => busEmit('socket:turn_changed',      data));
  socket.on('card_played',       data => busEmit('socket:card_played',       data));
  socket.on('hand_updated',      data => busEmit('socket:hand_updated',      data));
  socket.on('valid_slots',       data => busEmit('socket:valid_slots',       data));
  socket.on('left_match',            ()   => busEmit('socket:left_match'));
  socket.on('player_left_match',     data => busEmit('socket:player_left_match',     data));
  socket.on('player_status_changed', data => busEmit('socket:player_status_changed', data));
}

// ── Room actions ──────────────────────────────────────────────────────────────

/** @param {string} roomName */
export function createRoom(roomName) {
  getSocket()?.emit('create_room', { roomName });
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
