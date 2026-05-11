const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendSuccess } = require("../utils/apiResponse");
const { publicPost, ratingSummary } = require("../utils/apiPresenters");
const { publicUser } = require("../utils/userPresenter");
const { getAuthUserId, readStringId } = require("../utils/request");

const USER_POST_INCLUDE = {
  author: true,
  tags: { include: { tag: true } },
  ratings: { select: { userId: true, value: true } },
  comments: {
    where: { deletedAt: null },
    include: {
      author: true,
      ratings: { select: { userId: true, value: true } },
    },
  },
};

function getOptionalUserId(req) {
  return req.currentUser?.id || req.user?.id || req.user?.uid || null;
}

function parsePageLimit(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let page = Number.parseInt(query.page, 10);
  if (!Number.isInteger(page) || page <= 0) page = 1;

  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function topCommentForPost(post) {
  if (!post.comments?.length) return null;
  return [...post.comments].sort((a, b) => {
    const aVotes = ratingSummary(a.ratings).total_votes;
    const bVotes = ratingSummary(b.ratings).total_votes;
    if (bVotes !== aVotes) return bVotes - aVotes;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

function normalizeProfileUpdate(input) {
  const data = {};
  const has = (field) => Object.prototype.hasOwnProperty.call(input, field);

  if (has("user_name")) data.username = cleanNullableString(input.user_name);
  if (has("username")) data.username = cleanNullableString(input.username);
  if (has("display_name")) data.displayName = cleanNullableString(input.display_name);
  if (has("displayName")) data.displayName = cleanNullableString(input.displayName);
  if (has("education_level")) data.educationLevel = cleanNullableString(input.education_level);
  if (has("educationLevel")) data.educationLevel = cleanNullableString(input.educationLevel);
  if (has("bio")) data.bio = cleanNullableString(input.bio);
  if (has("profile_picture")) data.avatarUrl = cleanNullableString(input.profile_picture);
  if (has("avatarUrl")) data.avatarUrl = cleanNullableString(input.avatarUrl);
  if (has("interested_subjects")) data.interestedSubjects = normalizeStringList(input.interested_subjects);
  if (has("interestedSubjects")) data.interestedSubjects = normalizeStringList(input.interestedSubjects);

  return data;
}

function cleanNullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

function premiumPayload(user) {
  if (!user) return null;
  return {
    user_id: user.id,
    is_premium: user.isPremium,
    updated_at: user.updatedAt,
  };
}

/**
 * @desc    Get a single user by username
 * @route   GET /api/v1/users/:username
 * @access  Public
 */
exports.getUser = asyncHandler(async (req, res) => {
  const username = String(req.params.username || "").trim();
  if (!/^[\w-]+$/.test(username)) {
    throw createError(400, "INVALID_USERNAME", "Invalid username");
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || user.deletedAt) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  return sendSuccess(res, {
    data: {
      ...publicUser(user),
      like: null,
      dislike: null,
    },
  });
});

/**
 * @desc    Delete current user
 * @route   DELETE /api/v1/users
 * @access  Private
 */
exports.deleteUser = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const deletedAt = new Date();
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "DELETED",
      deletedAt,
      sessions: {
        updateMany: {
          where: { revokedAt: null },
          data: { revokedAt: deletedAt },
        },
      },
    },
  });

  return sendSuccess(res, {
    data: publicUser(user),
  });
});

/**
 * @desc    Update current user profile
 * @route   PUT /api/v1/users
 * @access  Private
 */
exports.updateUser = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const { new_data: newData } = req.body || {};

  if (!newData || Object.keys(newData).length === 0) {
    throw createError(400, "NO_DATA", "No data to update");
  }

  const privilegedFields = ["is_premium", "isPremium", "user_state", "status", "role"];
  const attemptedPrivileged = Object.keys(newData).filter((field) =>
    privilegedFields.includes(field)
  );
  if (attemptedPrivileged.length > 0) {
    throw createError(
      403,
      "PRIVILEGED_FIELDS",
      `Fields ${attemptedPrivileged.join(", ")} can only be changed by administrators`
    );
  }

  const data = normalizeProfileUpdate(newData);
  if (Object.keys(data).length === 0) {
    throw createError(400, "NO_VALID_FIELDS", "No valid fields to update");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return sendSuccess(res, {
    data: publicUser(user),
  });
});

/**
 * @desc    Get all posts created by a specific user
 * @route   GET /api/v1/users/:userID/posts
 * @access  Public with optional auth
 */
exports.getPostbyUserId = asyncHandler(async (req, res) => {
  const userId = readStringId(req.params.userID, "userID");
  const currentUserId = getOptionalUserId(req);
  const { page, limit, offset } = parsePageLimit(req.query, {
    defaultLimit: 100,
    maxLimit: 100,
  });

  const [total, posts] = await Promise.all([
    prisma.post.count({
      where: { authorId: userId, deletedAt: null },
    }),
    prisma.post.findMany({
      where: { authorId: userId, deletedAt: null },
      include: USER_POST_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    }),
  ]);

  const data = posts.map((post) =>
    publicPost(post, {
      currentUserId,
      topComment: topCommentForPost(post),
    })
  );
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return sendSuccess(res, {
    count: data.length,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      nextPage: page < totalPages ? page + 1 : null,
    },
    data,
  });
});

/**
 * @desc    Update user's premium status
 * @route   PUT /api/v1/users/premium
 * @access  Private
 */
exports.updatePremium = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true },
  });

  if (!existing) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  if (existing.isPremium) {
    return sendSuccess(res, {
      message: "User is already premium",
      data: null,
    });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isPremium: true },
  });

  return sendSuccess(res, {
    data: premiumPayload(user),
  });
});

/**
 * @desc    Cancel user's premium status
 * @route   PUT /api/v1/users/canclePremium
 * @access  Private
 */
exports.canclePremium = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true },
  });

  if (!existing) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  if (!existing.isPremium) {
    return sendSuccess(res, {
      message: "User is not premium",
      data: null,
    });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isPremium: false },
  });

  return sendSuccess(res, {
    data: premiumPayload(user),
  });
});
