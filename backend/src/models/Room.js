'use strict';

const { v4: uuidv4 }              = require('uuid');
const { ROOM_MAX_PLAYERS, ROOM_CODE_LENGTH } = require('../config');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

/**
 * Generate a random alphanumeric room code.
 * @param {number} length
 * @returns {string}
 */
function generateCode(length = ROOM_CODE_LENGTH) {
  return Array.from({ length }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('');
}

class Room {
  /**
   * @param {string} name
   * @param {string} hostUsername
   */
  constructor(name, hostUsername) {
    this.id         = uuidv4();
    this.code       = generateCode();
    this.name       = name?.trim() || `Stanza di ${hostUsername}`;
    this.host       = hostUsername;
    this.players    = [{ username: hostUsername }];
    this.status     = 'waiting';          // 'waiting' | 'playing'
    this.maxPlayers = ROOM_MAX_PLAYERS;
    this.gameState  = null;
  }

  // ── Player management ──────────────────────────────────────────────────────

  /** @param {string} username */
  addPlayer(username) {
    if (this.isFull() || this.hasPlayer(username)) return false;
    this.players.push({ username });
    return true;
  }

  /** @param {string} username */
  removePlayer(username) {
    this.players = this.players.filter(p => p.username !== username);
    // Promote next player to host if needed
    if (this.players.length > 0 && this.host === username) {
      this.host = this.players[0].username;
    }
  }

  // ── Predicates ─────────────────────────────────────────────────────────────

  isFull()                  { return this.players.length >= this.maxPlayers; }
  isPlaying()               { return this.status === 'playing'; }
  hasPlayer(username)       { return this.players.some(p => p.username === username); }

  // ── Serialisation ──────────────────────────────────────────────────────────

  toJSON() {
    return {
      id:         this.id,
      code:       this.code,
      name:       this.name,
      host:       this.host,
      players:    this.players,
      status:     this.status,
      maxPlayers: this.maxPlayers,
    };
  }
}

module.exports = Room;
