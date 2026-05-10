const prisma = require("../lib/prisma");

const TYPE_MAP = {
  comment: "COMMENT",
  reply: "REPLY",
  mention: "MENTION",
  ban: "BAN",
  unban: "UNBAN",
  admin_delete: "ADMIN_DELETE",
  system: "SYSTEM",
};

function normalizeNotificationType(type) {
  const normalized = String(type || "system").trim().toLowerCase();
  return TYPE_MAP[normalized] || "SYSTEM";
}

async function createNotification(_pool, {
  toUserId,
  type,
  message,
  link = null,
}) {
  if (!toUserId || !message) return null;

  return prisma.notification.create({
    data: {
      userId: String(toUserId),
      type: normalizeNotificationType(type),
      message,
      link,
    },
  });
}

module.exports = {
  createNotification,
  normalizeNotificationType,
};
