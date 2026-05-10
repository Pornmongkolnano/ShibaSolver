const {
  USER_COOKIE,
  getSessionUser,
  readBearerOrCookie,
} = require("../services/sessionService");

function attachUser(req, user) {
  req.currentUser = user;
  req.user = {
    id: user.id,
    uid: user.id,
    role: user.role,
    status: user.status,
  };
}

exports.requireAuth = async (req, res, next) => {
  try {
    const token = readBearerOrCookie(req, USER_COOKIE);
    const user = await getSessionUser(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing or invalid session" },
      });
    }

    attachUser(req, user);
    next();
  } catch (err) {
    next(err);
  }
};

exports.optionalAuth = async (req, _res, next) => {
  try {
    const token = readBearerOrCookie(req, USER_COOKIE);
    const user = await getSessionUser(token);
    if (user) attachUser(req, user);
    next();
  } catch {
    next();
  }
};
