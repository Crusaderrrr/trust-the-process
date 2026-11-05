# Progress — Trust The Process (TTP)

Phases from SPEC §9. ✅ = built and verified on desktop (mobile viewport); 📱 = confirmed on iPhone.
Live URL: https://crusaderrrr.github.io/

## Decisions
- 2026-10-22 — Hevy-style logging: per-set ✓ completion, Previous column, rest timer, live duration.
- 2026-10-22 — Edit/delete finished workouts in v1.
- 2026-10-22 — History tab in v1.
- 2026-10-22 — Set types now: normal / warmup / drop / failure (`set_type`).
- 2026-10-22 — Hosted as user site `Crusaderrrr.github.io` → base `/`.
- 2026-10-22 — Build all phases continuously; owner tests on iPhone and sends corrections.

## Phase 0 — Skeleton + persistence gate ✅ 📱
- [x] Repo, Pages via GitHub Actions, Vite/React/TS/Tailwind, HashRouter, tab bar
- [x] DB worker (`opfs-sahpool`, pool `ttp`) + RPC + migration 1, "open elsewhere" screen
- [x] `domain/dates.ts` + tests, PWA config, deploy workflow
- [x] iPhone: installed, launch counter persists

## Phase 1 — Exercise library ✅
- [x] List + search + muscle-group filter
- [x] Add custom exercise (also from the workout picker)
- [x] Archive (history) / hard-delete (custom, no history); archived list + unarchive

## Phase 2 — Backup ✅
- [x] Export (share sheet on iOS / download elsewhere) as `ttp-YYYY-MM-DD.sqlite3`
- [x] Import with header + `user_version` validation, migrate-forward, reload
- [x] Last-backup date + 14-day nudge (Settings and Today); storage status, build time

## Phase 3 — Workout logging ✅
- [x] `domain/sets.ts` + `domain/workout.ts` + tests
- [x] Start / continue / discard; mini-bar while in progress; minimize
- [x] Multi-select exercise picker; remove / move / replace exercises
- [x] Set table: SET · PREVIOUS · KG · REPS · ✓, set types, swipe/menu delete, add set (pre-fill)
- [x] Rest timer (per-exercise setting, persisted `rest_ends_at`, ±15 s, skip, beep + flash)
- [x] Live duration, volume, set count header
- [x] Finish flow (incomplete-sets prompt, save sheet with summary + PR count)

## Phase 4 — History + edit/delete ✅
- [x] History cards (duration, volume, PRs, exercises) + detail
- [x] Edit finished workout (title, date, start time, minutes, notes, sets)
- [x] Delete workout

## Phase 5 — Plan + calendar + skips ✅
- [x] `plan_version` + Plan screen
- [x] `domain/calendar.ts` + tests
- [x] Month grid (arrows + swipe), day sheet, skip with reason, log past workout
- [x] Missed-days banner on Today (last 14 days); month summary + reasons

## Phase 6 — Progress ✅
- [x] `domain/progress.ts` + tests
- [x] Charts (top weight, e1RM, volume) with 1M / 3M / 1Y / All
- [x] PR cards, session history

## Feedback round 1 (2026-10-22) ✅
- [x] Gap between the workout header and the first exercise
- [x] Log Workout header pinned (header outside the scrolling body)
- [x] Rest timer Skip button green
- [x] Set-type menu: first item no longer clipped; W / D / F letters in yellow / blue / red
- [x] Favourite exercises (★) + Favourites section in Exercises and the picker (migration 2)
- [x] Muscle-group icons on exercises (drawn SVG per muscle group; no image column needed)
- [x] **Data-loss fix**: `preserveOnInitFailure: true` (see SPEC §7)

## Feedback round 2 (2026-10-22) ✅
- [x] Exercise photos (free-exercise-db, public domain) for all 52 seed exercises, bundled offline
- [x] Own photo for any exercise (new-exercise sheet + progress page), stored in DB (migration 3)
- [x] Hevy-style illustrations need a paid license — not used (owner chose free photos)
- [x] DB install retries; stress-tested close→reopen cycles and tab takeover without data loss

## Feedback round 3 (2026-10-22) ✅
- [x] Pages no longer rubber-band off-screen on iOS (document pinned; only content scrolls)
- [x] Grip selector (wide / normal / narrow / parallel wide / parallel normal) on grip exercises,
      remembered per exercise, matched in Previous, shown in History, filterable in Progress
