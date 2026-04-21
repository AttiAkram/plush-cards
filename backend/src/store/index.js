'use strict';

/**
 * In-memory data stores shared across the whole application.
 * In a production system these would be replaced by Redis / a database.
 *
 * Exported as a single module so every consumer reads the same Map instances.
 */

const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { BCRYPT_ROUNDS } = require('../config');

/**
 * @type {Map<string, {
 *   username:           string,
 *   passwordHash:       string,
 *   id:                 string,
 *   role:               'root'|'admin'|'player',
 *   mustChangePassword: boolean
 * }>}
 */
const users = new Map();            // key: username (lower-cased)

/** @type {Map<string, string>} */
const sessions = new Map();         // key: token  →  value: username

/** @type {Map<string, import('../models/Room')>} */
const rooms = new Map();            // key: roomCode

/** @type {Map<string, { username: string, roomCode: string|null }>} */
const sockets = new Map();          // key: socket.id

// ── Seed AdminRoot ─────────────────────────────────────────────────────────────
// Created once on startup. Default credentials: admin / admin.
// The first login forces a mandatory password change before accessing the app.
users.set('admin', {
  username:           'admin',
  passwordHash:       bcrypt.hashSync('admin', BCRYPT_ROUNDS),
  id:                 uuidv4(),
  role:               'root',
  mustChangePassword: true,
});

module.exports = { users, sessions, rooms, sockets };
