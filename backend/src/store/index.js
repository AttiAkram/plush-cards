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
const { CARD_DEFINITIONS } = require('../game/cards');

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

/**
 * @type {Map<string, import('../game/cards').CardDef>}
 * key: card id. Seeded from CARD_DEFINITIONS; editable at runtime via admin API.
 */
const cards = new Map();

// ── Seed cards ────────────────────────────────────────────────────────────────
for (const def of CARD_DEFINITIONS) {
  cards.set(def.id, { ...def });
}

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

module.exports = { users, sessions, rooms, sockets, cards };
