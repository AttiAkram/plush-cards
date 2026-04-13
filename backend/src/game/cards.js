'use strict';

/**
 * @typedef  {Object} CardDef
 * @property {string} id
 * @property {string} name
 * @property {number} damage
 * @property {number} hp
 * @property {string} rarity   - 'comune' | 'raro' | 'epico' | 'mitico' | 'leggendario'
 * @property {string} description
 */

/** @type {CardDef[]} */
const CARD_DEFINITIONS = [
  {
    id: 'orso',     name: 'Plush Orso',     damage: 3,  hp: 5,  rarity: 'comune',
    description: 'Un orsacchiotto con artigli affilati. Protegge il suo territorio con fierezza.',
  },
  {
    id: 'panda',    name: 'Plush Panda',    damage: 2,  hp: 8,  rarity: 'comune',
    description: 'Mangia bambù e si addormenta in battaglia, ma non sottovalutarlo.',
  },
  {
    id: 'gatto',    name: 'Plush Gatto',    damage: 3,  hp: 6,  rarity: 'comune',
    description: 'Morbido e graffiante. Imprevedibile come solo i gatti sanno essere.',
  },
  {
    id: 'coniglio', name: 'Plush Coniglio', damage: 4,  hp: 7,  rarity: 'raro',
    description: 'Veloce come il vento. Attacca prima che tu possa vederlo.',
  },
  {
    id: 'volpe',    name: 'Plush Volpe',    damage: 5,  hp: 6,  rarity: 'raro',
    description: 'Furba e veloce. Sempre un passo avanti rispetto ai nemici.',
  },
  {
    id: 'gufo',     name: 'Plush Gufo',     damage: 4,  hp: 5,  rarity: 'raro',
    description: 'La saggezza antica lo rende imprevedibile in battaglia.',
  },
  {
    id: 'lupo',     name: 'Plush Lupo',     damage: 6,  hp: 9,  rarity: 'epico',
    description: 'Il predatore del mazzo. Diventa più forte in branco.',
  },
  {
    id: 'drago',    name: 'Plush Drago',    damage: 7,  hp: 12, rarity: 'epico',
    description: 'Sputa fuoco e protegge il suo territorio con fiamme ardenti.',
  },
  {
    id: 'unicorno', name: 'Plush Unicorno', damage: 8,  hp: 15, rarity: 'mitico',
    description: 'La sua magia purifica il campo e guarisce gli alleati.',
  },
  {
    id: 'fenice',   name: 'Plush Fenice',   damage: 12, hp: 20, rarity: 'leggendario',
    description: 'Rinasce dalle proprie ceneri. Nessun avversario può fermarla.',
  },
];

module.exports = { CARD_DEFINITIONS };
