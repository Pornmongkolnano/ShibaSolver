const prisma = require("../lib/prisma");
const { createNotification } = require("../services/notificationService");
const { asyncHandler, createError, sendSuccess } = require("../utils/apiResponse");
const { parseLimitOffset, readStringId } = require("../utils/request");
const { publicAdmin } = require("../utils/userPresenter");

const STATUS_FILTERS = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
};

function requireAdminId(req) {
  const adminId = req.admin?.id || req.admin?.admin_id;
  if (!adminId) {
    throw createError(401, "UNAUTHORIZED", "Admin authentication required");
  }
  return adminId;
}

function normalizeStatus(value, { required = false } = {}) {
  const status = String(value ?? "").trim().toLowerCase();
  if (!status) {
    if (required) {
      throw createError(400, "INVALID_STATUS", "status is required");
    }
    return null;
  }

  const normalized = STATUS_FILTERS[status];
  if (!normalized) {
    throw createError(
      400,
      "INVALID_STATUS",
      "status must be one of: pending, accepted, rejected"
    );
  }
  return normalized;
}

function legacyStatus(status) {
  return String(status || "").toLowerCase();
}

function displayName(user) {
  return user?.displayName || user?.username || user?.email || null;
}

function reportTargetId(report) {
  if (!report) return null;
  return report.targetUserId || report.targetPostId || report.targetCommentId || null;
}

function targetTypeToLegacy(targetType) {
  return String(targetType || "").toLowerCase();
}

function serializeBannedUser(user) {
  return {
    user_id: user.id,
    user_name: user.username,
    display_name: user.displayName,
    profile_picture: user.avatarUrl,
    email: user.email,
    user_state: "ban",
    banned_at: user.updatedAt,
  };
}

function serializeAccountReport(report) {
  return {
    report_id: report.id,
    reporter_id: report.reporterId,
    target_id: report.targetUserId,
    reason: report.reason,
    status: legacyStatus(report.status),
    created_at: report.createdAt,
    reporter_name: displayName(report.reporter),
    target_name: displayName(report.targetUser),
    target_username: report.targetUser?.username || null,
  };
}

function serializePostReport(report) {
  return {
    report_id: report.id,
    reporter_id: report.reporterId,
    target_id: report.targetPostId,
    reason: report.reason,
    status: legacyStatus(report.status),
    created_at: report.createdAt,
    reporter_name: displayName(report.reporter),
    post_title: report.targetPost?.title || null,
    post_owner_name: displayName(report.targetPost?.author),
    post_owner_username: report.targetPost?.author?.username || null,
  };
}

function serializeCommentReport(report) {
  return {
    report_id: report.id,
    reporter_id: report.reporterId,
    target_id: report.targetCommentId,
    reason: report.reason,
    status: legacyStatus(report.status),
    created_at: report.createdAt,
    reporter_name: displayName(report.reporter),
    comment_text: report.targetComment?.body || null,
    comment_owner_name: displayName(report.targetComment?.author),
    comment_owner_username: report.targetComment?.author?.username || null,
  };
}

async function listReports(targetType, status, include, serializer) {
  const where = {
    targetType,
    ...(status ? { status } : {}),
  };

  const reports = await prisma.report.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
  });

  return {
    rows: reports.map(serializer),
    total: reports.length,
  };
}

/**
 * @desc    Get all admins (optional search & pagination)
 * @route   GET /api/v1/admins
 * @access  Private/Admin
 */
exports.getAllAdmins = asyncHandler(async (req, res) => {
  requireAdminId(req);
  const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 20, maxLimit: 100 });
  const search = String(req.query.search ?? "").trim();

  const where = {
    role: "ADMIN",
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, admins] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
    }),
  ]);

  return sendSuccess(res, {
    count: admins.length,
    total,
    pagination: { limit, offset },
    data: admins.map(publicAdmin),
  });
});

/**
 * @desc    Get banned users with optional search & pagination
 * @route   GET /api/v1/admins/users/banned
 * @access  Private/Admin
 */
