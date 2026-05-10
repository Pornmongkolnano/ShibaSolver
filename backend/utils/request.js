const { createError } = require("./apiResponse");

function getAuthUserId(req) {
  const userId = req.currentUser?.id || req.user?.id || req.user?.uid || req.admin?.id;
  if (!userId) {
    throw createError(401, "UNAUTHORIZED", "Authentication required");
  }
  return userId;
}

function readStringId(value, fieldName = "id") {
  const id = String(value ?? "").trim();
  if (!id || id === "undefined" || id === "null") {
    throw createError(400, "INVALID_ID", `${fieldName} is required`);
  }
  return id;
}

function readOptionalStringId(value) {
  const id = String(value ?? "").trim();
  return id && id !== "undefined" && id !== "null" ? id : null;
}

function readLimitedText(value, fieldName, { min = 1, max = 2000 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length < min) {
    throw createError(400, "INVALID_TEXT", `${fieldName} is required`);
  }
  if (text.length > max) {
    throw createError(400, "INVALID_TEXT", `${fieldName} must be at most ${max} characters`);
  }
  return text;
}

function parseLimitOffset(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  let offset = Number.parseInt(query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

function parseIdList(value, fieldName = "ids", maxItems = 100) {
  const ids = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    throw createError(400, "INVALID_ID_LIST", `${fieldName} is required`);
  }
  if (uniqueIds.length > maxItems) {
    throw createError(400, "INVALID_ID_LIST", `${fieldName} supports at most ${maxItems} ids`);
  }
  return uniqueIds;
}

function readTargetType(value, allowed = ["post", "comment"]) {
  const targetType = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(targetType)) {
    throw createError(
      400,
      "INVALID_TARGET_TYPE",
      `target_type must be one of: ${allowed.join(", ")}`
    );
  }
  return targetType;
}

function readRatingValue(value) {
  const ratingValue = String(value ?? "").trim().toLowerCase();
  if (!["like", "dislike"].includes(ratingValue)) {
    throw createError(400, "INVALID_RATING", "rating_type must be 'like' or 'dislike'");
  }
  return ratingValue === "like" ? "LIKE" : "DISLIKE";
}

module.exports = {
  getAuthUserId,
  parseIdList,
  parseLimitOffset,
  readLimitedText,
  readOptionalStringId,
  readRatingValue,
  readStringId,
  readTargetType,
};
