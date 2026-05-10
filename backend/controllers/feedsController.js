const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../utils/apiResponse");
const { publicPost, ratingSummary } = require("../utils/apiPresenters");
const { parseLimitOffset } = require("../utils/request");

const FEED_INCLUDE = {
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

function topCommentForPost(post) {
  if (!post.comments?.length) return null;

  return [...post.comments].sort((a, b) => {
    const aVotes = ratingSummary(a.ratings).total_votes;
    const bVotes = ratingSummary(b.ratings).total_votes;
    if (bVotes !== aVotes) return bVotes - aVotes;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

exports.getFeed = asyncHandler(async (req, res) => {
  const currentUserId = getOptionalUserId(req);
  const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 20, maxLimit: 100 });
  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    include: FEED_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    skip: offset,
  });

  const data = posts.map((post) =>
    publicPost(post, {
      currentUserId,
      topComment: topCommentForPost(post),
    })
  );

  return sendSuccess(res, {
    count: data.length,
    data,
  });
});
