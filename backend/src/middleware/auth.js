'use strict';

const { sessions } = require('../store');

/**
 * Express middleware — validates the `Authorization: Bearer <token>` header.
 * Attaches `req.username` on success; returns 401 on failure.
 *
 * @type {import('express').RequestHandler}
 */
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  req.username = sessions.get(token);
  next();
}

module.exports = { authenticate };
