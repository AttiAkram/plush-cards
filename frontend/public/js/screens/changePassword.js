/**
 * Change-password screen — shown to users who must change their default password
 * before accessing the rest of the app (e.g. AdminRoot on first login).
 */

import { $, el }      from '../utils/dom.js';
import * as api       from '../api/client.js';
import { setState }   from '../state/store.js';
import { showScreen } from '../router/index.js';

// ── Exported navigation ───────────────────────────────────────────────────────

export function enterChangePassword() {
  $('cp-new-pass').value     = '';
  $('cp-confirm-pass').value = '';
  $('cp-error').textContent  = '';
  showScreen('changepass');
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initChangePasswordScreen() {
  $('form-change-password').addEventListener('submit', async e => {
    e.preventDefault();
    const newPassword = $('cp-new-pass').value;
    const confirm     = $('cp-confirm-pass').value;
    const errorEl     = $('cp-error');

    errorEl.textContent = '';

    if (newPassword.length < 4)
      return (errorEl.textContent = 'Password troppo corta (min 4)');
    if (newPassword !== confirm)
      return (errorEl.textContent = 'Le password non corrispondono');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled    = true;
    btn.textContent = 'Salvataggio…';

    try {
      const res = await api.post('/api/change-password', { newPassword });
      if (res.error) { errorEl.textContent = res.error; return; }

      setState({ mustChangePassword: false });
      localStorage.setItem('plush_mustchangepassword', 'false');

      // Lazy-import lobby to avoid circular deps at module parse time
      import('./lobby.js').then(({ enterLobby }) => enterLobby());
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Cambia password';
    }
  });
}
