'use strict';

const { createDecks }                      = require('./deck');
const { HAND_SIZE, NEXUS_HP, FIELD_SIZE }  = require('../config');

/** Roll one d20 (1–20). */
function rollD20() { return Math.ceil(Math.random() * 20); }

/**
 * Build the initial game state for a room that is about to start.
 *
 * @param {import('../models/Room')} room
 * @returns {object} Serialisable game state sent to all clients.
 */
function initGameState(room) {
  const { personaggiDeck, artifactPool } = createDecks();

  // D20 roll for turn order — higher roll goes first; ties preserve room-join order
  const rolls = room.players.map(p => ({ username: p.username, roll: rollD20() }));
  rolls.sort((a, b) => b.roll - a.roll);
  const turnOrder = rolls.map(r => r.username);

  // Deal opening hands and assign one artifact per player
  const playerStates = {};
  for (const { username } of room.players) {
    const hand = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const card = personaggiDeck.pop();
      if (card) hand.push(card);
    }

    playerStates[username] = {
      username,
      status:   'active',
      nexus:    { hp: NEXUS_HP, maxHp: NEXUS_HP },
      hand,
      field:    Array.from({ length: FIELD_SIZE }, () => null),
      artifactSlot:        artifactPool.pop() ?? null,
      plushPlayedThisTurn: 0,
      scartiQuestoTurno:   0,
      scartiTotali:        0,
    };
  }

  return {
    players:     playerStates,
    turnOrder,
    currentTurn: turnOrder[0],
    turnNumber:  1,
    phase:       'main',
    deck:        personaggiDeck,   // server-only — stripped in sanitiseGs
    discard:     [],               // global discard pile; each card has `owner` field
    zones: {
      void:     [],
      absolute: [],
    },
    d20Rolls: rolls,               // sent to clients at game_started for display
  };
}

module.exports = { initGameState };
