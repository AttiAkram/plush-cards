'use strict';

const { createDeck }                       = require('./deck');
const { HAND_SIZE, NEXUS_HP, FIELD_SIZE }  = require('../config');

/**
 * Build the initial game state for a room that is about to start.
 *
 * @param {import('../models/Room')} room
 * @returns {object} Serialisable game state sent to all clients.
 */
function initGameState(room) {
  const deck         = createDeck();
  const playerStates = {};

  for (const player of room.players) {
    // Deal opening hand
    const hand = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const card = deck.pop();
      if (card) hand.push(card);
    }

    playerStates[player.username] = {
      username:  player.username,
      status:    'active',                                    // 'active' | 'disconnected' | 'left'
      nexus:     { hp: NEXUS_HP, maxHp: NEXUS_HP },
      hand,
      field:     Array.from({ length: FIELD_SIZE }, () => null),
      deckCount: Math.floor(deck.length / room.players.length),
      discard:   [],
    };
  }

  return {
    players:     playerStates,
    turnOrder:   room.players.map(p => p.username),
    currentTurn: room.players[0].username,
    turnNumber:  1,
    phase:       'main',
    zones: {
      void:     [],
      absolute: [],
    },
  };
}

module.exports = { initGameState };
