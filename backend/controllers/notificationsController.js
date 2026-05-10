const prisma = require("../lib/prisma");
const { asyncHandler, createError, sendSuccess } = require("../utils/apiResponse");
const { publicNotification } = require("../utils/apiPresenters");
const { getAuthUserId, parseLimitOffset, readStringId } = require("../utils/request");

function notificationWhere(req, extra = {}) {
  return {
    userId: getAuthUserId(req),
    ...extra,
  };
}

async function listNotifications(req, extraWhere = {}) {
  const { limit, offset } = parseLimitOffset(req.query, {
    defaultLimit: 20,
    maxLimit: 100,
  });
  const where = notificationWhere(req, extraWhere);

  const [total, notifications] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    limit,
    offset,
    data: notifications.map(publicNotification),
  };
}

/**
 * @desc    Get all notifications of current user (latest first)
 * @route   GET /api/v1/notifications
 * @access  Private
 */
exports.getNotifications = asyncHandler(async (req, res) => {
  const { total, limit, offset, data } = await listNotifications(req);

  return sendSuccess(res, {
    count: data.length,
    total,
    pagination: { limit, offset },
    meta: {
      limit,
      offset,
      total,
      hasNext: offset + data.length < total,
      nextOffset: offset + data.length < total ? offset + limit : null,
    },
    data,
  });
});

/**
 * @desc    Get unread notifications of current user
 * @route   GET /api/v1/notifications/unread
 * @access  Private
 */
exports.getUnreadNotifications = asyncHandler(async (req, res) => {
  const { total, limit, offset, data } = await listNotifications(req, {
    readAt: null,
  });

  return sendSuccess(res, {
    count: data.length,
    total,
    pagination: { limit, offset },
    meta: {
      limit,
      offset,
      total,
      hasNext: offset + data.length < total,
      nextOffset: offset + data.length < total ? offset + limit : null,
    },
    data,
  });
});

/**
 * @desc    Get unread notifications count (for badge)
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private
 */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unread = await prisma.notification.count({
    where: notificationWhere(req, { readAt: null }),
  });

  return sendSuccess(res, { unread });
});

/**
 * @desc    Mark a notification as read
 * @route   PATCH /api/v1/notifications/:id/read
 * @access  Private
 */
exports.markAsRead = asyncHandler(async (req, res) => {
  const notificationId = readStringId(req.params.id, "notification id");
  const result = await prisma.notification.updateMany({
    where: notificationWhere(req, { id: notificationId }),
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    throw createError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }

  return sendSuccess(res);
});

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Private
 */
exports.markAllAsRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: notificationWhere(req, { readAt: null }),
    data: { readAt: new Date() },
  });

  return sendSuccess(res, {
    data: { updated: result.count },
  });
});
