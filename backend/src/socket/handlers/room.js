'use strict';

const Room  = require('../../models/Room');
const store = require('../../store');

/**
 * Remove a player from their current room.
 * If the room becomes empty it is deleted.
 * Exported so the disconnect handler in socket/index.js can reuse it.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function handleLeaveRoom(io, socket) {
  const userData = store.sockets.get(socket.id);
  if (!userData?.roomCode) return;

  const { username, roomCode } = userData;
  const room = store.rooms.get(roomCode);

  if (room) {
    room.removePlayer(username);
    socket.leave(roomCode);

    if (room.players.length === 0) {
      store.rooms.delete(roomCode);
    } else {
      io.to(roomCode).emit('room_updated', room.toJSON());
    }
  }

  // Clear roomCode from socket record (keep username for cleanup)
  store.sockets.set(socket.id, { username, roomCode: null });
  socket.emit('left_room');
}

/**
 * Register all room-related socket event handlers for one connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerRoomHandlers(io, socket) {
  const { username } = socket;

  // ── create_room ─────────────────────────────────────────────────────────────
  socket.on('create_room', ({ roomName } = {}) => {
    const room = new Room(roomName, username);
    store.rooms.set(room.code, room);
    store.sockets.set(socket.id, { username, roomCode: room.code });
    socket.join(room.code);
    socket.emit('room_created', room.toJSON());
  });

  // ── join_room ────────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase()?.trim();
    const room = store.rooms.get(code);

    if (!room)            return socket.emit('join_error', 'Stanza non trovata');
    if (room.isPlaying()) return socket.emit('join_error', 'Partita già iniziata');
    if (room.isFull())    return socket.emit('join_error', 'Stanza piena');

    if (!room.hasPlayer(username)) room.addPlayer(username);

    store.sockets.set(socket.id, { username, roomCode: code });
    socket.join(code);
    socket.emit('room_joined', room.toJSON());
    io.to(code).emit('room_updated', room.toJSON());
  });

  // ── leave_room ───────────────────────────────────────────────────────────────
  socket.on('leave_room', () => handleLeaveRoom(io, socket));
}

module.exports = { registerRoomHandlers, handleLeaveRoom };
