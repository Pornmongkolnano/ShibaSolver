const {
  ADMIN_COOKIE,
  getSessionUser,
  readBearerOrCookie,
} = require("../services/sessionService");

async function adminProtect(req, res, next) {
  try {
    const token = readBearerOrCookie(req, ADMIN_COOKIE);
    const user = await getSessionUser(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      });
    }

    if (user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Admin role required" },
      });
    }

    req.currentUser = user;
    req.admin = {
      id: user.id,
      admin_id: user.id,
      role: user.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { adminProtect };
