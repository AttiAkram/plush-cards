'use strict';

const store              = require('../../store');
const { initGameState }  = require('../../game/state');

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

  socket.on('start_game', () => {
    const { room, roomCode } = getRoomAndState();
    if (!room) return;

    if (room.host !== username)
      return socket.emit('error_msg', 'Solo il host può iniziare la partita');
    if (room.players.length < 2)
      return socket.emit('error_msg', 'Servono almeno 2 giocatori per iniziare');

    room.status    = 'playing';
    room.gameState = initGameState(room);

    io.to(roomCode).emit('game_started', room.gameState);
  });

  // ── end_turn ─────────────────────────────────────────────────────────────────

  socket.on('end_turn', () => {
    const { room, roomCode, gs } = getRoomAndState();
    if (!gs) return;

    if (gs.currentTurn !== username)
      return socket.emit('error_msg', 'Non è il tuo turno');

    const idx     = gs.turnOrder.indexOf(username);
    const nextIdx = (idx + 1) % gs.turnOrder.length;
    if (nextIdx === 0) gs.turnNumber += 1;
    gs.currentTurn = gs.turnOrder[nextIdx];

    io.to(roomCode).emit('turn_changed', {
      currentTurn: gs.currentTurn,
      turnNumber:  gs.turnNumber,
    });
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
    myState.field[slotIndex] = card;

    io.to(roomCode).emit('card_played', {
      playerId:  username,
      cardUid,
      slotIndex,
      card,
    });

    // Updated hand only goes to the player who played
    socket.emit('hand_updated', { hand: myState.hand });
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
