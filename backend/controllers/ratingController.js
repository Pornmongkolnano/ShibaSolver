const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendSuccess } = require("../utils/apiResponse");
const { publicRating } = require("../utils/apiPresenters");
const {
  getAuthUserId,
  parseIdList,
  readRatingValue,
  readStringId,
  readTargetType,
} = require("../utils/request");

function ratingTargetFilter(targetType, targetId) {
  return targetType === "post"
    ? { postId: targetId, commentId: null }
    : { commentId: targetId, postId: null };
}

async function assertTargetExists(targetType, targetId) {
  const model = targetType === "post" ? prisma.post : prisma.comment;
  const target = await model.findFirst({
    where: { id: targetId, deletedAt: null },
    select: { id: true },
  });

  if (!target) {
    throw createError(404, "TARGET_NOT_FOUND", `Target ${targetType} not found`);
  }
}

async function getSummary(targetType, targetId, userId = null) {
  const ratings = await prisma.rating.findMany({
    where: ratingTargetFilter(targetType, targetId),
    select: { userId: true, value: true },
  });

  let likes = 0;
  let dislikes = 0;
  let myRating = null;

  for (const rating of ratings) {
    if (rating.value === "LIKE") likes += 1;
    if (rating.value === "DISLIKE") dislikes += 1;
    if (userId && rating.userId === userId) {
      myRating = rating.value.toLowerCase();
    }
  }

  return {
    likes,
    dislikes,
    my_rating: myRating,
  };
}

function parseRatingTarget(req) {
  const targetType = readTargetType(req.body?.target_type ?? req.query?.target_type);
  const targetId = readStringId(req.body?.target_id ?? req.query?.target_id, "target_id");
  return { targetType, targetId };
}

/**
 * @desc    like or dislike a post or comment
 * @route   POST /api/v1/ratings
 * @access  Private
 */
exports.rate = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const { targetType, targetId } = parseRatingTarget(req);
  const value = readRatingValue(req.body?.rating_type);

  await assertTargetExists(targetType, targetId);

  const isPost = targetType === "post";
  const rating = await prisma.rating.upsert({
    where: isPost
      ? { userId_postId: { userId, postId: targetId } }
      : { userId_commentId: { userId, commentId: targetId } },
    create: {
      userId,
      value,
      ...(isPost ? { postId: targetId } : { commentId: targetId }),
    },
    update: { value },
  });

  const summary = await getSummary(targetType, targetId, userId);

  return sendSuccess(res, {
    data: {
      target_type: targetType,
      target_id: targetId,
      rating: publicRating(rating),
      summary,
    },
  });
});

/**
 * @desc    remove like or dislike from a post or comment
 * @route   DELETE /api/v1/ratings
 * @access  Private
 */
exports.unrate = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const { targetType, targetId } = parseRatingTarget(req);

  const result = await prisma.rating.deleteMany({
    where: {
      userId,
      ...ratingTargetFilter(targetType, targetId),
    },
  });
  const summary = await getSummary(targetType, targetId, userId);

  return sendSuccess(res, {
    message: result.count ? "Unrated" : "No rating to remove",
    summary,
  });
});

/**
 * @desc    get rating summary for a post or comment
 * @route   GET /api/v1/ratings/summary?target_type=post|comment&ids=...
 * @access  Private
 */
exports.getSummaryBatch = asyncHandler(async (req, res) => {
  const targetType = readTargetType(req.query?.target_type);
  const ids = parseIdList(req.query?.ids);
  const userId = getAuthUserId(req);
  const idField = targetType === "post" ? "postId" : "commentId";

  const ratings = await prisma.rating.findMany({
    where: { [idField]: { in: ids } },
    select: { [idField]: true, userId: true, value: true },
  });

  const summaries = new Map(
    ids.map((id) => [id, { id, likes: 0, dislikes: 0, my_rating: null }])
  );

  for (const rating of ratings) {
    const id = rating[idField];
    const summary = summaries.get(id);
    if (!summary) continue;
    if (rating.value === "LIKE") summary.likes += 1;
    if (rating.value === "DISLIKE") summary.dislikes += 1;
    if (rating.userId === userId) summary.my_rating = rating.value.toLowerCase();
  }

  return sendSuccess(res, {
    target_type: targetType,
    data: [...summaries.values()],
  });
});

/**
 * @desc    get ShibaMeter (trust ratio) for a user based on their solution comments
 * @route   GET /api/v1/users/:username/shibameter
 * @access  Public
 */
exports.getShibaMeter = asyncHandler(async (req, res) => {
  const username = String(req.params.username || "").trim();
  if (!/^[\w-]+$/.test(username)) {
    throw createError(400, "INVALID_USERNAME", "Invalid username");
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  const comments = await prisma.comment.findMany({
    where: {
      authorId: user.id,
      isSolution: true,
      deletedAt: null,
    },
    select: {
      ratings: { select: { value: true } },
    },
  });

  let likes = 0;
  let dislikes = 0;
  for (const comment of comments) {
    for (const rating of comment.ratings) {
      if (rating.value === "LIKE") likes += 1;
      if (rating.value === "DISLIKE") dislikes += 1;
    }
  }

  const totalRatings = likes + dislikes;
  const shibaMeter = totalRatings === 0
    ? 0
    : Number(((likes / totalRatings) * 100).toFixed(2));

  return sendSuccess(res, {
    username,
    shibaMeter,
  });
});

/**
 * @desc    checking if (logged in) user has liked or disliked posts/comments
 * @route   GET /api/v1/ratings/check?target_type=post|comment&target_id=...
 * @access  Private
 */
exports.getUserRating = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const { targetType, targetId } = parseRatingTarget(req);
  const rating = await prisma.rating.findFirst({
    where: {
      userId,
      ...ratingTargetFilter(targetType, targetId),
    },
    select: { value: true },
  });

  return sendSuccess(res, {
    target_type: targetType,
    target_id: targetId,
    my_rating: rating?.value?.toLowerCase() || null,
  });
});
