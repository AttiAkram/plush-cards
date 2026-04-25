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
  constructor(name, hostUsername, mode = 'rules') {
    this.id         = uuidv4();
    this.code       = generateCode();
    this.name       = name?.trim() || `Stanza di ${hostUsername}`;
    this.host       = hostUsername;
    this.mode          = mode === 'campaign' ? 'campaign' : 'rules';
    this.players       = [{ username: hostUsername }];
    this.ready         = { [hostUsername]: false };
    this.status        = 'waiting';   // 'waiting' | 'drafting' | 'playing' | 'finished'
    this.maxPlayers    = ROOM_MAX_PLAYERS;
    this.gameState     = null;
    this.draftChoices  = {};          // { [username]: CardDef[] } — 3 options per player
    this.draftPicks    = {};          // { [username]: CardDef }   — confirmed pick
  }

  // ── Player management ──────────────────────────────────────────────────────

  /** @param {string} username */
  addPlayer(username) {
    if (this.isFull() || this.hasPlayer(username)) return false;
    this.players.push({ username });
    this.ready[username] = false;
    return true;
  }

  /** @param {string} username */
  removePlayer(username) {
    this.players = this.players.filter(p => p.username !== username);
    delete this.ready[username];
    // Promote next player to host if needed
    if (this.players.length > 0 && this.host === username) {
      this.host = this.players[0].username;
    }
  }

  /**
   * Toggle the ready state for a player.
   * @param {string} username
   * @returns {boolean} new ready value
   */
  toggleReady(username) {
    if (!this.hasPlayer(username)) return false;
    this.ready[username] = !this.ready[username];
    return this.ready[username];
  }

  /** @returns {boolean} true if all players are ready */
  allReady() {
    return this.players.every(p => this.ready[p.username]);
  }

  // ── Predicates ─────────────────────────────────────────────────────────────

  isFull()                  { return this.players.length >= this.maxPlayers; }
  isPlaying()               { return this.status === 'playing' || this.status === 'drafting'; }
  hasPlayer(username)       { return this.players.some(p => p.username === username); }

  // ── Serialisation ──────────────────────────────────────────────────────────

  toJSON() {
    return {
      id:         this.id,
      code:       this.code,
      name:       this.name,
      host:       this.host,
      mode:       this.mode,
      players:    this.players,
      ready:      { ...this.ready },
      status:     this.status,
      maxPlayers: this.maxPlayers,
    };
  }
}

module.exports = Room;