exports.getBannedUsers = asyncHandler(async (req, res) => {
  requireAdminId(req);
  const { limit, offset } = parseLimitOffset(req.query, { defaultLimit: 20, maxLimit: 100 });
  const search = String(req.query.search ?? "").trim();

  const where = {
    status: "BANNED",
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: offset,
      take: limit,
    }),
  ]);

  return sendSuccess(res, {
    count: users.length,
    total,
    pagination: { limit, offset },
    data: users.map(serializeBannedUser),
  });
});

/**
 * @desc    Admin delete a post (soft delete) and cascade delete comments
 * @route   DELETE /api/v1/admins/posts/:postId
 * @access  Private/Admin
 */
exports.adminDeletePost = asyncHandler(async (req, res) => {
  const adminId = requireAdminId(req);
  const postId = readStringId(req.params.postId, "postId");
  const deletedAt = new Date();

  const post = await prisma.$transaction(async (tx) => {
    const existingPost = await tx.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!existingPost) {
      throw createError(404, "POST_NOT_FOUND", "Post not found or already deleted");
    }

    await tx.post.update({
      where: { id: postId },
      data: { deletedAt },
    });

    await tx.comment.updateMany({
      where: { postId, deletedAt: null },
      data: { deletedAt },
    });

    await tx.adminAction.create({
      data: {
        adminId,
        actionType: "DELETE_POST",
        targetType: "POST",
        targetId: postId,
      },
    });

    return existingPost;
  });

  if (post.authorId) {
    await createNotification(null, {
      toUserId: post.authorId,
      type: "admin_delete",
      message: "Your post has been removed by an administrator.",
      link: `/post/${postId}`,
    });
  }

  return sendSuccess(res, {
    message: "Post deleted with comments cascaded",
    data: { post_id: post.id, user_id: post.authorId },
  });
});

/**
 * @desc    Admin: delete (soft delete) a comment
 * @route   DELETE /api/v1/admins/comments/:commentId
 * @access  Admin
 */
exports.adminDeleteComment = asyncHandler(async (req, res) => {
  const adminId = requireAdminId(req);
  const commentId = readStringId(req.params.commentId, "commentId");
  const deletedAt = new Date();

  const comment = await prisma.$transaction(async (tx) => {
    const existingComment = await tx.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { id: true, authorId: true, postId: true },
    });

    if (!existingComment) {
      throw createError(404, "COMMENT_NOT_FOUND", "Comment not found or already deleted");
    }

    await tx.comment.update({
      where: { id: commentId },
      data: { deletedAt },
    });

    await tx.adminAction.create({
      data: {
        adminId,
        actionType: "DELETE_COMMENT",
        targetType: "COMMENT",
        targetId: commentId,
      },
    });

    return existingComment;
  });

  if (comment.authorId) {
    await createNotification(null, {
      toUserId: comment.authorId,
      type: "admin_delete",
      message: "Your comment has been removed by an administrator.",
      link: comment.postId ? `/post/${comment.postId}` : null,
    });
  }

  return sendSuccess(res, {
    message: "Comment deleted successfully",
    data: { comment_id: comment.id, user_id: comment.authorId, post_id: comment.postId },
  });
});

/**
 * @desc    Ban a user by admin
 * @route   POST /api/v1/admins/banUser/:userId
 * @access  Private/Admin
 */
exports.adminBanUser = asyncHandler(async (req, res) => {
  const adminId = requireAdminId(req);
  const userId = readStringId(req.params.userId, "userId");

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user || user.status === "DELETED") {
      throw createError(404, "USER_NOT_FOUND", "User not found");
    }

    const alreadyBanned = user.status === "BANNED";

    if (!alreadyBanned) {
      await tx.user.update({
        where: { id: userId },
        data: { status: "BANNED" },
      });
    }

    await tx.adminAction.create({
      data: {
        adminId,
        actionType: "BAN_USER",
        targetType: "USER",
        targetId: userId,
      },
    });

    return { alreadyBanned };
  });

  if (!result.alreadyBanned) {
    await createNotification(null, {
      toUserId: userId,
      type: "ban",
      message: "Your account has been banned by an administrator.",
      link: null,
    });
  }

  return sendSuccess(res, {
    data: { user_id: userId, user_state: "ban" },
    alreadyBanned: result.alreadyBanned,
  });
});

