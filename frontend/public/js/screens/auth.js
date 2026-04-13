/**
 * Auth screen — login & registration forms.
 */

import { $, qsa }      from '../utils/dom.js';
import * as api         from '../api/client.js';
import { setState }     from '../state/store.js';
import { showScreen }   from '../router/index.js';
import { enterLobby }   from './lobby.js';

// ── Session helpers ────────────────────────────────────────────────────────────

export function saveSession(token, username) {
  setState({ token, username });
  localStorage.setItem('plush_token',    token);
  localStorage.setItem('plush_username', username);
}

export function clearSession() {
  setState({ token: null, username: null, room: null, gameState: null });
  localStorage.removeItem('plush_token');
  localStorage.removeItem('plush_username');
}

// ── Error display ──────────────────────────────────────────────────────────────

function showError(message) {
  const el = $('auth-error');
  el.textContent = message;
  // Re-trigger animation by toggling the class
  el.classList.remove('shake');
  void el.offsetWidth; // reflow
  el.classList.add('shake');
}

function clearError() { $('auth-error').textContent = ''; }

// ── Tab switching ──────────────────────────────────────────────────────────────

function initTabs() {
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      qsa('.tab-btn').forEach(b => b.classList.remove('active'));
      qsa('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + tab).classList.add('active');
      clearError();
    });
  });
}

// ── Login form ─────────────────────────────────────────────────────────────────

function initLoginForm() {
  $('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;

    if (!username || !password) return showError('Compila tutti i campi');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Accesso...';

    try {
      const res = await api.post('/api/login', { username, password });
      if (res.error) return showError(res.error);
      saveSession(res.token, res.username);
      enterLobby();
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Accedi';
    }
  });
}

// ── Register form ──────────────────────────────────────────────────────────────

function initRegisterForm() {
  $('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('reg-user').value.trim();
    const password = $('reg-pass').value;
    const confirm  = $('reg-pass2').value;

    if (!username || !password) return showError('Compila tutti i campi');
    if (password !== confirm)   return showError('Le password non corrispondono');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Registrazione...';

    try {
      const res = await api.post('/api/register', { username, password });
      if (res.error) return showError(res.error);
      saveSession(res.token, res.username);
      enterLobby();
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Inizia l'Avventura";
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Register all auth screen event listeners. Call once at app startup. */
export function initAuthScreen() {
  initTabs();
  initLoginForm();
  initRegisterForm();
}

/** Navigate to the auth screen and reset form state. */
export function enterAuth() {
  $('login-user').value = '';
  $('login-pass').value = '';
  clearError();
  showScreen('auth');
}
