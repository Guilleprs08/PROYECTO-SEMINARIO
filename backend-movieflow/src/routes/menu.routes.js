// src/routes/menu.routes.js
const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menu.controller');

router.get('/menu/:role_id', menuController.getMenuByRole);

module.exports = router;
