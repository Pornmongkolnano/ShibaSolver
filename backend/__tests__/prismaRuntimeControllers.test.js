jest.mock("../lib/prisma", () => ({
  $transaction: jest.fn(),
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  post: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  comment: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  adminAction: {
    create: jest.fn(),
  },
  report: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("../services/notificationService", () => ({
  createNotification: jest.fn(),
}));

const prisma = require("../lib/prisma");
const { createNotification } = require("../services/notificationService");
const adminsController = require("../controllers/adminsController");
const searchController = require("../controllers/searchController");
const usersController = require("../controllers/usersController");

function mockResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function runTransaction(arg) {
  if (Array.isArray(arg)) return Promise.all(arg);
  return arg(prisma);
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(runTransaction);
});

describe("Prisma runtime controller migration", () => {
  test("searchUsers returns public user aliases with stable string ids", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user_1",
        email: "alice@example.com",
        username: "alice",
        displayName: "Alice Solver",
        avatarUrl: null,
        bio: null,
        educationLevel: null,
        interestedSubjects: ["math"],
        role: "USER",
        status: "ACTIVE",
        isPremium: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const req = { query: { query: "ali" } };
    const res = mockResponse();
    const next = jest.fn();

    await searchController.searchUsers(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: { not: "DELETED" },
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        count: 1,
        users: [
          expect.objectContaining({
            user_id: "user_1",
            user_name: "alice",
            display_name: "Alice Solver",
            rank: expect.any(Number),
          }),
        ],
      })
    );
  });

  test("getPostbyUserId returns public posts with rating stats and top comment", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    prisma.post.count.mockResolvedValue(1);
    prisma.post.findMany.mockResolvedValue([
      {
        id: "post_1",
        authorId: "user_1",
        title: "Integral help",
        body: "How do I solve this?",
        imageUrl: null,
        isSolved: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        author: {
          id: "user_1",
          email: "alice@example.com",
          username: "alice",
          displayName: "Alice",
          avatarUrl: null,
        },
        tags: [{ tag: { name: "calculus" } }],
        ratings: [{ userId: "viewer_1", value: "LIKE" }],
        comments: [
          {
            id: "comment_1",
            postId: "post_1",
            authorId: "user_2",
            parentId: null,
            body: "Try substitution.",
            imageUrl: null,
            isSolution: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            author: {
              id: "user_2",
              email: "bob@example.com",
              username: "bob",
              displayName: "Bob",
              avatarUrl: null,
            },
            ratings: [
              { userId: "viewer_1", value: "LIKE" },
              { userId: "user_3", value: "LIKE" },
            ],
          },
        ],
      },
    ]);

    const req = {
      currentUser: { id: "viewer_1" },
      params: { userID: "user_1" },
      query: { page: "1", limit: "10" },
    };
    const res = mockResponse();
    const next = jest.fn();

    await usersController.getPostbyUserId(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: "user_1", deletedAt: null },
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        count: 1,
        data: [
          expect.objectContaining({
            post_id: "post_1",
            stats: { likes: 1, dislikes: 0 },
            liked_by_user: true,
            top_comment: expect.objectContaining({
              comment_id: "comment_1",
              likes: 2,
            }),
          }),
        ],
      })
    );
  });

  test("adminBanUser uses Prisma enum status and logs the action", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user_2", status: "ACTIVE" });
    prisma.user.update.mockResolvedValue({ id: "user_2", status: "BANNED" });
    prisma.adminAction.create.mockResolvedValue({ id: "action_1" });

    const req = {
      admin: { id: "admin_1" },
      params: { userId: "user_2" },
    };
    const res = mockResponse();
    const next = jest.fn();

    await adminsController.adminBanUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_2" },
      data: { status: "BANNED" },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin_1",
        actionType: "BAN_USER",
        targetType: "USER",
        targetId: "user_2",
      },
    });
    expect(createNotification).toHaveBeenCalledWith(null, {
      toUserId: "user_2",
      type: "ban",
      message: "Your account has been banned by an administrator.",
      link: null,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user_id: "user_2", user_state: "ban" },
      alreadyBanned: false,
    });
  });

  test("adminUpdateReportStatus writes reviewer, reviewedAt, and resolve action", async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: "report_1",
      targetType: "POST",
      targetUserId: null,
      targetPostId: "post_1",
      targetCommentId: null,
    });
    prisma.report.update.mockResolvedValue({
      id: "report_1",
      reviewerId: "admin_1",
      targetType: "POST",
      targetUserId: null,
      targetPostId: "post_1",
      targetCommentId: null,
      status: "ACCEPTED",
    });
    prisma.adminAction.create.mockResolvedValue({ id: "action_1" });

    const req = {
      admin: { id: "admin_1" },
      params: { reportId: "report_1" },
      body: { status: "accepted" },
    };
    const res = mockResponse();
    const next = jest.fn();

    await adminsController.adminUpdateReportStatus(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.report.update).toHaveBeenCalledWith({
      where: { id: "report_1" },
      data: {
        status: "ACCEPTED",
        reviewerId: "admin_1",
        reviewedAt: expect.any(Date),
      },
    });
    expect(prisma.adminAction.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin_1",
        actionType: "RESOLVE_REPORT",
        targetType: "POST",
        targetId: "post_1",
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Report #report_1 updated to 'accepted'",
      data: {
        report_id: "report_1",
        target_type: "post",
        target_id: "post_1",
        status: "accepted",
        admin_id: "admin_1",
      },
    });
  });
});
