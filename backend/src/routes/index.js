'use strict';

const router      = require('express').Router();
const authRoutes  = require('./auth');
const roomRoutes  = require('./rooms');
const adminRoutes = require('./admin');

router.use(authRoutes);
router.use(roomRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
