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
 * The `deck` array stays server-side; clients only see `deckCount`.
 */
function sanitiseGs(gs) {
  const out = { ...gs, players: {} };
  for (const [uname, pState] of Object.entries(gs.players)) {
    const { deck, ...pub } = pState;   // eslint-disable-line no-unused-vars
    out.players[uname] = { ...pub, deckCount: pState.deck.length };
  }
  return out;
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

    // Natural draw for the new player (before their start-of-turn effects)
    const nextState  = gs.players[gs.currentTurn];
    const drawnUsers = new Set();
    if (nextState) {
      const drawn = nextState.deck.pop();
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

    // 1-plush-per-turn limit for personaggi
    if (card.type === 'personaggio' && (myState.plushPlayedThisTurn ?? 0) >= 1)
      return socket.emit('error_msg', 'Puoi giocare solo 1 personaggio per turno');

    if (slotIndex < 0 || slotIndex >= myState.field.length)
      return socket.emit('error_msg', 'Slot non valido');

    if (myState.field[slotIndex] !== null)
      return socket.emit('error_msg', 'Slot già occupato');

    const [playedCard] = myState.hand.splice(cardIdx, 1);
    playedCard.currentHp   = playedCard.hp;
    playedCard.haAttaccato = false;
    myState.field[slotIndex] = playedCard;

    if (playedCard.type === 'personaggio')
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

    const attackerIdx = myState.field.findIndex(c => c?.uid === attackerUid);
    if (attackerIdx === -1)
      return socket.emit('error_msg', 'Attaccante non trovato sul campo');
    const attacker = myState.field[attackerIdx];

    if (attacker.haAttaccato)
      return socket.emit('error_msg', 'Questa carta ha già attaccato questo turno');

    const targetIdx = enemyState.field.findIndex(c => c?.uid === targetUid);
    if (targetIdx === -1)
      return socket.emit('error_msg', 'Bersaglio non trovato sul campo');
    const target = enemyState.field[targetIdx];

    // Can only attack an artefatto if the enemy has no personaggi on their field
    if (target.type === 'artefatto') {
      const hasPersonaggi = enemyState.field.some(c => c !== null && c.type === 'personaggio');
      if (hasPersonaggi)
        return socket.emit('error_msg', 'Elimina prima tutti i personaggi nemici per attaccare un artefatto');
    }

    const results      = [];
    const dirtyPlayers = new Set();
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
      pendingDeaths.push({ card: attacker, username,       slotIndex: attackerIdx });
    if (target.currentHp   <= 0)
      pendingDeaths.push({ card: target,   username: targetUsername, slotIndex: targetIdx });

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
    myState.discard.push(card);
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
