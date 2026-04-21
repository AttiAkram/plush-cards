'use strict';

/**
 * Effects execution engine.
 *
 * executeEffects(gs, sourceUsername, trigger, sourceCard?)
 *   → { results: EffectResult[], dirtyPlayers: Set<string> }
 *
 * `dirtyPlayers` contains usernames whose hand/deck changed — callers must
 * send them private `hand_updated` events.
 */

// ── Target resolution ──────────────────────────────────────────────────────────

/**
 * Returns an array of { username, card?, slotIndex? } resolved targets.
 *
 * @param {object} gs
 * @param {string} actorUsername
 * @param {string} target
 * @param {object} [sourceCard]  - the card that owns the effect (for SE_STESSO)
 * @returns {Array<{username:string, card?:object, slotIndex?:number}>}
 */
function resolveTargets(gs, actorUsername, target, sourceCard) {
  const opponentNames = gs.turnOrder.filter(u => u !== actorUsername);

  switch (target) {
    case 'SE_STESSO': {
      if (!sourceCard) return [];
      // Find which slot it's in on the actor's field
      const myState = gs.players[actorUsername];
      const idx     = myState?.field.findIndex(c => c?.uid === sourceCard.uid);
      if (idx === undefined || idx === -1) return [{ username: actorUsername }];
      return [{ username: actorUsername, card: sourceCard, slotIndex: idx }];
    }

    case 'UN_TUO_PERSONAGGIO': {
      const myState  = gs.players[actorUsername];
      const occupied = myState?.field
        .map((c, i) => ({ card: c, slotIndex: i }))
        .filter(({ card }) => card !== null);
      if (!occupied?.length) return [];
      // Pick random one
      const pick = occupied[Math.floor(Math.random() * occupied.length)];
      return [{ username: actorUsername, ...pick }];
    }

    case 'UN_NEMICO': {
      for (const opp of opponentNames) {
        const oppState = gs.players[opp];
        const occupied = oppState?.field
          .map((c, i) => ({ card: c, slotIndex: i }))
          .filter(({ card }) => card !== null);
        if (occupied?.length) {
          const pick = occupied[Math.floor(Math.random() * occupied.length)];
          return [{ username: opp, ...pick }];
        }
      }
      return [];
    }

    case 'TUTTI_I_TUOI': {
      const myState = gs.players[actorUsername];
      return (myState?.field || [])
        .map((c, i) => ({ card: c, slotIndex: i }))
        .filter(({ card }) => card !== null)
        .map(({ card, slotIndex }) => ({ username: actorUsername, card, slotIndex }));
    }

    case 'TUTTI_I_NEMICI': {
      const out = [];
      for (const opp of opponentNames) {
        const oppState = gs.players[opp];
        const rows = (oppState?.field || [])
          .map((c, i) => ({ card: c, slotIndex: i }))
          .filter(({ card }) => card !== null)
          .map(({ card, slotIndex }) => ({ username: opp, card, slotIndex }));
        out.push(...rows);
      }
      return out;
    }

    case 'ARTEFATTO_TUO':
    case 'ARTEFATTO_NEMICO':
      // Artefact system not yet implemented — no-op
      return [];

    default:
      return [];
  }
}

// ── Action handlers ────────────────────────────────────────────────────────────

/**
 * Apply a single action to a resolved target.
 * Returns a human-readable result string or null if nothing happened.
 *
 * @param {object} gs
 * @param {string} actorUsername
 * @param {string} action
 * @param {{ username:string, card?:object, slotIndex?:number }} resolved
 * @param {object} params
 * @param {Set<string>} dirtyPlayers
 * @returns {string|null}
 */
