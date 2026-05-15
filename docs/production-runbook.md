# ShibaSolver Production Runbook

## Target Stack

- Frontend: Vercel
- Backend: Render web service
- Database: Neon PostgreSQL
- Image uploads: Cloudinary unsigned upload preset

## Required Environment

Backend variables are documented in `backend/.env.example`. For local development, copy that file to `backend/config/config.env` or `backend/.env`.

Frontend variables are documented in `frontend/.env.example`. For local development, copy that file to `frontend/.env.local`.

## Local Verification

```bash
npm run install:all
npm run check
```

Validate the redesigned Prisma schema without connecting to a real database:

```bash
cd backend
DATABASE_URL=postgresql://user:password@localhost:5432/shibasolver npm run prisma:validate
```

Backend startup also requires a reachable PostgreSQL database:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

## Deployment Checklist

- Create Neon database and set `DATABASE_URL`.
- Set `DATABASE_SSL=require` or `DATABASE_SSL=no-verify` depending on the database certificate policy.
- Set `SESSION_EXPIRES_IN` to the desired opaque session lifetime, for example `7d`.
- Configure Google OAuth with the production frontend origin.
- Configure backend CORS with `FRONTEND_ORIGIN`.
- Configure Cloudinary unsigned upload preset and set frontend public variables.
- Run Prisma migrations before exposing the app: `cd backend && npm run prisma:migrate`.
- Create the first admin account: `cd backend && npm run admin:create`.
- Deploy backend first, verify `GET /health`, then set frontend API URL to the backend origin.

## Backend Health Check

Use `/health` as the Render health check path. The endpoint returns `200` only after the API can run `SELECT 1` against PostgreSQL.

Expected healthy response:

```json
{
  "success": true,
  "status": "ok",
  "service": "shibasolver-api"
}
```

If the database pool is missing or the query fails, the endpoint returns `503` with the standard error envelope. Treat that as a deploy blocker before pointing the frontend at the backend.
