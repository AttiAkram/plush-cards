'use strict';

/**
 * Effects execution engine.
 *
 * executeEffects(gs, actorUsername, trigger, sourceCard?)
 *   → { results: string[], dirtyPlayers: Set<string> }
 *
 * `dirtyPlayers` — usernames whose hand/deckCount changed;
 *   callers must send them a private `hand_updated` socket event.
 *
 * ALL_FINE_TURNO / ALL_INIZIO_TURNO fire only for cards owned by `actorUsername`.
 * ON_MORTE is handled internally: when a card is killed by DANNO_A_CARTA, its
 *   ON_MORTE effects run before the card is removed from the field, so that
 *   SPOSTA_CARTA_DI_ZONA can move it (e.g. back to hand) instead of discarding.
 */

// ── Target resolution ──────────────────────────────────────────────────────────

function resolveTargets(gs, actorUsername, target, sourceCard) {
  const opponents = gs.turnOrder.filter(u => u !== actorUsername);

  switch (target) {
    case 'SE_STESSO': {
      if (!sourceCard) return [];
      const myState = gs.players[actorUsername];
      const idx = myState?.field.findIndex(c => c?.uid === sourceCard.uid);
      if (idx === undefined || idx === -1) return [{ username: actorUsername }];
      return [{ username: actorUsername, card: sourceCard, slotIndex: idx }];
    }

    case 'UN_TUO_PERSONAGGIO': {
      const occupied = fieldSlots(gs.players[actorUsername], actorUsername);
      if (!occupied.length) return [];
      return [occupied[Math.floor(Math.random() * occupied.length)]];
    }

    case 'UN_NEMICO': {
      for (const opp of opponents) {
        const occupied = fieldSlots(gs.players[opp], opp);
        if (occupied.length) return [occupied[Math.floor(Math.random() * occupied.length)]];
      }
      return [];
    }

    case 'TUTTI_I_TUOI':
      return fieldSlots(gs.players[actorUsername], actorUsername);

    case 'TUTTI_I_NEMICI': {
      const out = [];
      for (const opp of opponents) out.push(...fieldSlots(gs.players[opp], opp));
      return out;
    }

    case 'ARTEFATTO_TUO':
    case 'ARTEFATTO_NEMICO':
      return []; // artefact targeting — future work

    default:
      return [];
  }
}

/** Helper: all non-null slots on a player's field as resolved targets. */
function fieldSlots(pState, username) {
  if (!pState) return [];
  return pState.field
    .map((card, slotIndex) => ({ username, card, slotIndex }))
    .filter(({ card }) => card !== null);
}

// ── Action handlers ────────────────────────────────────────────────────────────

/**
 * Apply one action to one resolved target.
 * `pendingDeaths` is pushed to when a card's HP reaches 0 (processed later).
 * Returns a human-readable log line, or null if nothing happened.
 */
function applyAction(gs, actorUsername, action, resolved, params, dirtyPlayers, pendingDeaths) {
  const { username: targetUser, card, slotIndex } = resolved;
  const targetState = gs.players[targetUser];
  if (!targetState) return null;

  switch (action) {

    case 'PESCA_CARTE': {
      const amount = Math.max(1, params.amount ?? 1);
      let drawn = 0;
      for (let i = 0; i < amount; i++) {
        const c = targetState.deck.pop();
        if (!c) break;
        targetState.hand.push(c);
        drawn++;
      }
      if (drawn) dirtyPlayers.add(targetUser);
      return drawn
        ? `${targetUser} pesca ${drawn} carta${drawn > 1 ? 'e' : ''}`
        : `${targetUser} cerca di pescare ma il mazzo è vuoto`;
    }

    case 'DANNO_A_CARTA': {
      if (!card || slotIndex === undefined) return null;
      const amount = params.amount ?? 1;
      card.currentHp = (card.currentHp ?? card.hp) - amount;
      const msg = `${card.name} subisce ${amount} danno${amount > 1 ? 'i' : ''}`;
      if (card.currentHp <= 0) {
        // Don't remove from field yet — ON_MORTE may redirect the card
        pendingDeaths.push({ card, username: targetUser, slotIndex });
        return msg + ' ed è distrutto';
      }
      return msg;
    }

    case 'DANNO_A_ARTEFATTO':
      return null; // future

    case 'MODIFICA_ATTACCO': {
      if (!card) return null;
      const delta = params.amount ?? 0;
      card.damage = Math.max(0, (card.damage ?? 0) + delta);
      return `${card.name}: attacco ${delta >= 0 ? '+' : ''}${delta} → ${card.damage}`;
    }

    case 'MODIFICA_VITA': {
      if (!card) return null;
      const delta = params.amount ?? 0;
      card.currentHp = Math.max(1, (card.currentHp ?? card.hp) + delta);
      return `${card.name}: vita ${delta >= 0 ? '+' : ''}${delta} → ${card.currentHp}`;
    }

    case 'SPOSTA_CARTA_DI_ZONA': {
      if (!card || slotIndex === undefined) return null;
      const dest = params.destinazione ?? 'scarti';

      // Remove from current field slot
      targetState.field[slotIndex] = null;

      // Prepare a clean copy (strip runtime flags)
      const cleanCard = { ...card };
      delete cleanCard._pendingDeath;

      if (dest === 'mano') {
        cleanCard.currentHp = cleanCard.hp; // reset HP on return to hand
        targetState.hand.push(cleanCard);
        dirtyPlayers.add(targetUser);
        return `${card.name} torna in mano`;
      }
      if (dest === 'vuoto') {
        gs.zones.void.push(cleanCard);
        return `${card.name} inviato nel Vuoto`;
      }
      if (dest === 'assoluto') {
        gs.zones.absolute.push(cleanCard);
        return `${card.name} inviato nell'Assoluto`;
      }
      // default: scarti
      targetState.discard.push(cleanCard);
      return `${card.name} inviato agli Scarti`;
    }

    case 'SCAMBIA_POSIZIONI_CAMPO': {
      const myState  = gs.players[actorUsername];
      const occupied = (myState?.field || []).map((c, i) => i).filter(i => myState.field[i] !== null);
      if (occupied.length < 2) return null;
      const [a, b] = occupied.sort(() => Math.random() - 0.5).slice(0, 2);
      [myState.field[a], myState.field[b]] = [myState.field[b], myState.field[a]];
      return `${actorUsername} scambia le posizioni sul campo`;
    }

    case 'ABILITA_TRIGGER_GLOBALI':
      return null; // future

    default:
      return null;
  }
}

