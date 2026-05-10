const prisma = require("../lib/prisma");
const { createNotification } = require("../services/notificationService");
const { asyncHandler, createError, sendCreated, sendSuccess } = require("../utils/apiResponse");
const { publicComment, ratingSummary } = require("../utils/apiPresenters");
const {
  getAuthUserId,
  readLimitedText,
  readOptionalStringId,
  readStringId,
} = require("../utils/request");

const COMMENT_INCLUDE = {
  author: true,
  ratings: { select: { userId: true, value: true } },
};

const COMMENT_WITH_POST_INCLUDE = {
  ...COMMENT_INCLUDE,
  post: { select: { id: true, title: true } },
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getOptionalUserId(req) {
  return req.currentUser?.id || req.user?.id || req.user?.uid || null;
}

function readOptionalNullableString(body, fields) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) {
      const value = body[field];
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      return text || null;
    }
  }
  return undefined;
}

function parseLimitPage(query) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = 10;
  limit = Math.min(limit, 100);

  let page = Number.parseInt(query.page, 10);
  if (!Number.isInteger(page) || page <= 0) page = 1;

  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
}

function normalizeSort(value) {
  const sort = String(value || "latest").toLowerCase();
  return ["latest", "oldest", "popular", "ratio"].includes(sort) ? sort : "latest";
}

function compareCommentIds(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function commentVoteSummary(comment) {
  return ratingSummary(comment.ratings);
}

function compareByPopularity(a, b) {
  const aVotes = commentVoteSummary(a).total_votes;
  const bVotes = commentVoteSummary(b).total_votes;
  if (bVotes !== aVotes) return bVotes - aVotes;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || compareCommentIds(a, b);
}

function sortComments(comments, sort) {
  const rows = [...comments];
  if (sort === "oldest") {
    return rows.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        compareCommentIds(a, b)
    );
  }

  if (sort === "popular") {
    return rows.sort(compareByPopularity);
  }

  if (sort === "ratio") {
    return rows.sort((a, b) => {
      const aSummary = commentVoteSummary(a);
      const bSummary = commentVoteSummary(b);
      const aRatio = aSummary.total_votes > 0 ? aSummary.likes / aSummary.total_votes : -1;
      const bRatio = bSummary.total_votes > 0 ? bSummary.likes / bSummary.total_votes : -1;
      if (bRatio !== aRatio) return bRatio - aRatio;
      if (bSummary.total_votes !== aSummary.total_votes) {
        return bSummary.total_votes - aSummary.total_votes;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || compareCommentIds(a, b);
    });
  }

  return rows.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      compareCommentIds(b, a)
  );
}

async function assertActiveUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
    },
  });

  if (!user) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.status !== "ACTIVE") {
    throw createError(403, "ACCOUNT_DISABLED", "Your account cannot perform this action");
  }

  return user;
}

function actorName(user) {
  return user.displayName || user.username || "Someone";
}

function previewText(text) {
  return `${text.slice(0, 40)}${text.length > 40 ? "..." : ""}`;
}

/**
 * @desc    Get all comments of the user
 * @route   GET /api/v1/comments/user/:userId?limit=10&page=1&sort=latest|oldest|popular
 * @access  Private
 */
exports.getCommentsByUser = asyncHandler(async (req, res) => {
  const authUserId = getAuthUserId(req);
  const userId = req.params.userId && req.params.userId !== "me"
    ? readStringId(req.params.userId, "userId")
    : authUserId;
  const { limit, page, offset } = parseLimitPage(req.query);
  const sort = normalizeSort(req.query.sort);

  const [total, comments] = await Promise.all([
    prisma.comment.count({
      where: { authorId: userId, deletedAt: null },
    }),
    prisma.comment.findMany({
      where: { authorId: userId, deletedAt: null },
      include: COMMENT_WITH_POST_INCLUDE,
    }),
  ]);

  const sorted = sortComments(comments, sort).slice(offset, offset + limit);
  const data = sorted.map((comment) => publicComment(comment, { currentUserId: authUserId }));
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return sendSuccess(res, {
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      nextPage: page < totalPages ? page + 1 : null,
    },
    viewingSelf: userId === authUserId,
    data,
  });
});

/**
 * @desc    Get top comment of a post
 * @route   GET /api/v1/comments/post/:postId/top
 * @access  Public
 */
exports.getTopComment = asyncHandler(async (req, res) => {
  const postId = readStringId(req.params.postId, "postId");
  const currentUserId = getOptionalUserId(req);
  const comments = await prisma.comment.findMany({
    where: { postId, deletedAt: null },
    include: COMMENT_INCLUDE,
  });
  const topComment = sortComments(comments, "popular")[0];

  if (!topComment) {
    throw createError(404, "COMMENT_NOT_FOUND", "No comments found for this post");
  }

  return sendSuccess(res, {
    data: publicComment(topComment, { currentUserId }),
  });
});

