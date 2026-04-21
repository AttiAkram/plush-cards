'use strict';

const { sessions, users } = require('../store');

/**
 * Express middleware — validates the `Authorization: Bearer <token>` header.
 * Attaches `req.username` and `req.user` on success; returns 401 on failure.
 *
 * @type {import('express').RequestHandler}
 */
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  const username = sessions.get(token);
  req.username = username;
  req.user     = users.get(username.toLowerCase());
  next();
}

/**
 * Middleware factory — requires the authenticated user to have one of the
 * specified roles. Must be used after `authenticate`.
 *
 * @param {...('root'|'admin'|'player')} roles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
