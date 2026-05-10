const { publicAdmin, publicUser } = require("../utils/userPresenter");

describe("user presenters", () => {
  const user = {
    id: "user_1",
    email: "learner@example.com",
    username: "learner",
    displayName: "Learner",
    avatarUrl: "https://example.com/avatar.png",
    bio: "Solves problems",
    educationLevel: "University",
    interestedSubjects: ["Math"],
    role: "ADMIN",
    status: "ACTIVE",
    isPremium: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  test("publicUser keeps new fields and legacy compatibility aliases", () => {
    expect(publicUser(user)).toMatchObject({
      id: "user_1",
      user_id: "user_1",
      username: "learner",
      user_name: "learner",
      displayName: "Learner",
      display_name: "Learner",
      avatarUrl: "https://example.com/avatar.png",
      profile_picture: "https://example.com/avatar.png",
      status: "ACTIVE",
      user_state: "active",
    });
  });

  test("publicAdmin exposes admin-compatible identity fields", () => {
    expect(publicAdmin(user)).toEqual({
      id: "user_1",
      admin_id: "user_1",
      name: "Learner",
      email: "learner@example.com",
      role: "ADMIN",
    });
  });
});
