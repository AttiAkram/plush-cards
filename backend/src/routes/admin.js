'use strict';

const router             = require('express').Router();
const bcrypt             = require('bcryptjs');
const { v4: uuidv4 }    = require('uuid');
const { users, cards }   = require('../store');
const { authenticate, requireRole } = require('../middleware/auth');
const { BCRYPT_ROUNDS }  = require('../config');

// ── GET /api/admin/users — list all users ─────────────────────────────────────
router.get('/users', authenticate, requireRole('root', 'admin'), (req, res) => {
  const list = Array.from(users.values()).map(u => ({
    username:  u.username,
    role:      u.role      ?? 'player',
    disabled:  u.disabled  ?? false,
  }));
  res.json(list);
});

// ── POST /api/admin/users — create a user with a specified role ───────────────
router.post('/users', authenticate, requireRole('root', 'admin'), async (req, res) => {
  const { username, password, role = 'admin' } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username e password richiesti' });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: 'Username: 3–20 caratteri' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password troppo corta (min 4)' });
  if (!['admin', 'player'].includes(role))
    return res.status(400).json({ error: 'Ruolo non valido (admin o player)' });
  if (users.has(username.toLowerCase()))
    return res.status(400).json({ error: 'Username già in uso' });

  // Only root can create admins; admins can only create players
  const requesterRole = req.user?.role ?? 'player';
  if (role === 'admin' && requesterRole !== 'root')
    return res.status(403).json({ error: 'Solo un AdminRoot può creare Admin' });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  users.set(username.toLowerCase(), {
    username, passwordHash, id: uuidv4(),
    role, mustChangePassword: true, disabled: false,
  });

  res.status(201).json({ ok: true, username, role });
});

// ── PATCH /api/admin/users/:username/role — change role (root only) ───────────
router.patch('/users/:username/role', authenticate, requireRole('root'), (req, res) => {
  const { role } = req.body;
  if (!['root', 'admin', 'player'].includes(role))
    return res.status(400).json({ error: 'Ruolo non valido' });

  const key  = req.params.username.toLowerCase();
  const user = users.get(key);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });

  // Prevent demoting the only root admin
  if (user.role === 'root' && role !== 'root') {
    const rootCount = Array.from(users.values()).filter(u => u.role === 'root').length;
    if (rootCount <= 1)
      return res.status(400).json({ error: 'Deve esistere almeno un AdminRoot' });
  }

  user.role = role;
  res.json({ ok: true, username: user.username, role });
});

// ── PATCH /api/admin/users/:username/disable — toggle disabled ────────────────
router.patch('/users/:username/disable', authenticate, requireRole('root', 'admin'), (req, res) => {
  const key  = req.params.username.toLowerCase();
  const user = users.get(key);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  if (user.role === 'root')
    return res.status(403).json({ error: 'Non puoi disabilitare un AdminRoot' });

  // Admins can only disable players, not other admins
  const requesterRole = req.user?.role ?? 'player';
  if (requesterRole === 'admin' && user.role === 'admin')
    return res.status(403).json({ error: 'Un Admin non può disabilitare un altro Admin' });

  user.disabled = !(user.disabled ?? false);
  res.json({ ok: true, username: user.username, disabled: user.disabled });
});

// ── GET /api/admin/cards — list all cards ─────────────────────────────────────
router.get('/cards', authenticate, requireRole('root', 'admin'), (req, res) => {
  res.json(Array.from(cards.values()));
});

// ── POST /api/admin/cards — create a new card ─────────────────────────────────
router.post('/cards', authenticate, requireRole('root', 'admin'), (req, res) => {
  const { id, name, damage, hp, rarity, type = 'personaggio', description = '', effects = [], tags = [], role = 'neutro' } = req.body;

  if (!id || !name)
    return res.status(400).json({ error: 'id e name sono obbligatori' });
  if (!/^[a-z0-9_-]+$/.test(id))
    return res.status(400).json({ error: 'id: solo lettere minuscole, numeri, _ e -' });
  if (cards.has(id))
    return res.status(400).json({ error: `id "${id}" già in uso` });
  if (!['personaggio', 'artefatto'].includes(type))
    return res.status(400).json({ error: 'type non valido' });
  if (!['comune', 'raro', 'epico', 'mitico', 'leggendario'].includes(rarity))
    return res.status(400).json({ error: 'rarity non valida' });

  const card = {
    id,
    name,
    damage:      Number(damage) || 0,
    hp:          Number(hp) || 1,
    rarity,
    type,
    active:      false,
    description,
    tags:        Array.isArray(tags) ? tags : [],
    role:        role || 'neutro',
    effects:     Array.isArray(effects) ? effects : [],
  };

  cards.set(id, card);
  res.status(201).json(card);
});

// ── PUT /api/admin/cards/:id — replace a card ─────────────────────────────────
router.put('/cards/:id', authenticate, requireRole('root', 'admin'), (req, res) => {
  const card = cards.get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Carta non trovata' });

  const { name, damage, hp, rarity, type, description, effects, active, tags, role } = req.body;
  if (name        !== undefined) card.name        = name;
  if (damage      !== undefined) card.damage      = Number(damage) || 0;
  if (hp          !== undefined) card.hp          = Number(hp) || 1;
  if (rarity      !== undefined) card.rarity      = rarity;
  if (type        !== undefined) card.type        = type;
  if (description !== undefined) card.description = description;
  if (effects     !== undefined) card.effects     = Array.isArray(effects) ? effects : [];
  if (active      !== undefined) card.active      = Boolean(active);
  if (tags        !== undefined) card.tags        = Array.isArray(tags) ? tags : [];
  if (role        !== undefined) card.role        = role || 'neutro';

  res.json(card);
});

// ── PATCH /api/admin/cards/:id/toggle — flip active flag ─────────────────────
router.patch('/cards/:id/toggle', authenticate, requireRole('root', 'admin'), (req, res) => {
  const card = cards.get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Carta non trovata' });
  card.active = !card.active;
  res.json({ ok: true, id: card.id, active: card.active });
});

module.exports = router;
