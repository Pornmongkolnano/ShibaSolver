const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const prisma = require("../lib/prisma");
const {
  USER_COOKIE,
  clearSessionCookie,
  createSession,
  readBearerOrCookie,
  revokeToken,
  setSessionCookie,
} = require("../services/sessionService");
const { publicUser } = require("../utils/userPresenter");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
  const value = String(username || "").trim();
  return value.length > 0 ? value : null;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

async function issueUserSession(req, res, user, statusCode = 200, extra = {}) {
  const session = await createSession(user, req);
  setSessionCookie(res, USER_COOKIE, session.token, session.maxAge);

  return res.status(statusCode).json({
    success: true,
    ...extra,
    data: publicUser(user),
  });
}

exports.registerWithPassword = async (req, res, next) => {
  try {
    const {
      email: rawEmail,
      password,
      username,
      displayName,
      avatarUrl,
    } = req.body || {};
    const email = normalizeEmail(rawEmail);

    if (!email || !validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REGISTER_PAYLOAD",
          message: "Valid email and password of at least 8 characters are required",
        },
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: "EMAIL_IN_USE", message: "Email is already registered" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        username: normalizeUsername(username),
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        identities: {
          create: {
            provider: "PASSWORD",
            providerUserId: email,
            passwordHash,
          },
        },
      },
    });

    return issueUserSession(req, res, user, 201, { new_user: true });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: {
          code: "UNIQUE_CONSTRAINT",
          message: "Email or username is already in use",
        },
      });
    }
    next(err);
  }
};

exports.loginWithPassword = async (req, res, next) => {
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

    if (!identity || !ok || identity.user.status !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
      });
    }

    return issueUserSession(req, res, identity.user);
  } catch (err) {
    next(err);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        error: {
          code: "GOOGLE_AUTH_NOT_CONFIGURED",
          message: "GOOGLE_CLIENT_ID is not configured",
        },
      });
    }

    const { id_token } = req.body || {};
    if (!id_token) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "id_token is required" },
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload.email);

    if (!payload.email_verified || !email || !payload.sub) {
      return res.status(401).json({
        success: false,
        error: {
          code: "EMAIL_NOT_VERIFIED",
          message: "Google email is not verified",
        },
      });
    }

    const existingIdentity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: "GOOGLE",
          providerUserId: payload.sub,
        },
      },
      include: { user: true },
    });

    if (existingIdentity) {
      const user = await prisma.user.update({
        where: { id: existingIdentity.userId },
        data: {
          email,
          displayName: existingIdentity.user.displayName || payload.name || null,
          avatarUrl: payload.picture || existingIdentity.user.avatarUrl || null,
        },
      });
      return issueUserSession(req, res, user, 200, { new_user: false });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            displayName: existingUser.displayName || payload.name || null,
            avatarUrl: payload.picture || existingUser.avatarUrl || null,
            identities: {
              create: {
                provider: "GOOGLE",
                providerUserId: payload.sub,
              },
            },
          },
        })
      : await prisma.user.create({
          data: {
            email,
            displayName: payload.name || null,
            avatarUrl: payload.picture || null,
            identities: {
              create: {
                provider: "GOOGLE",
                providerUserId: payload.sub,
              },
            },
          },
        });

    return issueUserSession(req, res, user, existingUser ? 200 : 201, {
      new_user: !existingUser,
    });
  } catch (err) {
    if (err.message?.includes("Wrong recipient")) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_ID_TOKEN", message: "Invalid Google id_token" },
      });
    }
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = readBearerOrCookie(req, USER_COOKIE);
    await revokeToken(token);
    clearSessionCookie(res, USER_COOKIE);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: publicUser(req.currentUser),
  });
};
