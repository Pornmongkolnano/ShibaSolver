const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendCreated, sendSuccess } = require("../utils/apiResponse");
const { publicPost } = require("../utils/apiPresenters");
const {
  getAuthUserId,
  parseLimitOffset,
  readLimitedText,
  readStringId,
} = require("../utils/request");

const POST_INCLUDE = {
  author: true,
  tags: { include: { tag: true } },
  ratings: { select: { userId: true, value: true } },
};

function getOptionalUserId(req) {
  return req.currentUser?.id || req.user?.id || req.user?.uid || null;
}

function normalizeTags(rawTags, { required = false } = {}) {
  if (!Array.isArray(rawTags)) {
    if (required) {
      throw createError(400, "INVALID_TAGS", "Tags must be a non-empty array");
    }
    return undefined;
  }

  const tags = [
    ...new Set(
      rawTags
        .map((tag) => {
          if (typeof tag === "string") return tag.trim();
          return String(tag?.name || tag?.tag_name || "").trim();
        })
        .filter(Boolean)
    ),
  ];

  if (required && tags.length === 0) {
    throw createError(400, "INVALID_TAGS", "Tags must be a non-empty array");
  }

  if (tags.length > 20) {
    throw createError(400, "INVALID_TAGS", "A post can have at most 20 tags");
  }

  return tags;
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

function readOptionalBoolean(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw createError(400, "INVALID_BOOLEAN", `${fieldName} must be a boolean`);
}

async function assertActiveUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.status !== "ACTIVE") {
    throw createError(403, "ACCOUNT_DISABLED", "Your account cannot perform this action");
  }
}

async function attachTags(tx, postId, tags) {
  for (const name of tags) {
    const tag = await tx.tag.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });

    await tx.postTag.create({
      data: { postId, tagId: tag.id },
    });
  }
}

async function findVisiblePost(postId) {
  return prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: POST_INCLUDE,
  });
}

/**
 * @desc    Get a single post by ID
 * @route   GET /api/v1/posts/:postId
 * @access  Public with optional auth
 */
exports.getPost = asyncHandler(async (req, res) => {
  const postId = readStringId(req.params.postId, "postId");
  const currentUserId = getOptionalUserId(req);
  const post = await findVisiblePost(postId);

  if (!post) {
    throw createError(404, "POST_NOT_FOUND", "Post not found");
  }

  return sendSuccess(res, {
    data: publicPost(post, { currentUserId }),
  });
});

/**
 * @desc    Create a new post
 * @route   POST /api/v1/posts
 * @access  Private
 */
exports.createPost = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  await assertActiveUser(userId);

  const title = readLimitedText(req.body?.title, "title", { max: 180 });
  const body = readLimitedText(req.body?.description ?? req.body?.body, "description", {
    max: 10000,
  });
  const imageUrl = readOptionalNullableString(req.body, ["post_image", "imageUrl"]);
  const tags = normalizeTags(req.body?.tags, { required: true });
  const isSolved = readOptionalBoolean(req.body?.is_solved ?? req.body?.isSolved, "is_solved") || false;

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: userId,
        title,
        body,
        imageUrl,
        isSolved,
      },
      select: { id: true },
    });

    await attachTags(tx, created.id, tags);

    return tx.post.findUnique({
      where: { id: created.id },
      include: POST_INCLUDE,
    });
  });

  return sendCreated(res, {
    data: publicPost(post, { currentUserId: userId }),
    tags,
  });
});

/**
 * @desc    Edit a post and update its tags
 * @route   PUT /api/v1/posts/:postId
 * @access  Private
 */
