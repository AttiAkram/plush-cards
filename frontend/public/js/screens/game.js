/**
 * Game screen — renders the board and handles all interactive mechanics:
 *   • End Turn button (+ Enter hotkey)
 *   • Leave Match button
 *   • Card inspect modal (click hand/field cards; long-press on mobile)
 *   • Drag & Drop from hand to field (HTML5 DnD, event delegation)
 *   • Turn changed / card played socket event handlers
 */

import { $, el, escHtml }                        from '../utils/dom.js';
import { getState, setState }                     from '../state/store.js';
import { showScreen }                             from '../router/index.js';
import { on }                                     from '../events/emitter.js';
import { createCardEl, createMiniCardEl,
         creatureArtHtml }                        from '../components/card.js';
import { endTurn, playCard, requestValidSlots,
         leaveMatch }                             from '../socket/client.js';

// ── Drag state ────────────────────────────────────────────────────────────────

let draggingCardUid   = null;
let currentValidSlots = [];   // slot indices declared valid by the server

// ── Rarity labels (shared) ────────────────────────────────────────────────────

const RARITY_LABELS = {
  comune: 'Comune', raro: 'Raro', epico: 'Epico',
  mitico: 'Mitico', leggendario: 'Leggendario',
};

// ── Nexus ─────────────────────────────────────────────────────────────────────

function updateNexus(nexus) {
  $('nexus-hp-val').textContent  = nexus.hp;
  $('nexus-hp-fill').style.width = `${(nexus.hp / nexus.maxHp) * 100}%`;
}

// ── Turn info + End Turn button ───────────────────────────────────────────────

function updateTurnInfo(gameState) {
  const isMe = gameState.currentTurn === getState().username;
  $('turn-number').textContent = `Turno ${gameState.turnNumber}`;
  $('turn-player').textContent = isMe ? 'Turno tuo!' : gameState.currentTurn;

  const badge = document.querySelector('.turn-badge');
  if (badge) badge.classList.toggle('my-turn', isMe);

  $('btn-end-turn').disabled = !isMe;
}

// ── Card detail modal ─────────────────────────────────────────────────────────

function openCardModal(card) {
  $('card-modal-art').innerHTML  = creatureArtHtml(card.id, 64);
  $('card-modal-name').textContent = card.name;

  const rarityEl = $('card-modal-rarity');
  rarityEl.textContent = RARITY_LABELS[card.rarity] ?? card.rarity;
  rarityEl.className   = `card-modal-rarity rarity-${card.rarity}`;

  $('card-modal-stats').innerHTML =
    `<span class="cm-stat cm-dmg">⚔ ${card.damage}</span>
     <span class="cm-stat cm-hp">♥ ${card.hp}</span>`;

  $('card-modal-desc').textContent = card.description;
  $('card-modal').classList.remove('hidden');
}

function closeCardModal() {
  $('card-modal').classList.add('hidden');
}

/**
 * Attach click (desktop) and long-press (mobile) to open the card modal.
 * @param {HTMLElement} cardEl
 * @param {object}      card
 */
function attachCardInspect(cardEl, card) {
  cardEl.addEventListener('click', () => openCardModal(card));

  let lpTimer;
  cardEl.addEventListener('touchstart', () => {
    lpTimer = setTimeout(() => openCardModal(card), 500);
  }, { passive: true });
  cardEl.addEventListener('touchend',  () => clearTimeout(lpTimer));
  cardEl.addEventListener('touchmove', () => clearTimeout(lpTimer));
}

// ── Slot highlight helpers ────────────────────────────────────────────────────

function highlightValidSlots() {
  $('player-field').querySelectorAll('.field-slot').forEach((slotEl, i) => {
    slotEl.classList.toggle('droppable', currentValidSlots.includes(i));
  });
}

function clearSlotHighlights() {
  $('player-field').querySelectorAll('.field-slot').forEach(slotEl => {
    slotEl.classList.remove('droppable', 'drag-over');
  });
}

// ── Hand ──────────────────────────────────────────────────────────────────────

