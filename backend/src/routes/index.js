'use strict';

const router     = require('express').Router();
const authRoutes = require('./auth');
const roomRoutes = require('./rooms');

router.use(authRoutes);
router.use(roomRoutes);

module.exports = router;
