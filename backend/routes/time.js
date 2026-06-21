const express = require('express');
const router = express.Router();
const { getUaeTime } = require('../controllers/timeController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getUaeTime);

module.exports = router;
