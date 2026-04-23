/**
 * Card editor slide-in panel.
 * Features: create/edit, live effect preview, duplicate effect row,
 * tags/role fields, semantic validation.
 */

import { $, el, escHtml }  from '../utils/dom.js';
import * as api             from '../api/client.js';
import { showToast }        from '../components/toast.js';
import { effectToText }     from '../utils/effectText.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRIGGERS = [
  { value: 'QUANDO_GIOCATA',      label: 'Quando giocata' },
  { value: 'ALL_INIZIO_TURNO',    label: 'Inizio del tuo turno' },
  { value: 'ALL_FINE_TURNO',      label: 'Fine del tuo turno' },
  { value: 'QUANDO_DICHIARA',     label: 'Quando attacca' },
  { value: 'PASSIVO_SE_IN_CAMPO', label: 'Passivo (se in campo)' },
  { value: 'ON_MORTE',            label: 'Alla morte' },
];

export const ACTIONS = [
  { value: 'PESCA_CARTE',             label: 'Pesca carte',              params: ['amount'] },
  { value: 'DANNO_A_CARTA',           label: 'Infliggi danno a carta',   params: ['amount'] },
  { value: 'DANNO_A_ARTEFATTO',       label: 'Infliggi danno artefatto', params: ['amount'] },
  { value: 'MODIFICA_ATTACCO',        label: 'Modifica attacco (±)',      params: ['amount'] },
  { value: 'MODIFICA_VITA',           label: 'Modifica vita (±)',         params: ['amount'] },
  { value: 'SPOSTA_CARTA_DI_ZONA',    label: 'Sposta carta di zona',     params: ['destinazione'] },
  { value: 'SCAMBIA_POSIZIONI_CAMPO', label: 'Scambia posizioni campo',  params: [] },
  { value: 'ABILITA_TRIGGER_GLOBALI', label: 'Abilita trigger globali',  params: [] },
  { value: 'GUARDIA_CENTRALE',       label: "Guardia Centrale (protegge artefatto)", params: [] },
];

export const TARGETS = [
  { value: 'SE_STESSO',            label: 'Sé stesso' },
  { value: 'UN_TUO_PERSONAGGIO',   label: 'Un tuo personaggio (rand.)' },
  { value: 'UN_NEMICO',            label: 'Un nemico (rand.)' },
  { value: 'TUTTI_I_TUOI',         label: 'Tutti i tuoi personaggi' },
  { value: 'TUTTI_I_NEMICI',       label: 'Tutti i nemici' },
  { value: 'ARTEFATTO_TUO',        label: 'Tuo artefatto' },
  { value: 'ARTEFATTO_NEMICO',     label: 'Artefatto nemico' },
];

export const ZONE_DESTINATIONS = [
  { value: 'mano',     label: 'Mano' },
  { value: 'scarti',   label: 'Scarti' },
  { value: 'vuoto',    label: 'Vuoto' },
  { value: 'assoluto', label: 'Assoluto' },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _editId  = null;
let _onSaved = null;

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

function readEffectFromRow(row) {
  const action    = row.querySelector('.ce-sel-action')?.value;
  const actionDef = ACTIONS.find(a => a.value === action);
  const ps        = actionDef?.params ?? [];
  const params    = {};
  if (ps.includes('amount'))       params.amount       = Number(row.querySelector('.ce-amount-input')?.value ?? 0);
  if (ps.includes('destinazione')) params.destinazione = row.querySelector('.ce-sel-dest')?.value ?? 'mano';
  return {
    trigger: row.querySelector('.ce-sel-trigger')?.value,
    action,
    target:  row.querySelector('.ce-sel-target')?.value,
    params,
  };
}

// ── Effect rows ───────────────────────────────────────────────────────────────

function updatePreview(row) {
  const effect  = readEffectFromRow(row);
  const preview = row.querySelector('.ce-effect-preview');
  if (!preview) return;
  const text = effectToText(effect);
  preview.textContent = text ?? '—';
  preview.classList.toggle('ce-preview-empty', !text);
}

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

  // Destinazione param
  const destWrap  = el('div', 'ce-amount-wrap');
  const destLabel = el('label', 'ce-amount-label');
  destLabel.textContent = 'Destinazione';
  const destSel = makeSelect(ZONE_DESTINATIONS, effect.params?.destinazione ?? 'mano', 'select-input ce-sel-dest');
  destWrap.appendChild(destLabel);
  destWrap.appendChild(destSel);

  // Action buttons
  const removeBtn = el('button', 'ce-effect-remove');
  removeBtn.type        = 'button';
  removeBtn.textContent = '✕';
  removeBtn.title       = 'Rimuovi effetto';
  removeBtn.addEventListener('click', () => row.remove());

  const dupBtn = el('button', 'ce-effect-dup');
  dupBtn.type        = 'button';
  dupBtn.textContent = '⧉';
  dupBtn.title       = 'Duplica effetto';
  dupBtn.addEventListener('click', () => {
    const copy = buildEffectRow(readEffectFromRow(row));
    row.parentNode.insertBefore(copy, row.nextSibling);
  });

  // Live preview
  const preview = el('div', 'ce-effect-preview');

  function refresh() {
    const actionDef = ACTIONS.find(a => a.value === actionSel.value);
    const ps = actionDef?.params ?? [];
    amountWrap.classList.toggle('hidden', !ps.includes('amount'));
    destWrap.classList.toggle('hidden',   !ps.includes('destinazione'));
    updatePreview(row);
  }

  // Validate amount on blur
  amountInput.addEventListener('blur', () => {
    const action = actionSel.value;
    const v = Number(amountInput.value);
    if (['PESCA_CARTE', 'DANNO_A_CARTA', 'DANNO_A_ARTEFATTO'].includes(action) && v < 1) {
      amountInput.value = 1;
    }
    updatePreview(row);
  });

  [triggerSel, actionSel, targetSel, destSel].forEach(s => s.addEventListener('change', refresh));
  amountInput.addEventListener('input', () => updatePreview(row));

  refresh();

  row.appendChild(triggerSel);
  row.appendChild(actionSel);
  row.appendChild(targetSel);
  row.appendChild(amountWrap);
  row.appendChild(destWrap);
  row.appendChild(dupBtn);
  row.appendChild(removeBtn);
  row.appendChild(preview);
  return row;
}

