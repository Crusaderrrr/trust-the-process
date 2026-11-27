# Trust The Process (TTP)

Workout tracker (Hevy-inspired): logging with previous-set hints, rest timer with push, history,
calendar, per-exercise progress. React + TypeScript PWA, Hono + Postgres server,
invite-only accounts.

- `CLAUDE.md` — working rules · `PROGRESS.md` — status ·
  `ROADMAP.md` — plan to go public ·
  `TODO.md` — unscheduled feature work
- `npm run db:dev` then `npm run dev:server` and `npm run dev`; `npm test`, `npm run typecheck`

## Exercise catalog
Exercise data by [RepDB](https://repdb.co) (repdb.co).

The dataset's free licence allows use inside the app but not republishing it, so it is not in this
repo. Download it from RepDB, then import it into the database once (safe to repeat; it also adds the
exercises to every account):

- local: `npm run import:repdb -- <dataset folder>` (the folder with `exercises.json`)
- a remote database: the same, with `DATABASE_URL` set to it
- the Docker stack: `docker compose cp <dataset folder> app:/tmp/repdb`, then
  `docker compose exec app node dist-server/cli.js import-repdb /tmp/repdb`

Without the import the app works, with no exercise pictures or instructions.
