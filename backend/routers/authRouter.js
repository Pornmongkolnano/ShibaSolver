const express = require("express");
const {
  getMe,
  googleLogin,
  loginWithPassword,
  logout,
  registerWithPassword,
} = require("../controllers/authController");
const { requireAuth} = require("../middleware/auth");
const router = express.Router();

router.post("/register", registerWithPassword);
router.post("/login", loginWithPassword);
router.post("/google", googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

module.exports = router;
