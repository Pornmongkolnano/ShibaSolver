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
  publicNotification,
  publicRating,
  publicReport,
};
