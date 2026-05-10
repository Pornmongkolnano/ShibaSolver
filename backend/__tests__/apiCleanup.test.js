jest.mock("../lib/prisma", () => ({
  $transaction: jest.fn(),
  notification: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  post: {
    findFirst: jest.fn(),
  },
  comment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  rating: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  report: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
}));

const prisma = require("../lib/prisma");
const notificationsController = require("../controllers/notificationsController");
const ratingController = require("../controllers/ratingController");
const reportController = require("../controllers/reportController");
const { normalizeNotificationType } = require("../services/notificationService");

function mockResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function authReq(overrides = {}) {
  return {
    currentUser: { id: "user_1" },
    user: { id: "user_1", uid: "user_1" },
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("notification api cleanup", () => {
  test("getUnreadCount uses Prisma readAt null contract", async () => {
    prisma.notification.count.mockResolvedValue(3);
    const req = authReq();
    const res = mockResponse();
    const next = jest.fn();

    await notificationsController.getUnreadCount(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "user_1", readAt: null },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, unread: 3 });
  });

  test("notification types normalize legacy lower-case names", () => {
    expect(normalizeNotificationType("comment")).toBe("COMMENT");
    expect(normalizeNotificationType("admin_delete")).toBe("ADMIN_DELETE");
    expect(normalizeNotificationType("unknown")).toBe("SYSTEM");
  });
});

describe("rating api cleanup", () => {
  test("rate upserts a post rating and returns legacy aliases", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    prisma.post.findFirst.mockResolvedValue({ id: "post_1" });
    prisma.rating.upsert.mockResolvedValue({
      id: "rating_1",
      userId: "user_1",
      postId: "post_1",
      commentId: null,
      value: "LIKE",
      createdAt: now,
      updatedAt: now,
    });
    prisma.rating.findMany.mockResolvedValue([
      { userId: "user_1", value: "LIKE" },
      { userId: "user_2", value: "DISLIKE" },
    ]);
    const req = authReq({
      body: { target_type: "post", target_id: "post_1", rating_type: "like" },
    });
    const res = mockResponse();
    const next = jest.fn();

    await ratingController.rate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.rating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_postId: { userId: "user_1", postId: "post_1" } },
        create: { userId: "user_1", value: "LIKE", postId: "post_1" },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        target_type: "post",
        target_id: "post_1",
        rating: expect.objectContaining({
          rating_id: "rating_1",
          rating_type: "like",
        }),
        summary: { likes: 1, dislikes: 1, my_rating: "like" },
      }),
    });
  });

  test("getSummaryBatch returns zero summaries for unrated ids", async () => {
    prisma.rating.findMany.mockResolvedValue([]);
    const req = authReq({
      query: { target_type: "comment", ids: "comment_1,comment_2" },
    });
    const res = mockResponse();
    const next = jest.fn();

    await ratingController.getSummaryBatch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      target_type: "comment",
      data: [
        { id: "comment_1", likes: 0, dislikes: 0, my_rating: null },
        { id: "comment_2", likes: 0, dislikes: 0, my_rating: null },
      ],
    });
  });
});

describe("report api cleanup", () => {
  test("reportAccount writes target-specific Prisma columns", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    prisma.user.findFirst.mockResolvedValue({ id: "user_2" });
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.report.create.mockResolvedValue({
      id: "report_1",
      reporterId: "user_1",
      reviewerId: null,
      targetType: "USER",
      targetUserId: "user_2",
      targetPostId: null,
      targetCommentId: null,
      reason: "spam",
      status: "PENDING",
      createdAt: now,
      reviewedAt: null,
    });
    const req = authReq({
      body: { target_id: "user_2", reason: "spam" },
    });
    const res = mockResponse();
    const next = jest.fn();

    await reportController.reportAccount(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        reporterId: "user_1",
        reason: "spam",
        targetType: "USER",
        targetUserId: "user_2",
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User reported successfully",
      data: expect.objectContaining({
        report_id: "report_1",
        target_type: "user",
        target_id: "user_2",
      }),
    });
  });
});
