jest.mock("../lib/prisma", () => ({
  post: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  comment: {
    findMany: jest.fn(),
  },
}));

const prisma = require("../lib/prisma");
const postsController = require("../controllers/postsController");
const commentsController = require("../controllers/commentsController");

function mockResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("content controller Prisma flows", () => {
  test("refreshFeed returns Prisma posts with legacy post aliases", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    prisma.post.findMany.mockResolvedValue([
      {
        id: "post_1",
        authorId: "user_1",
        title: "Limit question",
        body: "How do I solve this?",
        imageUrl: null,
        isSolved: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        author: {
          id: "user_1",
          email: "a@example.com",
          username: "alice",
          displayName: "Alice",
          avatarUrl: "/avatar.png",
        },
        tags: [{ tag: { name: "calculus" } }],
        ratings: [{ userId: "user_2", value: "LIKE" }],
      },
    ]);

    const req = { query: {} };
    const res = mockResponse();
    const next = jest.fn();

    await postsController.refreshFeed(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      count: 1,
      data: [
        expect.objectContaining({
          post_id: "post_1",
          description: "How do I solve this?",
          post_image: null,
          is_solved: false,
          tags: ["calculus"],
          likes: 1,
          dislikes: 0,
        }),
      ],
      rows: [
        expect.objectContaining({
          post_id: "post_1",
        }),
      ],
    });
  });

  test("old anonymous comment access returns a restricted contract", async () => {
    const oldDate = new Date("2026-03-01T00:00:00.000Z");
    prisma.post.findFirst.mockResolvedValue({ id: "post_old", createdAt: oldDate });

    const req = { params: { postId: "post_old" }, query: {} };
    const res = mockResponse();
    const next = jest.fn();

    await commentsController.getCommentsAccessControlled(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      restricted: true,
      reason: "LOGIN_REQUIRED",
      post: {
        post_id: "post_old",
        created_at: oldDate,
        is_recent_30d: false,
      },
      data: [],
    });
  });

  test("recent anonymous comment access hides solution comments", async () => {
    const now = new Date();
    prisma.post.findFirst.mockResolvedValue({ id: "post_recent", createdAt: now });
    prisma.comment.findMany.mockResolvedValue([]);

    const req = { params: { postId: "post_recent" }, query: { sort: "popular" } };
    const res = mockResponse();
    const next = jest.fn();

    await commentsController.getCommentsAccessControlled(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.comment.findMany).toHaveBeenCalledWith({
      where: {
        postId: "post_recent",
        deletedAt: null,
        isSolution: false,
      },
      include: expect.any(Object),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        restricted: false,
        count: 0,
        data: [],
      })
    );
  });
});
