/**
 * Auth screen — login & registration forms.
 */

import { $, qsa }      from '../utils/dom.js';
import * as api         from '../api/client.js';
import { setState }     from '../state/store.js';
import { showScreen }   from '../router/index.js';
import { enterLobby }   from './lobby.js';
import { enterChangePassword } from './changePassword.js';

// ── Session helpers ────────────────────────────────────────────────────────────

export function saveSession(token, username, role = 'player', mustChangePassword = false) {
  setState({ token, username, role, mustChangePassword });
  localStorage.setItem('plush_token',              token);
  localStorage.setItem('plush_username',           username);
  localStorage.setItem('plush_role',               role);
  localStorage.setItem('plush_mustchangepassword', String(mustChangePassword));
}

export function clearSession() {
  setState({ token: null, username: null, role: null, mustChangePassword: false, room: null, gameState: null });
  localStorage.removeItem('plush_token');
  localStorage.removeItem('plush_username');
  localStorage.removeItem('plush_role');
  localStorage.removeItem('plush_mustchangepassword');
}

// ── Error display ──────────────────────────────────────────────────────────────

function showError(message, id = 'auth-error') {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function clearError() {
  ['auth-error', 'auth-error-reg'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = '';
  });
}

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

    if (!username || !password) return showError('Compila tutti i campi', 'auth-error');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Accesso in corso...';

    try {
      const res = await api.post('/api/login', { username, password });
      if (res.error) return showError(res.error, 'auth-error');
      saveSession(res.token, res.username, res.role, res.mustChangePassword);
      res.mustChangePassword ? enterChangePassword() : enterLobby();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Accedi';
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

    if (!username || !password) return showError('Compila tutti i campi', 'auth-error-reg');
    if (password !== confirm)   return showError('Le password non corrispondono', 'auth-error-reg');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Registrazione in corso...';

    try {
      const res = await api.post('/api/register', { username, password });
      if (res.error) return showError(res.error, 'auth-error-reg');
      saveSession(res.token, res.username, res.role, res.mustChangePassword);
      enterLobby();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Registrati';
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