/**
 * @desc    Unban a user by admin
 * @route   PATCH /api/v1/admins/unbanUser/:userId
 * @access  Private/Admin
 */
exports.adminUnbanUser = asyncHandler(async (req, res) => {
  const adminId = requireAdminId(req);
  const userId = readStringId(req.params.userId, "userId");

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user || user.status === "DELETED") {
      throw createError(404, "USER_NOT_FOUND", "User not found");
    }

    const alreadyNormal = user.status === "ACTIVE";

    if (!alreadyNormal) {
      await tx.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
    }

    await tx.adminAction.create({
      data: {
        adminId,
        actionType: "UNBAN_USER",
        targetType: "USER",
        targetId: userId,
      },
    });

    return { alreadyNormal };
  });

  if (!result.alreadyNormal) {
    await createNotification(null, {
      toUserId: userId,
      type: "unban",
      message: "Your account has been unbanned by an administrator.",
      link: null,
    });
  }

  return sendSuccess(res, {
    data: { user_id: userId, user_state: "normal" },
    alreadyNormal: result.alreadyNormal,
  });
});

/**
 * @desc    Admin: view all user account reports
 * @route   GET /api/v1/admins/accounts?status=pending|accepted|rejected
 * @access  Admin
 */
exports.adminGetAccountReports = asyncHandler(async (req, res) => {
  requireAdminId(req);
  const status = normalizeStatus(req.query.status);
  const { rows, total } = await listReports(
    "USER",
    status,
    {
      reporter: true,
      targetUser: true,
    },
    serializeAccountReport
  );

  return sendSuccess(res, { count: rows.length, total, data: rows });
});

/**
 * @desc    Admin: view all post reports
 * @route   GET /api/v1/admins/posts?status=pending|accepted|rejected
 * @access  Admin
 */
exports.adminGetPostReports = asyncHandler(async (req, res) => {
  requireAdminId(req);
  const status = normalizeStatus(req.query.status);
  const { rows, total } = await listReports(
    "POST",
    status,
    {
      reporter: true,
      targetPost: {
        include: { author: true },
      },
    },
    serializePostReport
  );

  return sendSuccess(res, { count: rows.length, total, data: rows });
});

/**
 * @desc    Admin: view all comment reports
 * @route   GET /api/v1/admins/comments?status=pending|accepted|rejected
 * @access  Admin
 */
exports.adminGetCommentReports = asyncHandler(async (req, res) => {
  requireAdminId(req);
  const status = normalizeStatus(req.query.status);
  const { rows, total } = await listReports(
    "COMMENT",
    status,
    {
      reporter: true,
      targetComment: {
        include: { author: true },
      },
    },
    serializeCommentReport
  );

  return sendSuccess(res, { count: rows.length, total, data: rows });
});

/**
 * @desc    Admin: update report status (accept / reject)
 * @route   PATCH /api/v1/reports/:id/status
 * @access  Admin
 */
exports.adminUpdateReportStatus = asyncHandler(async (req, res) => {
  const adminId = requireAdminId(req);
  const reportId = readStringId(
    req.params.id ?? req.params.reportId ?? req.params.report_id,
    "reportId"
  );
  const status = normalizeStatus(req.body.status, { required: true });

  const updated = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        targetType: true,
        targetUserId: true,
        targetPostId: true,
        targetCommentId: true,
      },
    });

    if (!report) {
      throw createError(404, "REPORT_NOT_FOUND", "Report not found");
    }

    const nextReport = await tx.report.update({
      where: { id: reportId },
      data: {
        status,
        reviewerId: adminId,
        reviewedAt: new Date(),
      },
    });

    await tx.adminAction.create({
      data: {
        adminId,
        actionType: "RESOLVE_REPORT",
        targetType: report.targetType,
        targetId: reportTargetId(report) || report.id,
      },
    });

    return nextReport;
  });

  const statusLabel = legacyStatus(updated.status);

  return sendSuccess(res, {
    message: `Report #${reportId} updated to '${statusLabel}'`,
    data: {
      report_id: updated.id,
      target_type: targetTypeToLegacy(updated.targetType),
      target_id: reportTargetId(updated),
      status: statusLabel,
      admin_id: updated.reviewerId,
    },
  });
});
