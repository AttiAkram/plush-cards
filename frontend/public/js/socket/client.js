/**
 * Socket.io client — manages the single persistent connection.
 *
 * Responsibilities:
 *  1. Connect / authenticate with the backend.
 *  2. Re-emit server events through the event bus so screens stay decoupled.
 *  3. Expose action functions (createRoom, joinRoom …) used by screens.
 *
 * Import the `io` ESM build served by the backend via nginx proxy.
 */

// socket.io 4.x ESM client — loaded from CDN (works on every environment).
import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

import { getState, setSocket, getSocket } from '../state/store.js';
import { emit as busEmit }                from '../events/emitter.js';
import { BACKEND_URL }                    from '../config.js';

// ── Connection ────────────────────────────────────────────────────────────────

/** Connect to the server (no-op if already connected). */
export function connectSocket() {
  if (getSocket()?.connected) return;

  // BACKEND_URL = '' → same origin (Docker/nginx); non-empty → Railway URL
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
  socket.on('game_started', gs   => busEmit('socket:game_started', gs));
}

// ── Actions ───────────────────────────────────────────────────────────────────

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
