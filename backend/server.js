const express = require("express");
const { loadEnv, requiredEnv } = require("./config/env");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const rateLimit = require('express-rate-limit');
const { xss } = require("express-xss-sanitizer");
const helmet = require("helmet");
const hpp = require("hpp");
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/openapi');

loadEnv();
requiredEnv(["DATABASE_URL", "JWT_SECRET"]);

const adminAuthRouter = require('./routers/adminAuthRouter');
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

const app = express();
//Set security headers
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
  message: { success: false, message: 'Too many login attempts, try later.' }
});
app.use('/api/v1/adminAuth/login', adminLoginLimiter);
//Prevent XSS attacks
app.use(xss());
//Prevent http param pollutions
app.use(hpp());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));
app.get('/api-docs.json', (_req, res) => {
  res.json(swaggerDocument);
});

(async () => {
  const pool = await connectDB();
  app.locals.pool = pool;
  app.get("/", (req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome to ShibaSolver API",
    });
  });

  app.get("/health", async (req, res, next) => {
    try {
      await req.app.locals.pool.query("SELECT 1");
      res.status(200).json({
        success: true,
        status: "ok",
        service: "shibasolver-api",
      });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/v1/adminAuth', adminAuthRouter);
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

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  app.use((err, _req, res, _next) => {
    console.error("Request error:", err);
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || "INTERNAL_SERVER_ERROR",
        message:
          statusCode >= 500
            ? "Internal server error"
            : err.message || "Request failed",
      },
    });
  });

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
