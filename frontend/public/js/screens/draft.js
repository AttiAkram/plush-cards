/**
 * Draft screen — shown between lobby and game board.
 * Each player sees 3 artifact cards and picks one before the match starts.
 */

import { $, el }         from '../utils/dom.js';
import { on }            from '../events/emitter.js';
import { showScreen }    from '../router/index.js';
import { createCardEl }  from '../components/card.js';
import { pickArtifact }  from '../socket/client.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _selected = null;   // currently highlighted card object
let _confirmed = false; // true after clicking "Conferma scelta"

// ── Helpers ────────────────────────────────────────────────────────────────────

function setWaiting(waitingFor) {
  const text = waitingFor.length === 1
    ? `In attesa di ${waitingFor[0]}…`
    : `In attesa di ${waitingFor.length} altri giocatori…`;
  $('draft-waiting-text').textContent = text;
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderDraft(choices, waitingFor) {
  _selected  = null;
  _confirmed = false;

  const confirmBtn = $('btn-confirm-artifact');
  confirmBtn.disabled = true;

  $('draft-waiting').classList.add('hidden');
  $('draft-sub').textContent = choices.length
    ? `Scegli 1 artefatto su ${choices.length} da portare in battaglia`
    : 'Nessun artefatto disponibile — procedi automaticamente';

  const container = $('draft-cards');
  container.innerHTML = '';

  if (choices.length === 0) {
    // No artifacts — auto-confirm with null after a short delay
    setTimeout(() => pickArtifact(null), 800);
    return;
  }

  choices.forEach(card => {
    const wrap  = el('div', 'draft-card-wrap');
    const cardEl = createCardEl(card);
    cardEl.classList.add('draft-card-choice');

    cardEl.addEventListener('click', () => {
      if (_confirmed) return;
      container.querySelectorAll('.draft-card-choice')
        .forEach(c => c.classList.remove('draft-selected'));
      cardEl.classList.add('draft-selected');
      _selected = card;
      confirmBtn.disabled = false;
    });

    wrap.appendChild(cardEl);
    container.appendChild(wrap);
  });

  showScreen('draft');
}

// ── Socket listeners ──────────────────────────────────────────────────────────

function initSocketListeners() {
  on('socket:draft_started', ({ choices, waitingFor }) => {
    renderDraft(choices, waitingFor);
  });

  on('socket:draft_updated', ({ waitingFor }) => {
    if (_confirmed) setWaiting(waitingFor);
  });

  // game_started is forwarded here only to update the draft screen subtitle
  // (actual screen transition is handled by game.js)
}

// ── Actions ────────────────────────────────────────────────────────────────────

function initActions() {
  $('btn-confirm-artifact').addEventListener('click', () => {
    if (!_selected || _confirmed) return;
    _confirmed = true;

    // Visual feedback: dim unchosen cards
    $('draft-cards').querySelectorAll('.draft-card-choice').forEach(c => {
      c.classList.toggle('draft-dimmed', !c.classList.contains('draft-selected'));
    });

    $('btn-confirm-artifact').disabled = true;
    $('btn-confirm-artifact').textContent = 'Scelto!';
    $('draft-waiting').classList.remove('hidden');
    $('draft-waiting-text').textContent = 'In attesa degli altri giocatori…';

    pickArtifact(_selected.uid);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initDraftScreen() {
  initActions();
  initSocketListeners();
}
