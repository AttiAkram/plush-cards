/**
 * HTTP API client — thin wrapper around fetch.
 * Automatically attaches the Bearer token from the store.
 */

import { getState }    from '../state/store.js';
import { BACKEND_URL } from '../config.js';

/** @returns {HeadersInit} */
function authHeaders() {
  const { token } = getState();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    // Normalise HTTP error codes into { error } shape
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
    return await res.json();
  } catch {
    return { error: 'Impossibile raggiungere il server. Riprova.' };
  }
}
