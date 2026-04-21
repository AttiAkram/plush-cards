'use strict';

const express               = require('express');
const http                  = require('http');
const { createSocketServer }          = require('./src/socket');
const routes                          = require('./src/routes');
const { PORT, NODE_ENV, FRONTEND_URL } = require('./src/config');

const app    = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());

// CORS — allow the Vercel frontend (and any origin in dev)
app.use((req, res, next) => {
  const origin = FRONTEND_URL === '*' ? '*' : FRONTEND_URL;
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── WebSocket ──────────────────────────────────────────────────────────────────
createSocketServer(server);

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[plush-backend] running in ${NODE_ENV} mode on :${PORT}`);
});
