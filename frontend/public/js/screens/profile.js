/**
 * Profile screen — shows username, role, and quick-access actions.
 */

import { $, escHtml }    from '../utils/dom.js';
import { getState }      from '../state/store.js';
import { showScreen }    from '../router/index.js';
import { enterChangePassword } from './changePassword.js';

const ROLE_LABELS = { root: 'AdminRoot', admin: 'Admin', player: 'Player' };

// ── Navigation ────────────────────────────────────────────────────────────────

export function enterProfile() {
  const { username, role } = getState();

  $('profile-avatar-lg').textContent  = (username?.[0] ?? '?').toUpperCase();
  $('profile-name-text').textContent  = username ?? '—';
  $('profile-role-badge').textContent = ROLE_LABELS[role] ?? role ?? 'Player';
  $('profile-role-badge').className   = `role-badge role-${role ?? 'player'}`;

  // Show admin button only for admin/root
  const isAdmin = role === 'root' || role === 'admin';
  $('btn-profile-to-admin').classList.toggle('hidden', !isAdmin);

  showScreen('profile');
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initProfileScreen() {
  $('btn-back-profile').addEventListener('click', () => {
    import('./lobby.js').then(({ enterLobby }) => enterLobby());
  });

  $('btn-changepass-profile').addEventListener('click', () => enterChangePassword());

  $('btn-profile-to-admin').addEventListener('click', () => {
    import('./adminPanel.js').then(({ enterAdmin }) => enterAdmin());
  });
}
