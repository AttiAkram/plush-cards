/**
 * Card editor slide-in panel — create and edit cards with inline effect rows.
 */

import { $, el, escHtml }  from '../utils/dom.js';
import * as api             from '../api/client.js';
import { showToast }        from '../components/toast.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGERS = [
  { value: 'QUANDO_GIOCATA',      label: 'Quando giocata' },
  { value: 'ALL_INIZIO_TURNO',    label: 'Inizio del tuo turno' },
  { value: 'ALL_FINE_TURNO',      label: 'Fine del tuo turno' },
  { value: 'QUANDO_DICHIARA',     label: 'Quando dichiara attacco' },
  { value: 'PASSIVO_SE_IN_CAMPO', label: 'Passivo (se in campo)' },
  { value: 'ON_MORTE',            label: 'Alla morte' },
];

const ACTIONS = [
  { value: 'PESCA_CARTE',             label: 'Pesca carte',              params: ['amount'] },
  { value: 'DANNO_A_CARTA',           label: 'Infliggi danno a carta',   params: ['amount'] },
  { value: 'DANNO_A_ARTEFATTO',       label: 'Infliggi danno artefatto', params: ['amount'] },
  { value: 'MODIFICA_ATTACCO',        label: 'Modifica attacco (±)',      params: ['amount'] },
  { value: 'MODIFICA_VITA',           label: 'Modifica vita (±)',         params: ['amount'] },
  { value: 'SPOSTA_CARTA_DI_ZONA',    label: 'Sposta carta di zona',     params: ['destinazione'] },
  { value: 'SCAMBIA_POSIZIONI_CAMPO', label: 'Scambia posizioni campo',  params: [] },
  { value: 'ABILITA_TRIGGER_GLOBALI', label: 'Abilita trigger globali',  params: [] },
];

const ZONE_DESTINATIONS = [
  { value: 'mano',     label: 'Mano' },
  { value: 'scarti',   label: 'Scarti' },
  { value: 'vuoto',    label: 'Vuoto' },
  { value: 'assoluto', label: 'Assoluto' },
];

