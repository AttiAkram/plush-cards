'use strict';

const { v4: uuidv4 } = require('uuid');
const store          = require('../store');

/** How many copies of each rarity go into one deck. */
const RARITY_COPIES = {
  comune:      4,
  raro:        3,
  epico:       2,
  mitico:      1,
  leggendario: 1,
};

/**
 * Fisher-Yates in-place shuffle.
 * @template T
 * @param {T[]} arr
 * @returns {T[]} same array, shuffled
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a full shuffled deck from the live card store (active cards only).
 * Each card gets a unique `uid` so duplicate copies can be told apart.
 * @returns {import('./cards').CardDef[]}
 */
function createDeck() {
  const deck = [];

  for (const def of store.cards.values()) {
    if (!def.active) continue;
    const copies = RARITY_COPIES[def.rarity] ?? 1;
    for (let i = 0; i < copies; i++) {
      deck.push({ ...def, uid: uuidv4() });
    }
  }

  return shuffle(deck);
}

module.exports = { createDeck };
