const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../../controllers/auth/verifyAdmin.controller');

router.post('/verify-admin', verifyAdmin);

module.exports = router;
