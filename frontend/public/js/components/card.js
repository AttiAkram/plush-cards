/**
 * Card component factory.
 * Produces DOM nodes for plush creature cards and inline SVG creature art.
 */

import { el, escHtml }           from '../utils/dom.js';
import { CREATURES, CREATURE_FALLBACK } from '../data/creatures.js';

const RARITY_LABELS = {
  comune:      'Comune',
  raro:        'Raro',
  epico:       'Epico',
  mitico:      'Mitico',
  leggendario: 'Leggendario',
};

// ── SVG icon snippets ──────────────────────────────────────────────────────────

const SVG_SWORD = `<svg class="icon-stat-sm" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l3-3M16 22l3.5-3.5M20 18l1.5 1.5M17.5 12.5L22 8l-4-4-4.5 4.5"/>
</svg>`;

const SVG_HEART = `<svg class="icon-stat-sm" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 14.25l-.345.666a.75.75 0 0 0 .69 0L8 14.25zm0 0C2.561 11.08 1 8.5 1 6.5A4.5 4.5 0 0 1 8 2.75 4.5 4.5 0 0 1 15 6.5c0 2-1.56 4.58-7 7.75z"/>
</svg>`;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build the inner SVG element for a creature's artwork.
 * @param {string} creatureId
 * @param {number} [size=32]   — viewBox units, not px
 * @returns {string} HTML string
 */
export function creatureArtHtml(creatureId, size = 32) {
  const art = CREATURES[creatureId] ?? CREATURE_FALLBACK;
  return `<svg viewBox="0 0 ${size} ${size}" fill="${art.color}"
    xmlns="http://www.w3.org/2000/svg">${art.svg}</svg>`;
}

// ── Card element ───────────────────────────────────────────────────────────────

/**
 * Create a full plush creature card DOM element.
 * @param {import('../../../backend/src/game/cards.js').CardDef & { uid: string }} card
 * @returns {HTMLElement}
 */
export function createCardEl(card) {
  const div = el('div', `card ${card.rarity}`);

  div.innerHTML = `
    <div class="card-image-area">
      <div class="creature-art">${creatureArtHtml(card.id)}</div>
    </div>
    <div class="card-name">${escHtml(card.name)}</div>
    <div class="card-description">${escHtml(card.description)}</div>
    <div class="card-footer">
      <span class="card-damage">${SVG_SWORD} ${card.damage}</span>
      <span class="card-rarity-badge">${RARITY_LABELS[card.rarity] ?? card.rarity}</span>
      <span class="card-hp">${SVG_HEART} ${card.hp}</span>
    </div>`;

  return div;
}

/**
 * Create a tiny card element suitable for the opponent field display.
 * @param {object} card
 * @returns {HTMLElement}
 */
export function createMiniCardEl(card) {
  const div = el('div', 'opp-field-card');
  div.title    = card.name;
  div.innerHTML = creatureArtHtml(card.id, 32);
  return div;
}
