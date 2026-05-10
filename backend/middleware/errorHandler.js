function notFound(req, _res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  next(err);
}

function normalizePrismaError(err) {
  if (err.code === "P2002") {
    return {
      statusCode: 409,
      code: "UNIQUE_CONSTRAINT",
      message: "A record with this value already exists",
    };
  }

  if (err.code === "P2025") {
    return {
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Record not found",
    };
  }

  return null;
}

function errorHandler(err, _req, res, _next) {
  const prismaError = normalizePrismaError(err);
  const statusCode = prismaError?.statusCode || err.statusCode || err.status || 500;
  const code = prismaError?.code || err.code || "INTERNAL_SERVER_ERROR";
  const message = prismaError?.message || err.message || "Request failed";

  if (statusCode >= 500) {
    console.error("Request error:", err);
  }

  const payload = {
    success: false,
    error: {
      code,
      message: statusCode >= 500 ? "Internal server error" : message,
    },
  };

  if (err.details && process.env.NODE_ENV !== "production") {
    payload.error.details = err.details;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  errorHandler,
  notFound,
};
