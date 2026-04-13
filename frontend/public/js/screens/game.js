/**
 * Game screen — all interactive mechanics:
 *   • Players status bar (replaces opponents-area)
 *   • Turn changed banner + End Turn pending state
 *   • Card inspect modal (click / long-press)
 *   • Drag & Drop hand → field (HTML5 DnD, event delegation)
 *   • Zone stacks panel (discard / void / absolute)
 *   • Leave Match
 */

import { $, el, escHtml }                        from '../utils/dom.js';
import { getState, setState }                     from '../state/store.js';
import { showScreen }                             from '../router/index.js';
import { on }                                     from '../events/emitter.js';
import { createCardEl, creatureArtHtml }          from '../components/card.js';
import { endTurn, playCard, requestValidSlots,
         leaveMatch }                             from '../socket/client.js';

// ── Drag state ────────────────────────────────────────────────────────────────

let draggingCardUid   = null;
let currentValidSlots = [];

// ── Rarity labels ─────────────────────────────────────────────────────────────

const RARITY_LABELS = {
  comune: 'Comune', raro: 'Raro', epico: 'Epico',
  mitico: 'Mitico', leggendario: 'Leggendario',
};

// ── Nexus ─────────────────────────────────────────────────────────────────────

function updateNexus(nexus) {
  $('nexus-hp-val').textContent  = nexus.hp;
  $('nexus-hp-fill').style.width = `${(nexus.hp / nexus.maxHp) * 100}%`;
}

// ──────────────────────────────────────────────────────────────────────────────
// PLAYERS BAR
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_ICONS = {
  active:       '<span class="ps-dot ps-dot--active"></span>',
  disconnected: '<span class="ps-dot ps-dot--disc" title="Disconnesso">↯</span>',
  left:         '<span class="ps-dot ps-dot--left" title="Ha abbandonato">✕</span>',
};

/**
 * Render the top player-status bar from the full game state.
 * Shows a pill per player: avatar, name, HP bar, status, active-turn highlight.
 */
