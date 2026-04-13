'use strict';

const { Server }                                 = require('socket.io');
const { socketAuth }                             = require('./middleware');
const { registerRoomHandlers, handleLeaveRoom }  = require('./handlers/room');
const { registerGameHandlers }                   = require('./handlers/game');
const store                                      = require('../store');

/**
 * Attach a Socket.io server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    store.sockets.set(socket.id, { username: socket.username, roomCode: null });

    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      handleLeaveRoom(io, socket);
      store.sockets.delete(socket.id);
    });
  });

  return io;
}

module.exports = { createSocketServer };
