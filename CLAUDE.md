# CLAUDE.md — Trust The Process (TTP)

Workout tracker (Hevy-inspired). React + TypeScript PWA talking to a Hono + Postgres server
(`server/`), invite-only accounts, shipped as a Docker image (`Dockerfile`; `compose.yaml`). Started as an
offline-only SQLite/OPFS app on GitHub Pages; that was replaced in v2 (merged to `main`
2026-10-27). Current status lives in `PROGRESS.md` — update it when
a task changes state. The plan to go public is `ROADMAP.md`; unscheduled feature work lives in `TODO.md`.

## Working agreement
- No plan approval needed for small work: implement directly, track in `PROGRESS.md`.
- Don't add dependencies without asking first.
- Small, focused commits with clear messages. One concern per commit.
- If a request is ambiguous or seems wrong, say so and propose a fix — don't silently improvise.

## Versioning
- The app version is `version` in `package.json` (shown in Settings → About), 0.5.0 from 2026-11-25.
- Bump it with every change that ships: `npm version <patch|minor> --no-git-tag-version`, in the same push.
  Patch = fixes and small changes (renames, restyling); minor = a new feature or section. Unless the
  owner names the level, decide yourself and say which you picked.

## Commands
- `npm run db:dev` — local Postgres (Docker, port 5433); server tests need it
- `npm run dev:server` — API (needs `DATABASE_URL`); `npm run dev` — Vite, proxies `/api`
- `npm test` — Vitest · `npm run build` · `npm run lint` · `npm run typecheck`
- `docker compose up -d --build` — production stack (see `.env.example`)

Run `typecheck` and `test` before saying a task is done.

## Dev account
Test account `dev` on the running app (production DB, not admin): log in there to try new features.
- Credentials: `DEV_ACCOUNT_USERNAME` / `DEV_ACCOUNT_PASSWORD` in [`.env`](.env) (gitignored). This repo is
  public and the app is on the internet, so never put the password in a tracked file.
- `npm run seed:dev` resets its workouts to fresh test data through the API, and can't touch other
  accounts (`server/dev-seed.ts`).

## Architecture rules
- UI → `src/repositories/` → `src/api/client.ts` → Hono routes in `server/routes/` → Postgres.
  SQL only in `server/` (migrations in `server/migrations/`, never edit an applied one).
- Every row is owned by a user; every query filters by the session's user. Exception: `catalog_exercise` /
  `catalog_image`, shared reference data (RepDB, `server/catalog.ts`). Its licence forbids republishing:
  never commit the dataset or its images.
- `src/domain/` is pure TypeScript: no React, no DB/API imports. Every function there has tests.
- Active workout is local-first: edits apply to a cached document, mirrored to `localStorage`,
  saved whole with debounce + retry (`repositories/workoutStore.ts`). Persist every action.
- TypeScript strict; no `any`.

## Gotchas
- Local dates via `domain/dates.ts` only — never `toISOString()` for calendar dates.
- ISO weekdays (1 = Mon … 7 = Sun); convert from JS `getDay()` in one helper.
- `HashRouter`. Writes must be JSON (CSRF guard); CSP is strict.

## Style
- UI language: English. Mobile-first, dark mode default, Tailwind. kg only.
- Functional components + hooks. Feature folders under `src/features/`.
- Prefer clarity over cleverness; explain non-obvious decisions in a short comment.

## Themes
- Look lives in `src/themes/<id>.css`, never in components: they use `.ui-*` classes (shapes and layout
  stay as Tailwind utilities). `glass` is the default, `original` the pre-redesign look.
- "Glassy style" means: give the component the matching `.ui-*` class, styled as in `themes/glass.css`.
- A new `.ui-*` class goes into every theme file (`themes.test.ts` checks). New theme: see `themes/index.ts`.
