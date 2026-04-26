'use strict';

const store                              = require('../../store');
const { initGameState }                  = require('../../game/state');
const { createArtifactPool }             = require('../../game/deck');
const { executeEffects, processPendingDeaths } = require('../../game/effects');
const sessions                           = require('../../game/sessions');

const DRAFT_CHOICES = 3;   // artifact options shown to each player

/** Returns true if `username` has admin or root role. */
function isAdminUser(username) {
  const user = store.users.get(username?.toLowerCase());
  return user?.role === 'root' || user?.role === 'admin';
}

/**
 * Broadcast effects results and updated game state.
 * Also sends private hand_updated to any player whose hand changed.
 */
function broadcastEffects(io, socket, roomCode, gs, results, dirtyPlayers) {
  if (!results.length && !dirtyPlayers.size) return;

  const publicGs = sanitiseGs(gs);
  io.to(roomCode).emit('effects_applied', { results, gameState: publicGs });

  for (const username of dirtyPlayers) {
    const sid = findSocketId(username);
    if (sid) io.to(sid).emit('hand_updated', { hand: gs.players[username].hand });
  }
}

/** Find the socket id for a username from the sockets store. */
function findSocketId(username) {
  for (const [sid, info] of store.sockets.entries()) {
    if (info.username === username) return sid;
  }
  return null;
}

/**
 * Strip server-only fields from game state before sending to clients.
 * `gs.deck` stays server-side; clients only see `gs.deckCount`.
 */
function sanitiseGs(gs) {
  const { deck, ...pub } = gs;   // eslint-disable-line no-unused-vars
  return { ...pub, deckCount: deck?.length ?? 0 };
}

/**
 * Check if the enemy field has GUARDIA_CENTRALE — i.e. any field card with
 * that passive effect active.  Used when deciding if an artifact can be attacked.
 */
function hasGuardiaCentrale(pState) {
  return pState.field.some(card =>
    card?.effects?.some(e =>
      e.trigger === 'PASSIVO_SE_IN_CAMPO' && e.action === 'GUARDIA_CENTRALE'
    )
  );
}

/**
 * Finalise the draft phase: init game state with chosen artifacts and broadcast game_started.
 */
function _finalizeDraft(io, room, roomCode) {
  const chosenArtifacts = {};
  for (const [uname, card] of Object.entries(room.draftPicks)) {
    if (card) chosenArtifacts[uname] = card;
  }
  room.status    = 'playing';
  room.gameState = initGameState(room, chosenArtifacts);

  // Clean up draft state
  room.draftChoices = {};
  room.draftPicks   = {};

  io.to(roomCode).emit('game_started', sanitiseGs(room.gameState));
}

/**
 * Find a card anywhere in the game state (field, hand, artifact, discard, zones, deck).
 * Returns { card, owner, zone, slotIndex? } or null.
 */
function _findCardEverywhere(gs, uid) {
  for (const [uname, p] of Object.entries(gs.players)) {
    const fi = p.field.findIndex(c => c?.uid === uid);
    if (fi !== -1) return { card: p.field[fi], owner: uname, zone: 'field', slotIndex: fi };
    const hi = p.hand.findIndex(c => c.uid === uid);
    if (hi !== -1) return { card: p.hand[hi], owner: uname, zone: 'hand', handIdx: hi };
    if (p.artifactSlot?.uid === uid) return { card: p.artifactSlot, owner: uname, zone: 'artifact' };
  }
  const di = gs.discard.findIndex(c => c.uid === uid);
  if (di !== -1) return { card: gs.discard[di], owner: gs.discard[di].owner, zone: 'discard', idx: di };
  const vi = gs.zones.void.findIndex(c => c.uid === uid);
  if (vi !== -1) return { card: gs.zones.void[vi], owner: null, zone: 'void', idx: vi };
  const ai = gs.zones.absolute.findIndex(c => c.uid === uid);
  if (ai !== -1) return { card: gs.zones.absolute[ai], owner: null, zone: 'absolute', idx: ai };
  const ki = gs.deck.findIndex(c => c.uid === uid);
  if (ki !== -1) return { card: gs.deck[ki], owner: null, zone: 'deck', idx: ki };
  return null;
}

