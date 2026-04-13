/**
 * Minimal synchronous event emitter used as an in-process message bus.
 *
 * The socket client emits events here;
 * screens subscribe here — so neither module imports the other.
 *
 * @example
 * // publisher
 * import { emit } from '../events/emitter.js';
 * emit('socket:room_created', room);
 *
 * // subscriber
 * import { on } from '../events/emitter.js';
 * on('socket:room_created', room => renderRoom(room));
 */

/** @type {Map<string, Function[]>} */
const _listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string}   event
 * @param {Function} handler
 */
export function on(event, handler) {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event).push(handler);
}

/**
 * Unsubscribe a previously registered handler.
 * @param {string}   event
 * @param {Function} handler
 */
export function off(event, handler) {
  if (!_listeners.has(event)) return;
  _listeners.set(event, _listeners.get(event).filter(h => h !== handler));
}

/**
 * Emit an event, calling all registered handlers synchronously.
 * @param {string} event
 * @param {...any}  args
 */
export function emit(event, ...args) {
  _listeners.get(event)?.forEach(h => h(...args));
}
