'use strict';

const router           = require('express').Router();
const { rooms }        = require('../store');
const { authenticate } = require('../middleware/auth');

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (_, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

// ── GET /api/rooms ────────────────────────────────────────────────────────────
router.get('/rooms', authenticate, (req, res) => {
  const available = [];

  rooms.forEach(room => {
    if (!room.isPlaying() && !room.isFull()) {
      available.push(room.toJSON());
    }
  });

  res.json(available);
});

module.exports = router;
