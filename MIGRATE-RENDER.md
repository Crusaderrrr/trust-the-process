# MIGRATE-RENDER.md — moving TTP from the laptop to Render + Neon

Plan and runbook. Today: Docker Compose on a laptop (app + Postgres 18) behind Tailscale Funnel
(`DEPLOY.md`). Target: the same Docker image as a **Render web service**, with the database on
**Neon** (serverless Postgres). Nothing here has been run yet. Limits and prices were checked on
2026-11-17 and change often, so the items marked **verify** need a look at the live pricing page
before you rely on them.

```
phone ──HTTPS──▶ Render (Docker web service, Node/Hono, serves the PWA + /api) ──SSL──▶ Neon Postgres
```

## 1. What the app needs (from the code)

| Fact | Where | Consequence on Render + Neon |
|---|---|---|
| Reads `DATABASE_URL`, `PORT` (default 3000), `HOST` (default 0.0.0.0) | `server/index.ts` | Render sets `PORT` (10000 by default); the app already follows it. Only `DATABASE_URL` is required. |
| Optional `VAPID_SUBJECT` | `server/push.ts` | Set it to `mailto:<your real address>` (Apple wants a plausible contact). |
| Migrations run on start, in one transaction, with `pg_advisory_xact_lock` | `server/db.ts` | Fine on a direct Neon connection. Don't point the app at the pooled URL (§3). |
| Session cookie is `Secure`, `SameSite=Lax` | `server/auth.ts` | Fine: Render serves HTTPS. |
| Strict CSP, `connect-src 'self'` | `server/app.ts` | Fine: the front end and API are on one origin. Don't split them across services. |
| Login rate limit keys on the **last** `X-Forwarded-For` entry | `server/auth.ts` `clientIp` | Written for Tailscale Funnel. Behind Render the last entry may be Render's proxy, not the client. **Verify** (§8, step 9). |
| "Time's up" push timers are `setTimeout` in the process, restored from the DB on start | `server/push.ts` | Works on one always-on instance. On a free instance that spins down, a push can be missed (§4). |
| `/api/health` runs `SELECT 1` | `server/app.ts` | If Render calls it every few seconds it keeps Neon awake (§4). Use a different health check path. |
| Dockerfile: multi-stage, `node:24-slim`, runs as `node`, `CMD node dist-server/index.js` | `Dockerfile` | Render builds and runs it as is. No `render.yaml` or Dockerfile change is required. |

## 2. Services, plans and cost