function renderPlayersBar(gameState) {
  const bar  = $('players-bar');
  // Keep the Leave button (first child), clear the rest
  const leave = bar.firstElementChild;
  bar.innerHTML = '';
  bar.appendChild(leave);

  const me = getState().username;

  for (const username of gameState.turnOrder) {
    const p       = gameState.players[username];
    if (!p) continue;
    const isMe    = username === me;
    const isTurn  = gameState.currentTurn === username;
    const status  = p.status ?? 'active';
    const hpPct   = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);

    const pill = el('div',
      `player-pill${isTurn ? ' is-turn' : ''}${isMe ? ' is-me' : ''} status-${status}`);

    pill.innerHTML = `
      <div class="player-avatar">${escHtml(username[0].toUpperCase())}</div>
      <div class="player-pill-body">
        <div class="player-pill-name">${escHtml(username)}${isMe ? ' <span class="you-badge">tu</span>' : ''}</div>
        <div class="player-pill-hp">
          <div class="player-hp-bar"><div class="player-hp-fill" style="width:${hpPct}%"></div></div>
          <span class="player-hp-text">${p.nexus.hp}</span>
        </div>
      </div>
      ${STATUS_ICONS[status] ?? STATUS_ICONS.active}`;

    bar.appendChild(pill);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TURN INFO + END TURN BUTTON
// ──────────────────────────────────────────────────────────────────────────────

function updateTurnInfo(gameState) {
  const isMe = gameState.currentTurn === getState().username;
  $('turn-number').textContent = `Turno ${gameState.turnNumber}`;
  $('turn-player').textContent = isMe ? 'Turno tuo!' : gameState.currentTurn;

  const badge = $('turn-badge');
  if (badge) badge.classList.toggle('my-turn', isMe);
}

function setEndTurnPending(pending) {
  const btn = $('btn-end-turn');
  if (pending) {
    btn.disabled   = true;
    btn.textContent = 'In attesa…';
    btn.classList.add('pending');
  } else {
    btn.classList.remove('pending');
  }
}

function updateEndTurnBtn(gameState) {
  const btn  = $('btn-end-turn');
  const isMe = gameState.currentTurn === getState().username;
  btn.disabled    = !isMe;
  btn.textContent = 'Fine Turno';
  btn.classList.remove('pending');
}

// ──────────────────────────────────────────────────────────────────────────────
// TURN CHANGE BANNER
// ──────────────────────────────────────────────────────────────────────────────

let _bannerTimer;

function showTurnBanner(text) {
  clearTimeout(_bannerTimer);
  const banner = $('turn-banner');
  $('turn-banner-text').textContent = text;
  banner.classList.remove('hidden', 'banner-hide');
  // force reflow so the transition fires
  banner.offsetWidth; // eslint-disable-line no-unused-expressions
  banner.classList.add('banner-show');

  _bannerTimer = setTimeout(() => {
    banner.classList.remove('banner-show');
    banner.classList.add('banner-hide');
    setTimeout(() => banner.classList.add('hidden'), 400);
  }, 2400);
}

// ──────────────────────────────────────────────────────────────────────────────
// CARD DETAIL MODAL
// ──────────────────────────────────────────────────────────────────────────────

function openCardModal(card) {
  $('card-modal-art').innerHTML    = creatureArtHtml(card.id, 64);
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

function closeCardModal() { $('card-modal').classList.add('hidden'); }

function attachCardInspect(cardEl, card) {
  cardEl.addEventListener('click', () => openCardModal(card));
  let lp;
  cardEl.addEventListener('touchstart', () => {
    lp = setTimeout(() => openCardModal(card), 500);
  }, { passive: true });
  cardEl.addEventListener('touchend',  () => clearTimeout(lp));
  cardEl.addEventListener('touchmove', () => clearTimeout(lp));
}

// ──────────────────────────────────────────────────────────────────────────────
// ZONE STACKS (discard / void / absolute)
// ──────────────────────────────────────────────────────────────────────────────

const ZONE_TITLES = { discard: 'Scarti', void: 'Vuoto', absolute: 'Assoluto' };

function updateZoneCounts(gameState) {
  const me = getState().username;
  // discard: show my own discard count
  const discardCount = gameState.players[me]?.discard?.length ?? 0;
  const voidCount    = gameState.zones?.void?.length ?? 0;
  const absCount     = gameState.zones?.absolute?.length ?? 0;

  $('zone-count-discard').textContent  = discardCount;
  $('zone-count-void').textContent     = voidCount;
  $('zone-count-absolute').textContent = absCount;
}

function openZonePanel(zoneName, gameState) {
  const me    = getState().username;
  let cards;
  if (zoneName === 'discard')  cards = gameState.players[me]?.discard  ?? [];
  else if (zoneName === 'void')      cards = gameState.zones?.void     ?? [];
  else                               cards = gameState.zones?.absolute ?? [];

  $('zone-panel-title').textContent = ZONE_TITLES[zoneName] ?? zoneName;
  const container = $('zone-panel-cards');
  container.innerHTML = '';

  if (!cards.length) {
    container.innerHTML = '<p class="zone-panel-empty">Nessuna carta</p>';
  } else {
    cards.forEach(card => {
      const cardEl = createCardEl(card);
      attachCardInspect(cardEl, card);
      container.appendChild(cardEl);
    });
  }

  $('zone-panel').classList.remove('hidden');
}

function closeZonePanel() { $('zone-panel').classList.add('hidden'); }

function initZonePanels() {
  document.querySelectorAll('.zone-stack').forEach(btn => {
    btn.addEventListener('click', () => {
      const gs = getState().gameState;
      if (gs) openZonePanel(btn.dataset.zone, gs);
    });
  });
  $('zone-panel-close').addEventListener('click', closeZonePanel);
  $('zone-panel-overlay').addEventListener('click', closeZonePanel);
}

// ──────────────────────────────────────────────────────────────────────────────
// HAND
// ──────────────────────────────────────────────────────────────────────────────

function renderHand(cards) {
  const hand = $('player-hand');
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

// ──────────────────────────────────────────────────────────────────────────────
// FIELD
// ──────────────────────────────────────────────────────────────────────────────

function highlightValidSlots() {
  $('player-field').querySelectorAll('.field-slot').forEach((s, i) => {
    s.classList.toggle('droppable', currentValidSlots.includes(i));
  });
}

function clearSlotHighlights() {
  $('player-field').querySelectorAll('.field-slot').forEach(s => {
    s.classList.remove('droppable', 'drag-over');
  });
}

function renderField(slots, containerId) {
  $(containerId).querySelectorAll('.field-slot').forEach((slotEl, i) => {
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

// ──────────────────────────────────────────────────────────────────────────────
// FULL BOARD RENDER
// ──────────────────────────────────────────────────────────────────────────────

export function renderGameBoard(gameState) {
  setState({ gameState });
  const myState = gameState.players[getState().username];
  if (!myState) return;

  renderPlayersBar(gameState);
  updateTurnInfo(gameState);
  updateEndTurnBtn(gameState);
  updateZoneCounts(gameState);

  $('deck-count').textContent = `${myState.deckCount} carte`;
  updateNexus(myState.nexus);
  renderHand(myState.hand);
  renderField(myState.field, 'player-field');
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAG & DROP (event delegation)
// ──────────────────────────────────────────────────────────────────────────────

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
    field.querySelectorAll('.field-slot').forEach((s, idx) => {
      s.classList.toggle('droppable', currentValidSlots.includes(idx) && s !== slotEl);
      s.classList.toggle('drag-over', s === slotEl);
    });
  });

  field.addEventListener('dragleave', e => {
    const slotEl = e.target.closest('.field-slot');
    if (slotEl && !slotEl.contains(e.relatedTarget))
      slotEl.classList.remove('drag-over');
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

// ──────────────────────────────────────────────────────────────────────────────
// ACTION BUTTONS + KEYBOARD
// ──────────────────────────────────────────────────────────────────────────────

function initGameActions() {
  $('btn-end-turn').addEventListener('click', () => {
    setEndTurnPending(true);
    endTurn();
  });

  $('btn-leave-match').addEventListener('click', () => leaveMatch());

  // Card modal
  $('card-modal-close').addEventListener('click', closeCardModal);
  $('card-modal-overlay').addEventListener('click', closeCardModal);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCardModal();
      closeZonePanel();
      return;
    }
    if (e.key === 'Enter'
        && $('card-modal').classList.contains('hidden')
        && $('zone-panel').classList.contains('hidden')
        && !$('btn-end-turn').disabled) {
      setEndTurnPending(true);
      endTurn();
    }
  });

  initZonePanels();
  initHandDrag();
  initFieldDropZones();
}

// ──────────────────────────────────────────────────────────────────────────────
// SOCKET LISTENERS
// ──────────────────────────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:game_started', gameState => {
    renderGameBoard(gameState);
    showScreen('game');
  });

  on('socket:turn_changed', ({ currentTurn, turnNumber }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const prevTurn = gs.currentTurn;
    gs.currentTurn = currentTurn;
    gs.turnNumber  = turnNumber;
    setState({ gameState: gs });

    const me    = getState().username;
    const isMe  = currentTurn === me;
    const label = isMe ? 'Turno tuo!' : `Turno di ${currentTurn}`;
    showTurnBanner(label);

    renderPlayersBar(gs);
    updateTurnInfo(gs);
    updateEndTurnBtn(gs);
    // Re-render hand so draggable state flips on turn change
    renderHand(gs.players[me]?.hand ?? []);
  });

  on('socket:card_played', ({ playerId, cardUid, slotIndex, card }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const player = gs.players[playerId];
    if (!player) return;

    player.field[slotIndex] = card;
    if (playerId !== getState().username) {
      // Decrement opponent hand count
      const idx = player.hand.findIndex(c => c.uid === cardUid);
      if (idx !== -1) player.hand.splice(idx, 1);
    }
    setState({ gameState: gs });

    if (playerId === getState().username) renderField(player.field, 'player-field');
    else                                  renderPlayersBar(gs); // hand count change
  });

  on('socket:hand_updated', ({ hand }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const me = gs.players[getState().username];
    if (!me) return;
    me.hand = hand;
    setState({ gameState: gs });
    renderHand(hand);
  });

  on('socket:valid_slots', ({ cardUid, validSlots }) => {
    if (cardUid !== draggingCardUid) return;
    currentValidSlots = validSlots;
    highlightValidSlots();
  });

  on('socket:player_status_changed', ({ username, status }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const player = gs.players[username];
    if (!player) return;
    player.status = status;
    setState({ gameState: gs });
    renderPlayersBar(gs);
  });

  on('socket:left_match', () => {
    import('./lobby.js').then(({ enterLobby }) => enterLobby());
  });

  on('socket:player_left_match', () => {
    // Status change is handled by player_status_changed; nothing extra needed here
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initGameScreen() {
  initGameActions();
  initSocketListeners();
}
