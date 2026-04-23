/**
 * Toast notification component.
 * Uses a single #toast element defined in index.html.
 * Supports manual close via the ✕ button.
 */

import { $ } from '../utils/dom.js';

const DURATION_MS = 3800;
let _timer = null;

function dismissToast() {
  clearTimeout(_timer);
  $('toast').className = 'toast';
}

/**
 * Show a transient notification.
 * @param {string}  message
 * @param {boolean} [isError=false]
 */
export function showToast(message, isError = false) {
  const toast = $('toast');

  toast.innerHTML = '';
  const text = document.createElement('span');
  text.className   = 'toast-text';
  text.textContent = message;
  const close = document.createElement('button');
  close.className   = 'toast-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Chiudi');
  close.addEventListener('click', dismissToast);
  toast.appendChild(text);
  toast.appendChild(close);

  toast.className = `toast show${isError ? ' toast--error' : ''}`;

  clearTimeout(_timer);
  _timer = setTimeout(dismissToast, DURATION_MS);
}