// ── Inner execution (no death processing) ────────────────────────────────────

/**
 * Fire effects for `trigger` across `candidates`, writing deaths into
 * `pendingDeaths`. Returns results + dirtyPlayers.
 */
function _inner(gs, trigger, candidates, dirtyPlayers, pendingDeaths) {
  const results = [];
  for (const { card, owner } of candidates) {
    if (!card.effects?.length) continue;
    for (const effect of card.effects) {
      if (effect.trigger !== trigger) continue;
      const targets = resolveTargets(gs, owner, effect.target, card);
      for (const t of targets) {
        const msg = applyAction(gs, owner, effect.action, t, effect.params ?? {}, dirtyPlayers, pendingDeaths);
        if (msg) results.push(`[${card.name}] ${trigger} → ${msg}`);
      }
    }
  }
  return results;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fire all effects matching `trigger`.
 *
 * Pass `sourceCard` for card-specific triggers (QUANDO_GIOCATA, ON_MORTE).
 * For turn triggers (ALL_FINE_TURNO, ALL_INIZIO_TURNO) leave sourceCard null;
 * the engine iterates all cards owned by `actorUsername` (the turn player).
 *
 * @param {object}  gs
 * @param {string}  actorUsername  - whose turn it is / who played the card
 * @param {string}  trigger
 * @param {object}  [sourceCard]
 * @returns {{ results: string[], dirtyPlayers: Set<string> }}
 */
function executeEffects(gs, actorUsername, trigger, sourceCard) {
  const results      = [];
  const dirtyPlayers = new Set();
  const pendingDeaths = [];

  // Build candidate list
  let candidates;
  if (sourceCard) {
    candidates = [{ card: sourceCard, owner: actorUsername }];
  } else {
    // Turn-scoped triggers: only the turn player's field cards
    const pState = gs.players[actorUsername];
    candidates = pState
      ? (pState.field || []).filter(Boolean).map(card => ({ card, owner: actorUsername }))
      : [];
  }

  results.push(..._inner(gs, trigger, candidates, dirtyPlayers, pendingDeaths));

  results.push(...processPendingDeaths(gs, pendingDeaths, dirtyPlayers));

  return { results, dirtyPlayers };
}

// ── Shared death resolver ──────────────────────────────────────────────────────

/**
 * Process a list of pending deaths: fire ON_MORTE, then remove from field
 * (unless SPOSTA_CARTA_DI_ZONA already moved the card).
 * Mutates `gs` and `dirtyPlayers`. Returns log lines.
 *
 * @param {object}   gs
 * @param {Array}    pendingDeaths  — [{ card, username, slotIndex }]
 * @param {Set}      dirtyPlayers
 * @returns {string[]}
 */
function processPendingDeaths(gs, pendingDeaths, dirtyPlayers) {
  const results = [];
  for (const { card, username, slotIndex } of pendingDeaths) {
    const pState = gs.players[username];
    if (!pState) continue;

    const deathPending = [];
    results.push(..._inner(gs, 'ON_MORTE', [{ card, owner: username }], dirtyPlayers, deathPending));

    if (pState.field[slotIndex] === card) {
      pState.field[slotIndex] = null;
      const clean = { ...card };
      delete clean._pendingDeath;
      pState.discard.push(clean);
    }

    for (const secondary of deathPending) {
      const sp = gs.players[secondary.username];
      if (!sp) continue;
      if (sp.field[secondary.slotIndex] === secondary.card) {
        sp.field[secondary.slotIndex] = null;
        sp.discard.push({ ...secondary.card });
      }
    }
  }
  return results;
}

module.exports = { executeEffects, processPendingDeaths };
