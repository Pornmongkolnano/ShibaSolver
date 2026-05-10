# Agent Handoff: ShibaSolver

Last inspected: 2026-05-11

## Current Repo State

- Branch: `main`
- Remote tracking: `origin/main`
- Worktree before this file was created: clean
- Project layout: no root package manager entrypoint; work is split into two independent packages:
  - `backend/`: Express REST API over PostgreSQL
  - `frontend/`: Next.js app using React, Tailwind, and MUI

## Product Summary

ShibaSolver is a learning/problem-solving web platform. Users sign in with Google, create posts with tags and images, comment or reply with possible solution marking, rate posts/comments, bookmark posts, receive notifications, and report accounts/content. Admin users can log in separately and moderate users, posts, comments, and reports.

## Architecture

### Backend

- Runtime: Node.js CommonJS
- Framework: Express 5
- Database: PostgreSQL via `pg`
- Auth:
  - User auth uses Google ID token verification in `backend/controllers/authController.js`.
  - User session JWT is stored in the `ss_token` cookie and can also be sent as `Authorization: Bearer <token>`.
  - Admin auth uses email/password in `backend/controllers/adminAuthController.js`.
  - Admin JWT is stored in `admin_access_token` and must include `scope: "admin"`.
- API docs:
  - Swagger UI: `GET /api-docs`
  - JSON spec: `GET /api-docs.json`
  - Source: `backend/docs/openapi.js` and `backend/docs/paths.js`
- Server entrypoint: `backend/server.js`
- DB connection: `backend/config/db.js`

Main mounted routes from `backend/server.js`:

- `/api/v1/auth`
- `/api/v1/adminAuth`
- `/api/v1/admins`
- `/api/v1/users`
- `/api/v1/posts`
- `/api/v1/feeds`
- `/api/v1/comments`
- `/api/v1/ratings`
- `/api/v1/reports`
- `/api/v1/notifications`
- `/api/v1/search`

Backend security middleware currently includes `helmet`, `cors`, `express-rate-limit` for admin login, `express-xss-sanitizer`, and `hpp`.

### Frontend

- Runtime: Next.js 15, React 19
- Router shape: mostly App Router under `frontend/src/app`, with legacy Pages Router files under `frontend/src/pages`.
- Styling: Tailwind CSS 4, MUI, custom globals in `frontend/src/app/globals.css`
- Root layout: `frontend/src/app/layout.tsx`
- Main feed: `frontend/src/app/page.tsx` -> `frontend/src/components/FeedPageContent.tsx`
- Top navigation: `frontend/src/components/topMenu/TopMenu.tsx`
- Notifications state: `frontend/src/context/NotificationContext.tsx`
- API access is spread through hooks and utility files under `frontend/src/hooks` and `frontend/src/utils`.

Important frontend routes:

- `/`: feed, search, saved posts, notification panel, create-post modal
- `/signup`: Google sign-in
- `/register`: profile registration after Google sign-in
- `/settings`: logout and account settings surface
- `/post/[postId]/[slug]`: dedicated post view
- `/user/[username]`: public profile
- `/user/me`: current-user redirect/profile helper
- `/user/edit`: edit profile
- `/admin-login`: admin login
- `/admin`: admin dashboard
- `/admin/reports`: moderation reports
- `/admin/banned-accounts`: banned account list
- `/data-policy`: data policy

## Environment

### Backend

`backend/server.js` loads `backend/config/config.env`, which is ignored by Git. Expected variables inferred from code:

```env
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=...
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
COOKIE_DOMAIN=
SWAGGER_SERVER_URL=http://localhost:5000
API_BASE_URL=http://localhost:5000
```

`DATABASE_URL`, `JWT_SECRET`, and `GOOGLE_CLIENT_ID` are required for real backend use.

### Frontend

Use `frontend/.env.local` for public browser variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_USE_MOCK=0
```

The code uses both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_URL`; keep them aligned until the API base handling is consolidated.

Image upload currently uses hard-coded Cloudinary values in `frontend/src/utils/uploadImage.ts`:

- Cloud name: `dkhggwcub`
- Upload preset: `unsigned_preset`

Move these to env variables before production use.

## Local Setup

Install dependencies separately:

```bash
cd backend
npm ci

cd ../frontend
npm ci
```

Start backend:

```bash
cd backend
npm run dev
```

Start frontend:

```bash
cd frontend
npm run dev
```

Expected local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- Swagger: `http://localhost:5000/api-docs`

## Database Notes

SQL files live under `backend/SQL_command`.

Tables/entities represented by the code:

- `users`
- `admins`
- `tags`
- `posts`
- `post_tags`
- `comments`
- `bookmarks`
- `ratings`
- `reports`
- `notifications`
- `cookie_consents`
- `admin_actions`

Enums are defined in `backend/SQL_command/enum.sql`.

Important caveat: do not assume `backend/SQL_command/All_table.sql` is directly runnable in its current state. During inspection, schema drift and SQL syntax issues were visible:

