'use strict';

const router                  = require('express').Router();
const bcrypt                  = require('bcryptjs');
const { v4: uuidv4 }          = require('uuid');
const { users, sessions }     = require('../store');
const { authenticate }        = require('../middleware/auth');
const { BCRYPT_ROUNDS }       = require('../config');

// ── POST /api/register ────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username e password richiesti' });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: 'Username: 3–20 caratteri' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password troppo corta (min 4)' });
  if (users.has(username.toLowerCase()))
    return res.status(400).json({ error: 'Username già in uso' });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  users.set(username.toLowerCase(), { username, passwordHash, id: uuidv4() });

  const token = uuidv4();
  sessions.set(token, username);
  res.status(201).json({ token, username });
});

// ── POST /api/login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username?.toLowerCase());

  if (!user) return res.status(401).json({ error: 'Username o password errati' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Username o password errati' });

  const token = uuidv4();
  sessions.set(token, user.username);
  res.json({ token, username: user.username });
});

// ── POST /api/logout ──────────────────────────────────────────────────────────
router.post('/logout', authenticate, (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  sessions.delete(token);
  res.json({ ok: true });
});

module.exports = router;
