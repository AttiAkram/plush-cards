'use strict';

const store              = require('../../store');
const { initGameState }  = require('../../game/state');
const { executeEffects } = require('../../game/effects');

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

  // Sanitise gs for broadcast: strip server-only deck array
  const publicGs = sanitiseGs(gs);

  io.to(roomCode).emit('effects_applied', { results, gameState: publicGs });

  for (const username of dirtyPlayers) {
    const sid = findSocketId(username);
    if (sid) {
      io.to(sid).emit('hand_updated', { hand: gs.players[username].hand });
    }
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

    // Fire end-of-turn effects for all field cards of the current player
    const { results: endResults, dirtyPlayers: endDirty } =
      executeEffects(gs, username, 'ALL_FINE_TURNO');

    // Advance turn
    const idx      = gs.turnOrder.indexOf(username);
    const nextIdx  = (idx + 1) % gs.turnOrder.length;
    if (nextIdx === 0) gs.turnNumber += 1;
    gs.currentTurn = gs.turnOrder[nextIdx];

    // Fire start-of-turn effects for the new current player
    const { results: startResults, dirtyPlayers: startDirty } =
      executeEffects(gs, gs.currentTurn, 'ALL_INIZIO_TURNO');

    const allResults     = [...endResults, ...startResults];
    const allDirty       = new Set([...endDirty, ...startDirty]);

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

    if (slotIndex < 0 || slotIndex >= myState.field.length)
      return socket.emit('error_msg', 'Slot non valido');

    if (myState.field[slotIndex] !== null)
      return socket.emit('error_msg', 'Slot già occupato');

    const [card] = myState.hand.splice(cardIdx, 1);
    // Track current HP on the card instance
    card.currentHp = card.hp;
    myState.field[slotIndex] = card;

    io.to(roomCode).emit('card_played', {
      playerId:  username,
      cardUid,
      slotIndex,
      card,
    });

    // Updated hand goes only to the player who played
    socket.emit('hand_updated', { hand: myState.hand });

    // Fire QUANDO_GIOCATA effects
    const { results, dirtyPlayers } =
      executeEffects(gs, username, 'QUANDO_GIOCATA', card);

    broadcastEffects(io, socket, roomCode, gs, results, dirtyPlayers);
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
