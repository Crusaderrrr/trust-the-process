# CLAUDE.md — Trust The Process (TTP)

Workout tracker (Hevy-inspired). React + TypeScript PWA talking to a Hono + Postgres server
(`server/`), invite-only accounts, self-hosted via Docker Compose (see `DEPLOY.md`). Started as an
offline-only SQLite/OPFS app on GitHub Pages; that was replaced in v2 (merged to `main`
2026-10-27). `SPEC.md` is the original v1 spec: domain logic, screens and exercise seed still
apply, storage/deploy parts are superseded. Current status lives in `PROGRESS.md` — update it when
a task changes state. The plan to go public is `ROADMAP.md`; unscheduled ideas live in `IDEAS.md`.

## Working agreement
- No plan approval needed for small work: implement directly, track in `PROGRESS.md`.
- Don't add dependencies without asking first.
- Small, focused commits with clear messages. One concern per commit.
- If the spec is ambiguous or seems wrong, say so and propose a fix — don't silently improvise.

## Commands
- `npm run db:dev` — local Postgres (Docker, port 5433); server tests need it
- `npm run dev:server` — API (needs `DATABASE_URL`); `npm run dev` — Vite, proxies `/api`
- `npm test` — Vitest · `npm run build` · `npm run lint` · `npm run typecheck`
- `docker compose up -d --build` — production stack (see `.env.example`)

Run `typecheck` and `test` before saying a task is done.

## Dev account
Local dev database only; it doesn't exist in production, and must never be created there (this repo is public).
- Username `dev`, password `ttp-dev-password` (admin).
- `npm run db:dev && npm run seed:dev` creates it, or resets it to fresh data (`server/dev-seed.ts`):
  about 2.5 years of workouts (templates, grips, set types, cardio, notes, check-ins), every skip reason,
  a workout in progress, favourites, archived and custom exercises.
- Vite proxies `/api` to port 3000, which is the production container when that stack is up. To stay on
  dev data, serve the built app on another port and open http://localhost:3001:
  `npm run build && DATABASE_URL=postgres://ttp:ttp@127.0.0.1:5433/ttp PORT=3001 npm run dev:server`

## Architecture rules
- UI → `src/repositories/` → `src/api/client.ts` → Hono routes in `server/routes/` → Postgres.
  SQL only in `server/` (migrations in `server/migrations/`, never edit an applied one).
- Every row is owned by a user; every query filters by the session's user.
- `src/domain/` is pure TypeScript: no React, no DB/API imports. Every function there has tests.
- Active workout is local-first: edits apply to a cached document, mirrored to `localStorage`,
  saved whole with debounce + retry (`repositories/workoutStore.ts`). Persist every action.
- TypeScript strict; no `any`.

## Gotchas
- Local dates via `domain/dates.ts` only — never `toISOString()` for calendar dates.
- ISO weekdays (1 = Mon … 7 = Sun); convert from JS `getDay()` in one helper.
- `HashRouter`. Writes must be JSON (CSRF guard); CSP is strict.
- `src/db/` (old SQLite worker) is unused legacy; don't build on it.

## Style
- UI language: English. Mobile-first, dark mode default, Tailwind. kg only.
- Functional components + hooks. Feature folders under `src/features/`.
- Prefer clarity over cleverness; explain non-obvious decisions in a short comment.
