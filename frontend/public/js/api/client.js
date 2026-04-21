/**
 * HTTP API client — thin wrapper around fetch.
 * Automatically attaches the Bearer token from the store.
 * On 401 it emits auth:unauthorized so the app can redirect to login.
 */

import { getState }    from '../state/store.js';
import { BACKEND_URL } from '../config.js';
import { emit }        from '../events/emitter.js';

/** @returns {HeadersInit} */
function authHeaders() {
  const { token } = getState();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Signal session expiry once; debounced so multiple 401s don't stack. */
let _unauthorizedPending = false;
function handleUnauthorized() {
  if (_unauthorizedPending) return;
  _unauthorizedPending = true;
  // Allow current call stack to finish before redirecting
  setTimeout(() => {
    _unauthorizedPending = false;
    emit('auth:unauthorized');
  }, 0);
}

/**
 * POST to a JSON API endpoint.
 * @template T
 * @param {string} path
 * @param {object} body
 * @returns {Promise<T>}
 */
export async function post(path, body = {}) {
  try {
    const res  = await fetch(BACKEND_URL + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return data; }
    if (!res.ok && !data.error) data.error = `Errore ${res.status}`;
    return data;
  } catch {
    return { error: 'Impossibile raggiungere il server. Riprova.' };
  }
}

/**
 * PATCH a JSON API endpoint.
 * @template T
 * @param {string} path
 * @param {object} body
 * @returns {Promise<T>}
 */
export async function patch(path, body = {}) {
  try {
    const res  = await fetch(BACKEND_URL + path, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return data; }
    if (!res.ok && !data.error) data.error = `Errore ${res.status}`;
    return data;
  } catch {
    return { error: 'Impossibile raggiungere il server. Riprova.' };
  }
}

/**
 * PUT a JSON API endpoint.
 * @template T
 * @param {string} path
 * @param {object} body
 * @returns {Promise<T>}
 */
export async function put(path, body = {}) {
  try {
    const res  = await fetch(BACKEND_URL + path, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 401) { handleUnauthorized(); return data; }
    if (!res.ok && !data.error) data.error = `Errore ${res.status}`;
    return data;
  } catch {
    return { error: 'Impossibile raggiungere il server. Riprova.' };
  }
}

/**
 * GET a JSON API endpoint.
 * @template T
 * @param {string} path
 * @returns {Promise<T>}
 */
export async function get(path) {
  try {
    const res = await fetch(BACKEND_URL + path, { headers: authHeaders() });
    if (res.status === 401) { handleUnauthorized(); return { error: 'Sessione scaduta' }; }
    return await res.json();
  } catch {
    return { error: 'Impossibile raggiungere il server. Riprova.' };
  }
}
