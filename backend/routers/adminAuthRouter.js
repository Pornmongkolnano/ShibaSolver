const express = require('express');
const {
  getAdminMe,
  loginAdmin,
  logoutAdmin,
} = require('../controllers/adminAuthController');
const { adminProtect } = require('../middleware/adminAuth');
const router = express.Router();

router.post('/login', loginAdmin);
router.post('/logout', adminProtect, logoutAdmin);
router.get('/me', adminProtect, getAdminMe);

module.exports = router;
