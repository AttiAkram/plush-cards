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
         leaveMatch, attack, discardCard,
         manualEdit, sendGmNote, requestDeck,
         saveSession, restoreSession, gmRandom }  from '../socket/client.js';
import { showToast }                              from '../components/toast.js';

// ── Error messages ────────────────────────────────────────────────────────────

const _ERROR_MAP = {
  'Non è il tuo turno':
    "Non è il tuo turno.",
  'Puoi giocare solo 1 personaggio per turno':
    "Hai già giocato un personaggio questo turno.",
  'Questa carta ha già attaccato questo turno':
    "Questa carta ha già attaccato — aspetta il prossimo turno.",
  'Elimina prima tutti i personaggi nemici per attaccare un artefatto':
    "Non puoi colpire l'artefatto finché ci sono plush davanti.",
  "Un personaggio con Guardia Centrale protegge l'artefatto nemico":
    "Un guardiano protegge l'artefatto — eliminalo prima.",
  'Slot già occupato':
    "Quello slot è già occupato.",
  'Carta non trovata in mano':
    "Carta non trovata nella tua mano.",
  'Attaccante non trovato sul campo':
    "Quella carta non è più in campo.",
  'Bersaglio non trovato sul campo':
    "Il bersaglio non è più in campo.",
  'Gli artefatti non possono essere giocati dalla mano':
    "Gli artefatti non si giocano dalla mano.",
};

function humanizeGameError(msg) {
  if (typeof msg !== 'string') return 'Errore di gioco.';
  return _ERROR_MAP[msg] ?? msg;
}

// ── Drag state ────────────────────────────────────────────────────────────────

let draggingCardUid   = null;
let currentValidSlots = [];

// ── Attack mode state ─────────────────────────────────────────────────────────

let _attackModeCard = null;   // { uid, name, ... } card selected as attacker

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

// ── Attack mode helpers ───────────────────────────────────────────────────────

function enterAttackMode(card) {
  _attackModeCard = card;
  $('attack-hint-text').textContent = `Attacca con ${card.name} — scegli un bersaglio`;
  $('attack-mode-hint').classList.remove('hidden');
  renderOpponentsArea(getState().gameState);
  $('player-field').querySelectorAll('.field-slot').forEach(s => {
    const cardEl = s.querySelector('.card');
    if (cardEl) cardEl.classList.toggle('attacker-selected', cardEl.dataset.uid === card.uid);
  });
}

function exitAttackMode() {
  _attackModeCard = null;
  $('attack-mode-hint').classList.add('hidden');
  $('player-field').querySelectorAll('.card.attacker-selected').forEach(c => c.classList.remove('attacker-selected'));
  renderOpponentsArea(getState().gameState);
}

// ── Damage floaters ───────────────────────────────────────────────────────────

/**
 * Show a floating damage/heal label above a card element for 1s.
 * @param {HTMLElement} cardEl
 * @param {string}      text   e.g. "-3" or "+2"
 */
function showDamageFloater(cardEl, text) {
  if (!cardEl) return;
  const rect     = cardEl.getBoundingClientRect();
  const floater  = document.createElement('div');
  floater.className   = 'damage-floater';
  floater.textContent = text;
  floater.style.left  = `${rect.left + rect.width / 2}px`;
  floater.style.top   = `${rect.top  + rect.height * 0.3}px`;
  document.body.appendChild(floater);
  floater.addEventListener('animationend', () => floater.remove());
}

/** Find a rendered card element by uid (works across player field + opp areas). */
function findCardEl(uid) {
  return document.querySelector(`.card[data-uid="${uid}"]`);
}

/**
 * Compare old and new game states; show floaters on cards whose HP changed.
 */
function showCombatFloaters(oldGs, newGs) {
  if (!oldGs || !newGs) return;
  for (const [uname, newP] of Object.entries(newGs.players)) {
    const oldP = oldGs.players[uname];
    if (!oldP) continue;
    // Field cards
    newP.field.forEach((newCard, i) => {
      const oldCard = oldP.field[i];
      if (!oldCard || !newCard || oldCard.uid !== newCard.uid) return;
      const oldHp = oldCard.currentHp ?? oldCard.hp;
      const newHp = newCard.currentHp ?? newCard.hp;
      if (newHp < oldHp) showDamageFloater(findCardEl(oldCard.uid), `-${oldHp - newHp}`);
      if (newHp > oldHp) showDamageFloater(findCardEl(oldCard.uid), `+${newHp - oldHp}`);
    });
    // Artifact slot
    const oldArt = oldP.artifactSlot;
    const newArt = newP.artifactSlot;
    if (oldArt && newArt && oldArt.uid === newArt.uid) {
      const oldHp = oldArt.currentHp ?? oldArt.hp;
      const newHp = newArt.currentHp ?? newArt.hp;
      if (newHp < oldHp) showDamageFloater(findCardEl(oldArt.uid), `-${oldHp - newHp}`);
      if (newHp > oldHp) showDamageFloater(findCardEl(oldArt.uid), `+${newHp - oldHp}`);
    }
  }
}