- `users.sql` and the `users` block inside `All_table.sql` end with a trailing comma before `)`.
- `admins.sql` includes `email` and `password`, but the `admins` table inside `All_table.sql` only includes `admin_id` and `name`.
- `admins.sql` also has a trailing comma before `)`.
- `cookie_consents` uses `gen_random_uuid()`, so the database needs an extension such as `pgcrypto`.

Before provisioning a fresh DB, fix the schema files or create a single migration source of truth.

## Validation Performed

Commands run from this checkout:

```bash
cd backend
npm ci
npm test -- --runInBand --watchAll=false
npm audit --omit=dev --audit-level=high
node server.js

cd ../frontend
npm ci
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Results:

- `backend/npm ci`: completed successfully.
- `frontend/npm ci`: completed successfully.
- `backend/npm test -- --runInBand --watchAll=false`: failed because Jest found zero test files, not because assertions failed.
- `frontend/npm run lint`: failed because `next lint` is deprecated and the project has no ESLint config, so Next opened an interactive ESLint setup prompt.
- `frontend/npm run build`: passed. Next produced a production build for 18 App Router routes and 3 legacy Pages Router routes.
- `backend/node server.js`: failed locally because `backend/config/config.env` is absent and no PostgreSQL connection config was loaded.
- `backend/npm audit --omit=dev --audit-level=high`: reported 9 production dependency vulnerabilities: 4 moderate and 5 high.
- `frontend/npm audit --omit=dev --audit-level=high`: reported 3 production dependency vulnerabilities: 2 moderate and 1 critical, including advisories against the installed Next.js version.

Next build warning observed:

- Next inferred the workspace root as `/Users/pornmongkol` because another lockfile exists at `/Users/pornmongkol/package-lock.json`.
- Consider setting `outputFileTracingRoot` in `frontend/next.config.ts` or removing the unrelated parent lockfile if it is not needed.

## Known Risks And Follow-Ups

1. No automated test coverage exists for either package.
   - Backend has a Jest script but no test files.
   - Frontend build passes, but lint is not configured.

2. Dependency security needs attention.
   - Backend high-risk audit findings include `express-rate-limit`, `express-xss-sanitizer`, `jsonwebtoken`/`jws`, `lodash`, and `path-to-regexp`.
   - Frontend critical audit finding includes Next.js advisories.
   - Start with `npm audit fix` in each package on a branch, then rerun build and smoke tests.

3. Database schema files need cleanup before reliable fresh deployment.
   - Fix trailing commas.
   - Reconcile `admins` schema drift.
   - Add required extensions explicitly.
   - Prefer migration files over multiple divergent table snippets.

4. Backend lacks a visible centralized error handler after route mounting.
   - Several controllers call `next(err)`, which can fall through to Express defaults.
   - Add a final JSON error middleware to avoid HTML/default error responses.

5. Frontend API base variables are inconsistent.
   - Many files use `NEXT_PUBLIC_API_URL`.
   - Some utility/report files use `NEXT_PUBLIC_BACKEND_URL`.
   - Missing env values will produce requests to `undefined/api/...`.

6. Cloudinary upload settings are hard-coded in frontend source.
   - Move cloud name and upload preset to `.env.local`.
   - Confirm unsigned upload preset policy before production.

7. Legacy `frontend/src/pages` routes still build.
   - They create public routes such as `/RegisterPage`, `/UserProfilePage`, and `/EditProfilePage`.
   - Confirm whether these are intentional or leftover from earlier routing.

8. Backend cannot start without real environment and database.
   - `node server.js` exits during `connectDB()` when `DATABASE_URL` is missing or invalid.
   - Keep `backend/config/config.env` local-only; it is ignored by `backend/.gitignore`.

9. Admin and notification routes are protected by middleware, but route files apply protection in different styles.
   - `adminsRouter` uses `router.use(adminProtect)` and also repeats `adminProtect` on some routes.
   - `notificationRouter` uses `router.use(requireAuth)`.
   - Keep protection consistent when adding new routes.

## Development Guidance For Future Agents

- Read this file first, then inspect the changed files and current `git status`.
- Do not assume the README files are complete; `backend/README.md` is minimal and `frontend/README.md` is still mostly the default Next.js text.
- Keep backend and frontend changes synchronized when API contracts change.
- If adding backend endpoints, update:
  - controller in `backend/controllers`
  - router in `backend/routers`
  - Swagger docs in `backend/docs`
  - matching frontend hook/service
- If changing schema, update SQL files and any controller query that depends on the changed columns.
- Use cookie-based auth with `credentials: "include"` on frontend fetches unless intentionally switching to bearer tokens.
- Avoid committing generated folders:
  - `backend/node_modules`
  - `frontend/node_modules`
  - `frontend/.next`
  - coverage/build outputs
- Recommended validation after meaningful changes:

```bash
cd frontend
npm run build

cd ../backend
npm test -- --runInBand --watchAll=false --passWithNoTests
```

Once tests and lint are added, replace the backend `--passWithNoTests` fallback with real test execution and replace `next lint` with ESLint CLI.
