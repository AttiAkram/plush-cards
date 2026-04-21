/**
 * Game screen — all interactive mechanics:
 *   • Players status bar + opponent fields always visible on board
 *   • Player panel (click any pill → slide-in panel with field/nexus/zones)
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

// ── Touch state ───────────────────────────────────────────────────────────────

let _touchStartCard  = null;   // { uid, el, startX, startY } while finger is down
let _touchHoldTimer  = null;
let _touchDragging   = false;
let _ghostEl         = null;
let _tapSelectUid    = null;   // uid of hand card currently in tap-select mode
let _tapSelectCard   = null;   // card object for the tap-selected card
let _currentModalCard = null;  // card object currently shown in the inspect modal

const _HOLD_MS     = 280;
const _TAP_MOVE_PX = 10;

// ── Rarity labels ─────────────────────────────────────────────────────────────

const RARITY_LABELS = {
  comune: 'Comune', raro: 'Raro', epico: 'Epico',
  mitico: 'Mitico', leggendario: 'Leggendario',
};

// ── Ghost card helpers (touch drag) ──────────────────────────────────────────

function _createGhost(sourceEl, cx, cy) {
  const r     = sourceEl.getBoundingClientRect();
  const clone = sourceEl.cloneNode(true);
  clone.removeAttribute('id');
  Object.assign(clone.style, {
    position:      'fixed',
    pointerEvents: 'none',
    zIndex:        '9999',
    width:         `${r.width}px`,
    height:        `${r.height}px`,
    left:          `${cx - r.width / 2}px`,
    top:           `${cy - r.height / 2}px`,
    transform:     'scale(1.12) rotate(4deg)',
    boxShadow:     '0 18px 44px rgba(0,0,0,0.28)',
    opacity:       '0.95',
    transition:    'none',
  });
  document.body.appendChild(clone);
  return clone;
}

function _moveGhost(cx, cy) {
  if (!_ghostEl) return;
  _ghostEl.style.left = `${cx - parseFloat(_ghostEl.style.width)  / 2}px`;
  _ghostEl.style.top  = `${cy - parseFloat(_ghostEl.style.height) / 2}px`;
}

function _removeGhost() { _ghostEl?.remove(); _ghostEl = null; }

// ── Tap-select mode helpers ───────────────────────────────────────────────────

function exitTapSelectMode() {
  if (!_tapSelectUid) return;
  _tapSelectUid = _tapSelectCard = null;
  $('player-hand').querySelectorAll('[data-uid]').forEach(el => el.classList.remove('tap-selected'));
  clearSlotHighlights();
}

function enterTapSelectMode(uid, card) {
  if (_tapSelectUid === uid) {
    // Second tap on same card → deselect + open inspect modal
    exitTapSelectMode();
    openCardModal(card);
    return;
  }
  exitTapSelectMode();
  _tapSelectUid  = uid;
  _tapSelectCard = card;
  $('player-hand').querySelectorAll('[data-uid]').forEach(el =>
    el.classList.toggle('tap-selected', el.dataset.uid === uid));
  currentValidSlots = [];
  requestValidSlots(uid);
}

// ── Find the field slot under a touch point ───────────────────────────────────

function _slotUnderPoint(cx, cy) {
  const field = $('player-field');
  for (const el of document.elementsFromPoint(cx, cy)) {
    const s = el.closest?.('.field-slot[data-slot]');
    if (s && field.contains(s)) return s;
  }
  return null;
}

// ── Nexus (player's own) ──────────────────────────────────────────────────────

function updateNexus(nexus) {
  $('nexus-hp-val').textContent  = nexus.hp;
  $('nexus-hp-fill').style.width = `${(nexus.hp / nexus.maxHp) * 100}%`;
}

// ──────────────────────────────────────────────────────────────────────────────
// SHARED FIELD RENDERER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render cards into an array of existing .field-slot elements (or any container
 * whose children you want to fill).  Works for player field, opp zones, panel.
 *
 * @param {(object|null)[]} slots
 * @param {HTMLElement}      container  — element whose .field-slot children to fill,
 *                                        OR element to append fresh slots into (useFresh)
 * @param {boolean}          [useFresh] — if true, clears container and appends new slot divs
 */