// ── Event log ─────────────────────────────────────────────────────────────────

const LOG_MAX = 60;
const _logEntries = [];   // { text: string, type: 'turn'|'attack'|'effect'|'system' }

function addToLog(text, type = 'effect') {
  _logEntries.push({ text, type });
  if (_logEntries.length > LOG_MAX) _logEntries.shift();

  // If panel is open, append the line directly (no full re-render)
  if (!$('game-log-panel').classList.contains('hidden')) {
    _appendLogEntry({ text, type });
    const entries = $('game-log-entries');
    entries.scrollTop = entries.scrollHeight;
  }
}

function _appendLogEntry({ text, type }) {
  const empty = $('game-log-entries').querySelector('.game-log-empty');
  if (empty) empty.remove();
  const line = el('div', `game-log-line gl-${type}`);
  line.textContent = text;
  $('game-log-entries').appendChild(line);
}

function renderLog() {
  const container = $('game-log-entries');
  container.innerHTML = '';
  if (!_logEntries.length) {
    container.innerHTML = '<p class="game-log-empty">Nessun evento ancora.</p>';
    return;
  }
  _logEntries.forEach(e => _appendLogEntry(e));
  container.scrollTop = container.scrollHeight;
}

function openLog() {
  $('game-log-panel').classList.remove('hidden');
  renderLog();
  const gs = getState().gameState;
  $('gm-log-tools')?.classList.toggle('hidden', gs?.mode !== 'campaign');
}
function closeLog() { $('game-log-panel').classList.add('hidden'); }

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
  eliminated:   '<span class="ps-dot ps-dot--elim" title="Eliminato">✕</span>',
};