const TARGETS = [
  { value: 'SE_STESSO',            label: 'Sé stesso' },
  { value: 'UN_TUO_PERSONAGGIO',   label: 'Un tuo personaggio (rand.)' },
  { value: 'UN_NEMICO',            label: 'Un nemico (rand.)' },
  { value: 'TUTTI_I_TUOI',         label: 'Tutti i tuoi personaggi' },
  { value: 'TUTTI_I_NEMICI',       label: 'Tutti i nemici' },
  { value: 'ARTEFATTO_TUO',        label: 'Tuo artefatto' },
  { value: 'ARTEFATTO_NEMICO',     label: 'Artefatto nemico' },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _editId      = null;  // null = new card, string = existing id
let _onSaved     = null;  // callback invoked after successful save

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelect(options, selectedValue, cls) {
  const sel = el('select', cls);
  for (const { value, label } of options) {
    const opt = document.createElement('option');
    opt.value    = value;
    opt.text     = label;
    opt.selected = value === selectedValue;
    sel.appendChild(opt);
  }
  return sel;
}

// ── Effect rows ───────────────────────────────────────────────────────────────

function buildEffectRow(effect = {}) {
  const row = el('div', 'ce-effect-row');

  const triggerSel = makeSelect(TRIGGERS, effect.trigger || 'QUANDO_GIOCATA', 'select-input ce-sel-trigger');
  const actionSel  = makeSelect(ACTIONS,  effect.action  || 'PESCA_CARTE',    'select-input ce-sel-action');
  const targetSel  = makeSelect(TARGETS,  effect.target  || 'SE_STESSO',      'select-input ce-sel-target');

  // Amount param
  const amountWrap  = el('div', 'ce-amount-wrap');
  const amountLabel = el('label', 'ce-amount-label');
  amountLabel.textContent = 'Quantità';
  const amountInput = el('input', 'ce-amount-input');
  amountInput.type  = 'number';
  amountInput.min   = '-99';
  amountInput.max   = '99';
  amountInput.value = effect.params?.amount ?? 1;
  amountWrap.appendChild(amountLabel);
  amountWrap.appendChild(amountInput);

  // Destinazione param (for SPOSTA_CARTA_DI_ZONA)
  const destWrap  = el('div', 'ce-amount-wrap');
  const destLabel = el('label', 'ce-amount-label');
  destLabel.textContent = 'Destinazione';
  const destSel = makeSelect(ZONE_DESTINATIONS, effect.params?.destinazione ?? 'mano', 'select-input ce-sel-dest');
  destWrap.appendChild(destLabel);
  destWrap.appendChild(destSel);

  const removeBtn = el('button', 'ce-effect-remove');
  removeBtn.type        = 'button';
  removeBtn.textContent = '✕';
  removeBtn.title       = 'Rimuovi effetto';
  removeBtn.addEventListener('click', () => row.remove());

  function updateParamVisibility() {
    const actionDef = ACTIONS.find(a => a.value === actionSel.value);
    const ps = actionDef?.params ?? [];
    amountWrap.classList.toggle('hidden', !ps.includes('amount'));
    destWrap.classList.toggle('hidden',   !ps.includes('destinazione'));
  }

  actionSel.addEventListener('change', updateParamVisibility);
  updateParamVisibility();

  row.appendChild(triggerSel);
  row.appendChild(actionSel);
  row.appendChild(targetSel);
  row.appendChild(amountWrap);
  row.appendChild(destWrap);
  row.appendChild(removeBtn);
  return row;
}

function collectEffects() {
  const rows = $('ce-effects-list').querySelectorAll('.ce-effect-row');
  return Array.from(rows).map(row => {
    const trigger   = row.querySelector('.ce-sel-trigger')?.value;
    const action    = row.querySelector('.ce-sel-action')?.value;
    const target    = row.querySelector('.ce-sel-target')?.value;
    const amountEl  = row.querySelector('.ce-amount-input');
    const destEl    = row.querySelector('.ce-sel-dest');
    const actionDef = ACTIONS.find(a => a.value === action);
    const ps        = actionDef?.params ?? [];
    const params    = {};
    if (ps.includes('amount'))       params.amount       = Number(amountEl?.value ?? 0);
    if (ps.includes('destinazione')) params.destinazione = destEl?.value ?? 'mano';
    return { trigger, action, target, params };
  });
}

// ── Open / close ──────────────────────────────────────────────────────────────

function clearForm() {
  $('ce-id').value          = '';
  $('ce-name').value        = '';
  $('ce-damage').value      = '1';
  $('ce-hp').value          = '1';
  $('ce-rarity').value      = 'comune';
  $('ce-type').value        = 'personaggio';
  $('ce-active').checked    = false;
  $('ce-description').value = '';
  $('ce-effects-list').innerHTML = '';
  $('ce-error').textContent = '';
}

export function openCardEditor(card, onSaved) {
  _editId  = card?.id ?? null;
  _onSaved = onSaved ?? null;

  clearForm();
  $('card-editor-title').textContent = card ? `Modifica: ${escHtml(card.name)}` : 'Nuova Carta';

  if (card) {
    $('ce-id').value          = card.id;
    $('ce-id').disabled       = true;   // id is immutable after creation
    $('ce-name').value        = card.name;
    $('ce-damage').value      = card.damage ?? 0;
    $('ce-hp').value          = card.hp ?? 1;
    $('ce-rarity').value      = card.rarity ?? 'comune';
    $('ce-type').value        = card.type ?? 'personaggio';
    $('ce-active').checked    = card.active ?? false;
    $('ce-description').value = card.description ?? '';

    for (const eff of card.effects ?? []) {
      $('ce-effects-list').appendChild(buildEffectRow(eff));
    }
  } else {
    $('ce-id').disabled = false;
  }

  $('card-editor-panel').classList.remove('hidden');
  $('ce-name').focus();
}

export function closeCardEditor() {
  $('card-editor-panel').classList.add('hidden');
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveCard() {
  const errorEl = $('ce-error');
  errorEl.textContent = '';

  const id          = $('ce-id').value.trim();
  const name        = $('ce-name').value.trim();
  const damage      = Number($('ce-damage').value) || 0;
  const hp          = Number($('ce-hp').value)     || 1;
  const rarity      = $('ce-rarity').value;
  const type        = $('ce-type').value;
  const active      = $('ce-active').checked;
  const description = $('ce-description').value.trim();
  const effects     = collectEffects();

  if (!name) { errorEl.textContent = 'Il nome è obbligatorio'; return; }
  if (!_editId && !id) { errorEl.textContent = "L'ID è obbligatorio"; return; }

  const btn = $('btn-ce-save');
  btn.disabled = true;

  try {
    let res;
    if (_editId) {
      res = await api.put(`/api/admin/cards/${_editId}`, { name, damage, hp, rarity, type, active, description, effects });
    } else {
      res = await api.post('/api/admin/cards', { id, name, damage, hp, rarity, type, description, effects });
    }

    if (res.error) { errorEl.textContent = res.error; return; }

    showToast(_editId ? 'Carta aggiornata' : 'Carta creata');
    closeCardEditor();
    _onSaved?.();
  } finally {
    btn.disabled = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCardEditor() {
  $('card-editor-close').addEventListener('click', closeCardEditor);
  $('card-editor-overlay').addEventListener('click', closeCardEditor);
  $('btn-ce-cancel').addEventListener('click', closeCardEditor);
  $('btn-ce-save').addEventListener('click', saveCard);
  $('btn-add-effect').addEventListener('click', () => {
    $('ce-effects-list').appendChild(buildEffectRow());
  });
}