function renderHand(cards) {
  const hand    = $('player-hand');
  hand.innerHTML = '';

  const { gameState, username } = getState();
  const isMyTurn = gameState?.currentTurn === username;

  cards.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.dataset.uid          = card.uid;
    cardEl.style.animationDelay = `${i * 0.08}s`;
    cardEl.classList.add('dealing');
    cardEl.draggable = isMyTurn;
    attachCardInspect(cardEl, card);
    hand.appendChild(cardEl);
  });
}

// ── Field ─────────────────────────────────────────────────────────────────────

function renderField(slots, containerId) {
  const slotEls = $(containerId).querySelectorAll('.field-slot');
  slotEls.forEach((slotEl, i) => {
    slotEl.innerHTML = '';
    if (slots[i]) {
      const cardEl = createCardEl(slots[i]);
      attachCardInspect(cardEl, slots[i]);
      slotEl.appendChild(cardEl);
    } else {
      slotEl.innerHTML = `<svg class="icon-slot" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>`;
    }
  });
}

// ── Opponents ─────────────────────────────────────────────────────────────────

const SVG_HEART_SMALL = `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 14.25l-.345.666a.75.75 0 0 0 .69 0L8 14.25zm0 0C2.561 11.08 1 8.5 1 6.5A4.5 4.5 0 0 1 8 2.75 4.5 4.5 0 0 1 15 6.5c0 2-1.56 4.58-7 7.75z"/>
</svg>`;

function renderOpponents(gameState) {
  const area     = $('opponents-area');
  area.innerHTML = '';
  const myName   = getState().username;

  for (const username of gameState.turnOrder) {
    if (username === myName) continue;
    const opp = gameState.players[username];
    if (!opp) continue;

    const hpPct    = (opp.nexus.hp / opp.nexus.maxHp) * 100;
    const isActive = gameState.currentTurn === username;
    const zone     = el('div', `opponent-zone${isActive ? ' active-turn' : ''}`);

    zone.innerHTML = `
      <div class="opp-name">${escHtml(username)}</div>
      <div class="opp-nexus-info">
        ${SVG_HEART_SMALL} ${opp.nexus.hp}/${opp.nexus.maxHp}
      </div>
      <div class="opp-nexus-bar">
        <div class="opp-nexus-fill" style="width:${hpPct}%"></div>
      </div>
      <div class="opp-hand-backs">
        ${Array.from({ length: opp.hand.length },
            () => '<div class="card-back-mini"></div>').join('')}
      </div>`;

    const fieldEl = el('div', 'opp-field');
    for (const card of opp.field) {
      if (card) {
        const miniEl = createMiniCardEl(card);
        attachCardInspect(miniEl, card);
        fieldEl.appendChild(miniEl);
      } else {
        fieldEl.appendChild(el('div', 'opp-slot-empty'));
      }
    }
    zone.appendChild(fieldEl);
    area.appendChild(zone);
  }
}

// ── Full board render ─────────────────────────────────────────────────────────

export function renderGameBoard(gameState) {
  setState({ gameState });

  const myState = gameState.players[getState().username];
  if (!myState) return;

  updateTurnInfo(gameState);
  $('deck-count').textContent = `${myState.deckCount} carte`;

  updateNexus(myState.nexus);
  renderHand(myState.hand);
  renderField(myState.field, 'player-field');
  renderOpponents(gameState);
}

// ── Drag & Drop (event delegation on containers) ──────────────────────────────

function initHandDrag() {
  const hand = $('player-hand');

  hand.addEventListener('dragstart', e => {
    const cardEl = e.target.closest('[data-uid]');
    if (!cardEl) return;
    const { gameState, username } = getState();
    if (gameState?.currentTurn !== username) return;

    draggingCardUid   = cardEl.dataset.uid;
    currentValidSlots = [];
    cardEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';

    requestValidSlots(draggingCardUid);
    // Give the server a tick to respond before highlighting
    setTimeout(highlightValidSlots, 60);
  });

  hand.addEventListener('dragend', e => {
    const cardEl = e.target.closest('[data-uid]');
    if (cardEl) cardEl.classList.remove('dragging');
    draggingCardUid = null;
    clearSlotHighlights();
  });
}