function renderPlayersBar(gameState) {
  const bar   = $('players-bar');
  const leave = bar.firstElementChild;   // keep the Leave button
  bar.innerHTML = '';
  bar.appendChild(leave);

  const me         = getState().username;
  const isCampaign = gameState.mode === 'campaign';
  const isGM       = isCampaign && _isHostOrAdmin(gameState, me);

  for (const username of Object.keys(gameState.players)) {
    const p      = gameState.players[username];
    if (!p) continue;
    const isMe        = username === me;
    const isTurn      = gameState.currentTurn === username;
    const status      = p.status ?? 'active';
    const isEliminated = status === 'eliminated';
    const hpPct       = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);
    const canEditHp   = isCampaign && !isEliminated && (isMe || isGM);

    const pill = el('div',
      `player-pill${isTurn ? ' is-turn' : ''}${isMe ? ' is-me' : ''} status-${status}`);

    pill.innerHTML = `
      <div class="player-avatar">${escHtml(username[0].toUpperCase())}</div>
      <div class="player-pill-body">
        <div class="player-pill-name">
          ${escHtml(username)}
          ${isMe ? '<span class="you-badge">tu</span>' : ''}
          ${isEliminated ? '<span class="elim-badge">Eliminato</span>' : ''}
        </div>
        ${isEliminated ? '' : `
        <div class="player-pill-hp">
          <div class="player-hp-bar"><div class="player-hp-fill" style="width:${hpPct}%"></div></div>
          <span class="player-hp-text">${p.nexus.hp}</span>
        </div>
        ${canEditHp ? `
        <div class="player-hp-controls">
          <button class="btn btn-outline hp-ctrl-btn" data-delta="-5" data-target="${escHtml(username)}">−5</button>
          <button class="btn btn-outline hp-ctrl-btn" data-delta="-1" data-target="${escHtml(username)}">−1</button>
          <button class="btn btn-outline hp-ctrl-btn" data-delta="1"  data-target="${escHtml(username)}">+1</button>
          <button class="btn btn-outline hp-ctrl-btn" data-delta="5"  data-target="${escHtml(username)}">+5</button>
        </div>` : ''}`}
      </div>
      ${STATUS_ICONS[status] ?? ''}`;

    // Click the pill body → open panel; click HP buttons → adjust life
    pill.addEventListener('click', e => {
      if (e.target.closest('.hp-ctrl-btn')) return;
      openPlayerPanel(username, getState().gameState);
    });
    pill.querySelectorAll('.hp-ctrl-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        manualEdit({ type: 'nexus_hp', targetUsername: btn.dataset.target, delta: parseInt(btn.dataset.delta, 10) });
      });
    });

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

  for (const username of Object.keys(gameState.players)) {
    if (username === myName) continue;
    const p = gameState.players[username];
    if (!p) continue;

    const hpPct       = Math.max(0, (p.nexus.hp / p.nexus.maxHp) * 100);
    const isActive    = gameState.currentTurn === username;
    const isEliminated = (p.status ?? 'active') === 'eliminated';
    const zone         = el('div', `opp-zone${isActive ? ' opp-zone--active' : ''}${isEliminated ? ' opp-zone--eliminated' : ''}`);

    // Header: name + HP bar
    zone.innerHTML = `
      <div class="opp-zone-header">
        <span class="opp-zone-name">${escHtml(username)}</span>
        <div class="opp-zone-hp">
          <div class="opp-hp-bar"><div class="opp-hp-fill" style="width:${hpPct}%"></div></div>
          <span class="opp-hp-text">♥ ${p.nexus.hp}</span>
        </div>
      </div>`;

    // Field row with cards (clickable / attackable in attack mode)
    const fieldPersonaggi = p.field.filter(c => c !== null && c.type === 'personaggio');
    const hasGuardia = p.field.some(c =>
      c?.effects?.some(e => e.trigger === 'PASSIVO_SE_IN_CAMPO' && e.action === 'GUARDIA_CENTRALE')
    );
    const fieldRow = el('div', 'opp-zone-field');
    p.field.forEach(card => {
      const slotEl = el('div', 'field-slot');
      if (card) {
        const cardEl = createCardEl(card);
        if (_attackModeCard) {
          const canTarget = card.type === 'personaggio'
            || (fieldPersonaggi.length === 0 && !hasGuardia);
          if (canTarget) {
            cardEl.classList.add('attackable');
            cardEl.addEventListener('click', e => {
              e.stopPropagation();
              const atk = _attackModeCard;
              exitAttackMode();
              attack(atk.uid, username, card.uid);
            });
          } else {
            cardEl.classList.add('not-attackable');
          }
        } else {
          attachCardInspect(cardEl, card);
        }
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

    // Artifact slot row
    const artRow = el('div', 'opp-artifact-row');
    if (p.artifactSlot) {
      const artEl = createCardEl(p.artifactSlot);
      if (_attackModeCard) {
        const canTargetArt = fieldPersonaggi.length === 0 && !hasGuardia;
        if (canTargetArt) {
          artEl.classList.add('attackable');
          artEl.addEventListener('click', e => {
            e.stopPropagation();
            const atk = _attackModeCard;
            exitAttackMode();
            attack(atk.uid, username, p.artifactSlot.uid);
          });
        } else {
          artEl.classList.add('not-attackable');
        }
      } else {
        attachCardInspect(artEl, p.artifactSlot);
      }
      artRow.appendChild(artEl);
    } else {
      artRow.innerHTML = '<span class="opp-artifact-empty">Artefatto: —</span>';
    }
    zone.appendChild(artRow);

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

  // Zone counts (discard is global, filtered per player; void/absolute are global)
  const discardCount = (gameState.discard ?? []).filter(c => c.owner === username).length;
  $('pp-zone-discard-count').textContent  = discardCount;
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
     <span class="cm-stat cm-hp">♥ ${card.currentHp ?? card.hp} / ${card.hp}</span>`;
  $('card-modal-desc').textContent = card.description;

  const { gameState, username } = getState();
  const isCampaign = gameState?.mode === 'campaign';
  const isMyTurn   = gameState?.currentTurn === username;
  const inMyHand   = gameState?.players[username]?.hand?.some(c => c.uid === card.uid);
  const fieldCard  = gameState?.players[username]?.field?.find(c => c?.uid === card.uid);
  const inMyField  = !!fieldCard;
  const isGM       = isCampaign && _isHostOrAdmin(gameState, username);
  const canAttack  = isCampaign
    ? inMyField
    : (isMyTurn && inMyField && !fieldCard?.haAttaccato);

  $('card-modal-play').classList.toggle('hidden',    !(isMyTurn && inMyHand) && !isCampaign);
  $('card-modal-discard').classList.toggle('hidden', !((isMyTurn || isCampaign) && inMyHand));
  $('card-modal-attack').classList.toggle('hidden',  !canAttack);

  // Master Tools — campaign mode only, for GM or own cards
  const cardOwner = _findCardOwner(gameState, card.uid);
  const canUseMT  = isCampaign && (isGM || cardOwner === username);
  $('master-tools').classList.toggle('hidden', !canUseMT);
  if (canUseMT) _renderMasterTools(card, gameState, username);

  $('card-modal').classList.remove('hidden');
}

/** Find the current modal card object in the updated game state. */
function _findCurrentModalCard(gs) {
  if (!_currentModalCard || !gs) return null;
  const uid = _currentModalCard.uid;
  for (const p of Object.values(gs.players)) {
    const fc = p.field?.find(c => c?.uid === uid);
    if (fc) return fc;
    const hc = p.hand?.find(c => c.uid === uid);
    if (hc) return hc;
    if (p.artifactSlot?.uid === uid) return p.artifactSlot;
  }
  return null;
}

/** True if `username` is the room host or has admin/root role. */
function _isHostOrAdmin(gameState, username) {
  const state = getState();
  const role  = state.role;
  if (role === 'root' || role === 'admin') return true;
  return state.room?.host === username;
}

/** Find which player owns a card (field/hand/artifact), or null for shared zones. */
function _findCardOwner(gameState, uid) {
  if (!gameState) return null;
  for (const [uname, p] of Object.entries(gameState.players)) {
    if (p.hand?.some(c => c.uid === uid))   return uname;
    if (p.field?.some(c => c?.uid === uid)) return uname;
    if (p.artifactSlot?.uid === uid)        return uname;
  }
  return null;
}

function _renderMasterTools(card, gameState, me) {
  const isGM = _isHostOrAdmin(gameState, me);

  // Stat displays
  $('mt-hp-val').textContent  = card.currentHp ?? card.hp;
  $('mt-atk-val').textContent = card.damage ?? 0;

  // Markers row
  const markerRow = $('mt-marker-row');
  if (markerRow) {
    markerRow.innerHTML = '';
    const MARKER_COLORS = [
      ['green',  '🟢'],
      ['red',    '🔴'],
      ['blue',   '🔵'],
      ['yellow', '🟡'],
    ];
    for (const [color, icon] of MARKER_COLORS) {
      const count = card.markers?.[color] ?? 0;
      const cell  = el('span', 'mt-marker-cell');
      cell.innerHTML = `
        <button class="btn btn-xs btn-outline mt-mk-btn" data-color="${color}" data-delta="-1">−</button>
        <span class="mt-marker-icon" title="${color}">${icon}</span>
        <span class="mt-mk-val" id="mt-mk-${color}">${count}</span>
        <button class="btn btn-xs btn-outline mt-mk-btn" data-color="${color}" data-delta="1">+</button>`;
      markerRow.appendChild(cell);
    }
  }

  // Move buttons — admin sees all players + random; others see only own hand/field
  const moveRow = $('mt-move-row');
  moveRow.innerHTML = '';
  const players = Object.keys(gameState.players);

  if (isGM) {
    for (const uname of players) {
      const btn = el('button', 'btn btn-sm btn-outline mt-move-btn');
      btn.textContent    = uname === me ? 'Mia mano' : `Mano: ${uname}`;
      btn.dataset.to     = 'hand';
      btn.dataset.toUser = uname;
      moveRow.appendChild(btn);
    }
    for (const uname of players) {
      const btn = el('button', 'btn btn-sm btn-outline mt-move-btn');
      btn.textContent    = uname === me ? 'Mio campo' : `Campo: ${uname}`;
      btn.dataset.to     = 'field';
      btn.dataset.toUser = uname;
      moveRow.appendChild(btn);
    }
    const randHandBtn = el('button', 'btn btn-sm btn-outline mt-move-btn');
    randHandBtn.textContent = '→ Mano casuale';
    randHandBtn.dataset.to  = 'hand_random';
    moveRow.appendChild(randHandBtn);
    const randFieldBtn = el('button', 'btn btn-sm btn-outline mt-move-btn');
    randFieldBtn.textContent = '→ Campo casuale';
    randFieldBtn.dataset.to  = 'field_random';
    moveRow.appendChild(randFieldBtn);
  } else {
    const myHandBtn = el('button', 'btn btn-sm btn-outline mt-move-btn');
    myHandBtn.textContent    = 'Mia mano';
    myHandBtn.dataset.to     = 'hand';
    myHandBtn.dataset.toUser = me;
    moveRow.appendChild(myHandBtn);
    const myFieldBtn = el('button', 'btn btn-sm btn-outline mt-move-btn');
    myFieldBtn.textContent    = 'Mio campo';
    myFieldBtn.dataset.to     = 'field';
    myFieldBtn.dataset.toUser = me;
    moveRow.appendChild(myFieldBtn);
  }
  for (const [to, label] of [['discard','Scarti'],['void','Vuoto'],['absolute','Assoluto'],['deck_top','Deck (sopra)'],['deck_bottom','Deck (fondo)']]) {
    const btn = el('button', 'btn btn-sm btn-outline mt-move-btn');
    btn.textContent = label;
    btn.dataset.to  = to;
    moveRow.appendChild(btn);
  }

  // Admin-only section
  const adminSection = $('mt-admin-section');
  if (adminSection) adminSection.classList.toggle('hidden', !isGM);
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
  $('zone-count-discard').textContent  = gameState.discard?.length ?? 0;
  $('zone-count-void').textContent     = gameState.zones?.void?.length ?? 0;
  $('zone-count-absolute').textContent = gameState.zones?.absolute?.length ?? 0;
}

/**
 * @param {string} zoneName
 * @param {object} gameState
 * @param {string} [targetUsername]  — filter discard by owner when provided
 */
function openZonePanel(zoneName, gameState, targetUsername) {
  let cards;
  if (zoneName === 'discard') {
    const all = gameState.discard ?? [];
    // If opened from player panel, filter to that player's cards
    cards = targetUsername ? all.filter(c => c.owner === targetUsername) : all;
  } else if (zoneName === 'void') {
    cards = gameState.zones?.void ?? [];
  } else {
    cards = gameState.zones?.absolute ?? [];
  }

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

/**
 * Render a single artifact card (or empty placeholder) into a container.
 * @param {object|null} artifactCard
 * @param {string}      containerId
 */
function renderArtifactSlot(artifactCard, containerId) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (artifactCard) {
    const cardEl = createCardEl(artifactCard);
    attachCardInspect(cardEl, artifactCard);
    container.appendChild(cardEl);
  } else {
    container.innerHTML = `<svg class="icon-slot" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2l2 5h5l-4 3 1.5 5L12 12l-4.5 3L9 10 5 7h5z"/>
    </svg>`;
  }
}

export function renderGameBoard(gameState) {
  setState({ gameState });
  const myState = gameState.players[getState().username];
  if (!myState) return;

  renderPlayersBar(gameState);
  renderOpponentsArea(gameState);
  updateTurnInfo(gameState);
  updateEndTurnBtn(gameState);
  updateZoneCounts(gameState);

  $('deck-count').textContent = `${gameState.deckCount ?? 0} carte`;
  updateNexus(myState.nexus);
  renderHand(myState.hand);
  renderField(myState.field, 'player-field');
  renderArtifactSlot(myState.artifactSlot, 'player-artifact-slot');

  // Debug / campaign badges + GM toolbar (toolbar is admin/host only)
  $('debug-badge').classList.toggle('hidden', !gameState.debugMode);
  $('campaign-badge').classList.toggle('hidden', gameState.mode !== 'campaign');
  const isCampaignBoard = gameState.mode === 'campaign';
  const isGMUser = isCampaignBoard && _isHostOrAdmin(gameState, getState().username);
  const gmToolbar = $('gm-toolbar');
  if (gmToolbar) gmToolbar.classList.toggle('hidden', !isGMUser);
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION BUTTONS + KEYBOARD
// ──────────────────────────────────────────────────────────────────────────────

function initGameActions() {
  $('btn-end-turn').addEventListener('click', () => { setEndTurnPending(true); endTurn(); });
  $('btn-leave-match').addEventListener('click', () => leaveMatch());
  $('btn-game-over-lobby').addEventListener('click', () => {
    $('game-over-overlay').classList.add('hidden');
    leaveMatch();
  });

  $('card-modal-close').addEventListener('click', closeCardModal);
  $('card-modal-overlay').addEventListener('click', closeCardModal);

  // "Gioca" button in modal → close modal + enter tap-select mode
  $('card-modal-play').addEventListener('click', () => {
    const card = _currentModalCard;
    closeCardModal();
    if (card) enterTapSelectMode(card.uid, card);
  });

  // "Attacca" button in modal → close modal + enter attack mode
  $('card-modal-attack').addEventListener('click', () => {
    const card = _currentModalCard;
    closeCardModal();
    if (card) enterAttackMode(card);
  });

  // "Scarta" button in modal → close modal + discard
  $('card-modal-discard').addEventListener('click', () => {
    const card = _currentModalCard;
    closeCardModal();
    if (card) discardCard(card.uid);
  });

  // Cancel attack mode button
  $('btn-cancel-attack').addEventListener('click', exitAttackMode);

  // Master Tools: stat buttons (delegated on container)
  $('master-tools').addEventListener('click', e => {
    const btn = e.target.closest('.mt-stat-btn');
    if (!btn || !_currentModalCard) return;
    const stat  = btn.dataset.stat;
    const delta = parseInt(btn.dataset.delta, 10);
    manualEdit({ type: 'stat', cardUid: _currentModalCard.uid, stat, delta });
  });

  // Master Tools: zone-move buttons (delegated on mt-move-row)
  $('mt-move-row').addEventListener('click', e => {
    const btn = e.target.closest('.mt-move-btn');
    if (!btn || !_currentModalCard) return;
    const to       = btn.dataset.to;
    const toUser   = btn.dataset.toUser;
    manualEdit({ type: 'move', cardUid: _currentModalCard.uid, to, toUsername: toUser });
    closeCardModal();
  });

  // Master Tools: marker buttons (delegated — container built dynamically)
  $('master-tools').addEventListener('click', e => {
    const btn = e.target.closest('.mt-mk-btn');
    if (!btn || !_currentModalCard) return;
    const color = btn.dataset.color;
    const delta = parseInt(btn.dataset.delta, 10);
    manualEdit({ type: 'marker', cardUid: _currentModalCard.uid, color, delta });
  });

  // GM toolbar buttons
  const deckBtn       = $('btn-gm-deck');
  const saveBtn       = $('btn-save-session');
  const groupDrawBtn  = $('btn-group-draw');
  const resetAllHpBtn = $('btn-reset-all-hp');
  if (deckBtn)      deckBtn.addEventListener('click', () => requestDeck());
  if (saveBtn)      saveBtn.addEventListener('click', () => { saveSession(_logEntries); showToast('Sessione salvata!'); });
  if (groupDrawBtn) groupDrawBtn.addEventListener('click', () => {
    const raw = prompt('Quante carte pesca ciascun giocatore? (1–5)', '1');
    if (raw === null) return;
    const n = Math.max(1, Math.min(5, parseInt(raw, 10) || 1));
    gmRandom({ action: 'group_draw', count: n });
  });
  if (resetAllHpBtn) resetAllHpBtn.addEventListener('click', () => {
    gmRandom({ action: 'reset_all_hp' });
  });

  // Master Tools: admin quick-action buttons
  $('btn-mt-reset-hp')?.addEventListener('click', () => {
    if (!_currentModalCard) return;
    manualEdit({ type: 'reset_hp', cardUid: _currentModalCard.uid });
  });
  $('btn-mt-clear-markers')?.addEventListener('click', () => {
    if (!_currentModalCard) return;
    manualEdit({ type: 'marker', cardUid: _currentModalCard.uid, color: 'all' });
  });

  // Log panel
  $('btn-toggle-log').addEventListener('click', openLog);
  $('game-log-close').addEventListener('click', closeLog);
  $('game-log-overlay').addEventListener('click', closeLog);

  // GM Note / Chapter buttons inside log panel
  const gmNoteBtn    = $('btn-gm-note');
  const gmChapterBtn = $('btn-gm-chapter');
  const gmNoteInput  = $('gm-note-input');
  if (gmNoteBtn) {
    gmNoteBtn.addEventListener('click', () => {
      const text = gmNoteInput?.value.trim();
      if (!text) return;
      sendGmNote(text, 'note');
      gmNoteInput.value = '';
    });
    gmNoteInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { gmNoteBtn.click(); e.preventDefault(); }
    });
  }
  if (gmChapterBtn) {
    gmChapterBtn.addEventListener('click', () => {
      const title = prompt('Titolo capitolo:');
      if (title?.trim()) sendGmNote(title.trim(), 'chapter');
    });
  }

  // GM deck panel
  const deckPanel = $('gm-deck-panel');
  if (deckPanel) {
    $('gm-deck-close')?.addEventListener('click',   () => deckPanel.classList.add('hidden'));
    $('gm-deck-overlay')?.addEventListener('click', () => deckPanel.classList.add('hidden'));
    $('gm-deck-list')?.addEventListener('click', e => {
      const btn = e.target.closest('.gm-deck-give-btn');
      if (!btn) return;
      const { uid, toUser } = btn.dataset;
      manualEdit({ type: 'move', cardUid: uid, to: 'hand', toUsername: toUser });
      deckPanel.classList.add('hidden');
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCardModal();
      closeZonePanel();
      closePlayerPanel();
      closeLog();
      exitTapSelectMode();
      exitAttackMode();
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
    // Show D20 turn order
    if (gameState.d20Rolls?.length) {
      const rolls = gameState.d20Rolls.map(r => `${r.username} [${r.roll}]`).join(' › ');
      addToLog(`D20 — ordine turni: ${rolls}`, 'system');
    }
    const me = getState().username;
    showTurnBanner(gameState.currentTurn === me ? 'Turno tuo!' : `Primo turno: ${gameState.currentTurn}`);
  });

  on('socket:turn_changed', ({ currentTurn, turnNumber }) => {
    const gs = getState().gameState;
    if (!gs) return;
    gs.currentTurn = currentTurn;
    gs.turnNumber  = turnNumber;
    setState({ gameState: gs });

    const me = getState().username;
    addToLog(`── Turno ${turnNumber}: tocca a ${currentTurn} ──`, 'turn');
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

  on('socket:effects_applied', ({ results, gameState: newGs }) => {
    if (!newGs) return;
    const me    = getState().username;
    const oldGs = getState().gameState;
    showCombatFloaters(oldGs, newGs);
    setState({ gameState: newGs });
    renderPlayersBar(newGs);
    renderOpponentsArea(newGs);
    renderField(newGs.players[me]?.field ?? [], 'player-field');
    renderArtifactSlot(newGs.players[me]?.artifactSlot ?? null, 'player-artifact-slot');
    updateZoneCounts(newGs);
    updateEndTurnBtn(newGs);
    $('deck-count').textContent = `${newGs.deckCount ?? 0} carte`;
    for (const uname of Object.keys(newGs.players)) refreshPanelIfOpen(uname, newGs);
    for (const msg of results) {
      addToLog(msg, 'effect');
      showToast(msg);
    }
  });

  on('socket:attack_result', ({ results, gameState: newGs }) => {
    if (!newGs) return;
    const me    = getState().username;
    const oldGs = getState().gameState;
    showCombatFloaters(oldGs, newGs);
    setState({ gameState: newGs });
    renderPlayersBar(newGs);
    renderOpponentsArea(newGs);
    renderField(newGs.players[me]?.field ?? [], 'player-field');
    renderArtifactSlot(newGs.players[me]?.artifactSlot ?? null, 'player-artifact-slot');
    updateZoneCounts(newGs);
    updateEndTurnBtn(newGs);
    $('deck-count').textContent = `${newGs.deckCount ?? 0} carte`;
    for (const uname of Object.keys(newGs.players)) refreshPanelIfOpen(uname, newGs);
    for (const msg of results) {
      addToLog(msg, 'attack');
      showToast(msg);
    }
  });

  on('socket:card_discarded', ({ username: who, gameState: newGs }) => {
    if (!newGs) return;
    addToLog(`${who} scarta una carta`, 'system');
    setState({ gameState: newGs });
    updateZoneCounts(newGs);
    $('deck-count').textContent = `${newGs.deckCount ?? 0} carte`;
    refreshPanelIfOpen(getState().username, newGs);
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

  on('socket:error', msg => {
    showToast(humanizeGameError(msg), true);
  });

  on('socket:manual_edit_applied', ({ gameState: newGs, log }) => {
    if (!newGs) return;
    const me    = getState().username;
    const oldGs = getState().gameState;
    showCombatFloaters(oldGs, newGs);
    setState({ gameState: newGs });
    renderPlayersBar(newGs);
    renderOpponentsArea(newGs);
    renderField(newGs.players[me]?.field ?? [], 'player-field');
    renderArtifactSlot(newGs.players[me]?.artifactSlot ?? null, 'player-artifact-slot');
    updateZoneCounts(newGs);
    $('deck-count').textContent = `${newGs.deckCount ?? 0} carte`;
    for (const uname of Object.keys(newGs.players)) refreshPanelIfOpen(uname, newGs);
    // Refresh modal if the edited card is still shown
    if (_currentModalCard) {
      const updated = _findCurrentModalCard(newGs);
      if (updated) {
        $('mt-hp-val').textContent  = updated.currentHp ?? updated.hp;
        $('mt-atk-val').textContent = updated.damage ?? 0;
        $('card-modal-stats').innerHTML =
          `<span class="cm-stat cm-dmg">⚔ ${updated.damage}</span>
           <span class="cm-stat cm-hp">♥ ${updated.currentHp ?? updated.hp} / ${updated.hp}</span>`;
      }
    }
    if (log) addToLog(log, 'system');
  });

  on('socket:player_eliminated', ({ username: who }) => {
    const gs = getState().gameState;
    const me = getState().username;
    const msg = who === me ? 'Sei stato eliminato!' : `${who} è stato eliminato!`;
    addToLog(msg, 'system');
    showToast(msg, who === me);
    if (gs) { renderPlayersBar(gs); renderOpponentsArea(gs); }
  });

  on('socket:gm_note', ({ username: who, text, type }) => {
    if (type === 'chapter') {
      addToLog(`══ ${text} ══`, 'chapter');
    } else {
      addToLog(`[GM ${who}] ${text}`, 'gm');
    }
    // Show GM log tools for campaign mode
    const gs = getState().gameState;
    if (gs?.mode === 'campaign') {
      $('gm-log-tools')?.classList.remove('hidden');
      openLog();
    }
  });

  on('socket:deck_contents', ({ deck }) => {
    const gs      = getState().gameState;
    const players = gs ? Object.keys(gs.players) : [];
    const panel   = $('gm-deck-panel');
    const list    = $('gm-deck-list');
    if (!panel || !list) return;

    $('gm-deck-count').textContent = deck.length;
    list.innerHTML = deck.length
      ? deck.map(card => `
        <div class="gm-deck-item">
          <span class="gm-deck-name">${escHtml(card.name)}</span>
          <span class="gm-deck-rarity rarity-${card.rarity}">${card.rarity}</span>
          <div class="gm-deck-actions">
            ${players.map(u => `<button class="btn btn-xs btn-outline gm-deck-give-btn"
              data-uid="${card.uid}" data-to-user="${escHtml(u)}">→ ${escHtml(u)}</button>`).join('')}
          </div>
        </div>`).join('')
      : '<p class="gm-deck-empty">Mazzo vuoto.</p>';

    panel.classList.remove('hidden');
  });

  on('socket:session_saved', ({ savedAt }) => {
    const d = new Date(savedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    showToast(`Sessione salvata alle ${d}`);
    addToLog(`[Sessione salvata alle ${d}]`, 'system');
  });

  on('socket:session_restored', ({ gameState, logEntries, savedAt }) => {
    if (!gameState) return;
    // Restore log
    _logEntries.length = 0;
    for (const e of (logEntries ?? [])) _logEntries.push(e);
    const d = new Date(savedAt).toLocaleDateString('it-IT');
    addToLog(`[Sessione del ${d} ripristinata]`, 'system');
    // Render board
    renderGameBoard(gameState);
    showScreen('game');
    showTurnBanner(`Sessione ripristinata — turno di ${gameState.currentTurn}`);
  });

  on('socket:gm_random_result', ({ results, gameState: newGs }) => {
    if (!newGs) return;
    const me    = getState().username;
    const oldGs = getState().gameState;
    showCombatFloaters(oldGs, newGs);
    setState({ gameState: newGs });
    renderPlayersBar(newGs);
    renderOpponentsArea(newGs);
    renderField(newGs.players[me]?.field ?? [], 'player-field');
    renderArtifactSlot(newGs.players[me]?.artifactSlot ?? null, 'player-artifact-slot');
    updateZoneCounts(newGs);
    $('deck-count').textContent = `${newGs.deckCount ?? 0} carte`;
    for (const uname of Object.keys(newGs.players)) refreshPanelIfOpen(uname, newGs);
    for (const msg of results) addToLog(msg, 'system');
  });

  on('socket:game_over', ({ winner }) => {
    const me = getState().username;
    const isWinner = winner === me;
    $('game-over-title').textContent    = isWinner ? 'Hai vinto!' : 'Fine partita';
    $('game-over-subtitle').textContent = winner
      ? (isWinner ? 'Complimenti, hai eliminato tutti gli avversari.' : `${winner} ha vinto la partita.`)
      : 'Pareggio — nessun vincitore.';
    $('game-over-overlay').classList.remove('hidden');
    addToLog(winner ? `${winner} vince la partita!` : 'Fine partita — pareggio.', 'system');
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
