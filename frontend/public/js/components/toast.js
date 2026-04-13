/**
 * Toast notification component.
 * Uses a single #toast element defined in index.html.
 */

import { $ } from '../utils/dom.js';

const DURATION_MS = 3200;
let _timer = null;

/**
 * Show a transient notification.
 * @param {string}  message
 * @param {boolean} [isError=false]
 */
export function showToast(message, isError = false) {
  const toast = $('toast');

  toast.textContent = message;
  toast.className   = `toast show${isError ? ' toast--error' : ''}`;

  clearTimeout(_timer);
  _timer = setTimeout(() => { toast.className = 'toast'; }, DURATION_MS);
}
