# Trust The Process (TTP) — Specification (v1 / MVP)

> **Status (2026-11):** this is the original v1 spec. Storage, deployment and "no backend/accounts"
> (§1–§3, §4's SQLite specifics, §7 OPFS gotchas, §8, backup in §6) are **superseded** — the app now
> runs on a Node + Postgres server (see `DEPLOY.md`, `server/`). Domain logic (§5), screen behaviour
> (§6) and the exercise seed (§10) are still the reference.

A personal, offline-first workout tracker, loosely inspired by Hevy (logging flow, "previous"
hints, per-exercise progress). Installed on one iPhone as a PWA ("Add to Home Screen"), hosted
on GitHub Pages. No backend, no accounts, no social features. All data lives on the device in
SQLite (WASM) persisted to OPFS.

- App name: **Trust The Process**; short name (home-screen label): **TTP**.
- Repository: `Crusaderrrr/Crusaderrrr.github.io` (a GitHub *user site*) → URL
  `https://crusaderrrr.github.io/`, served from the root `/` (must never change, see §8).
- Internal identifier: `ttp` (SAHPool name, DB file `ttp.sqlite3`, export file prefix).

UI language: **English**. Weight unit: **kg**.

---

## 1. Goals and non-goals

**Goals (MVP)**
1. Log workouts the way Hevy does: set rows with a "Previous" column, kg / reps, set types
   (normal / warm-up / drop / failure), a completion checkmark per set, a rest timer that starts
   when a set is checked, and a live workout duration.
   Workout history with edit and delete.
2. Weekly training plan + full calendar: planned / done / skipped (with reason) / missed.
3. Progress per exercise: charts of weight, estimated 1RM and volume over time.
4. Pre-seeded exercise library (~50 exercises) + custom exercises.
5. Backup: export / import the whole database as a `.sqlite3` file.

**Non-goals (not in v1)**
- Friends, feeds, sharing, accounts, sync between devices.
- Workout templates/routines, push notifications (candidates for v2).
- Multiple users, multiple units, localization.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript (strict) |
| Database | `@sqlite.org/sqlite-wasm`, VFS `opfs-sahpool`, running in a Web Worker |
| PWA | `vite-plugin-pwa` (precache must include `*.wasm`) |
| Routing | `HashRouter` (GitHub Pages has no SPA fallback) |
| Charts | Recharts |
| Styling | Tailwind CSS, mobile-first, dark mode by default |
| Tests | Vitest for pure domain logic |
| Hosting | GitHub Pages, deployed by GitHub Actions on push to `main` |

### Why these constraints matter
- **OPFS is only usable from a Worker** → all SQL runs in `db.worker.ts`; the UI talks to it via
  a small promise-based RPC (`postMessage`).
- **`opfs-sahpool`** needs no COOP/COEP headers → works on GitHub Pages, which cannot set
  custom headers. It does not support concurrent access from multiple tabs; acceptable for a
  single-user phone app.
- **A user-site repo is served from the root** → Vite `base`, PWA `scope` and `start_url` are
  all `/`.
- **Origin is `https://crusaderrrr.github.io`**, shared by every Pages repo of that user
  (any future project repo is served under `/<repo>/` on the same origin).
  OPFS storage is per origin, so use a unique SAHPool name (`ttp`) and DB file name
  (`/ttp.sqlite3`). Never rename these after launch — the data would appear lost.
- **Target: iOS 17+** (OPFS sync access handles in workers and `navigator.storage.persist()`).

---

## 3. Architecture

```
React UI ── repositories (typed async fns) ── db/client.ts (RPC) ──postMessage──▶ db/db.worker.ts
                                                                               ├─ sqlite3 WASM
                                                                               ├─ migrations (PRAGMA user_version)
                                                                               └─ OPFS: /ttp.sqlite3
```

```
src/
  db/
    db.worker.ts        # init sqlite, install SAHPool VFS, run migrations, handle messages
    client.ts           # RPC: query(), exec(), transaction batch, exportDb(), importDb()
    migrations.ts       # ordered list of migrations; each bumps user_version
    seed.ts             # exercise library seed (run inside migration 1)
  domain/               # PURE logic, no DB, no React — fully unit tested
    dates.ts            # local-date helpers (see §7)
    calendar.ts         # derive day status from plan + workouts + skips
    progress.ts         # 1RM, volume, per-workout aggregates
    sets.ts             # set labels (1, 2, W, D, F), "Previous" matching, completion rules
  repositories/         # one file per aggregate; only place that contains SQL
    exercises.ts
    workouts.ts
    plan.ts
    skips.ts
  features/             # screens + their components/hooks
    today/  history/  calendar/  workout/  exercises/  progress/  settings/
  components/           # shared UI primitives
  App.tsx  main.tsx
```

Rules:
- SQL lives **only** in `repositories/` (and migrations). Components never build SQL.
- `domain/` has no imports from `db/`, `repositories/` or React.
- Worker messages: `{ id, type: 'query' | 'batch' | 'export' | 'import', sql?, bind?, statements?, bytes? }`.
  `batch` runs several statements in one transaction (needed for "save workout").

---

## 4. Data model (SQLite)

Run `PRAGMA foreign_keys = ON` on every connection (off by default in SQLite).
Dates are `TEXT` `YYYY-MM-DD` (local date). Timestamps are `TEXT` ISO-8601 with offset.

```sql
CREATE TABLE exercise (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  muscle_group  TEXT    NOT NULL,   -- chest | back | shoulders | biceps | triceps | legs | glutes | core | full_body
  equipment     TEXT    NOT NULL,   -- barbell | dumbbell | machine | cable | bodyweight | kettlebell | other
  is_custom     INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,  -- hide instead of delete (keeps history intact)
  rest_seconds  INTEGER NOT NULL DEFAULT 120 CHECK (rest_seconds >= 0), -- 0 = timer off; remembered per exercise
  favorite      INTEGER NOT NULL DEFAULT 0,  -- migration 2; ★ / Favourites section
  image         TEXT                         -- migration 3; '/exercises/<slug>.jpg' (bundled) or JPEG data URL (own photo)
);
-- Migration 4: exercise.has_grip (grip selector on: Lat Pulldown, Seated Cable Row, T-Bar Row,
-- Pull-Up; toggle per exercise) and workout_exercise.grip
-- ('wide','normal','narrow','parallel_wide','parallel_normal'). New grip exercises default to
-- the grip used last time; "Previous" matches the same grip (falls back to grip-less history);
-- History shows the grip and Progress can filter by it.
-- Migration 5: exercise.rest_custom + meta 'default_rest_seconds' (Settings → Default rest
-- timer). Changing the default rewrites rest_seconds of every rest_custom = 0 exercise; setting
-- rest in a workout sets rest_custom = 1; "Use default" in the workout's rest menu resets it.
-- Migration 6: exercise.is_cardio + workout_set.speed_kmh / incline_pct (both optional), and a
-- seeded "Treadmill" (full_body · machine, rest off). Cardio sets log TIME · KM/H · INCLINE %
-- instead of kg / reps: time is stored as seconds in `reps`, `weight_kg` = 0 (keeps the
-- completed-set CHECK; no volume, no PRs). Time input: "25" = 25 min, "25:30" / "25.30" =
-- 25 min 30 s. Previous values show as placeholders (no Previous column — no room).
-- Seed exercises get public-domain photos from free-exercise-db, bundled in public/exercises/
-- (precached, so they work offline). Users can set their own photo (resized to 480px, stored in
-- the DB so backups include it). No image → muscle-group icon (inline SVG).

CREATE TABLE workout (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,             -- default by time of day: "Morning Workout", …
  date          TEXT NOT NULL,             -- local date the workout belongs to
  started_at    TEXT NOT NULL,
  finished_at   TEXT,                      -- NULL = in progress
  notes         TEXT,
  rest_ends_at  TEXT                       -- running rest timer's end time; NULL = no timer
);
CREATE INDEX idx_workout_date ON workout(date);
-- At most one workout in progress at any time.
CREATE UNIQUE INDEX idx_workout_one_active ON workout((1)) WHERE finished_at IS NULL;

-- `position` has no UNIQUE constraint on purpose: SQLite checks UNIQUE per row, so swapping
-- two positions in a reorder would fail mid-update. Order by (position, id).
CREATE TABLE workout_exercise (
  id           INTEGER PRIMARY KEY,
  workout_id   INTEGER NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercise(id),
  position     INTEGER NOT NULL
);
CREATE INDEX idx_we_workout   ON workout_exercise(workout_id);
CREATE INDEX idx_we_exercise  ON workout_exercise(exercise_id);   -- "Previous" + progress lookups

CREATE TABLE workout_set (
  id                   INTEGER PRIMARY KEY,
  workout_exercise_id  INTEGER NOT NULL REFERENCES workout_exercise(id) ON DELETE CASCADE,
  position             INTEGER NOT NULL,
  set_type             TEXT    NOT NULL DEFAULT 'normal'
                         CHECK (set_type IN ('normal','warmup','drop','failure')),
  weight_kg            REAL    CHECK (weight_kg >= 0),   -- NULL = not entered yet; 0 / added weight for bodyweight
  reps                 INTEGER CHECK (reps > 0),         -- NULL = not entered yet
  completed            INTEGER NOT NULL DEFAULT 0,
  CHECK (completed = 0 OR (weight_kg IS NOT NULL AND reps IS NOT NULL))
);
CREATE INDEX idx_set_we ON workout_set(workout_exercise_id);

-- Weekly plan is versioned so changing it never rewrites history.
CREATE TABLE plan_version (
  id              INTEGER PRIMARY KEY,
  effective_from  TEXT NOT NULL UNIQUE      -- plan applies from this date onward
);

CREATE TABLE plan_day (
  plan_version_id  INTEGER NOT NULL REFERENCES plan_version(id) ON DELETE CASCADE,
  weekday          INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = Monday
  PRIMARY KEY (plan_version_id, weekday)
);

CREATE TABLE skip (
  date    TEXT PRIMARY KEY,
  reason  TEXT NOT NULL CHECK (reason IN
           ('sick','injury','tired','no_time','travel','chose_not_to','other')),
  note    TEXT
);

-- Small key/value store (e.g. launch_count, first_launch_at for the Phase 0 persistence check).
CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

### Why `plan_version`
If the plan were a single "Mon/Wed/Fri" row, changing it to "Tue/Thu" would retroactively
turn past Mondays from "missed" into "rest". With versions, the plan for date D is the latest
`plan_version` where `effective_from <= D`. Saving a plan = insert a new version effective today
(or replace today's version if one already exists).

### Why `archived` instead of delete
Deleting an exercise would break past workouts. Custom exercises with no history may be
hard-deleted; anything with history is archived.

---

## 5. Domain logic

### 5.1 Day status (`domain/calendar.ts`)
Inputs for a date: is it planned, workouts on that date, skip on that date, today's date.

| Status | Rule |
|---|---|
| `done` | ≥1 finished workout on that date (planned or not) |
| `extra` | `done` and the date was not planned (display as done with a marker) |
| `skipped` | skip row exists (takes priority over `missed`) |
| `missed` | planned, in the past, no workout, no skip → UI prompts "Mark as skipped?" |
| `planned` | planned, today or future, nothing logged yet |
| `rest` | not planned, nothing logged |

A skip and a workout on the same date are contradictory: logging a workout deletes the skip
for that date (ask for confirmation in the UI).

### 5.2 Sets (`domain/sets.ts`)
- **Label**: `normal` sets are numbered 1, 2, 3… (warm-ups don't advance the counter);
  `warmup` → `W`, `drop` → `D`, `failure` → `F` (failure and drop sets do advance the counter,
  shown as letter in place of the number, like Hevy).
- **Previous**: set *n* of an exercise shows set *n* (by position) from the most recent
  *finished* workout containing that exercise, e.g. `60 kg × 8`; `—` if none.
- **Completing a set**: empty kg / reps take the "Previous" values; if reps is still empty the
  set can't be completed (row shakes). Empty kg with no previous → 0.
- **Pre-fill on "Add set"**: copy kg / reps from the set above; for the first set, leave empty
  (Previous shows as placeholder).

### 5.3 Progress (`domain/progress.ts`)
Per exercise, per workout, over **completed sets excluding warm-ups**:
- **Top weight** = max `weight_kg`.
- **Estimated 1RM** (Epley) = `weight × (1 + reps / 30)`; take the max over sets. Only for sets
  with `reps <= 12` (estimate is unreliable beyond that); otherwise null.
- **Volume** = Σ `weight_kg × reps`.
- **Personal records**: best top weight, best e1RM, best volume — show date achieved.

All functions are pure and unit tested.

---

## 6. Screens (mobile-first, bottom tab bar)

Tabs: **Today · History · Calendar · Exercises · Settings**. Progress opens from an exercise.
While a workout is in progress, a mini-bar above the tab bar shows its title + duration;
tapping it reopens the workout.

1. **Today**
   - Shows today's status (planned / rest / done / skipped).
   - Primary button: "Start workout" (or "Continue workout" if one is in progress).
   - If any past planned days in the last 14 days are `missed`, show a banner: "2 missed days —
     add a reason" (older ones only show on the Calendar, so the banner can't nag forever).
   - Backup nudge banner when there is history and no backup in 14 days.
2. **Workout (in progress)** — modelled on Hevy's logging screen
   - Header: live duration (from `started_at`), total volume and completed-set count;
     "Finish" button.
   - Add exercise (searchable picker, filter by muscle group).
   - Per exercise card: name, rest timer setting (tap → off / 0:30 … 5:00, saved to
     `exercise.rest_seconds`), menu (reorder, replace, remove).
   - Set table columns: **SET · PREVIOUS · KG · REPS · ✓** (rules in §5.2).
     - Tap the SET label → choose type: Normal / Warm-up / Drop / Failure.
     - Empty KG / REPS show the Previous values as grey placeholders.
     - ✓ marks the set completed (row turns green) and starts the rest timer; tapping again
       un-completes it.
     - Swipe left on a row to delete the set. "+ Add set" below the table.
   - **Rest timer**: on ✓, if `rest_seconds > 0`, set `workout.rest_ends_at = now + rest`.
     A bar at the bottom shows the countdown with −15 s / +15 s / Skip. At zero: short sound
     and visual flash (foreground only, see §7). Countdown is derived from `rest_ends_at`, so
     it survives app reload.
   - **Every change is written to the DB immediately** (iOS can kill a backgrounded PWA at any
     moment; there is no "unsaved state").
   - **Finish**: if there are no completed sets → offer "Discard workout". If some sets are
     not completed → "Discard incomplete sets" / "Complete them" (only those with values) /
     Cancel. Then a save sheet: title, notes, summary (duration, volume, sets, PRs) → Save sets
     `finished_at`.
   - "Discard workout" (with confirmation) deletes the in-progress workout entirely.
   - Weight input: `inputmode="decimal"`; accept both `.` and `,` as decimal separator (iOS
     shows `,` on many regional keyboards). Reps: `inputmode="numeric"`.
3. **History**
   - Finished workouts, newest first, Hevy-style cards: title, date, duration, volume,
     PR count, and exercises as "3 × Bench Press".
   - Tap → workout detail (read-only: all sets with labels). Menu: **Edit** / **Delete**
     (confirm; cascade deletes exercises and sets).
   - **Edit** opens the same logging screen on the finished workout (no rest timer), plus
     date, start time and duration fields. Changes save immediately; "Done" drops incomplete
     sets, and if no completed sets remain, offers to delete the workout.
4. **Calendar**
   - Month grid, swipe/arrows between months; each day colored by status (§5.1).
   - Tap a day → sheet: view the workout(s) (opens History detail), or mark skipped with
     reason + note, or remove skip, or log a workout for that past date (creates a workout on
     that date and opens it in Edit mode).
   - Month summary: planned vs done vs skipped, and skip reasons breakdown.
5. **Plan** (from Calendar header)
   - Seven weekday toggles. Save creates a new `plan_version` effective today.
6. **Exercises**
   - Search + muscle-group filter. Add custom exercise (name, muscle group, equipment).
   - Tap exercise → **Progress**: line charts (top weight, e1RM, volume) with range
     selector (1M / 3M / 1Y / All), PR cards, list of past sessions.
7. **Settings**
   - Export database (downloads `ttp-YYYY-MM-DD.sqlite3`). On iOS use the share sheet
     (`navigator.share({ files })`) when available, falling back to a download link.
   - Import database (replaces all data; confirm first; validate the SQLite header and that
     `user_version` is between 1 and the app's current version — older files are migrated
     forward, newer ones rejected with "update the app first").
   - Show "last backup" date and nudge if older than 14 days. Stored in `localStorage`
     (not in the DB: an exported file would otherwise carry a stale timestamp and an import
     would overwrite it).
   - Build time and storage status (`navigator.storage.persisted()`).

---

## 7. Gotchas (must be handled)

- **Local dates, not UTC.** Never use `new Date().toISOString().slice(0, 10)` for "today" — it
  is the UTC date and will be wrong around midnight. Use a helper in `domain/dates.ts` that
  formats from local `getFullYear/getMonth/getDate`.
- **Weekday numbering.** JS `getDay()` is 0 = Sunday. Store ISO weekdays (1 = Monday … 7 = Sunday)
  and convert in one helper.
- **Precache WASM.** `vite-plugin-pwa` must include `**/*.wasm` in `globPatterns`, otherwise the
  app opens offline but the DB does not start.
- **`optimizeDeps.exclude: ['@sqlite.org/sqlite-wasm']`** in Vite config (required by the
  package README) and `worker.format: 'es'`.
- **Persistence request.** Call `navigator.storage.persist()` on first launch. Not a guarantee —
  backups are the real safety net.
- **Import** must close the current DB connection before replacing the file, then reopen and
  re-run migrations.
- **Home-screen storage is separate from Safari.** Test only via the installed icon.
- **Single-tab assumption** (`opfs-sahpool`): if the VFS fails to install because another
  instance holds it, show a clear "App is open elsewhere" message instead of a blank screen.
- **`preserveOnInitFailure: true` is mandatory.** Without it, a failed VFS install calls
  `removeVfs()` and deletes the whole pool directory (all data). Found in testing on 2026-10-22.
  The worker retries the install a few times (with `forceReinitIfPreviouslyFailed`) so a
  previous instance that is still shutting down doesn't surface as "open elsewhere".
- **iOS PWA polish.** `viewport-fit=cover` + `env(safe-area-inset-*)` padding (bottom tab bar
  sits above the home indicator); `apple-touch-icon` (180×180) and
  `apple-mobile-web-app-*` meta tags; all inputs ≥ 16px font-size, or iOS zooms on focus.
- **Service worker at the origin root.** Scope `/` would also capture navigations to any
  future project repo (`/<repo>/`). Restrict the SPA fallback:
  `workbox.navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/]` (HashRouter only ever
  navigates to `/`).
- **Rest timer in the background.** iOS suspends a backgrounded PWA and has no Vibration API;
  web push needs a server (out of scope). So the "time's up" sound/flash only fires while the
  app is open. Never use `setInterval` ticks as the source of truth — always compute from
  `rest_ends_at`, and re-check on `visibilitychange`.
- **Service worker updates.** `registerType: 'autoUpdate'` is safe because no state lives in
  memory; a reload mid-workout loses nothing.

---

## 8. Deployment (GitHub Pages)

- Public repository `Crusaderrrr/Crusaderrrr.github.io` (free GitHub Pages requires it). Code
  is public; data never leaves the phone.
- Vite `base: '/'`; PWA manifest `scope` and `start_url` = `/`.
  Manifest: `name: 'Trust The Process'`, `short_name: 'TTP'`, `display: 'standalone'`,
  dark `theme_color` / `background_color`.
- GitHub Actions workflow: on push to `main` → `npm ci` → `npm test` → `npm run build` →
  deploy `dist/` to Pages. Follow the official Vite "Deploying a Static Site → GitHub Pages"
  guide for the current action versions.
- Repo Settings → Pages → Source: **GitHub Actions**.
- Keep the final URL stable forever — OPFS data is bound to the origin.

---

## 9. Implementation phases

Each phase ends with something runnable on the iPhone. Do not start a phase before the previous
one is verified.

**Phase 0 — Skeleton + persistence gate**
Vite/React/TS/Tailwind, HashRouter with empty tabs, DB worker + RPC + migration 1,
PWA config, GitHub Actions deploy. `domain/dates.ts` + its tests (needed from Phase 2 on:
export filename, workout date).
✅ Done when: installed on iPhone from Home Screen, a test row survives a full app close,
and the app opens in airplane mode.

**Phase 1 — Exercise library**
Seed (§10), list/search/filter, add custom, archive.

**Phase 2 — Backup**
Export/import + last-backup nudge. (Done early on purpose: protects data from day one.)

**Phase 3 — Workout logging**
Start/continue/discard, set table (types, Previous, ✓ completion, pre-fill), rest timer,
live duration, finish flow with save sheet, immediate persistence. `sets.ts` with tests.

**Phase 4 — History + edit/delete**
History list and detail, edit a finished workout (incl. date/time/duration), delete.

**Phase 5 — Plan + calendar + skips**
`plan_version`, calendar grid with statuses, skip with reason, missed-days banner,
month summary, log a workout for a past date. Unit tests for `calendar.ts`.

**Phase 6 — Progress**
`progress.ts` with tests, charts, PRs, session history.

---

## 10. Exercise seed (inserted in migration 1)

| Name | Muscle group | Equipment |
|---|---|---|
| Barbell Bench Press | chest | barbell |
| Incline Barbell Bench Press | chest | barbell |
| Dumbbell Bench Press | chest | dumbbell |
| Incline Dumbbell Press | chest | dumbbell |
| Dumbbell Fly | chest | dumbbell |
| Cable Crossover | chest | cable |
| Chest Press Machine | chest | machine |
| Push-Up | chest | bodyweight |
| Dip | chest | bodyweight |
| Deadlift | back | barbell |
| Barbell Row | back | barbell |
| Dumbbell Row | back | dumbbell |
| Pull-Up | back | bodyweight |
| Chin-Up | back | bodyweight |
| Lat Pulldown | back | cable |
| Seated Cable Row | back | cable |
| T-Bar Row | back | barbell |
| Face Pull | shoulders | cable |
| Overhead Press | shoulders | barbell |
| Seated Dumbbell Shoulder Press | shoulders | dumbbell |
| Lateral Raise | shoulders | dumbbell |
| Cable Lateral Raise | shoulders | cable |
| Rear Delt Fly | shoulders | dumbbell |
| Shrug | shoulders | dumbbell |
| Barbell Curl | biceps | barbell |
| Dumbbell Curl | biceps | dumbbell |
| Hammer Curl | biceps | dumbbell |
| Preacher Curl | biceps | machine |
| Cable Curl | biceps | cable |
| Triceps Pushdown | triceps | cable |
| Overhead Triceps Extension | triceps | cable |
| Skull Crusher | triceps | barbell |
| Close-Grip Bench Press | triceps | barbell |
| Back Squat | legs | barbell |
| Front Squat | legs | barbell |
| Leg Press | legs | machine |
| Romanian Deadlift | legs | barbell |
| Bulgarian Split Squat | legs | dumbbell |
| Walking Lunge | legs | dumbbell |
| Leg Extension | legs | machine |
| Lying Leg Curl | legs | machine |
| Seated Leg Curl | legs | machine |
| Standing Calf Raise | legs | machine |
| Seated Calf Raise | legs | machine |
| Hip Thrust | glutes | barbell |
| Cable Kickback | glutes | cable |
| Hip Abduction Machine | glutes | machine |
| Plank | core | bodyweight |
| Hanging Leg Raise | core | bodyweight |
| Cable Crunch | core | cable |
| Ab Wheel Rollout | core | other |
| Kettlebell Swing | full_body | kettlebell |
| Treadmill (cardio, migration 6) | full_body | machine |

Seed rows use the default `rest_seconds` (120).
Plank is time-based; in v1 log it with `reps` = seconds and `weight_kg` = 0. Proper
time-based sets are a v2 item.
