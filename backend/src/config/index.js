'use strict';

/**
 * Centralised application configuration.
 * Values are read from environment variables with safe defaults.
 */
module.exports = {
  PORT:             parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV:         process.env.NODE_ENV || 'development',

  // CORS — set FRONTEND_URL on Railway to your Vercel domain, e.g.:
  //   https://plush-cards.vercel.app
  // Leave empty to allow all origins (fine during development).
  FRONTEND_URL:     process.env.FRONTEND_URL || '*',

  // Auth
  BCRYPT_ROUNDS:    10,

  // Room
  ROOM_MAX_PLAYERS: 4,
  ROOM_CODE_LENGTH: 6,

  // Game
  HAND_SIZE:        3,
  NEXUS_HP:         30,
  FIELD_SIZE:       3,
};