**Render web service (Docker).**
- **Free:** 750 instance hours a month per workspace, 512 MB RAM, 0.1 CPU. It **spins down after 15 minutes without inbound
  traffic** and wakes on the next request; reports of the wake-up range from 30 s to 2 min. The filesystem is ephemeral (the
  app writes nothing to disk, so that's fine). Free outbound bandwidth was cut in April 2026 (one source says 5 GB a month, **verify**).
  Render's own free Postgres expires after 30 days. That is why the database goes to Neon.
- **Paid (Starter, about $7 a month, verify):** always on, so no cold start and push timers keep working.

**Neon (Postgres).**
- **Free:** compute scales to zero after 5 minutes idle (fixed on Free), 100 CU-hours a month per project (older pages say
  about 192 h, **verify**), 0.5–1 GB storage (**verify**; at the limit, writes fail). Our data is small: text rows plus optional
  exercise photos (≤ 2 MB each) stored as data URLs. Watch the storage meter if people upload many photos.
- Pick the **same region** as the Render service, close to you.

**Recommendation:** start on Render Free + Neon Free to check that everything works. If the 30–60 s first-open delay is annoying,
or a rest-timer push is missed, move only Render to Starter. That is a plan switch with no redeploy.

## 3. Connection string: direct, not pooled

Neon gives two hostnames: direct (`ep-xxx.<region>.aws.neon.tech`) and pooled (`ep-xxx-pooler…`, PgBouncer in
transaction mode). Use the **direct** one for the app, for migrations and for `pg_dump` and `psql`:

```
postgres://<user>:<password>@ep-xxx.<region>.aws.neon.tech/<db>?sslmode=require
```

Why: the pooler doesn't support session-level features (SQL `PREPARE`, session advisory locks). Our migration lock is
transaction-level and would probably work, but a direct connection costs nothing at this size (one small instance, default
pool of 10). If it's ever needed, the pooled URL also requires `postgres(url, { prepare: false })`.

## 4. Behaviour changes to expect (and what to do)

1. **Cold starts.** Free Render: first request after 15 idle minutes takes 30–60 s or more. Neon wakes in about a second on
   top. The app shows "Offline — changes will sync" and keeps the workout locally, so nothing is lost, but the first open is slow.
2. **Neon dropping idle connections.** After scale-to-zero, the open sockets in postgres.js are dead and the first query can fail.
   Fix (code, §6): `idle_timeout` so the pool closes idle sockets before Neon suspends.
3. **Health check keeps Neon awake.** Render's health check hits `/api/health` (→ `SELECT 1`) all day, which prevents
   scale-to-zero and burns the CU-hours (0.25 CU × 720 h = 180 h > 100 h). Set the Render health check path to a
   static file (e.g. `/manifest.webmanifest` or `/`) and leave `/api/health` for manual checks.
4. **Missed rest-timer pushes on Free.** The timer lives in the Node process. If the instance is suspended before the rest ends,
   no push is sent. In practice every set saves with a request, so the service is awake during a workout; it only matters if
   you leave the phone for 15+ minutes, at which point a rest push is moot anyway. Starter removes the concern. Don't scale
   beyond 1 instance (`ponytail:` comment in `push.ts`).
5. **New URL = new app on the phone.** The address is the PWA's identity (`DEPLOY.md` §7). You will have to: finish and sync any
   unfinished workout on the old address first, sign in again at the new one, **Add to Home Screen** again, and re-enable
   notifications (push subscriptions belong to the origin; stale ones are deleted by the server on the first 404/410).
   A custom domain on Render (§7) means this happens only once, because later host moves keep the address.
6. **Backups are now your job.** The nightly `pg_dump` timer from `DEPLOY.md` §8 goes away with the laptop. Neon's built-in
   history window on Free is short (**verify**). See §9.

## 5. One-time setup

### Neon
1. Create a project: Postgres 17 or the newest offered, region next to Render. **Check the major version:** the laptop runs
   Postgres 18 (`compose.yaml`). If Neon doesn't offer 18, a dump from 18 still restores into 17 as long as nothing 18-specific is
   used. Our migrations are plain SQL, but do a dry run (§8, step 3).
2. Copy the **direct** connection string (§3). Keep the password out of the repo.
3. Create a second branch or project called `staging` if you want a place to rehearse the restore (free, small).

### Render
1. **New → Web Service → Build and deploy from a Git repository** → pick the repo, branch `main`, **Language: Docker**
   (root `Dockerfile`).
2. Region: same as Neon. Instance type: Free to start.
3. Environment variables:
   - `DATABASE_URL` = the Neon direct URL.
   - `VAPID_SUBJECT` = `mailto:you@yourdomain`.
   - `NODE_ENV` is already set by the Dockerfile.
4. Advanced → **Health Check Path**: `/manifest.webmanifest` (see §4.3). Auto-deploy on commit: your choice; on is
   convenient, but it deploys every push to `main`.
5. Optionally keep the setup in the repo as `render.yaml` (Blueprint) so it's reproducible:

   ```yaml
   services:
     - type: web
       name: ttp
       runtime: docker
       plan: free            # starter for always-on
       region: frankfurt     # same as Neon
       healthCheckPath: /manifest.webmanifest
       envVars:
         - key: DATABASE_URL
           sync: false       # entered in the dashboard, never committed
         - key: VAPID_SUBJECT
           sync: false
   ```

## 6. Code changes to make before the cutover

Small, each its own commit. None is needed to boot, but the first two avoid real problems on Neon.

1. `server/db.ts` `connect()`: default options `{ idle_timeout: 20, max_lifetime: 60 * 30 }` so sockets are recycled before
   Neon suspends and a cold wake never hits a dead connection. Add a test or keep it to the existing `connect` options argument.
2. `server/auth.ts` `clientIp`: decide how to read the client IP behind Render (§8, step 9). Probably the first or the second
   `X-Forwarded-For` entry; keep the Tailscale behaviour out once the laptop is retired.
3. `server/cli.ts` needs nothing, but see §8 step 8 (it is run from your PC).
4. Docs: rename `DEPLOY.md` to `DEPLOY-LAPTOP.md` (or delete it later), add the final Render notes to `README.md`/`CLAUDE.md`
   (commands section mentions compose), update `PROGRESS.md` and `ROADMAP.md` Phase 5.

## 7. Custom domain (recommended, optional)

Buy a domain (about $10–15 a year) and add it in Render → Settings → Custom Domains; Render issues the HTTPS certificate. Point the
phone at `https://app.yourdomain` from the start so a later move of the backend never changes the PWA's identity again.
(`ROADMAP.md` Phase 5 plans Cloudflare for DNS; it can sit in front, but cache static assets only, never `/api`.)

## 8. Cutover runbook

Do the rehearsal (steps 1–5) first with a **staging** Neon database; it changes nothing in production.

1. **Tools on your PC:** `psql` and `pg_dump` (match the server major version, 18 → use the Docker image:
   `docker run --rm -it postgres:18-alpine pg_dump …`). Keep `DATABASE_URL`s in shell variables, not in files.
2. **Dump from the laptop** (stack running there):
   ```bash
   docker compose exec -T db pg_dump -U ttp --clean --if-exists --no-owner --no-privileges ttp | gzip > ttp-cutover.sql.gz
   ```
   `--no-owner/--no-privileges` because Neon's role is not `ttp`. The dump includes `schema_migrations`, so the app won't
   re-run migrations, and `push_key` (the VAPID pair), so it stays the same.
3. **Restore into Neon (staging first):**
   ```bash
   gunzip -c ttp-cutover.sql.gz | psql "$NEON_DIRECT_URL" -v ON_ERROR_STOP=1
   psql "$NEON_DIRECT_URL" -c "select count(*) from app_user" -c "select count(*) from workout"
   ```
   Compare the counts with the laptop. `ON_ERROR_STOP` makes any version incompatibility fail loudly.
4. **Boot the app against it, locally:** `DATABASE_URL="$NEON_DIRECT_URL" npm run dev:server`, open `http://localhost:3000` (Vite:
   `npm run dev`), sign in with a real account, and check history, progress and templates.
5. **Deploy on Render** with the staging `DATABASE_URL`, open the `*.onrender.com` URL, sign in, log a test workout, finish it.
6. **Freeze and final dump** (the real cutover): stop writes by stopping the laptop app (`docker compose stop app`),
   re-run steps 2–3 against the **production** Neon database. Fix the data of the account you use first if it's a test.
7. **Point Render at production:** change `DATABASE_URL` on Render, redeploy, check the health path and
   `https://<service>.onrender.com/api/health` (`{"ok":true}` means the DB connection works).
8. **Invites and users:** the dumped accounts carry over. Render Free has no shell, so run the CLI from your PC against Neon:
   `DATABASE_URL="$NEON_DIRECT_URL" npx tsx server/cli.ts invite` (and `users`).
9. **Check the rate limit behind Render:** make 11 wrong logins for a throwaway username from your phone, then from another
   network. If a different client is blocked too, `clientIp` is reading Render's address; fix as in §6.2 before inviting friends.
10. **Phones:** open the new URL, sign in, **Add to Home Screen**, allow notifications, complete a set and check that the
    "Time's up" push arrives with the app closed. Then delete the old Home Screen icon.
11. **Keep the laptop stack stopped but intact** for a week (`docker compose stop`, never `down -v`), then remove the Tailscale
    Funnel (`sudo tailscale funnel reset`).

**Rollback** before step 10: `docker compose start app` on the laptop again; nothing written on Render/Neon was ever
authoritative until step 7. After phones switched: dump from Neon the same way as step 2 and restore into the laptop with the restore
command from `DEPLOY.md` §8.

## 9. Backups after the move

- **Neon:** point-in-time restore exists, but the window on Free is short (**verify**). Treat it as an undo button, not a backup.
- **Your own dump, weekly at least:** from your PC, `pg_dump --no-owner "$NEON_DIRECT_URL" | gzip > ttp-$(date +%F).sql.gz`, saved
  somewhere that isn't the laptop being retired. A scheduled GitHub Actions dump isn't suitable here: the repo is public, and
  workflow artifacts of a public repo are readable by any signed-in GitHub user.
- The in-app **Export my workouts (JSON)** in Settings is a per-user safety net for workout history only.

## 10. Checklist

- [ ] Neon project (direct URL saved, region chosen) and a staging database
- [ ] Code changes §6.1 and §6.2 merged
- [ ] Restore rehearsal on staging passes (counts match, sign-in works)
- [ ] Render service created, env vars set, health path `/manifest.webmanifest`
- [ ] Domain decided (§7)
- [ ] Final dump → Neon production, Render pointed at it
- [ ] Rate-limit check (step 9), push test on the phone (step 10)
- [ ] First off-site backup taken
- [ ] Laptop stack stopped, Funnel reset, `DEPLOY.md` retired, `PROGRESS.md` updated

## Sources
- Render free tier: <https://render.com/docs/free>
- Neon plans and free-plan limits: <https://neon.com/faqs/free-plan-limits-and-quotas>, <https://neon.com/pricing>
- Neon pooled vs direct connections: <https://neon.com/docs/connect/connection-pooling>, <https://neon.com/docs/connect/choose-connection>
