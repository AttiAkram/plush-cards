/**
 * Game screen — renders the board, hand, nexus, and opponents.
 */

import { $, el, escHtml }         from '../utils/dom.js';
import { getState, setState }      from '../state/store.js';
import { showScreen }              from '../router/index.js';
import { on }                      from '../events/emitter.js';
import { createCardEl, createMiniCardEl } from '../components/card.js';

// ── Nexus ──────────────────────────────────────────────────────────────────────

/** @param {{ hp: number, maxHp: number }} nexus */
function updateNexus(nexus) {
  $('nexus-hp-val').textContent    = nexus.hp;
  $('nexus-hp-fill').style.width   = `${(nexus.hp / nexus.maxHp) * 100}%`;
}

// ── Hand ───────────────────────────────────────────────────────────────────────

/** @param {object[]} cards */
function renderHand(cards) {
  const hand = $('player-hand');
  hand.innerHTML = '';

  cards.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.style.animationDelay = `${i * 0.08}s`;
    cardEl.classList.add('dealing');
    hand.appendChild(cardEl);
  });
}

// ── Field ──────────────────────────────────────────────────────────────────────

/**
 * Render player field slots.
 * @param {(object|null)[]} slots
 * @param {string}          containerId
 */
function renderField(slots, containerId) {
  const slotEls = $(containerId).querySelectorAll('.field-slot');

  slotEls.forEach((slotEl, i) => {
    slotEl.innerHTML = '';
    if (slots[i]) {
      slotEl.appendChild(createCardEl(slots[i]));
    } else {
      slotEl.innerHTML = `<svg class="icon-slot" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>`;
    }
  });
}

// ── Opponents ──────────────────────────────────────────────────────────────────

const SVG_HEART_SMALL = `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 14.25l-.345.666a.75.75 0 0 0 .69 0L8 14.25zm0 0C2.561 11.08 1 8.5 1 6.5A4.5 4.5 0 0 1 8 2.75 4.5 4.5 0 0 1 15 6.5c0 2-1.56 4.58-7 7.75z"/>
</svg>`;

/** @param {object} gameState */
function renderOpponents(gameState) {
  const area      = $('opponents-area');
  area.innerHTML  = '';
  const opponents = gameState.turnOrder.filter(u => u !== getState().username);

  for (const username of opponents) {
    const opp = gameState.players[username];
    if (!opp) continue;

    const hpPct = (opp.nexus.hp / opp.nexus.maxHp) * 100;
    const zone  = el('div', 'opponent-zone');

    zone.innerHTML = `
      <div class="opp-name">${escHtml(username)}</div>
      <div class="opp-nexus-info">
        ${SVG_HEART_SMALL} ${opp.nexus.hp}/${opp.nexus.maxHp}
      </div>
      <div class="opp-nexus-bar">
        <div class="opp-nexus-fill" style="width:${hpPct}%"></div>
      </div>
      <div class="opp-hand-backs">
        ${Array.from({ length: opp.hand.length }, () => '<div class="card-back-mini"></div>').join('')}
      </div>`;

    // Field cards
    const fieldEl = el('div', 'opp-field');
    for (const card of opp.field) {
      fieldEl.appendChild(card ? createMiniCardEl(card) : el('div', 'opp-slot-empty'));
    }
    zone.appendChild(fieldEl);
    area.appendChild(zone);
  }
}

// ── Full board render ──────────────────────────────────────────────────────────

/**
 * Render the entire game board from a game state snapshot.
 * @param {object} gameState
 */
export function renderGameBoard(gameState) {
  setState({ gameState });

  const myState = gameState.players[getState().username];
  if (!myState) return;

  // Turn info
  $('turn-number').textContent = `Turno ${gameState.turnNumber}`;
  $('turn-player').textContent = gameState.currentTurn === getState().username
    ? 'Turno tuo!'
    : gameState.currentTurn;

  // Deck
  $('deck-count').textContent = `${myState.deckCount} carte`;

  // My area
  updateNexus(myState.nexus);
  renderHand(myState.hand);
  renderField(myState.field, 'player-field');

  // Opponents
  renderOpponents(gameState);
}

// ── Socket events ──────────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:game_started', gameState => {
    renderGameBoard(gameState);
    showScreen('game');
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Register game event listeners. Call once at app startup. */
export function initGameScreen() {
  initSocketListeners();
}
