# Full Redesign Roadmap

## Direction

This rewrite does not need to preserve the old SQL schema or old API contracts. The new target is a production-first system with Prisma as the database source of truth, a unified auth model, consistent API responses, and a frontend that talks through a single API client.

## Database Redesign

The new Prisma schema in `backend/prisma/schema.prisma` intentionally replaces the old hand-written SQL fragments. It models:

- Users with roles, status, profile fields, sessions, and auth identities.
- Auth identities for both Google and password login.
- Posts, comments, tags, bookmarks, and ratings.
- Reports, admin actions, notifications, and cookie consent records.

The next migration branch should generate and review the initial SQL migration from this schema, then add database-level constraints that Prisma cannot express directly, especially:

- A rating must target exactly one post or one comment.
- A report must target exactly one user, post, or comment matching `targetType`.

## Implementation Order

1. Finish foundation: CI, env, lint/build/test, API/upload helpers, production runbook.
2. Generate initial Prisma migration and admin bootstrap workflow.
3. Rewrite auth around `User`, `AuthIdentity`, and `Session`.
4. Rewrite posts/comments/ratings/reports/notifications against Prisma.
5. Replace frontend data access with the shared API client.
6. Remove legacy Pages Router routes and old SQL command files after the replacement API is working.

## Completed In `codex/prisma-auth-redesign`

- Initial Prisma migration generated from the redesigned schema.
- Database CHECK constraints added for rating/report target integrity.
- User password register/login, Google login, logout, and `/auth/me` moved to Prisma-backed opaque sessions.
- Admin login/logout/session check moved to role-based Prisma users.
- Admin bootstrap command added with `npm run admin:create`.
