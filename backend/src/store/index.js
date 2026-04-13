'use strict';

/**
 * In-memory data stores shared across the whole application.
 * In a production system these would be replaced by Redis / a database.
 *
 * Exported as a single module so every consumer reads the same Map instances.
 */

/** @type {Map<string, { username: string, passwordHash: string, id: string }>} */
const users = new Map();            // key: username (lower-cased)

/** @type {Map<string, string>} */
const sessions = new Map();         // key: token  →  value: username

/** @type {Map<string, import('../models/Room')>} */
const rooms = new Map();            // key: roomCode

/** @type {Map<string, { username: string, roomCode: string|null }>} */
const sockets = new Map();          // key: socket.id

module.exports = { users, sessions, rooms, sockets };
