const crypto = require("crypto");
const prisma = require("../lib/prisma");

const USER_COOKIE = "ss_token";
const ADMIN_COOKIE = "admin_access_token";

function parseDurationMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  if (/^\d+$/.test(value)) return Number(value) * 1000;

  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

function sessionTtlMs() {
  return parseDurationMs(
    process.env.SESSION_EXPIRES_IN || process.env.JWT_EXPIRES_IN,
    7 * 24 * 60 * 60 * 1000
  );
}

function cookieOptions(maxAge = sessionTtlMs()) {
  const isProd = (process.env.NODE_ENV || "development") === "production";

  return {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    domain: isProd ? process.env.COOKIE_DOMAIN || undefined : undefined,
    path: "/",
    maxAge,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function createSession(user, req) {
  const token = createRawToken();
  const maxAge = sessionTtlMs();
  const expiresAt = new Date(Date.now() + maxAge);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null,
      expiresAt,
    },
  });

  return { token, expiresAt, maxAge };
}

async function getSessionUser(token) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (session.user.status !== "ACTIVE" || session.user.deletedAt) {
    return null;
  }

  return session.user;
}

async function revokeToken(token) {
  if (!token) return;

  await prisma.session
    .update({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}

function readBearerOrCookie(req, cookieName) {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return req.cookies?.[cookieName] || null;
}

function setSessionCookie(res, cookieName, token, maxAge) {
  res.cookie(cookieName, token, cookieOptions(maxAge));
}

function clearSessionCookie(res, cookieName) {
  res.cookie(cookieName, "", cookieOptions(0));
}

module.exports = {
  ADMIN_COOKIE,
  USER_COOKIE,
  clearSessionCookie,
  createSession,
  getSessionUser,
  readBearerOrCookie,
  revokeToken,
  setSessionCookie,
};