function renderSlotsInto(slots, container, useFresh = false) {
  if (useFresh) {
    container.innerHTML = '';
    slots.forEach(() => container.appendChild(el('div', 'field-slot')));
  }
  const slotEls = container.querySelectorAll('.field-slot');
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

// Convenience wrapper for the static player-field element
function renderField(slots, containerId) {
  renderSlotsInto(slots, $(containerId));
}

// ──────────────────────────────────────────────────────────────────────────────
// PLAYERS BAR
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_ICONS = {
  active:       '',
  disconnected: '<span class="ps-dot ps-dot--disc" title="Disconnesso">↯</span>',
  left:         '<span class="ps-dot ps-dot--left" title="Ha abbandonato">✕</span>',
};

function renderPlayersBar(gameState) {
  const bar   = $('players-bar');
  const leave = bar.firstElementChild;   // keep the Leave button
  bar.innerHTML = '';
  bar.appendChild(leave);

  const me = getState().username;

  for (const username of gameState.turnOrder) {
    const p      = gameState.players[username];
    if (!p) continue;
    const isMe   = username === me;
    const isTurn = gameState.currentTurn === username;
    const status = p.status ?? 'active';
    const hpPct  = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);

    const pill = el('div',
      `player-pill${isTurn ? ' is-turn' : ''}${isMe ? ' is-me' : ''} status-${status}`);

    pill.innerHTML = `
      <div class="player-avatar">${escHtml(username[0].toUpperCase())}</div>
      <div class="player-pill-body">
        <div class="player-pill-name">
          ${escHtml(username)}
          ${isMe ? '<span class="you-badge">tu</span>' : ''}
        </div>
        <div class="player-pill-hp">
          <div class="player-hp-bar"><div class="player-hp-fill" style="width:${hpPct}%"></div></div>
          <span class="player-hp-text">${p.nexus.hp}</span>
        </div>
      </div>
      ${STATUS_ICONS[status] ?? ''}`;

    // Clicking any pill opens that player's panel
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', () => openPlayerPanel(username, getState().gameState));

    bar.appendChild(pill);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// OPPONENTS AREA — always visible on the main board
// ──────────────────────────────────────────────────────────────────────────────

function renderOpponentsArea(gameState) {
  const area   = $('opponents-area');
  area.innerHTML = '';
  const myName = getState().username;

  for (const username of gameState.turnOrder) {
    if (username === myName) continue;
    const p = gameState.players[username];
    if (!p) continue;

    const hpPct    = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);
    const isActive = gameState.currentTurn === username;
    const zone     = el('div', `opp-zone${isActive ? ' opp-zone--active' : ''}`);

    // Header: name + HP bar
    zone.innerHTML = `
      <div class="opp-zone-header">
        <span class="opp-zone-name">${escHtml(username)}</span>
        <div class="opp-zone-hp">
          <div class="opp-hp-bar"><div class="opp-hp-fill" style="width:${hpPct}%"></div></div>
          <span class="opp-hp-text">♥ ${p.nexus.hp}</span>
        </div>
      </div>`;

    // Field row with cards (clickable)
    const fieldRow = el('div', 'opp-zone-field');
    p.field.forEach(card => {
      const slotEl = el('div', 'field-slot');
      if (card) {
        const cardEl = createCardEl(card);
        attachCardInspect(cardEl, card);
        slotEl.appendChild(cardEl);
      } else {
        slotEl.innerHTML = `<svg class="icon-slot" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`;
      }
      fieldRow.appendChild(slotEl);
    });
    zone.appendChild(fieldRow);

    // Clicking the zone header/name opens the player panel for that opponent
    zone.querySelector('.opp-zone-header').addEventListener('click', () => {
      openPlayerPanel(username, getState().gameState);
    });

    area.appendChild(zone);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PLAYER PANEL
// ──────────────────────────────────────────────────────────────────────────────

let _panelUsername = null;

function openPlayerPanel(username, gameState) {
  if (!gameState) return;
  _panelUsername = username;
  const p    = gameState.players[username];
  if (!p) return;
  const isMe = username === getState().username;

  // Header
  $('pp-avatar').textContent = username[0].toUpperCase();
  $('pp-name').textContent   = username;

  // Nexus
  const hpPct = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);
  $('pp-nexus').innerHTML = `
    <div class="pp-nexus-card">
      <div class="pp-nexus-icon">
        <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2L4 9v13c0 10 7.2 19.4 16 22 8.8-2.6 16-12 16-22V9L20 2z"
            fill="#E8E8E8" stroke="#BDBDBD" stroke-width="1.5"/>
          <path d="M16 22l3 3 6-6" stroke="#606060" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="pp-nexus-info">
        <div class="pp-nexus-hp-bar">
          <div class="pp-nexus-hp-fill" style="width:${hpPct}%"></div>
        </div>
        <span class="pp-nexus-hp-text">♥ ${p.nexus.hp} / ${p.nexus.maxHp}</span>
      </div>
    </div>`;

  // Field
  renderSlotsInto(p.field, $('pp-field'), true);

  // Zone counts (discard is per-player; void/absolute are global)
  $('pp-zone-discard-count').textContent  = p.discard?.length ?? 0;
  $('pp-zone-void-count').textContent     = gameState.zones?.void?.length ?? 0;
  $('pp-zone-absolute-count').textContent = gameState.zones?.absolute?.length ?? 0;

  // Hand section: visible for self only (opponents' hands are hidden)
  const handSection = $('pp-hand-section');
  if (isMe) {
    handSection.classList.remove('hidden');
    const handContainer = $('pp-hand-cards');
    handContainer.innerHTML = '';
    p.hand.forEach(card => {
      const cardEl = createCardEl(card);
      attachCardInspect(cardEl, card);
      handContainer.appendChild(cardEl);
    });
  } else {
    handSection.classList.add('hidden');
  }

  // Slide in
  const panel = $('player-panel');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('panel-open'));
}

function closePlayerPanel() {
  const panel = $('player-panel');
  panel.classList.remove('panel-open');
  setTimeout(() => { panel.classList.add('hidden'); _panelUsername = null; }, 300);
}

/** If the panel is open for `username`, refresh its content silently. */
function refreshPanelIfOpen(username, gameState) {
  if (_panelUsername === username
      && !$('player-panel').classList.contains('hidden')) {
    openPlayerPanel(username, gameState);
  }
}

function initPlayerPanel() {
  $('pp-close').addEventListener('click', closePlayerPanel);
  $('player-panel-overlay').addEventListener('click', closePlayerPanel);

  // Zone buttons inside the panel — open zone panel for the panel's player
  $('pp-zone-discard').addEventListener('click', () => {
    const gs = getState().gameState;
    if (gs && _panelUsername) openZonePanel('discard', gs, _panelUsername);
  });
  $('pp-zone-void').addEventListener('click', () => {
    const gs = getState().gameState;
    if (gs && _panelUsername) openZonePanel('void', gs, _panelUsername);
  });
  $('pp-zone-absolute').addEventListener('click', () => {
    const gs = getState().gameState;
    if (gs && _panelUsername) openZonePanel('absolute', gs, _panelUsername);
  });
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
    btn.disabled    = true;
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
  banner.offsetWidth; // eslint-disable-line
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
  _currentModalCard = card;
  $('card-modal-art').innerHTML    = creatureArtHtml(card.id, 64);
  $('card-modal-name').textContent = card.name;
  const rarityEl = $('card-modal-rarity');
  rarityEl.textContent = RARITY_LABELS[card.rarity] ?? card.rarity;
  rarityEl.className   = `card-modal-rarity rarity-${card.rarity}`;
  $('card-modal-stats').innerHTML =
    `<span class="cm-stat cm-dmg">⚔ ${card.damage}</span>
     <span class="cm-stat cm-hp">♥ ${card.hp}</span>`;
  $('card-modal-desc').textContent = card.description;

  // Show "Gioca" only when it's my turn and the card is in my hand
  const { gameState, username } = getState();
  const isMyTurn = gameState?.currentTurn === username;
  const inMyHand = gameState?.players[username]?.hand?.some(c => c.uid === card.uid);
  $('card-modal-play').classList.toggle('hidden', !(isMyTurn && inMyHand));

  $('card-modal').classList.remove('hidden');
}

function closeCardModal() {
  $('card-modal').classList.add('hidden');
  _currentModalCard = null;
}

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
  $('zone-count-discard').textContent  = gameState.players[me]?.discard?.length ?? 0;
  $('zone-count-void').textContent     = gameState.zones?.void?.length ?? 0;
  $('zone-count-absolute').textContent = gameState.zones?.absolute?.length ?? 0;
}