function collectEffects() {
  return Array.from(
    $('ce-effects-list').querySelectorAll('.ce-effect-row'),
    row => readEffectFromRow(row),
  );
}

// ── Validate ──────────────────────────────────────────────────────────────────

function validateEffects(effects) {
  for (const eff of effects) {
    if (!eff.trigger || !eff.action || !eff.target) return 'Un effetto ha campi mancanti.';
    if (['PESCA_CARTE', 'DANNO_A_CARTA', 'DANNO_A_ARTEFATTO'].includes(eff.action)) {
      if (!eff.params.amount || eff.params.amount < 1)
        return `${eff.action}: la quantità deve essere ≥ 1.`;
    }
    if (eff.action === 'SPOSTA_CARTA_DI_ZONA' && !eff.params.destinazione)
      return 'SPOSTA_CARTA_DI_ZONA: seleziona una destinazione.';
  }
  return null;
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
  $('ce-tags').value        = '';
  $('ce-role').value        = 'neutro';
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
    $('ce-id').disabled       = true;
    $('ce-name').value        = card.name;
    $('ce-damage').value      = card.damage ?? 0;
    $('ce-hp').value          = card.hp ?? 1;
    $('ce-rarity').value      = card.rarity ?? 'comune';
    $('ce-type').value        = card.type ?? 'personaggio';
    $('ce-active').checked    = card.active ?? false;
    $('ce-description').value = card.description ?? '';
    $('ce-tags').value        = Array.isArray(card.tags) ? card.tags.join(', ') : (card.tags ?? '');
    $('ce-role').value        = card.role ?? 'neutro';
    for (const eff of card.effects ?? []) {
      $('ce-effects-list').appendChild(buildEffectRow(eff));
    }
  } else {
    $('ce-id').disabled = false;
  }

  $('card-editor-panel').classList.remove('hidden');
  $('ce-name').focus();
}

/** Open the editor pre-filled as a copy (no id, name marked as copy). */
export function duplicateCardEditor(card, onSaved) {
  openCardEditor({ ...card, id: null, name: `${card.name} (copia)`, active: false }, onSaved);
  $('ce-id').value    = '';
  $('ce-id').disabled = false;
  $('card-editor-title').textContent = 'Duplica Carta';
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
  const tagsRaw     = $('ce-tags').value.trim();
  const tags        = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const role        = $('ce-role').value;
  const effects     = collectEffects();

  if (!name) { errorEl.textContent = 'Il nome è obbligatorio'; return; }
  if (!_editId && !id) { errorEl.textContent = "L'ID è obbligatorio"; return; }

  const effErr = validateEffects(effects);
  if (effErr) { errorEl.textContent = effErr; return; }

  const btn = $('btn-ce-save');
  btn.disabled = true;

  try {
    let res;
    if (_editId) {
      res = await api.put(`/api/admin/cards/${_editId}`, { name, damage, hp, rarity, type, active, description, tags, role, effects });
    } else {
      res = await api.post('/api/admin/cards', { id, name, damage, hp, rarity, type, description, tags, role, effects });
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
