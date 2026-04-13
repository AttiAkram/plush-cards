'use strict';

const { Server }                                 = require('socket.io');
const { socketAuth }                             = require('./middleware');
const { registerRoomHandlers, handleLeaveRoom }  = require('./handlers/room');
const { registerGameHandlers }                   = require('./handlers/game');
const store                                      = require('../store');
const { FRONTEND_URL }                           = require('../config');

/**
 * Attach a Socket.io server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    store.sockets.set(socket.id, { username: socket.username, roomCode: null });

    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      const socketData = store.sockets.get(socket.id);
      const room = socketData?.roomCode ? store.rooms.get(socketData.roomCode) : null;

      if (room?.status === 'playing' && room.gameState) {
        // Disconnected mid-game — mark player as disconnected instead of removing
        const playerState = room.gameState.players[socket.username];
        if (playerState) playerState.status = 'disconnected';
        io.to(socketData.roomCode).emit('player_status_changed', {
          username: socket.username,
          status:   'disconnected',
        });
        store.sockets.delete(socket.id);
      } else {
        handleLeaveRoom(io, socket);
        store.sockets.delete(socket.id);
      }
    });
  });

  return io;
}

module.exports = { createSocketServer };