- [x] Bottom sheets portal to <body> so the tab bar can't cover them on iOS
- [x] UI redesign: Material Symbols (filled) icons everywhere, cards, page headers, grouped
      Settings rows, Today week strip + last workout, floating rest bar, area chart with metric tabs

## Feedback round 4 (2026-10-22) ✅
- [x] Settings → Default rest timer, applied to every exercise not customised in a workout
      (migration 5); workout rest menu gains "Use default"

## Feedback round 5 (2026-10-23) ✅
- [x] Treadmill exercise: time / speed / incline sets instead of kg / reps (migration 6)

## Feedback round 6 (2026-10-24) ✅
- [x] Red delete background no longer bleeds through set rows (only mounted while swiped)
- [x] Rest-timer end: screen flash removed (beep later removed too, see 2026-10-27 — system notification is the only signal now)
- [x] Weight/reps auto-propagate to later incomplete sets; dimmed until edited/completed (migration 7)
- [x] Tonnage chart (per week / per workout) on History; ranges 1M / 3M / 1Y / 3Y; per-exercise charts use the same ranges
- [x] Reorder exercises: drag-and-drop sheet (replaces Move up/down)
- [x] Per-session exercise note (migration 7); shown in History detail and the calendar day sheet
- [x] Notifications: real "time's up" system notification (see log); sounds removed

## v2 self-hosted full-stack (merged into `main` 2026-10-27; the original plan doc was removed)
### Phase 7 — Server skeleton ✅
- [x] Hono + postgres.js server (`server/`), migrations runner (`schema_migrations`, advisory lock, one transaction)
- [x] `001_init.sql`: `app_user`, `session`, `invite`, `user_settings`
- [x] Serves the built SPA (hashed assets immutable, rest `no-cache`), `/api/health`, JSON 404 under `/api`
- [x] `Dockerfile`, `compose.yaml` (Postgres internal only, app on 127.0.0.1:3000), `compose.dev.yml` (`npm run db:dev`, port 5433)
- [x] CI (`ci.yml`) on `fullstack` + PRs with a Postgres service; server tests need `npm run db:dev` locally

### Phase 8 — Accounts ✅
- [x] Invite-only sign-up (single-use codes, atomic with user creation), login, logout, `GET /api/auth/me`
- [x] argon2id passwords; sessions = random token in HttpOnly/Secure/SameSite=Lax cookie, only SHA-256 stored, 30-day sliding expiry
- [x] Rate limit 10 / 15 min per client + username (sign-up per client); JSON-only guard for writes (CSRF); 2 MB body limit; CSP + security headers
- [x] Owner CLI: `docker compose exec app node dist-server/cli.js invite [count]` / `users`
- [x] Login / sign-up screen as a gate around the app; Settings → Account (signed in as, log out)
- [x] E2E in Chrome (390×844) against the real server under the CSP: bad invite, sign-up, reload keeps session, logout
- [x] Owner = first account (`is_admin`, migration 002). Settings → **Invite a friend** mints a single-use code as a sign-up link (`/#/signup?invite=…` prefills the form); Share sheet on iOS, copy elsewhere. The very first invite still comes from the CLI.

### Phase 9 — API + client ✅
- [x] Migration 003: `exercise`, `workout` / `workout_exercise` / `workout_set` (client UUIDs), `plan_version` / `plan_day`, `skip`; every row owned by a user; seed library (53 exercises) copied per account at sign-up
- [x] Endpoints: exercises (CRUD, patch, previous), settings, plan, skips, workouts (a workout is one document: `GET/PUT/DELETE /api/workouts/:id`, `/active`, calendar range), history, progress sessions; all filtered by the session's user
- [x] Client: repositories call the API; workout edits are pure functions in `domain/workoutDoc.ts` (tested) applied to a cached document and saved whole, one request at a time (`repositories/workoutStore.ts`)
- [x] `src/db/` (SQLite worker) is no longer loaded; kept only so phase 11 can read a v1 backup. Export/import-database UI, "App launches" and the backup nudge are gone
- [x] E2E in Chrome: sign-up → start → add exercises → sets with auto-fill → reload mid-workout → finish (PR count) → history, tonnage chart, progress page → second workout shows Previous