/**
 * @desc    Get a single comment by ID
 * @route   GET /api/v1/comments/:id
 * @access  Private
 */
exports.getComment = asyncHandler(async (req, res) => {
  const currentUserId = getAuthUserId(req);
  const commentId = readStringId(req.params.id, "commentId");
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    include: COMMENT_INCLUDE,
  });

  if (!comment) {
    throw createError(404, "COMMENT_NOT_FOUND", "Comment not found");
  }

  return sendSuccess(res, {
    data: publicComment(comment, { currentUserId }),
  });
});

/**
 * @desc    Create a comment
 * @route   POST /api/v1/comments
 * @access  Private
 */
exports.createComment = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const actor = await assertActiveUser(userId);
  const postId = readStringId(req.body?.post_id ?? req.body?.postId, "post_id");
  const body = readLimitedText(req.body?.text ?? req.body?.body, "text", { max: 10000 });
  const parentId = readOptionalStringId(req.body?.parent_comment ?? req.body?.parentId);
  const imageUrl = readOptionalNullableString(req.body, ["comment_image", "imageUrl"]);

  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true, authorId: true },
  });

  if (!post) {
    throw createError(404, "POST_NOT_FOUND", "Post not found");
  }

  let parentOwnerId = null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, postId: true, authorId: true },
    });

    if (!parent) {
      throw createError(400, "PARENT_NOT_FOUND", "parent_comment does not exist");
    }

    if (parent.postId !== postId) {
      throw createError(400, "PARENT_POST_MISMATCH", "parent_comment must belong to the same post");
    }

    parentOwnerId = parent.authorId;
  }

  const comment = await prisma.comment.create({
    data: {
      authorId: userId,
      postId,
      parentId,
      body,
      imageUrl,
    },
    include: COMMENT_INCLUDE,
  });

  const link = `/post/${postId}/${comment.id}`;
  if (post.authorId && post.authorId !== userId) {
    await createNotification(null, {
      toUserId: post.authorId,
      type: "comment",
      message: `${actorName(actor)} commented on your post: "${previewText(body)}"`,
      link,
    });
  }

  if (parentOwnerId && parentOwnerId !== userId) {
    await createNotification(null, {
      toUserId: parentOwnerId,
      type: "reply",
      message: `${actorName(actor)} replied: "${previewText(body)}"`,
      link,
    });
  }

  return sendCreated(res, {
    data: publicComment(comment, { currentUserId: userId }),
  });
});

/**
 * @desc    Edit a comment
 * @route   PUT /api/v1/comments/:id
 * @access  Private
 */
exports.editComment = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const commentId = readStringId(req.params.id, "commentId");
  const hasText =
    Object.prototype.hasOwnProperty.call(req.body || {}, "text") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "body");
  const imageUrl = readOptionalNullableString(req.body, ["comment_image", "imageUrl"]);

  if (!hasText && imageUrl === undefined) {
    throw createError(400, "NOTHING_TO_UPDATE", "No comment fields were provided");
  }

  const existing = await prisma.comment.findFirst({
    where: { id: commentId, authorId: userId, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    throw createError(404, "COMMENT_NOT_FOUND", "Comment not found or not authorized");
  }

  const data = {};
  if (hasText) {
    data.body = readLimitedText(req.body.text ?? req.body.body, "text", { max: 10000 });
  }
  if (imageUrl !== undefined) data.imageUrl = imageUrl;

  const comment = await prisma.comment.update({
    where: { id: commentId },
    data,
    include: COMMENT_INCLUDE,
  });

  return sendSuccess(res, {
    data: publicComment(comment, { currentUserId: userId }),
  });
});

/**
 * @desc    Soft delete a comment
 * @route   DELETE /api/v1/comments/:id
 * @access  Private
 */
exports.deleteComment = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const commentId = readStringId(req.params.id, "commentId");
  const result = await prisma.comment.updateMany({
    where: { id: commentId, authorId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (!result.count) {
    throw createError(404, "COMMENT_NOT_FOUND", "Comment not found or not authorized");
  }

  return sendSuccess(res, {
    message: "Comment deleted",
    data: { id: commentId, comment_id: commentId },
  });
});

/**
 * @desc    Toggle flag/unflag solution on a comment
 * @route   PATCH /api/v1/comments/:commentId/solution
 * @access  Private
 */
exports.toggleMyCommentSolution = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const commentId = readStringId(req.params.commentId, "commentId");
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    include: COMMENT_INCLUDE,
  });

  if (!comment) {
    throw createError(404, "COMMENT_NOT_FOUND", "Comment not found");
  }

  if (comment.authorId !== userId) {
    throw createError(403, "FORBIDDEN", "You are not the owner of this comment");
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { isSolution: !comment.isSolution },
    include: COMMENT_INCLUDE,
  });

  return sendSuccess(res, {
    data: publicComment(updated, { currentUserId: userId }),
  });
});