function applyAction(gs, actorUsername, action, resolved, params, dirtyPlayers) {
  const { username: targetUser, card, slotIndex } = resolved;
  const targetState = gs.players[targetUser];
  if (!targetState) return null;

  switch (action) {

    case 'PESCA_CARTE': {
      const amount = Math.max(1, params.amount ?? 1);
      const drawn  = [];
      for (let i = 0; i < amount; i++) {
        const c = targetState.deck.pop();
        if (!c) break;
        targetState.hand.push(c);
        drawn.push(c.name);
      }
      targetState.deckCount = targetState.deck.length;
      if (drawn.length) dirtyPlayers.add(targetUser);
      return drawn.length
        ? `${targetUser} pesca ${drawn.length} carta${drawn.length > 1 ? 'e' : ''}`
        : `${targetUser} cerca di pescare ma il mazzo è vuoto`;
    }

    case 'DANNO_A_CARTA': {
      if (!card || slotIndex === undefined) return null;
      const amount   = params.amount ?? 1;
      card.currentHp = (card.currentHp ?? card.hp) - amount;

      let msg = `${card.name} subisce ${amount} danno${amount > 1 ? 'i' : ''}`;

      // Destroy card if HP reaches 0
      if (card.currentHp <= 0) {
        targetState.field[slotIndex] = null;
        targetState.discard.push({ ...card });
        msg += ` ed è distrutto`;
      }

      return msg;
    }

    case 'DANNO_A_ARTEFATTO':
      // Artefact system not yet implemented
      return null;

    case 'MODIFICA_ATTACCO': {
      if (!card) return null;
      const delta = params.amount ?? 0;
      card.damage = Math.max(0, (card.damage ?? 0) + delta);
      return `${card.name}: attacco ${delta >= 0 ? '+' : ''}${delta} → ${card.damage}`;
    }

    case 'MODIFICA_VITA': {
      if (!card) return null;
      const delta    = params.amount ?? 0;
      card.currentHp = Math.max(1, (card.currentHp ?? card.hp) + delta);
      return `${card.name}: vita ${delta >= 0 ? '+' : ''}${delta} → ${card.currentHp}`;
    }

    case 'SPOSTA_CARTA_DI_ZONA':
      // Zone system stub — not yet implemented
      return null;

    case 'SCAMBIA_POSIZIONI_CAMPO': {
      // Swap two random occupied field slots for the target player
      const myState  = gs.players[actorUsername];
      const occupied = myState?.field
        .map((c, i) => i)
        .filter(i => myState.field[i] !== null);
      if (occupied.length < 2) return null;
      const [a, b] = occupied.sort(() => Math.random() - 0.5).slice(0, 2);
      [myState.field[a], myState.field[b]] = [myState.field[b], myState.field[a]];
      return `${actorUsername} scambia posizioni sul campo`;
    }

    case 'ABILITA_TRIGGER_GLOBALI':
      // Global trigger system — future work
      return null;

    default:
      return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fire all effects matching `trigger` across relevant cards in the game state.
 *
 * For `QUANDO_GIOCATA` / `QUANDO_DICHIARA` / `ON_MORTE`:  pass `sourceCard`.
 * For `ALL_INIZIO_TURNO` / `ALL_FINE_TURNO`:              sourceCard is unused;
 *   the engine iterates all cards on the field of the current-turn player.
 * For `PASSIVO_SE_IN_CAMPO`:                              same as ALL_.
 *
 * @param {object} gs              - live game state (mutated in place)
 * @param {string} actorUsername   - player who owns the triggering context
 * @param {string} trigger
 * @param {object} [sourceCard]    - the specific card that fired (for card-specific triggers)
 * @returns {{ results: string[], dirtyPlayers: Set<string> }}
 */
function executeEffects(gs, actorUsername, trigger, sourceCard) {
  const results      = [];
  const dirtyPlayers = new Set();

  // Collect (card, ownerUsername) pairs whose effects we should check
  const candidates = [];

  if (sourceCard) {
    // Only effects on this specific card
    candidates.push({ card: sourceCard, owner: actorUsername });
  } else {
    // All cards currently on any player's field
    for (const [username, pState] of Object.entries(gs.players)) {
      for (const card of pState.field) {
        if (card) candidates.push({ card, owner: username });
      }
    }
  }

  for (const { card, owner } of candidates) {
    if (!card.effects?.length) continue;

    for (const effect of card.effects) {
      if (effect.trigger !== trigger) continue;

      const resolved = resolveTargets(gs, owner, effect.target, card);
      for (const target of resolved) {
        const msg = applyAction(gs, owner, effect.action, target, effect.params ?? {}, dirtyPlayers);
        if (msg) results.push(msg);
      }
    }
  }

  return { results, dirtyPlayers };
}

module.exports = { executeEffects };
