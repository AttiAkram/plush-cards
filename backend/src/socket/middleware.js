'use strict';

const { sessions } = require('../store');

/**
 * Socket.io middleware — authenticates the connection via the token
 * passed in `socket.handshake.auth.token`.
 * Attaches `socket.username` on success.
 *
 * @param {import('socket.io').Socket} socket
 * @param {Function} next
 */
function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token || !sessions.has(token)) {
    return next(new Error('Non autorizzato'));
  }

  socket.username = sessions.get(token);
  next();
}

module.exports = { socketAuth };
