'use strict';

const { v4: uuidv4 } = require('uuid');
const store          = require('../store');

/** Copies per rarity for personaggi in the shared deck. */
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
 * Build the shared personaggi deck and a shuffled artifact pool.
 * Personaggi are added with RARITY_COPIES duplicates.
 * Artefatti each appear once in the pool (pre-assigned at game start).
 *
 * @returns {{ personaggiDeck: object[], artifactPool: object[] }}
 */
function createDecks() {
  const personaggiDeck = [];
  const artifactPool   = [];

  for (const def of store.cards.values()) {
    if (!def.active) continue;
    if (def.type === 'artefatto') {
      artifactPool.push({ ...def, uid: uuidv4() });
    } else {
      const copies = RARITY_COPIES[def.rarity] ?? 1;
      for (let i = 0; i < copies; i++) {
        personaggiDeck.push({ ...def, uid: uuidv4() });
      }
    }
  }

  return {
    personaggiDeck: shuffle(personaggiDeck),
    artifactPool:   shuffle(artifactPool),
  };
}

module.exports = { createDecks };