exports.editPost = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const postId = readStringId(req.params.postId, "postId");
  const tags = normalizeTags(req.body?.tags);

  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    throw createError(404, "POST_NOT_FOUND", "Post not found or not authorized");
  }

  const data = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) {
    data.title = readLimitedText(req.body.title, "title", { max: 180 });
  }
  if (
    Object.prototype.hasOwnProperty.call(req.body || {}, "description") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "body")
  ) {
    data.body = readLimitedText(req.body.description ?? req.body.body, "description", {
      max: 10000,
    });
  }

  const imageUrl = readOptionalNullableString(req.body, ["post_image", "imageUrl"]);
  if (imageUrl !== undefined) data.imageUrl = imageUrl;

  const isSolved = readOptionalBoolean(req.body?.is_solved ?? req.body?.isSolved, "is_solved");
  if (isSolved !== undefined) data.isSolved = isSolved;

  if (Object.keys(data).length === 0 && tags === undefined) {
    throw createError(400, "NOTHING_TO_UPDATE", "No post fields were provided");
  }

  const post = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.post.update({
        where: { id: postId },
        data,
      });
    }

    if (tags !== undefined) {
      await tx.postTag.deleteMany({ where: { postId } });
      await attachTags(tx, postId, tags);
    }

    return tx.post.findUnique({
      where: { id: postId },
      include: POST_INCLUDE,
    });
  });

  return sendSuccess(res, {
    data: publicPost(post, { currentUserId: userId }),
    tags: tags ?? publicPost(post).tags,
  });
});

/**
 * @desc    Soft delete own post and its comments
 * @route   DELETE /api/v1/posts/:postId
 * @access  Private
 */
exports.deletePost = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const postId = readStringId(req.params.postId, "postId");

  const existing = await prisma.post.findFirst({
    where: { id: postId, authorId: userId, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    throw createError(404, "POST_NOT_FOUND", "Post not found or not authorized");
  }

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: { deletedAt },
    }),
    prisma.comment.updateMany({
      where: { postId, deletedAt: null },
      data: { deletedAt },
    }),
  ]);

  return sendSuccess(res, {
    message: "Post deleted with comments cascaded",
    data: { id: postId, post_id: postId },
  });
});

/**
 * @desc    Refresh the feed
 * @route   GET /api/v1/posts
 * @access  Public
 */
exports.refreshFeed = asyncHandler(async (req, res) => {
  const currentUserId = getOptionalUserId(req);
  const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 50, maxLimit: 100 });
  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    include: POST_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    skip: offset,
  });
  const rows = posts.map((post) => publicPost(post, { currentUserId }));

  return sendSuccess(res, {
    count: rows.length,
    data: rows,
    rows,
  });
});

/**
 * @desc    Add a bookmark
 * @route   POST /api/v1/posts/bookmarks/:postId
 * @access  Private
 */
exports.addBookmark = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const postId = readStringId(req.params.postId, "postId");

  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true },
  });

  if (!post) {
    throw createError(404, "POST_NOT_FOUND", "Post not found");
  }

  const existing = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
  });

  if (existing) {
    return sendSuccess(res, {
      message: "Already bookmarked",
      data: {
        user_id: existing.userId,
        post_id: existing.postId,
        created_at: existing.createdAt,
      },
    });
  }

  const bookmark = await prisma.bookmark.create({
    data: { userId, postId },
  });

  return sendCreated(res, {
    data: {
      user_id: bookmark.userId,
      post_id: bookmark.postId,
      created_at: bookmark.createdAt,
    },
  });
});

/**
 * @desc    Get bookmarks for a user
 * @route   GET /api/v1/posts/bookmarks
 * @access  Private
 */
exports.getBookmarks = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId,
      post: { is: { deletedAt: null } },
    },
    include: {
      post: {
        include: POST_INCLUDE,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const data = bookmarks.map((bookmark) =>
    publicPost(bookmark.post, {
      currentUserId: userId,
      bookmarkedAt: bookmark.createdAt,
    })
  );

  return sendSuccess(res, {
    count: data.length,
    data,
  });
});

/**
 * @desc    Remove bookmark
 * @route   DELETE /api/v1/posts/bookmarks/:postId
 * @access  Private
 */
exports.removeBookmark = asyncHandler(async (req, res) => {
  const userId = getAuthUserId(req);
  const postId = readStringId(req.params.postId, "postId");
  const result = await prisma.bookmark.deleteMany({
    where: { userId, postId },
  });

  if (!result.count) {
    throw createError(404, "BOOKMARK_NOT_FOUND", "Bookmark not found");
  }

  return sendSuccess(res, {
    data: { user_id: userId, post_id: postId },
  });
});
