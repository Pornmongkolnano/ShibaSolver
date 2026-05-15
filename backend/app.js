const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { xss } = require("express-xss-sanitizer");
const helmet = require("helmet");
const hpp = require("hpp");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./docs/openapi");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const adminAuthRouter = require("./routers/adminAuthRouter");
const adminsRouter = require("./routers/adminsRouter");
const usersRouter = require("./routers/usersRouter");
const postsRouter = require("./routers/postsRouter");
const feedRouter = require("./routers/feedRouter");
const authRouter = require("./routers/authRouter");
const commentsRouter = require("./routers/commentsRouter");
const ratingRouter = require("./routers/ratingRouter");
const reportRouter = require("./routers/reportRouter");
const searchRouter = require("./routers/searchRouter");
const notificationRouter = require("./routers/notificationRouter");

const SERVICE_NAME = "shibasolver-api";

function createApp({ pool } = {}) {
  const app = express();

  if (pool) {
    app.locals.pool = pool;
  }

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );

  const adminLoginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { success: false, message: "Too many login attempts, try later." },
  });
  app.use("/api/v1/adminAuth/login", adminLoginLimiter);
  app.use(xss());
  app.use(hpp());

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));
  app.get("/api-docs.json", (_req, res) => {
    res.json(swaggerDocument);
  });

  app.get("/", (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome to ShibaSolver API",
    });
  });

  app.get("/health", async (req, res) => {
    const db = req.app.locals.pool;

    if (!db || typeof db.query !== "function") {
      return res.status(503).json({
        success: false,
        status: "unavailable",
        service: SERVICE_NAME,
        error: {
          code: "DATABASE_POOL_UNAVAILABLE",
          message: "Database pool is not initialized",
        },
      });
    }

    try {
      await db.query("SELECT 1");
      return res.status(200).json({
        success: true,
        status: "ok",
        service: SERVICE_NAME,
      });
    } catch (_err) {
      return res.status(503).json({
        success: false,
        status: "unavailable",
        service: SERVICE_NAME,
        error: {
          code: "DATABASE_HEALTH_CHECK_FAILED",
          message: "Database health check failed",
        },
      });
    }
  });

  app.use("/api/v1/adminAuth", adminAuthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/admins", adminsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/posts", postsRouter);
  app.use("/api/v1/feeds", feedRouter);
  app.use("/api/v1/comments", commentsRouter);
  app.use("/api/v1/ratings", ratingRouter);
  app.use("/api/v1/reports", reportRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/search", searchRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
