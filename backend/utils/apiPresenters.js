function lowerEnum(value) {
  return value ? String(value).toLowerCase() : value;
}

function publicNotification(notification) {
  if (!notification) return null;
  const isRead = Boolean(notification.readAt);
  const type = lowerEnum(notification.type);

  return {
    id: notification.id,
    notification_id: notification.id,
    type,
    notification_type: type,
    message: notification.message,
    link: notification.link,
    readAt: notification.readAt,
    is_read: isRead,
    createdAt: notification.createdAt,
    created_at: notification.createdAt,
  };
}

function publicRating(rating) {
  if (!rating) return null;
  const value = lowerEnum(rating.value);

  return {
    id: rating.id,
    rating_id: rating.id,
    userId: rating.userId,
    user_id: rating.userId,
    postId: rating.postId,
    post_id: rating.postId,
    commentId: rating.commentId,
    comment_id: rating.commentId,
    value,
    rating_type: value,
    createdAt: rating.createdAt,
    created_at: rating.createdAt,
    updatedAt: rating.updatedAt,
    updated_at: rating.updatedAt,
  };
}

function publicAuthor(user) {
  if (!user) return null;
  const displayName = user.displayName || user.username || user.email || "Unknown user";

  return {
    id: user.id,
    user_id: user.id,
    username: user.username,
    user_name: user.username || displayName,
    displayName,
    display_name: displayName,
    avatarUrl: user.avatarUrl,
    profile_picture: user.avatarUrl,
  };
}

function ratingSummary(ratings = [], currentUserId = null) {
  let likes = 0;
  let dislikes = 0;
  let myRating = null;

  for (const rating of ratings || []) {
    if (rating.value === "LIKE") likes += 1;
    if (rating.value === "DISLIKE") dislikes += 1;
    if (currentUserId && rating.userId === currentUserId) {
      myRating = lowerEnum(rating.value);
    }
  }

  return {
    likes,
    dislikes,
    total_votes: likes + dislikes,
    my_rating: myRating,
  };
}

function presentTags(tags = []) {
  return (tags || [])
    .map((item) => item?.tag?.name || item?.name || item?.tag_name || item)
    .filter(Boolean);
}

function publicComment(comment, { currentUserId = null } = {}) {
  if (!comment) return null;
  const author = publicAuthor(comment.author);
  const summary = ratingSummary(comment.ratings, currentUserId);
  const totalVotes = summary.likes + summary.dislikes;
  const ratio = totalVotes > 0 ? summary.likes / totalVotes : null;
  const isUpdated = comment.updatedAt && comment.createdAt
    ? new Date(comment.updatedAt).getTime() !== new Date(comment.createdAt).getTime()
    : false;

  return {
    id: comment.id,
    comment_id: comment.id,
    authorId: comment.authorId,
    user_id: comment.authorId,
    postId: comment.postId,
    post_id: comment.postId,
    post: comment.post
      ? {
          id: comment.post.id,
          post_id: comment.post.id,
          title: comment.post.title,
        }
      : undefined,
    post_title: comment.post?.title,
    parentId: comment.parentId,
    parent_comment: comment.parentId,
    body: comment.body,
    text: comment.body,
    imageUrl: comment.imageUrl,
    comment_image: comment.imageUrl,
    isSolution: comment.isSolution,
    is_solution: comment.isSolution,
    is_updated: isUpdated,
    createdAt: comment.createdAt,
    created_at: comment.createdAt,
    updatedAt: comment.updatedAt,
    updated_at: comment.updatedAt,
    deletedAt: comment.deletedAt,
    is_deleted: Boolean(comment.deletedAt),
    author,
    user_name: author?.user_name || null,
    display_name: author?.display_name || null,
    profile_picture: author?.profile_picture || null,
    likes: summary.likes,
    dislikes: summary.dislikes,
    total_votes: totalVotes,
    ratio,
    my_rating: summary.my_rating,
    replies: Array.isArray(comment.replies)
      ? comment.replies.map((reply) => publicComment(reply, { currentUserId }))
      : undefined,
  };
}

function publicPost(post, {
  currentUserId = null,
  topComment = undefined,
  bookmarkedAt = undefined,
} = {}) {
  if (!post) return null;
  const author = publicAuthor(post.author);
  const summary = ratingSummary(post.ratings, currentUserId);

  const payload = {
    id: post.id,
    post_id: post.id,
    authorId: post.authorId,
    user_id: post.authorId,
    poster_id: post.authorId,
    title: post.title,
    body: post.body,
    description: post.body,
    imageUrl: post.imageUrl,
    post_image: post.imageUrl,
    problem_image: post.imageUrl,
    isSolved: post.isSolved,
    is_solved: post.isSolved,
    createdAt: post.createdAt,
    created_at: post.createdAt,
    updatedAt: post.updatedAt,
    updated_at: post.updatedAt,
    deletedAt: post.deletedAt,
    is_deleted: Boolean(post.deletedAt),
    author,
    user_name: author?.user_name || null,
    display_name: author?.display_name || null,
    profile_picture: author?.profile_picture || null,
    tags: presentTags(post.tags),
    likes: summary.likes,
    dislikes: summary.dislikes,
    stats: {
      likes: summary.likes,
      dislikes: summary.dislikes,
    },
    my_rating: summary.my_rating,
    liked_by_user: summary.my_rating === "like",
    disliked_by_user: summary.my_rating === "dislike",
  };

  if (bookmarkedAt !== undefined) {
    payload.bookmarkedAt = bookmarkedAt;
    payload.bookmarked_at = bookmarkedAt;
  }

  if (topComment !== undefined) {
    payload.top_comment = topComment ? publicComment(topComment, { currentUserId }) : null;
  }

  return payload;
}

function publicReport(report) {
  if (!report) return null;
  const targetType = lowerEnum(report.targetType);
  const status = lowerEnum(report.status);
  const targetId =
    report.targetUserId || report.targetPostId || report.targetCommentId || null;

  return {
    id: report.id,
    report_id: report.id,
    reporterId: report.reporterId,
    reporter_id: report.reporterId,
    reviewerId: report.reviewerId,
    reviewer_id: report.reviewerId,
    targetType,
    target_type: targetType,
    targetId,
    target_id: targetId,
    targetUserId: report.targetUserId,
    target_user_id: report.targetUserId,
    targetPostId: report.targetPostId,
    target_post_id: report.targetPostId,
    targetCommentId: report.targetCommentId,
    target_comment_id: report.targetCommentId,
    reason: report.reason,
    status,
    createdAt: report.createdAt,
    created_at: report.createdAt,
    reviewedAt: report.reviewedAt,
    reviewed_at: report.reviewedAt,
  };
}

module.exports = {
  publicAuthor,
  publicComment,
  publicNotification,
  publicPost,
  publicRating,
  publicReport,
  ratingSummary,
};
