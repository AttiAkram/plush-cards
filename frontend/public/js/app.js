/**
 * app.js — Entry point.
 *
 * Initialises all screen modules (registers their event listeners once),
 * then routes to the correct screen based on persisted session data.
 */

import { initAuthScreen, enterAuth } from './screens/auth.js';
import { initLobbyScreen, enterLobby } from './screens/lobby.js';
import { initRoomScreen }              from './screens/room.js';
import { initGameScreen }              from './screens/game.js';
import { setState }                    from './state/store.js';

// ── Bootstrap all screens (one-time listener registration) ────────────────────

initAuthScreen();
initLobbyScreen();
initRoomScreen();
initGameScreen();

// ── Session restore ────────────────────────────────────────────────────────────

const token    = localStorage.getItem('plush_token');
const username = localStorage.getItem('plush_username');

if (token && username) {
  setState({ token, username });
  enterLobby();
} else {
  enterAuth();
}