function initFieldDropZones() {
  const field = $('player-field');

  field.addEventListener('dragover', e => {
    const slotEl = e.target.closest('.field-slot');
    if (!slotEl || !draggingCardUid) return;
    const i = parseInt(slotEl.dataset.slot, 10);
    if (!currentValidSlots.includes(i)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Highlight drop target, keep valid-slot glow on others
    field.querySelectorAll('.field-slot').forEach((s, idx) => {
      s.classList.toggle('droppable', currentValidSlots.includes(idx) && s !== slotEl);
      s.classList.toggle('drag-over', s === slotEl);
    });
  });

  field.addEventListener('dragleave', e => {
    // Only clear drag-over when leaving the slot entirely
    const slotEl = e.target.closest('.field-slot');
    if (slotEl && !slotEl.contains(e.relatedTarget)) {
      slotEl.classList.remove('drag-over');
    }
  });

  field.addEventListener('drop', e => {
    const slotEl = e.target.closest('.field-slot');
    if (!slotEl || !draggingCardUid) return;
    const i = parseInt(slotEl.dataset.slot, 10);
    e.preventDefault();
    clearSlotHighlights();
    if (!currentValidSlots.includes(i)) return;
    playCard(draggingCardUid, i);
    draggingCardUid = null;
  });
}

// ── Action buttons + keyboard shortcuts ───────────────────────────────────────

function initGameActions() {
  // End Turn button
  $('btn-end-turn').addEventListener('click', () => endTurn());

  // Leave Match button
  $('btn-leave-match').addEventListener('click', () => leaveMatch());

  // Card modal close
  $('card-modal-close').addEventListener('click', closeCardModal);
  $('card-modal-overlay').addEventListener('click', closeCardModal);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCardModal();
      return;
    }
    // Enter = End Turn (only when modal is closed and it's your turn)
    if (e.key === 'Enter'
        && $('card-modal').classList.contains('hidden')
        && !$('btn-end-turn').disabled) {
      endTurn();
    }
  });

  // Drag & Drop
  initHandDrag();
  initFieldDropZones();
}

// ── Socket events ─────────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:game_started', gameState => {
    renderGameBoard(gameState);
    showScreen('game');
  });

  // Another player (or server) advanced the turn
  on('socket:turn_changed', ({ currentTurn, turnNumber }) => {
    const gs = getState().gameState;
    if (!gs) return;
    gs.currentTurn = currentTurn;
    gs.turnNumber  = turnNumber;
    setState({ gameState: gs });

    updateTurnInfo(gs);
    // Re-render hand to toggle draggable state
    renderHand(gs.players[getState().username]?.hand ?? []);
    // Re-render opponents to update active-turn outline
    renderOpponents(gs);
  });

  // A card was played (by anyone)
  on('socket:card_played', ({ playerId, cardUid, slotIndex, card }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const player = gs.players[playerId];
    if (!player) return;

    // Update state
    player.field[slotIndex] = card;
    if (playerId !== getState().username) {
      // Opponents: remove from their hand array (keeps hand count accurate)
      const idx = player.hand.findIndex(c => c.uid === cardUid);
      if (idx !== -1) player.hand.splice(idx, 1);
    }
    setState({ gameState: gs });

    if (playerId === getState().username) {
      renderField(player.field, 'player-field');
    } else {
      renderOpponents(gs);
    }
  });

  // Our hand changed after playing a card
  on('socket:hand_updated', ({ hand }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const me = gs.players[getState().username];
    if (!me) return;
    me.hand = hand;
    setState({ gameState: gs });
    renderHand(hand);
  });

  // Server confirmed valid drop zones during a drag
  on('socket:valid_slots', ({ cardUid, validSlots }) => {
    if (cardUid !== draggingCardUid) return;
    currentValidSlots = validSlots;
    highlightValidSlots();
  });

  // We successfully left the match
  on('socket:left_match', () => {
    // Dynamic import avoids a circular dep with lobby → game → lobby
    import('./lobby.js').then(({ enterLobby }) => enterLobby());
  });

  // An opponent left — refresh opponent panel
  on('socket:player_left_match', () => {
    const gs = getState().gameState;
    if (gs) renderOpponents(gs);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Register all game screen event listeners. Call once at app startup. */
export function initGameScreen() {
  initGameActions();
  initSocketListeners();
}
