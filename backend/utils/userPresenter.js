function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    user_id: user.id,
    email: user.email,
    username: user.username,
    user_name: user.username,
    displayName: user.displayName,
    display_name: user.displayName,
    avatarUrl: user.avatarUrl,
    profile_picture: user.avatarUrl,
    bio: user.bio,
    educationLevel: user.educationLevel,
    education_level: user.educationLevel,
    interestedSubjects: user.interestedSubjects,
    interested_subjects: user.interestedSubjects,
    role: user.role,
    status: user.status,
    user_state: user.status.toLowerCase(),
    isPremium: user.isPremium,
    is_premium: user.isPremium,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

function publicAdmin(user) {
  return {
    id: user.id,
    admin_id: user.id,
    name: user.displayName || user.username || user.email,
    email: user.email,
    role: user.role,
  };
}

module.exports = {
  publicAdmin,
  publicUser,
};