/**
 * @param {string} zoneName
 * @param {object} gameState
 * @param {string} [targetUsername]  — whose discard to show (defaults to self)
 */
function openZonePanel(zoneName, gameState, targetUsername) {
  const username = targetUsername ?? getState().username;
  let cards;
  if (zoneName === 'discard')  cards = gameState.players[username]?.discard ?? [];
  else if (zoneName === 'void') cards = gameState.zones?.void ?? [];
  else                          cards = gameState.zones?.absolute ?? [];

  const titleSuffix = targetUsername && targetUsername !== getState().username
    ? ` di ${targetUsername}` : '';
  $('zone-panel-title').textContent = (ZONE_TITLES[zoneName] ?? zoneName) + titleSuffix;

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
  document.querySelectorAll('.zone-stack:not(.pp-zone-btn)').forEach(btn => {
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
  exitTapSelectMode();
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
    // Desktop click → inspect modal (touch is handled by initTouchDrag delegation)
    cardEl.addEventListener('click', () => openCardModal(card));
    hand.appendChild(cardEl);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAG & DROP — player field only (event delegation)
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
// TOUCH DRAG + TAP-SELECT (mobile)
// ──────────────────────────────────────────────────────────────────────────────

function initTouchDrag() {
  const hand  = $('player-hand');
  const field = $('player-field');

  // ── touchstart: note which card was touched, start hold timer ───────────────
  hand.addEventListener('touchstart', e => {
    const cardEl = e.target.closest('[data-uid]');
    if (!cardEl) return;
    const { gameState, username } = getState();
    if (gameState?.currentTurn !== username) return; // not my turn → click → modal

    const t = e.touches[0];
    _touchStartCard = { uid: cardEl.dataset.uid, el: cardEl, startX: t.clientX, startY: t.clientY };
    _touchDragging  = false;

    _touchHoldTimer = setTimeout(() => {
      // Hold threshold reached → activate drag ghost
      _touchDragging  = true;
      draggingCardUid = _touchStartCard.uid;
      currentValidSlots = [];
      exitTapSelectMode();
      _touchStartCard.el.classList.add('dragging');
      _ghostEl = _createGhost(_touchStartCard.el, t.clientX, t.clientY);
      requestValidSlots(draggingCardUid);
      navigator.vibrate?.(20);
    }, _HOLD_MS);
  }, { passive: true });

  // ── touchmove: update ghost / cancel hold if finger moved too early ──────────
  hand.addEventListener('touchmove', e => {
    if (!_touchStartCard) return;
    const t    = e.touches[0];
    const dist = Math.hypot(t.clientX - _touchStartCard.startX, t.clientY - _touchStartCard.startY);

    if (_touchDragging) {
      e.preventDefault();
      _moveGhost(t.clientX, t.clientY);
      const slotEl = _slotUnderPoint(t.clientX, t.clientY);
      field.querySelectorAll('.field-slot').forEach((s, i) => {
        const valid = currentValidSlots.includes(i);
        s.classList.toggle('droppable', valid && s !== slotEl);
        s.classList.toggle('drag-over', s === slotEl && valid);
      });
    } else if (dist > _TAP_MOVE_PX) {
      // Finger moved before hold → treat as scroll, cancel
      clearTimeout(_touchHoldTimer);
      _touchHoldTimer = null;
      _touchStartCard = null;
    }
  }, { passive: false });

  // ── touchend: drop card OR enter tap-select mode ─────────────────────────────
  hand.addEventListener('touchend', e => {
    clearTimeout(_touchHoldTimer);
    _touchHoldTimer = null;
    if (!_touchStartCard) return;
    const t = e.changedTouches[0];

    if (_touchDragging) {
      e.preventDefault(); // suppress synthetic click
      _touchDragging = false;
      _touchStartCard.el.classList.remove('dragging');
      _removeGhost();
      const slotEl = _slotUnderPoint(t.clientX, t.clientY);
      clearSlotHighlights();
      if (slotEl) {
        const i = parseInt(slotEl.dataset.slot, 10);
        if (currentValidSlots.includes(i)) playCard(draggingCardUid, i);
      }
      draggingCardUid = null;
    } else {
      // Short tap → tap-select mode (prevents the synthetic click / modal)
      e.preventDefault();
      const gs   = getState().gameState;
      const me   = getState().username;
      const card = gs?.players[me]?.hand?.find(c => c.uid === _touchStartCard.uid);
      if (card) enterTapSelectMode(_touchStartCard.uid, card);
    }
    _touchStartCard = null;
  }, { passive: false });

  hand.addEventListener('touchcancel', () => {
    clearTimeout(_touchHoldTimer);
    _touchHoldTimer = null;
    if (_touchDragging && _touchStartCard) {
      _touchStartCard.el.classList.remove('dragging');
      _removeGhost();
      clearSlotHighlights();
      draggingCardUid = null;
    }
    _touchDragging = false;
    _touchStartCard = null;
  }, { passive: true });

  // ── Field click: play card when in tap-select mode ───────────────────────────
  field.addEventListener('click', e => {
    if (!_tapSelectUid) return;
    const slotEl = e.target.closest('.field-slot[data-slot]');
    if (!slotEl) { exitTapSelectMode(); return; }
    const i = parseInt(slotEl.dataset.slot, 10);
    if (!currentValidSlots.includes(i)) { exitTapSelectMode(); return; }
    const uid = _tapSelectUid;
    exitTapSelectMode();
    playCard(uid, i);
  });

  // ── Document click: cancel tap-select when tapping outside hand/field ────────
  document.addEventListener('click', e => {
    if (!_tapSelectUid) return;
    if (!hand.contains(e.target) && !field.contains(e.target)) exitTapSelectMode();
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
  renderOpponentsArea(gameState);
  updateTurnInfo(gameState);
  updateEndTurnBtn(gameState);
  updateZoneCounts(gameState);

  $('deck-count').textContent = `${myState.deckCount} carte`;
  updateNexus(myState.nexus);
  renderHand(myState.hand);
  renderField(myState.field, 'player-field');
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION BUTTONS + KEYBOARD
// ──────────────────────────────────────────────────────────────────────────────

function initGameActions() {
  $('btn-end-turn').addEventListener('click', () => { setEndTurnPending(true); endTurn(); });
  $('btn-leave-match').addEventListener('click', () => leaveMatch());

  $('card-modal-close').addEventListener('click', closeCardModal);
  $('card-modal-overlay').addEventListener('click', closeCardModal);

  // "Gioca" button in modal → close modal + enter tap-select mode
  $('card-modal-play').addEventListener('click', () => {
    const card = _currentModalCard;
    closeCardModal();
    if (card) enterTapSelectMode(card.uid, card);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCardModal();
      closeZonePanel();
      closePlayerPanel();
      exitTapSelectMode();
      return;
    }
    if (e.key === 'Enter'
        && $('card-modal').classList.contains('hidden')
        && $('zone-panel').classList.contains('hidden')
        && $('player-panel').classList.contains('hidden')
        && !$('btn-end-turn').disabled) {
      setEndTurnPending(true);
      endTurn();
    }
  });

  initZonePanels();
  initPlayerPanel();
  initHandDrag();
  initFieldDropZones();
  initTouchDrag();
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
    gs.currentTurn = currentTurn;
    gs.turnNumber  = turnNumber;
    setState({ gameState: gs });

    const me   = getState().username;
    showTurnBanner(currentTurn === me ? 'Turno tuo!' : `Turno di ${currentTurn}`);

    renderPlayersBar(gs);
    renderOpponentsArea(gs);
    updateTurnInfo(gs);
    updateEndTurnBtn(gs);
    renderHand(gs.players[me]?.hand ?? []);
  });

  on('socket:card_played', ({ playerId, cardUid, slotIndex, card }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const player = gs.players[playerId];
    if (!player) return;
    player.field[slotIndex] = card;
    if (playerId !== getState().username) {
      const idx = player.hand.findIndex(c => c.uid === cardUid);
      if (idx !== -1) player.hand.splice(idx, 1);
    }
    setState({ gameState: gs });
    if (playerId === getState().username) {
      renderField(player.field, 'player-field');
    } else {
      renderOpponentsArea(gs);
      renderPlayersBar(gs);
    }
    refreshPanelIfOpen(playerId, gs);
  });

  on('socket:hand_updated', ({ hand }) => {
    const gs = getState().gameState;
    if (!gs) return;
    const me = gs.players[getState().username];
    if (!me) return;
    me.hand = hand;
    setState({ gameState: gs });
    renderHand(hand);
    refreshPanelIfOpen(getState().username, gs);
  });

  on('socket:valid_slots', ({ cardUid, validSlots }) => {
    const activeUid = draggingCardUid || _tapSelectUid;
    if (cardUid !== activeUid) return;
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

  on('socket:player_left_match', () => { /* handled by player_status_changed */ });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initGameScreen() {
  initGameActions();
  initSocketListeners();
}
