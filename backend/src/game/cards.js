'use strict';

/**
 * @typedef {Object} CardEffect
 * @property {string}  trigger
 * @property {string}  action
 * @property {string}  target
 * @property {Object}  params
 * @property {string}  [condition]
 */

/**
 * @typedef  {Object} CardDef
 * @property {string}       id
 * @property {string}       name
 * @property {number}       damage
 * @property {number}       hp
 * @property {string}       rarity       - 'comune' | 'raro' | 'epico' | 'mitico' | 'leggendario'
 * @property {string}       type         - 'personaggio' | 'artefatto'
 * @property {boolean}      active
 * @property {string}       description
 * @property {CardEffect[]} effects
 */

/**
 * Set 0 — test set covering every trigger + action combination for engine validation.
 * @type {CardDef[]}
 */
const CARD_DEFINITIONS = [

  // ── Personaggi ─────────────────────────────────────────────────────────────

  {
    id: 'orso', name: 'Plush Orso', damage: 4, hp: 7,
    rarity: 'comune', type: 'personaggio', active: true,
    tags: ['orso', 'tank'], role: 'difesa', effects: [],
    description: 'Un orsacchiotto con artigli affilati. Protegge il suo territorio con fierezza.',
  },

  {
    id: 'panda', name: 'Plush Panda', damage: 2, hp: 10,
    rarity: 'comune', type: 'personaggio', active: true,
    tags: ['panda', 'draw'], role: 'valore',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 2 } },
    ],
    description: 'Mangia bambù e medita. Quando entra in campo il suo proprietario pesca 2 carte.',
  },

  {
    id: 'gatto', name: 'Plush Gatto', damage: 4, hp: 5,
    rarity: 'comune', type: 'personaggio', active: true,
    tags: ['gatto', 'flash'], role: 'aggro',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'DANNO_A_CARTA', target: 'UN_NEMICO', params: { amount: 1 } },
    ],
    description: 'Morbido e graffiante. Quando entra in campo graffia un nemico per 1 danno.',
  },

  {
    id: 'coniglio', name: 'Plush Coniglio', damage: 4, hp: 6,
    rarity: 'raro', type: 'personaggio', active: true,
    tags: ['coniglio', 'draw'], role: 'valore',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: 'Veloce come il vento. Porta una carta in più quando entra in campo.',
  },

  {
    id: 'volpe', name: 'Plush Volpe', damage: 5, hp: 6,
    rarity: 'raro', type: 'personaggio', active: true,
    tags: ['volpe', 'splash'], role: 'controllo',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'DANNO_A_CARTA', target: 'TUTTI_I_NEMICI', params: { amount: 1 } },
    ],
    description: 'Furba e veloce. Quando entra colpisce tutti i nemici sul campo per 1 danno.',
  },

  {
    id: 'gufo', name: 'Plush Gufo', damage: 3, hp: 6,
    rarity: 'raro', type: 'personaggio', active: true,
    tags: ['gufo', 'draw', 'valore'], role: 'valore',
    effects: [
      { trigger: 'ALL_FINE_TURNO', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: 'La saggezza antica porta fortuna. Alla fine di ogni tuo turno peschi 1 carta.',
  },

  {
    id: 'lupo', name: 'Plush Lupo', damage: 6, hp: 9,
    rarity: 'epico', type: 'personaggio', active: true,
    tags: ['lupo', 'buff', 'leader'], role: 'aggro',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'MODIFICA_ATTACCO', target: 'TUTTI_I_TUOI', params: { amount: 2 } },
    ],
    description: "Il leader del branco. Quando arriva potenzia l'attacco di tutti i tuoi personaggi di +2.",
  },

  {
    id: 'drago', name: 'Plush Drago', damage: 7, hp: 12,
    rarity: 'epico', type: 'personaggio', active: true,
    tags: ['drago', 'fuoco', 'removal'], role: 'controllo',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'DANNO_A_CARTA', target: 'UN_NEMICO', params: { amount: 3 } },
    ],
    description: 'Sputa fuoco. Quando entra in campo infligge 3 danni a un nemico a scelta.',
  },

  {
    id: 'unicorno', name: 'Plush Unicorno', damage: 6, hp: 15,
    rarity: 'mitico', type: 'personaggio', active: true,
    tags: ['unicorno', 'cura', 'supporto'], role: 'difesa',
    effects: [
      { trigger: 'ALL_INIZIO_TURNO', action: 'MODIFICA_VITA', target: 'UN_TUO_PERSONAGGIO', params: { amount: 2 } },
    ],
    description: "Guaritore del campo. All'inizio di ogni tuo turno cura +2 HP a uno dei tuoi personaggi.",
  },

  {
    id: 'fenice', name: 'Plush Fenice', damage: 10, hp: 18,
    rarity: 'leggendario', type: 'personaggio', active: true,
    tags: ['fenice', 'resurrezione', 'legandario'], role: 'valore',
    effects: [
      { trigger: 'ON_MORTE', action: 'SPOSTA_CARTA_DI_ZONA', target: 'SE_STESSO', params: { destinazione: 'mano' } },
    ],
    description: 'Rinasce dalle proprie ceneri. Quando viene distrutta torna in mano con HP al massimo.',
  },

  // ── Artefatti ───────────────────────────────────────────────────────────────

  {
    id: 'torta_bambu', name: 'Torta di Bambù', damage: 0, hp: 12,
    rarity: 'comune', type: 'artefatto', active: true,
    tags: ['cibo', 'draw'], role: 'valore',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'PESCA_CARTE', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: 'Una torta enorme che blocca il passaggio. Chi la piazza pesca 1 carta.',
  },

  {
    id: 'scudo_piumato', name: 'Scudo Piumato', damage: 0, hp: 16,
    rarity: 'raro', type: 'artefatto', active: true,
    tags: ['scudo', 'regen'], role: 'difesa',
    effects: [
      { trigger: 'ALL_INIZIO_TURNO', action: 'MODIFICA_VITA', target: 'SE_STESSO', params: { amount: 1 } },
    ],
    description: "Uno scudo di piume magiche. All'inizio di ogni tuo turno si rigenera di 1 HP.",
  },

  {
    id: 'cristallo_antico', name: 'Cristallo Antico', damage: 2, hp: 8,
    rarity: 'epico', type: 'artefatto', active: true,
    tags: ['cristallo', 'magia', 'draw', 'removal'], role: 'valore',
    effects: [
      { trigger: 'QUANDO_GIOCATA', action: 'PESCA_CARTE',   target: 'SE_STESSO', params: { amount: 2 } },
      { trigger: 'QUANDO_GIOCATA', action: 'DANNO_A_CARTA', target: 'UN_NEMICO', params: { amount: 2 } },
    ],
    description: 'Un cristallo carico di energia. Quando appare fai pescare 2 carte e infliggi 2 danni a un nemico.',
  },

];

module.exports = { CARD_DEFINITIONS };
