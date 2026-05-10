const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const {
  ADMIN_COOKIE,
  clearSessionCookie,
  createSession,
  readBearerOrCookie,
  revokeToken,
  setSessionCookie,
} = require("../services/sessionService");
const { publicAdmin } = require("../utils/userPresenter");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

exports.loginAdmin = async (req, res, next) => {
  try {
    const { email: rawEmail, password } = req.body || {};
    const email = normalizeEmail(rawEmail);

    if (!email || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_LOGIN_PAYLOAD", message: "Email and password are required" },
      });
    }

    const identity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: "PASSWORD",
          providerUserId: email,
        },
      },
      include: { user: true },
    });

    const ok =
      identity?.passwordHash &&
      (await bcrypt.compare(password, identity.passwordHash));

    if (
      !identity ||
      !ok ||
      identity.user.role !== "ADMIN" ||
      identity.user.status !== "ACTIVE"
    ) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
      });
    }

    const session = await createSession(identity.user, req);
    setSessionCookie(res, ADMIN_COOKIE, session.token, session.maxAge);

    return res.json({
      success: true,
      token: session.token,
      data: publicAdmin(identity.user),
    });
  } catch (err) {
    next(err);
  }
};

exports.logoutAdmin = async (req, res, next) => {
  try {
    const token = readBearerOrCookie(req, ADMIN_COOKIE);
    await revokeToken(token);
    clearSessionCookie(res, ADMIN_COOKIE);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getAdminMe = async (req, res) => {
  return res.json({
    success: true,
    data: publicAdmin(req.currentUser),
  });
};