/**
 * Remove a card from wherever it currently lives, mutating gs.
 */
function _removeCardFromZone(gs, found) {
  const { owner, zone, slotIndex, handIdx, idx } = found;
  if (zone === 'field')    gs.players[owner].field[slotIndex]        = null;
  if (zone === 'hand')     gs.players[owner].hand.splice(handIdx, 1);
  if (zone === 'artifact') gs.players[owner].artifactSlot            = null;
  if (zone === 'discard')  gs.discard.splice(idx, 1);
  if (zone === 'void')     gs.zones.void.splice(idx, 1);
  if (zone === 'absolute') gs.zones.absolute.splice(idx, 1);
  if (zone === 'deck')     gs.deck.splice(idx, 1);
}

/**
 * Register game-related socket event handlers for one connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerGameHandlers(io, socket) {
  const { username } = socket;

  // ── Helper ───────────────────────────────────────────────────────────────────

  function getRoomAndState() {
    const { roomCode } = store.sockets.get(socket.id) || {};
    if (!roomCode) return {};
    const room = store.rooms.get(roomCode);
    return { room, roomCode, gs: room?.gameState ?? null };
  }

  // ── start_game ───────────────────────────────────────────────────────────────
  // Kicks off the artifact draft phase (or skips to game in debug/campaign mode).

  socket.on('start_game', ({ debug = false } = {}) => {
    const { room, roomCode } = getRoomAndState();
    if (!room) return;

    if (room.host !== username)
      return socket.emit('error_msg', 'Solo il host può iniziare la partita');

    const debugAllowed = debug && isAdminUser(username);

    // Campaign mode: skip all checks, no draft, random artifact assignment
    if (room.mode === 'campaign') {
      room.status    = 'playing';
      room.gameState = initGameState(room, {});
      return io.to(roomCode).emit('game_started', sanitiseGs(room.gameState));
    }

    if (room.players.length < 2 && !debugAllowed)
      return socket.emit('error_msg', 'Servono almeno 2 giocatori per iniziare');

    if (!debugAllowed) {
      const allReady = room.players.every(p => room.ready[p.username]);
      if (!allReady)
        return socket.emit('error_msg', 'Non tutti i giocatori sono pronti');
    }

    // Debug mode: skip draft, start immediately with random artifacts
    if (debugAllowed) {
      room.status    = 'playing';
      room.gameState = initGameState(room, {});
      room.gameState.debugMode = true;
      return io.to(roomCode).emit('game_started', sanitiseGs(room.gameState));
    }

    // ── Draft phase setup ────────────────────────────────────────────────────
    const pool = createArtifactPool();
    room.draftChoices = {};
    room.draftPicks   = {};
    room.status       = 'drafting';

    const allUsernames = room.players.map(p => p.username);
    let poolIdx = 0;

    for (const { username: uname } of room.players) {
      const choices = pool.slice(poolIdx, poolIdx + DRAFT_CHOICES);
      poolIdx += DRAFT_CHOICES;
      room.draftChoices[uname] = choices;

      // If this player has no choices (pool exhausted), auto-pick null
      if (choices.length === 0) {
        room.draftPicks[uname] = null;
      }
    }

    // Send private choices to each player
    for (const { username: uname } of room.players) {
      const sid = findSocketId(uname);
      if (!sid) continue;
      io.to(sid).emit('draft_started', {
        choices:     room.draftChoices[uname] ?? [],
        waitingFor:  allUsernames,
      });
    }

    // If everyone was auto-resolved (no artifacts in pool), start game now
    const waitingFor = allUsernames.filter(u => !(u in room.draftPicks));
    if (waitingFor.length === 0) _finalizeDraft(io, room, roomCode);
  });

  // ── pick_artifact ────────────────────────────────────────────────────────────

  socket.on('pick_artifact', ({ artifactUid }) => {
    const { room, roomCode } = getRoomAndState();
    if (!room || room.status !== 'drafting') return;
    if (username in room.draftPicks) return; // already picked

    const choices = room.draftChoices[username] ?? [];

    // artifactUid === null means no artifact available (pool was exhausted)
    if (artifactUid !== null) {
      const chosen = choices.find(c => c.uid === artifactUid);
      if (!chosen)
        return socket.emit('error_msg', 'Artefatto non valido');
      room.draftPicks[username] = chosen;
    } else {
      room.draftPicks[username] = null;
    }

    const waitingFor = room.players
      .map(p => p.username)
      .filter(u => !(u in room.draftPicks));

    if (waitingFor.length > 0) {
      io.to(roomCode).emit('draft_updated', { waitingFor });
    } else {
      _finalizeDraft(io, room, roomCode);
    }
  });

  // ── end_turn ─────────────────────────────────────────────────────────────────

  socket.on('end_turn', () => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    if (gs.currentTurn !== username)
      return socket.emit('error_msg', 'Non è il tuo turno');

    // Fire end-of-turn effects for the current player
    const { results: endResults, dirtyPlayers: endDirty } =
      executeEffects(gs, username, 'ALL_FINE_TURNO');

    // Reset current player's turn counters and per-card attack flags
    const myState = gs.players[username];
    if (myState) {
      myState.plushPlayedThisTurn = 0;
      myState.scartiQuestoTurno   = 0;
      myState.field.forEach(card => { if (card) card.haAttaccato = false; });
    }

    // Advance turn
    const idx     = gs.turnOrder.indexOf(username);
    const nextIdx = (idx + 1) % gs.turnOrder.length;
    if (nextIdx === 0) gs.turnNumber += 1;
    gs.currentTurn = gs.turnOrder[nextIdx];

    // Natural draw for the new player from the shared deck (before start-of-turn effects)
    const nextState  = gs.players[gs.currentTurn];
    const drawnUsers = new Set();
    if (nextState) {
      const drawn = gs.deck.pop();
      if (drawn) {
        nextState.hand.push(drawn);
        drawnUsers.add(gs.currentTurn);
      }
    }

    // Fire start-of-turn effects for the new current player
    const { results: startResults, dirtyPlayers: startDirty } =
      executeEffects(gs, gs.currentTurn, 'ALL_INIZIO_TURNO');

    const allResults = [...endResults, ...startResults];
    const allDirty   = new Set([...endDirty, ...startDirty, ...drawnUsers]);

    io.to(roomCode).emit('turn_changed', {
      currentTurn: gs.currentTurn,
      turnNumber:  gs.turnNumber,
    });

    broadcastEffects(io, socket, roomCode, gs, allResults, allDirty);
  });

  // ── play_card ─────────────────────────────────────────────────────────────────

  socket.on('play_card', ({ cardUid, slotIndex }) => {
    if (typeof slotIndex !== 'number') return;
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    const isCampaign = room.mode === 'campaign';

    if (!isCampaign && gs.currentTurn !== username)
      return socket.emit('error_msg', 'Non è il tuo turno');

    const myState = gs.players[username];
    if (!myState) return;

    const cardIdx = myState.hand.findIndex(c => c.uid === cardUid);
    if (cardIdx === -1)
      return socket.emit('error_msg', 'Carta non trovata in mano');

    const card = myState.hand[cardIdx];

    // Reject artefatti from hand (artifacts are pre-assigned to artifactSlot)
    if (card.type === 'artefatto')
      return socket.emit('error_msg', 'Gli artefatti non possono essere giocati dalla mano');

    // 1-plush-per-turn limit (rules mode only)
    if (!isCampaign && (myState.plushPlayedThisTurn ?? 0) >= 1)
      return socket.emit('error_msg', 'Puoi giocare solo 1 personaggio per turno');

    if (slotIndex < 0 || slotIndex >= myState.field.length)
      return socket.emit('error_msg', 'Slot non valido');

    if (myState.field[slotIndex] !== null)
      return socket.emit('error_msg', 'Slot già occupato');

    const [playedCard] = myState.hand.splice(cardIdx, 1);
    playedCard.currentHp   = playedCard.hp;
    playedCard.haAttaccato = false;
    myState.field[slotIndex] = playedCard;
    myState.plushPlayedThisTurn = (myState.plushPlayedThisTurn ?? 0) + 1;

    io.to(roomCode).emit('card_played', {
      playerId:  username,
      cardUid,
      slotIndex,
      card:      playedCard,
    });

    socket.emit('hand_updated', { hand: myState.hand });

    // Fire QUANDO_GIOCATA effects
    const { results, dirtyPlayers } =
      executeEffects(gs, username, 'QUANDO_GIOCATA', playedCard);

    broadcastEffects(io, socket, roomCode, gs, results, dirtyPlayers);
  });

  // ── attack ───────────────────────────────────────────────────────────────────

  socket.on('attack', ({ attackerUid, targetUsername, targetUid }) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    const isCampaign = room.mode === 'campaign';

    if (!isCampaign && gs.currentTurn !== username)
      return socket.emit('error_msg', 'Non è il tuo turno');

    const myState    = gs.players[username];
    const enemyState = gs.players[targetUsername];
    if (!myState || !enemyState)
      return socket.emit('error_msg', 'Giocatore non trovato');

    // Find attacker on my field
    const attackerIdx = myState.field.findIndex(c => c?.uid === attackerUid);
    if (attackerIdx === -1)
      return socket.emit('error_msg', 'Attaccante non trovato sul campo');
    const attacker = myState.field[attackerIdx];

    if (!isCampaign && attacker.haAttaccato)
      return socket.emit('error_msg', 'Questa carta ha già attaccato questo turno');

    // Find target: first check field, then artifactSlot
    let target        = null;
    let targetIdx     = -1;
    let isArtifact    = false;

    const fieldIdx = enemyState.field.findIndex(c => c?.uid === targetUid);
    if (fieldIdx !== -1) {
      target    = enemyState.field[fieldIdx];
      targetIdx = fieldIdx;
    } else if (enemyState.artifactSlot?.uid === targetUid) {
      target     = enemyState.artifactSlot;
      isArtifact = true;
    }

    if (!target)
      return socket.emit('error_msg', 'Bersaglio non trovato sul campo');

    // Artifact targeting rules:
    // - can only attack artifact if no personaggi are on enemy field
    // - GUARDIA_CENTRALE: even with empty field, a card with this passive blocks artifact attacks
    if (isArtifact || target.type === 'artefatto') {
      const fieldPersonaggi = enemyState.field.filter(c => c !== null && c.type === 'personaggio');
      if (fieldPersonaggi.length > 0)
        return socket.emit('error_msg', 'Elimina prima tutti i personaggi nemici per attaccare un artefatto');
      if (hasGuardiaCentrale(enemyState))
        return socket.emit('error_msg', "Un personaggio con Guardia Centrale protegge l'artefatto nemico");
    }

    const results       = [];
    const dirtyPlayers  = new Set();
    const pendingDeaths = [];

    // Fire QUANDO_DICHIARA effects for the attacker
    const { results: declareRes, dirtyPlayers: declareDirty } =
      executeEffects(gs, username, 'QUANDO_DICHIARA', attacker);
    results.push(...declareRes);
    for (const u of declareDirty) dirtyPlayers.add(u);

    // Combat damage (mutual)
    const atkDmg = attacker.damage ?? 0;
    const defDmg = target.damage   ?? 0;
    target.currentHp   = (target.currentHp   ?? target.hp)   - atkDmg;
    attacker.currentHp = (attacker.currentHp ?? attacker.hp) - defDmg;

    attacker.haAttaccato = true;
    results.push(`${attacker.name} attacca ${target.name}!`);

    if (attacker.currentHp <= 0)
      pendingDeaths.push({ card: attacker, username, slotIndex: attackerIdx });

    // Handle target death
    let eliminatedUsername = null;
    if (target.currentHp <= 0) {
      if (isArtifact) {
        // Artifact destroyed — player eliminated
        enemyState.artifactSlot = null;
        gs.discard.push({ ...target, owner: targetUsername });
        results.push(`${target.name} è stato distrutto!`);

        eliminatedUsername    = targetUsername;
        enemyState.status     = 'eliminated';
        results.push(`${targetUsername} è stato eliminato!`);

        // All field cards die (fire ON_MORTE normally via pendingDeaths)
        for (let i = 0; i < enemyState.field.length; i++) {
          const fc = enemyState.field[i];
          if (fc) pendingDeaths.push({ card: fc, username: targetUsername, slotIndex: i });
        }

        // Remove from active turn order
        gs.turnOrder = gs.turnOrder.filter(u => u !== targetUsername);
        if (gs.currentTurn === targetUsername) {
          gs.currentTurn = gs.turnOrder[0] ?? null;
        }
      } else {
        pendingDeaths.push({ card: target, username: targetUsername, slotIndex: targetIdx });
      }
    }

    results.push(...processPendingDeaths(gs, pendingDeaths, dirtyPlayers));

    const publicGs = sanitiseGs(gs);
    io.to(roomCode).emit('attack_result', { results, gameState: publicGs });

    for (const uname of dirtyPlayers) {
      const sid = findSocketId(uname);
      if (sid) io.to(sid).emit('hand_updated', { hand: gs.players[uname].hand });
    }

    // Emit elimination / game-over events after attack_result
    if (eliminatedUsername) {
      io.to(roomCode).emit('player_eliminated', { username: eliminatedUsername });

      if (gs.turnOrder.length <= 1) {
        const winner = gs.turnOrder[0] ?? null;
        room.status  = 'finished';
        io.to(roomCode).emit('game_over', { winner });
      }
    }
  });

  // ── discard_card ─────────────────────────────────────────────────────────────

  socket.on('discard_card', ({ cardUid }) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    if (room.mode !== 'campaign' && gs.currentTurn !== username)
      return socket.emit('error_msg', 'Non è il tuo turno');

    const myState = gs.players[username];
    if (!myState) return;

    const idx = myState.hand.findIndex(c => c.uid === cardUid);
    if (idx === -1) return socket.emit('error_msg', 'Carta non trovata in mano');

    const [card] = myState.hand.splice(idx, 1);
    gs.discard.push({ ...card, owner: username });   // global discard with owner
    myState.scartiQuestoTurno = (myState.scartiQuestoTurno ?? 0) + 1;
    myState.scartiTotali      = (myState.scartiTotali      ?? 0) + 1;

    socket.emit('hand_updated', { hand: myState.hand });

    io.to(roomCode).emit('card_discarded', {
      username,
      cardUid,
      gameState: sanitiseGs(gs),
    });
  });

  // ── request_valid_slots ──────────────────────────────────────────────────────

  socket.on('request_valid_slots', ({ cardUid }) => {
    const { gs } = getRoomAndState();
    if (!gs) return;

    const myState = gs.players[username];
    if (!myState) return;

    const card = myState.hand.find(c => c.uid === cardUid);
    if (!card) return socket.emit('valid_slots', { cardUid, validSlots: [] });

    // Artefatti cannot be played from hand
    if (card.type === 'artefatto')
      return socket.emit('valid_slots', { cardUid, validSlots: [] });

    const validSlots = myState.field
      .map((s, i) => (s === null ? i : -1))
      .filter(i => i !== -1);

    socket.emit('valid_slots', { cardUid, validSlots });
  });

  // ── manual_edit (campaign mode only) ────────────────────────────────────────
  //
  // type 'stat'  — change HP or ATK of any card by delta
  // type 'move'  — move a card from wherever it is to a target zone

  socket.on('manual_edit', ({ type, cardUid, stat, delta, color, to, toUsername, slotIndex } = {}) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs || room.mode !== 'campaign')
      return socket.emit('error_msg', 'Solo in modalità campagna');

    const isGM = room.host === username || isAdminUser(username);

    // Find the card in all zones
    const found = _findCardEverywhere(gs, cardUid);
    if (!found) return socket.emit('error_msg', 'Carta non trovata');

    const ownerUsername = found.owner;
    if (!isGM && ownerUsername !== username)
      return socket.emit('error_msg', 'Non puoi modificare le carte degli altri');

    const { card } = found;
    let log = '';

    if (type === 'stat') {
      const d = Number(delta) || 0;
      if (stat === 'hp') {
        card.currentHp = Math.max(0, (card.currentHp ?? card.hp) + d);
        log = `[GM] ${username} → ${card.name}: HP ${d >= 0 ? '+' : ''}${d} (ora ${card.currentHp})`;
      } else if (stat === 'atk') {
        card.damage = Math.max(0, (card.damage ?? 0) + d);
        log = `[GM] ${username} → ${card.name}: ATK ${d >= 0 ? '+' : ''}${d} (ora ${card.damage})`;
      }
    } else if (type === 'marker') {
      if (color === 'all') {
        if (!isGM) return socket.emit('error_msg', 'Solo il GM può azzerare tutti i marker');
        card.markers = { green: 0, red: 0, blue: 0, yellow: 0 };
        log = `[GM] ${username} → ${card.name}: tutti i marker azzerati`;
      } else {
        const VALID = ['green', 'red', 'blue', 'yellow'];
        if (!VALID.includes(color)) return socket.emit('error_msg', 'Colore marker non valido');
        const d = Number(delta) || 1;
        if (!card.markers) card.markers = { green: 0, red: 0, blue: 0, yellow: 0 };
        card.markers[color] = Math.max(0, Math.min(5, (card.markers[color] ?? 0) + d));
        const LABELS = { green: 'verde', red: 'rosso', blue: 'blu', yellow: 'giallo' };
        log = `[GM] ${username} → ${card.name}: marker ${LABELS[color]} ora ${card.markers[color]}`;
      }
    } else if (type === 'move') {
      const validTo = ['hand', 'field', 'discard', 'void', 'absolute', 'deck_top', 'deck_bottom', 'hand_random', 'field_random'];
      if (!validTo.includes(to)) return socket.emit('error_msg', 'Destinazione non valida');
      if ((to === 'hand_random' || to === 'field_random') && !isGM)
        return socket.emit('error_msg', 'Solo il GM può usare destinazioni casuali');

      // Remove from current zone
      _removeCardFromZone(gs, found);
      const destUser = toUsername ?? ownerUsername ?? username;

      if (to === 'hand') {
        const targetState = gs.players[destUser];
        if (!targetState) return socket.emit('error_msg', 'Giocatore non trovato');
        const clean = { ...card };
        delete clean.owner;
        clean.currentHp = clean.hp;  // reset HP on return to hand
        targetState.hand.push(clean);
        const sid = findSocketId(destUser);
        if (sid) io.to(sid).emit('hand_updated', { hand: targetState.hand });
        log = `[GM] ${username} sposta ${card.name} → mano di ${destUser}`;

      } else if (to === 'field') {
        const targetState = gs.players[destUser];
        if (!targetState) return socket.emit('error_msg', 'Giocatore non trovato');
        const freeSlot = typeof slotIndex === 'number'
          ? slotIndex
          : targetState.field.findIndex(s => s === null);
        if (freeSlot === -1 || targetState.field[freeSlot] !== null)
          return socket.emit('error_msg', 'Nessuno slot libero in campo');
        const clean = { ...card };
        delete clean.owner;
        clean.currentHp    = clean.currentHp ?? clean.hp;
        clean.haAttaccato  = false;
        targetState.field[freeSlot] = clean;
        log = `[GM] ${username} sposta ${card.name} → campo di ${destUser} (slot ${freeSlot})`;

      } else if (to === 'discard') {
        gs.discard.push({ ...card, owner: ownerUsername ?? username });
        log = `[GM] ${username} sposta ${card.name} → Scarti`;
      } else if (to === 'void') {
        const clean = { ...card }; delete clean.owner;
        gs.zones.void.push(clean);
        log = `[GM] ${username} sposta ${card.name} → Vuoto`;
      } else if (to === 'absolute') {
        const clean = { ...card }; delete clean.owner;
        gs.zones.absolute.push(clean);
        log = `[GM] ${username} sposta ${card.name} → Assoluto`;
      } else if (to === 'deck_top') {
        const clean = { ...card }; delete clean.owner;
        clean.currentHp = clean.hp;
        gs.deck.push(clean);  // push = top of stack (pop draws from top)
        log = `[GM] ${username} rimette ${card.name} in cima al mazzo`;
      } else if (to === 'deck_bottom') {
        const clean = { ...card }; delete clean.owner;
        clean.currentHp = clean.hp;
        gs.deck.unshift(clean);  // unshift = bottom (pop draws from top)
        log = `[GM] ${username} rimette ${card.name} in fondo al mazzo`;

      } else if (to === 'hand_random') {
        const playerNames = Object.keys(gs.players);
        const randUser    = playerNames[Math.floor(Math.random() * playerNames.length)];
        const targetState = gs.players[randUser];
        const clean = { ...card }; delete clean.owner;
        clean.currentHp = clean.hp;
        targetState.hand.push(clean);
        const sid = findSocketId(randUser);
        if (sid) io.to(sid).emit('hand_updated', { hand: targetState.hand });
        log = `[GM] ${username} sposta ${card.name} → mano casuale di ${randUser}`;

      } else if (to === 'field_random') {
        const playerNames = Object.keys(gs.players);
        const shuffled    = [...playerNames].sort(() => Math.random() - 0.5);
        let placed = false;
        for (const randUser of shuffled) {
          const targetState = gs.players[randUser];
          const freeSlot    = targetState.field.findIndex(s => s === null);
          if (freeSlot !== -1) {
            const clean = { ...card }; delete clean.owner;
            clean.currentHp   = clean.currentHp ?? clean.hp;
            clean.haAttaccato = false;
            targetState.field[freeSlot] = clean;
            log     = `[GM] ${username} sposta ${card.name} → campo casuale di ${randUser} (slot ${freeSlot})`;
            placed  = true;
            break;
          }
        }
        if (!placed) return socket.emit('error_msg', 'Nessuno slot libero in campo');
      }
    } else if (type === 'reset_hp') {
      card.currentHp = card.hp;
      log = `[GM] ${username} → ${card.name}: HP ripristinato a ${card.hp}`;
    }

    const publicGs = sanitiseGs(gs);
    io.to(roomCode).emit('manual_edit_applied', { gameState: publicGs, log });
  });

  // ── gm_note (campaign only — all campaign players) ───────────────────────────

  socket.on('gm_note', ({ text, type = 'note' } = {}) => {
    const { room, roomCode } = getRoomAndState();
    if (!room || room.mode !== 'campaign') return;
    const clean = String(text ?? '').trim();
    if (!clean) return;
    io.to(roomCode).emit('gm_note', { username, text: clean, type });
  });

  // ── request_deck (campaign only, GM only) ────────────────────────────────────

  socket.on('request_deck', () => {
    const { room, gs } = getRoomAndState();
    if (!gs || room.mode !== 'campaign') return;
    const isGM = room.host === username || isAdminUser(username);
    if (!isGM) return socket.emit('error_msg', 'Solo il GM può vedere il mazzo');
    socket.emit('deck_contents', { deck: gs.deck ?? [] });
  });

  // ── save_session (campaign only, GM only) ────────────────────────────────────

  socket.on('save_session', ({ logEntries = [] } = {}) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs || room.mode !== 'campaign') return;
    const isGM = room.host === username || isAdminUser(username);
    if (!isGM) return socket.emit('error_msg', 'Solo il GM può salvare la sessione');

    const savedAt = new Date().toISOString();
    sessions.saveSession(username, { savedAt, roomName: room.name, gameState: gs, logEntries });
    room.hasSavedSession = true;
    socket.emit('session_saved', { savedAt });
    io.to(roomCode).emit('room_updated', room.toJSON());
  });

  // ── restore_session (campaign only, GM only) ─────────────────────────────────

  socket.on('restore_session', () => {
    const { room, roomCode } = getRoomAndState();
    if (!room || room.mode !== 'campaign') return;
    const isGM = room.host === username || isAdminUser(username);
    if (!isGM) return socket.emit('error_msg', 'Solo il GM può ripristinare la sessione');

    const saved = sessions.loadSession(username);
    if (!saved) return socket.emit('error_msg', 'Nessuna sessione salvata trovata');

    room.status    = 'playing';
    room.gameState = saved.gameState;

    io.to(roomCode).emit('session_restored', {
      gameState:  sanitiseGs(saved.gameState),
      logEntries: saved.logEntries ?? [],
      savedAt:    saved.savedAt,
    });

    // Send private hands to each connected player
    for (const [uname, pState] of Object.entries(saved.gameState.players)) {
      const sid = findSocketId(uname);
      if (sid) io.to(sid).emit('hand_updated', { hand: pState.hand });
    }
  });

  // ── gm_random (campaign only, GM only) ──────────────────────────────────────
  // action 'group_draw'      — all players draw N cards from deck
  // action 'reset_all_hp'    — reset HP of all field cards to max
  // action 'clear_all_markers' — clear all markers from all field cards

  socket.on('gm_random', ({ action, count = 1 } = {}) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs || room.mode !== 'campaign') return;
    const isGM = room.host === username || isAdminUser(username);
    if (!isGM) return socket.emit('error_msg', 'Solo il GM può usare strumenti di gruppo');

    const results = [];

    if (action === 'group_draw') {
      const n = Math.max(1, Math.min(5, Number(count) || 1));
      for (const [uname, pState] of Object.entries(gs.players)) {
        let drawn = 0;
        for (let i = 0; i < n; i++) {
          const card = gs.deck.pop();
          if (!card) break;
          pState.hand.push(card);
          drawn++;
        }
        const sid = findSocketId(uname);
        if (sid) io.to(sid).emit('hand_updated', { hand: pState.hand });
        if (drawn < n) results.push('Mazzo esaurito');
      }
      results.push(`[GM] Tutti i giocatori pescano ${n} carta${n !== 1 ? 'e' : ''} dal mazzo`);

    } else if (action === 'reset_all_hp') {
      for (const pState of Object.values(gs.players)) {
        for (const card of pState.field) {
          if (card) card.currentHp = card.hp;
        }
        if (pState.artifactSlot) pState.artifactSlot.currentHp = pState.artifactSlot.hp;
      }
      results.push('[GM] HP di tutte le creature ripristinato');

    } else if (action === 'clear_all_markers') {
      for (const pState of Object.values(gs.players)) {
        for (const card of pState.field) {
          if (card?.markers) card.markers = { green: 0, red: 0, blue: 0, yellow: 0 };
        }
      }
      results.push('[GM] Tutti i marker rimossi dal campo');

    } else {
      return socket.emit('error_msg', 'Azione di gruppo non riconosciuta');
    }

    const publicGs = sanitiseGs(gs);
    io.to(roomCode).emit('gm_random_result', { results, gameState: publicGs });
  });

  // ── leave_match ───────────────────────────────────────────────────────────────

  socket.on('leave_match', () => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!room) return;

    if (gs?.players[username]) gs.players[username].status = 'left';

    socket.leave(roomCode);
    store.sockets.delete(socket.id);

    socket.emit('left_match');
    io.to(roomCode).emit('player_status_changed', { username, status: 'left' });
    io.to(roomCode).emit('player_left_match', { username });
  });
}

module.exports = { registerGameHandlers };
