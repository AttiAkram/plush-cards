/**
 * Centralised application state.
 *
 * Kept intentionally minimal — just a plain object + getters/setters.
 * For a larger app this could be replaced with a reactive library,
 * but the pattern stays the same.
 */

const _state = {
  /** @type {string|null} */
  token:     null,
  /** @type {string|null} */
  username:  null,
  /** @type {object|null} */
  room:      null,
  /** @type {object|null} */
  gameState: null,
};

// The socket instance is kept separately (not serialisable / not reactive)
/** @type {import('socket.io-client').Socket|null} */
let _socket = null;

/** Returns a shallow copy of the current state. */
export function getState() { return { ..._state }; }

/**
 * Merge a partial patch into the state.
 * @param {Partial<typeof _state>} patch
 */
export function setState(patch) { Object.assign(_state, patch); }

/** @returns {import('socket.io-client').Socket|null} */
export function getSocket() { return _socket; }

/** @param {import('socket.io-client').Socket} socket */
export function setSocket(socket) { _socket = socket; }
