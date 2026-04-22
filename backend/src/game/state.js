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
  const sharedDeck   = createDeck();
  const playerStates = {};

  // Split the shared deck into per-player decks (roughly equal)
  const perPlayer = Math.floor(sharedDeck.length / room.players.length);

  for (let pi = 0; pi < room.players.length; pi++) {
    const player = room.players[pi];
    const start  = pi * perPlayer;
    // Last player gets any remainder cards
    const end    = pi === room.players.length - 1 ? sharedDeck.length : start + perPlayer;
    const deck   = sharedDeck.slice(start, end);

    // Deal opening hand
    const hand = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const card = deck.pop();
      if (card) hand.push(card);
    }

    playerStates[player.username] = {
      username:  player.username,
      status:    'active',
      nexus:     { hp: NEXUS_HP, maxHp: NEXUS_HP },
      hand,
      field:     Array.from({ length: FIELD_SIZE }, () => null),
      deck,                           // kept server-side for draw effects
      deckCount: deck.length,
      discard:   [],
      plushPlayedThisTurn: 0,
      scartiQuestoTurno:   0,
      scartiTotali:        0,
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