/**
 * @desc    Reply to a comment
 * @route   POST /api/v1/comments/:commentId/replies
 * @access  Private
 */
exports.replyToComment = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const actor = await assertActiveUser(userId);
  const parentId = readStringId(req.params.commentId, "commentId");
  const body = readLimitedText(req.body?.text ?? req.body?.body, "text", { max: 10000 });
  const imageUrl = readOptionalNullableString(req.body, ["comment_image", "imageUrl"]);

  const parent = await prisma.comment.findFirst({
    where: { id: parentId, deletedAt: null },
    select: { id: true, authorId: true, postId: true },
  });

  if (!parent) {
    throw createError(404, "PARENT_NOT_FOUND", "Parent comment not found");
  }

  const reply = await prisma.comment.create({
    data: {
      authorId: userId,
      postId: parent.postId,
      parentId: parent.id,
      body,
      imageUrl,
    },
    include: COMMENT_INCLUDE,
  });

  if (parent.authorId !== userId) {
    await createNotification(null, {
      toUserId: parent.authorId,
      type: "reply",
      message: `${actorName(actor)} replied: "${previewText(body)}"`,
      link: `/post/${reply.postId}/${reply.id}`,
    });
  }

  return sendCreated(res, {
    data: publicComment(reply, { currentUserId: userId }),
  });
});

/**
 * @desc    Get all comments from a specific post with sorting and optional solution filtering.
 * @access  Internal
 */
async function fetchCommentsByPost(
  _pool,
  postId,
  sort = "latest",
  filterSolutionsForAnonymous = false,
  currentUserId = null
) {
  const comments = await prisma.comment.findMany({
    where: {
      postId,
      deletedAt: null,
      ...(filterSolutionsForAnonymous ? { isSolution: false } : {}),
    },
    include: COMMENT_INCLUDE,
  });

  return sortComments(comments, normalizeSort(sort)).map((comment) =>
    publicComment(comment, { currentUserId })
  );
}
exports.fetchCommentsByPost = fetchCommentsByPost;

/**
 * @desc    Get all comments from post with sort option
 * @route   GET /api/v1/comments/post/:postId?sort=popular|latest|oldest
 * @access  Private
 */
exports.getComments = asyncHandler(async (req, res) => {
  const currentUserId = getAuthUserId(req);
  const postId = readStringId(req.params.postId, "postId");
  const rows = await fetchCommentsByPost(null, postId, req.query.sort, false, currentUserId);

  return sendSuccess(res, {
    count: rows.length,
    data: rows,
  });
});

/**
 * @desc    Get comments with access control (30-day / premium rules)
 * @route   GET /api/v1/comments/post/:postId?sort=popular|latest|oldest|ratio
 * @access  Public with optional auth
 */
exports.getCommentsAccessControlled = asyncHandler(async (req, res) => {
  const postId = readStringId(req.params.postId, "postId");
  const currentUserId = getOptionalUserId(req);
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true, createdAt: true },
  });

  if (!post) {
    throw createError(404, "POST_NOT_FOUND", "Post not found");
  }

  const isRecent = post.createdAt.getTime() >= Date.now() - THIRTY_DAYS_MS;
  const isPremium = Boolean(req.currentUser?.isPremium);

  if (!currentUserId && !isRecent) {
    return sendSuccess(res, {
      restricted: true,
      reason: "LOGIN_REQUIRED",
      post: {
        post_id: post.id,
        created_at: post.createdAt,
        is_recent_30d: isRecent,
      },
      data: [],
    });
  }

  if (currentUserId && !isRecent && !isPremium) {
    return sendSuccess(res, {
      restricted: true,
      reason: "PREMIUM_REQUIRED",
      post: {
        post_id: post.id,
        created_at: post.createdAt,
        is_recent_30d: isRecent,
      },
      data: [],
    });
  }

  const filterSolutionsForAnonymous = !currentUserId && isRecent;
  const rows = await fetchCommentsByPost(
    null,
    postId,
    req.query.sort,
    filterSolutionsForAnonymous,
    currentUserId
  );

  return sendSuccess(res, {
    restricted: false,
    reason: null,
    post: {
      post_id: post.id,
      created_at: post.createdAt,
      is_recent_30d: isRecent,
    },
    count: rows.length,
    data: rows,
  });
});
