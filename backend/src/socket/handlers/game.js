'use strict';

const store                              = require('../../store');
const { initGameState }                  = require('../../game/state');
const { executeEffects, processPendingDeaths } = require('../../game/effects');

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
  // Accepts optional { debug: true } to allow single-player debug mode (admin/root only).

  socket.on('start_game', ({ debug = false } = {}) => {
    const { room, roomCode } = getRoomAndState();
    if (!room) return;

    if (room.host !== username)
      return socket.emit('error_msg', 'Solo il host può iniziare la partita');

    const debugAllowed = debug && isAdminUser(username);

    if (room.players.length < 2 && !debugAllowed)
      return socket.emit('error_msg', 'Servono almeno 2 giocatori per iniziare');

    // All non-host players must be ready (unless debug mode)
    if (!debugAllowed) {
      const allReady = room.players.every(p => room.ready[p.username]);
      if (!allReady)
        return socket.emit('error_msg', 'Non tutti i giocatori sono pronti');
    }

    room.status    = 'playing';
    room.gameState = initGameState(room);
    if (debugAllowed) room.gameState.debugMode = true;

    io.to(roomCode).emit('game_started', sanitiseGs(room.gameState));
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

    if (gs.currentTurn !== username)
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

    // 1-plush-per-turn limit
    if ((myState.plushPlayedThisTurn ?? 0) >= 1)
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

    if (gs.currentTurn !== username)
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

    if (attacker.haAttaccato)
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
    if (target.currentHp <= 0) {
      if (isArtifact) {
        // Artifact destroyed — remove from slot, push to global discard
        enemyState.artifactSlot = null;
        gs.discard.push({ ...target, owner: targetUsername });
        results.push(`${target.name} è stato distrutto!`);
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
  });

  // ── discard_card ─────────────────────────────────────────────────────────────

  socket.on('discard_card', ({ cardUid }) => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    if (gs.currentTurn !== username)
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