### Phase 10 — Local-first active workout ✅
- [x] `repositories/workoutStore.ts`: edits apply to the cached document instantly and are mirrored to `localStorage` (`ttp:pending:<id>`); the whole document is PUT after a 1 s debounce, retried with backoff (2 s … 30 s) while the network/server fails, flushed on background / `pagehide` / `online`; copies left in storage are re-saved on the next launch. Last write wins
- [x] "Offline — changes will sync" banner while a save is failing (`App.tsx`, `useSyncFailing`)
- [x] E2E in Chrome (390×844): go offline → fill set + mark done → banner shows, copy in localStorage → back online → synced, banner and copy gone; a stale pending copy is saved on reload
- Not covered: adding/replacing an exercise offline (needs the exercise list + "Previous" from the server); a 4xx refusal drops the local copy

### Phase 11 — Import a v1 backup ✅ (removed again 2026-10-30, see Feedback round 7)
- [x] `POST /api/import` (`server/routes/import.ts`, 20 MB body limit for this route only): one transaction; settings, exercises (matched by name to the account's library, custom ones created), workouts, plan, skips. Ids derive from (account, v1 id), so importing the same file again replaces instead of duplicating. The backup's unfinished workout is left out if the account already has one in progress. Tests in `import.test.ts`
- [x] `src/db/v1reader.worker.ts` reads the `.sqlite3` in memory with sqlite-wasm (no migration, so any v1 schema version 1–7 works) and builds the JSON; Settings → Data → **Import a v1 backup**
- [x] Checked with the real backup (`ttp-2026-10-25.sqlite3`, v7): reader output posted to a real server twice → 1 workout, plan Mon–Fri, skip 22 Oct, default rest 180 s, 3 favourites, no duplicates
- [ ] Click-through of the file picker in a browser (Chrome tool was unavailable)

### Phase 12 — Deploy on the laptop (in progress)
- [x] `DEPLOY.md`: lid/updates/ufw, Docker Engine on Mint, `.env`, compose up, first invite, Tailscale Funnel, v1 data move, nightly `pg_dump` timer (keep 14) + restore, updates, troubleshooting
- [ ] Run it on the laptop (owner); not tested by me
- Skipped on purpose: turning the old GitHub Pages site into a "moved to …" page

## Feedback round 7 (2026-10-30) ✅
- [x] Prefilled sets (from the last workout) are independent: editing one no longer changes the later ones ("Add set" copies still follow)
- [x] Week tonnage axis and tooltip show the range ("26 Oct – 1 Nov")
- [x] Cardio is a category (filter chip, New exercise); creating one makes it time-based. Migration 005 moves Treadmill into it
- [x] Finishing lifts the workout's duration to its logged cardio time (`finishedAtFor`)
- [x] Optional check-in on the Save sheet (Good / Okay / Bad + reasons) and a mood on skipped days (migration 006)
- [x] Calendar: tick for done, amber bar for skipped, mood dot on top. Today's week strip still uses the old fills
- [x] "Import a v1 backup" removed (button, worker, `POST /api/import`, DEPLOY step). `src/db/` is now unused
- Checked in Chrome (390×844): calendar marks, Cardio filter, check-in chips. Not clicked through: the New exercise sheet with Cardio, the skip sheet's mood, a cardio finish

## Rest-timer push (2026-10-30)
- [x] Server sends a Web Push at `rest_ends_at` (`server/push.ts`, `/api/push`, migration 007; `web-push` added with your OK). Saving a workout schedules it, finishing/clearing/deleting cancels, restart restores
- [x] Client registers the device on the first completed set (`notify.ts`); `public/push-sw.js` shows the notification
- [ ] Not verified: real delivery. Chrome in this setup can't grant notification permission, and iPhone push needs HTTPS (Funnel). Scheduler, cancel/reschedule, gone-subscription cleanup and the endpoint allow-list are unit tested with a fake sender

## Feedback round 8 (2026-11-03)
- [x] Calendar: tapping a day with exactly one workout opens it; the options sheet stays for empty days and days with several
- [x] Weekly plan removed: days are only done / skipped / no workout (no planned / missed / extra). Plan screen, `/api/plan`, missed-days banner gone; migration 008 drops `plan_version` / `plan_day`
- [x] Offline exercises: the library is cached in `localStorage` after every load and read from there when the server is unreachable; exercises created offline are queued with a negative temporary id, uploaded when the connection returns, and open workouts are re-pointed to the real id. A workout with a not-yet-uploaded exercise waits (retry with backoff) instead of being sent. Tests: `workoutDoc.test.ts` (id remap)
- [x] "Offline — changes will sync" moved off the top edge (notch / camera cutout): a pill above the tab bar, and inside the workout header below the safe area (`components/SyncBadge.tsx`)
- [x] Offline "Previous" column: `GET /api/exercises/last-sets` (latest completed sets per exercise + grip) is cached in `localStorage` on app start and when the connection returns; a finished workout is folded in locally, so the next offline workout sees it. Lookup mirrors the server rule (`domain/lastSets.ts`, unit tested)
- [ ] Not verified: server tests (Docker wasn't running, so migration 008 and the trimmed `data.test.ts` haven't run) and the offline flow in a browser. The last-sets SQL and its test in `data.test.ts` haven't run either. Editing an exercise (favourite, grip, rest, photo) still needs a connection

## Not verified yet
- iPhone check of Phases 1–6 (owner).
- Missed-day banner end-to-end (needs a plan older than the missed day; logic is unit tested).

## Log
- 2026-10-22 — Spec reviewed; renamed to Trust The Process / `ttp`; schema + gotcha fixes.
- 2026-10-22 — Decisions above folded into SPEC; repo connected.
- 2026-10-22 — Phase 0 implemented and confirmed on iPhone.
- 2026-10-22 — Phases 1–6 implemented. E2E in Chrome (390×844): logging, reload mid-workout,
  finish flow, PRs, history edit, calendar/plan/skip, charts, export → delete → import restore.
- 2026-10-23 — Treadmill (cardio sets) added; E2E in Chrome: log, finish, history, Previous.
- 2026-10-24 — Feedback round 6 implemented; E2E in Chrome (390×844): auto-fill, notes → calendar, reorder, tonnage chart.
- 2026-10-25 — Phases 7–8 on `fullstack`: server skeleton + accounts; tests green, `docker compose up` and sign-up/login/logout verified in Chrome.
- 2026-10-25 — In-app invite links (owner only) added; E2E in Chrome: owner mints link, friend signs up from it, friend has no invite button.
- 2026-10-25 — Phase 9 (API + client) on `fullstack`: workouts as documents, per-account data; E2E in Chrome.
- 2026-10-25 — Phase 10 (local-first active workout) on `fullstack`: local copy, debounced sync with retry, offline banner.
- 2026-10-25 — Phase 11 (v1 backup import) on `fullstack`: API + worker reader + Settings button; real backup imported twice against the dev DB.
- 2026-10-25 — Phase 12: `DEPLOY.md` written; the laptop steps themselves are not run yet.
- 2026-10-26 — "Time's up" system notification on rest-timer end (`features/workout/notify.ts`);
  permission requested on first set completion. Uses the service worker's `showNotification`
  (iOS home-screen PWAs don't support the `Notification()` constructor directly). Verified
  working on two iPhones.
- 2026-10-27 — Grip sets: exercises offer back grips or triceps attachments (rope / V-bar / straight bar); migration 004; tests green. `fullstack` merged into `main`.
- 2026-10-27 — Removed all in-app sounds (the rest-timer beep); the system notification from
  2026-10-26 is now the only "time's up" signal. New sets added for a previously-logged exercise
  are now prefilled (count, weight, reps, set type) from that exercise's last workout instead of
  starting as one empty set.
- 2026-10-30 — Feedback round 7: set-edit and week-label fixes, Cardio category, cardio-aware duration,
  optional check-in + calendar marks, v1 import removed.
- 2026-10-30 — Rest-timer Web Push: notification now comes with the app closed / phone locked (needs deploy + iPhone check).
- 2026-11-05 — Workout templates (built-in Upper/Lower up-down split): Today's start button is split into
  "Start workout" / "From template". A template workout shows empty sections (Chest 1, Back 1, …); tapping
  one opens the picker limited to that muscle group. Sections left empty vanish on finish (nothing new in
  the saved doc; slot fills live in localStorage, `repositories/templateRun.ts`). "Create template" is a stub.
- 2026-11-05 — Template colours + history: workouts store `template_id` (migration 009; workouts logged
  before it stay "no template"); per-account colours in `user_settings.template_colors`. History chart in
  Workout mode: bars take the template colour, filter chips All/Upper/Lower, colour swatches for the
  selected template, template name in the tooltip. Week mode adds everything together.
- 2026-11-05 — Dev account `dev` on the running app (not admin, credentials in `.env`); `npm run seed:dev` resets its
  test data through the API. Checked through the API, not clicked through in a browser. Not seedable: push
  subscriptions and template slot fills (device-only).
