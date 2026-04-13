'use strict';

const express               = require('express');
const http                  = require('http');
const { createSocketServer } = require('./src/socket');
const routes                = require('./src/routes');
const { PORT, NODE_ENV }    = require('./src/config');

const app    = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── WebSocket ──────────────────────────────────────────────────────────────────
createSocketServer(server);

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[plush-backend] running in ${NODE_ENV} mode on :${PORT}`);
});
