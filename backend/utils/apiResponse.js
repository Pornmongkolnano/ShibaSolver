class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createError(statusCode, code, message, details) {
  return new ApiError(statusCode, code, message, details);
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sendSuccess(res, {
  statusCode = 200,
  message,
  data,
  meta,
  ...extra
} = {}) {
  const payload = { success: true, ...extra };
  if (message) payload.message = message;
  if (meta) payload.meta = meta;
  if (data !== undefined) payload.data = data;
  return res.status(statusCode).json(payload);
}

function sendCreated(res, options) {
  return sendSuccess(res, { ...options, statusCode: 201 });
}

module.exports = {
  ApiError,
  asyncHandler,
  createError,
  sendCreated,
  sendSuccess,
};
