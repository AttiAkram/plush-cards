'use strict';

const store              = require('../../store');
const { initGameState }  = require('../../game/state');

/**
 * Register game-related socket event handlers for one connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerGameHandlers(io, socket) {
  const { username } = socket;

  // ── start_game ───────────────────────────────────────────────────────────────
  socket.on('start_game', () => {
    const { roomCode } = store.sockets.get(socket.id) || {};
    if (!roomCode) return;

    const room = store.rooms.get(roomCode);
    if (!room) return;

    if (room.host !== username)
      return socket.emit('error_msg', 'Solo il host può iniziare la partita');
    if (room.players.length < 2)
      return socket.emit('error_msg', 'Servono almeno 2 giocatori per iniziare');

    room.status    = 'playing';
    room.gameState = initGameState(room);

    io.to(roomCode).emit('game_started', room.gameState);
  });
}

module.exports = { registerGameHandlers };
