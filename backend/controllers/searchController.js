const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendSuccess } = require("../utils/apiResponse");
const { publicPost } = require("../utils/apiPresenters");
const { publicUser } = require("../utils/userPresenter");

const SEARCH_POST_INCLUDE = {
  author: true,
  tags: { include: { tag: true } },
  ratings: { select: { userId: true, value: true } },
};

function parseSearchPaging(query) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = 20;
  limit = Math.min(limit, 50);

  let page = Number.parseInt(query.page, 10);
  if (!Number.isInteger(page) || page <= 0) page = 1;

  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
}

function getOptionalUserId(req) {
  return req.currentUser?.id || req.user?.id || req.user?.uid || null;
}

function normalizeQuery(value) {
  return String(value || "").trim();
}

function normalizeTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function textRank(text, query) {
  const haystack = String(text || "").toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 80;
  if (haystack.includes(needle)) return 50;
  return 0;
}

function userRank(user, query) {
  return Math.max(textRank(user.username, query), textRank(user.displayName, query));
}

function postRank(post, query) {
  return Math.max(textRank(post.title, query), textRank(post.body, query));
}

/**
 * @desc    Search users by display name or username
 * @route   GET /api/v1/search/users?query=abc&page=1&limit=20
 * @access  Public
 */
exports.searchUsers = asyncHandler(async (req, res) => {
  const query = normalizeQuery(req.query.query);
  if (!query) {
    throw createError(400, "QUERY_REQUIRED", "Query parameter is required");
  }

  const { limit, page, offset } = parseSearchPaging(req.query);
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: { not: "DELETED" },
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    skip: offset,
  });

  const hasNextPage = users.length > limit;
  const pageUsers = (hasNextPage ? users.slice(0, limit) : users)
    .sort((a, b) => userRank(b, query) - userRank(a, query));

  return sendSuccess(res, {
    count: pageUsers.length,
    page,
    has_next_page: hasNextPage,
    users: pageUsers.map((user) => ({
      ...publicUser(user),
      rank: userRank(user, query),
    })),
  });
});

/**
 * @desc    Search posts by keyword, tags, or both.
 * @route   GET /api/v1/search/posts?query=...&tags=...&page=1&limit=20
 * @access  Public
 */
exports.searchPosts = asyncHandler(async (req, res) => {
  const query = normalizeQuery(req.query.query);
  const tags = normalizeTags(req.query.tags);
  if (!query && tags.length === 0) {
    throw createError(
      400,
      "SEARCH_PARAMETER_REQUIRED",
      "At least one search parameter (query or tags) is required"
    );
  }

  const { limit, page, offset } = parseSearchPaging(req.query);
  const currentUserId = getOptionalUserId(req);
  const andFilters = [{ deletedAt: null }];

  if (query) {
    andFilters.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { body: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  for (const tag of tags) {
    andFilters.push({
      tags: {
        some: {
          tag: {
            name: { equals: tag, mode: "insensitive" },
          },
        },
      },
    });
  }

  const posts = await prisma.post.findMany({
    where: { AND: andFilters },
    include: SEARCH_POST_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    skip: offset,
  });

  const hasNextPage = posts.length > limit;
  const pagePosts = hasNextPage ? posts.slice(0, limit) : posts;
  const sortedPosts = query
    ? [...pagePosts].sort((a, b) => postRank(b, query) - postRank(a, query))
    : pagePosts;

  return sendSuccess(res, {
    count: sortedPosts.length,
    page,
    has_next_page: hasNextPage,
    posts: sortedPosts.map((post) => ({
      ...publicPost(post, { currentUserId }),
      rank: query ? postRank(post, query) : undefined,
    })),
  });
});
