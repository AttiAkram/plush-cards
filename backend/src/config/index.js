'use strict';

/**
 * Centralised application configuration.
 * Values are read from environment variables with safe defaults.
 */
module.exports = {
  PORT:             parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV:         process.env.NODE_ENV || 'development',

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
