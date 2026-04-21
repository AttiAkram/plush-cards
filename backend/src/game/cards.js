'use strict';

/**
 * @typedef {Object} CardEffect
 * @property {string}  trigger   - e.g. 'QUANDO_GIOCATA'
 * @property {string}  action    - e.g. 'PESCA_CARTE'
 * @property {string}  target    - e.g. 'SE_STESSO'
 * @property {Object}  params    - action-specific params (amount, etc.)
 * @property {string}  [condition] - optional condition key
 */

/**
 * @typedef  {Object} CardDef
 * @property {string}       id
 * @property {string}       name
 * @property {number}       damage
 * @property {number}       hp
 * @property {string}       rarity   - 'comune' | 'raro' | 'epico' | 'mitico' | 'leggendario'
 * @property {string}       type     - 'personaggio' | 'artefatto'
 * @property {boolean}      active   - false = disabled/draft, not included in decks
 * @property {string}       description
 * @property {CardEffect[]} effects
 */

/** @type {CardDef[]} */
const CARD_DEFINITIONS = [
  {
    id: 'orso',     name: 'Plush Orso',     damage: 3,  hp: 5,  rarity: 'comune',
    type: 'personaggio', active: true, effects: [],
    description: 'Un orsacchiotto con artigli affilati. Protegge il suo territorio con fierezza.',
  },
  {
    id: 'panda',    name: 'Plush Panda',    damage: 2,  hp: 8,  rarity: 'comune',
    type: 'personaggio', active: true, effects: [],
    description: 'Mangia bambù e si addormenta in battaglia, ma non sottovalutarlo.',
  },
  {
    id: 'gatto',    name: 'Plush Gatto',    damage: 3,  hp: 6,  rarity: 'comune',
    type: 'personaggio', active: true, effects: [],
    description: 'Morbido e graffiante. Imprevedibile come solo i gatti sanno essere.',
  },
  {
    id: 'coniglio', name: 'Plush Coniglio', damage: 4,  hp: 7,  rarity: 'raro',
    type: 'personaggio', active: true, effects: [],
    description: 'Veloce come il vento. Attacca prima che tu possa vederlo.',
  },
  {
    id: 'volpe',    name: 'Plush Volpe',    damage: 5,  hp: 6,  rarity: 'raro',
    type: 'personaggio', active: true, effects: [],
    description: 'Furba e veloce. Sempre un passo avanti rispetto ai nemici.',
  },
  {
    id: 'gufo',     name: 'Plush Gufo',     damage: 4,  hp: 5,  rarity: 'raro',
    type: 'personaggio', active: true,
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: 'La saggezza antica lo rende imprevedibile in battaglia. Quando entra in campo fai pescare 1 carta.',
  },
  {
    id: 'lupo',     name: 'Plush Lupo',     damage: 6,  hp: 9,  rarity: 'epico',
    type: 'personaggio', active: true, effects: [],
    description: 'Il predatore del mazzo. Diventa più forte in branco.',
  },
  {
    id: 'drago',    name: 'Plush Drago',    damage: 7,  hp: 12, rarity: 'epico',
    type: 'personaggio', active: true,
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'DANNO_A_CARTA', target: 'UN_NEMICO', params: { amount: 3 } },
    ],
    description: 'Sputa fuoco e protegge il suo territorio con fiamme ardenti. Infligge 3 danni a un nemico quando entra in campo.',
  },
  {
    id: 'unicorno', name: 'Plush Unicorno', damage: 8,  hp: 15, rarity: 'mitico',
    type: 'personaggio', active: true,
    effects: [
      { trigger: 'ALL_INIZIO_TURNO', action: 'MODIFICA_VITA', target: 'UN_TUO_PERSONAGGIO', params: { amount: 2 } },
    ],
    description: 'La sua magia purifica il campo e guarisce gli alleati. All\'inizio di ogni turno cura +2 HP a un tuo personaggio.',
  },
  {
    id: 'fenice',   name: 'Plush Fenice',   damage: 12, hp: 20, rarity: 'leggendario',
    type: 'personaggio', active: true,
    effects: [
      { trigger: 'ALL_FINE_TURNO', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: 'Rinasce dalle proprie ceneri. Nessun avversario può fermarla. Pesca 1 carta alla fine di ogni turno.',
  },
];

module.exports = { CARD_DEFINITIONS };
