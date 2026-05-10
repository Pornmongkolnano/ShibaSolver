const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendCreated } = require("../utils/apiResponse");
const { publicReport } = require("../utils/apiPresenters");
const {
  getAuthUserId,
  readLimitedText,
  readStringId,
  readTargetType,
} = require("../utils/request");

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function duplicateWindowStart() {
  return new Date(Date.now() - DUPLICATE_WINDOW_MS);
}

function reportTargetCreateData(targetType, targetId) {
  if (targetType === "user") {
    return { targetType: "USER", targetUserId: targetId };
  }
  if (targetType === "post") {
    return { targetType: "POST", targetPostId: targetId };
  }
  return { targetType: "COMMENT", targetCommentId: targetId };
}

function reportTargetWhere(targetType, targetId) {
  if (targetType === "user") {
    return { targetType: "USER", targetUserId: targetId };
  }
  if (targetType === "post") {
    return { targetType: "POST", targetPostId: targetId };
  }
  return { targetType: "COMMENT", targetCommentId: targetId };
}

async function assertReportTargetExists(targetType, targetId) {
  if (targetType === "user") {
    const user = await prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw createError(404, "TARGET_NOT_FOUND", "Target user not found");
    return;
  }

  const model = targetType === "post" ? prisma.post : prisma.comment;
  const target = await model.findFirst({
    where: { id: targetId, deletedAt: null },
    select: { id: true },
  });
  if (!target) {
    throw createError(
      404,
      "TARGET_NOT_FOUND",
      `The ${targetType} you are trying to report has been removed or not found`
    );
  }
}

async function assertNoRecentDuplicateReport(reporterId, targetType, targetId) {
  const duplicate = await prisma.report.findFirst({
    where: {
      reporterId,
      ...reportTargetWhere(targetType, targetId),
      createdAt: { gte: duplicateWindowStart() },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw createError(
      429,
      "DUPLICATE_REPORT",
      `You have already reported this ${targetType} recently`
    );
  }
}

async function createReport({ reporterId, targetType, targetId, reason }) {
  await assertReportTargetExists(targetType, targetId);
  await assertNoRecentDuplicateReport(reporterId, targetType, targetId);

  return prisma.report.create({
    data: {
      reporterId,
      reason,
      ...reportTargetCreateData(targetType, targetId),
    },
  });
}

/**
 * @desc    Report a violating account (user)
 * @route   POST /api/v1/reports/accounts
 * @access  Private
 * @body    { target_id: string, reason: string }
 */
exports.reportAccount = asyncHandler(async (req, res) => {
  const reporterId = getAuthUserId(req);
  const targetId = readStringId(req.body?.target_id, "target_id");
  const reason = readLimitedText(req.body?.reason, "reason", { min: 3, max: 1000 });

  if (reporterId === targetId) {
    throw createError(400, "SELF_REPORT", "You cannot report yourself");
  }

  const report = await createReport({
    reporterId,
    targetType: "user",
    targetId,
    reason,
  });

  return sendCreated(res, {
    message: "User reported successfully",
    data: publicReport(report),
  });
});

/**
 * @desc    Report a violating post or comment
 * @route   POST /api/v1/reports/content
 * @access  Private
 * @body    { target_type: "post"|"comment", target_id: string, reason: string }
 */
exports.reportPostOrComment = asyncHandler(async (req, res) => {
  const reporterId = getAuthUserId(req);
  const targetType = readTargetType(req.body?.target_type);
  const targetId = readStringId(req.body?.target_id, "target_id");
  const reason = readLimitedText(req.body?.reason, "reason", { min: 3, max: 1000 });

  const report = await createReport({
    reporterId,
    targetType,
    targetId,
    reason,
  });

  return sendCreated(res, {
    message: `${targetType} reported successfully`,
    data: publicReport(report),
  });
});
