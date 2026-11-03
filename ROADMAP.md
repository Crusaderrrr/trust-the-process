# Roadmap — from the laptop to a public app

Written 2026-11-03. The order is deliberate: each phase has an **exit check** and the next one
starts only after it passes. Nothing public happens before the security gate in Phase 7 passes.
`IDEAS.md` keeps the unscheduled feature ideas; this file is the plan.

## Where we are (2026-11-03)
- React + TS PWA + Hono/Node + Postgres, Docker Compose, meant for the owner's laptop behind
  Tailscale Funnel (`DEPLOY.md`, not yet run there).
- Invite-only accounts (argon2id, hashed session tokens in cookies, rate limits, CSP, CSRF
  guard), per-user data, rest-timer Web Push, local-first saving of an open workout.
- Features: logging (set types, Previous, rest timer), history + edit, weekly plan + calendar,
  per-exercise progress, tonnage, check-ins, cardio, grips, 53 exercises.
- Missing for the public: offline start, hosting, email-based accounts, native app, legal
  pages, store presence, payments, and a strict security review.

## Decided
- Hosting: the Node server as a container on Fly.io / Railway / a small VPS with managed
  Postgres; Cloudflare only for DNS and caching. No move to Workers.
- Native app: Capacitor (iOS + Android) wrapping the same React build. Fallback: Expo / React
  Native, reusing `domain/`, API client and repositories.
- Logging stays free forever (see Phase 10).

## Decisions needed from you
| # | Question | My default |
|---|---|---|
| D1 | Which country you'll operate from (privacy law, taxes, who can receive store payouts) | — need your answer |
| D2 | App name + domain. "Trust The Process" may be hard to trademark/find in stores | Check stores and trademarks, buy the domain early |
| D3 | Host | Fly.io + managed Postgres (backups + point-in-time restore) |
| D4 | iOS first or both at once | Both: Capacitor makes Android cheap; iOS first if time is short |
| D5 | Email provider (sign-up check, password reset) | Resend or Postmark (new dependency, needs your OK) |
| D6 | Error monitoring | Sentry free tier (new dependency, needs your OK) |
| D7 | Monthly budget | ~$30–60/mo hosting + $99/yr Apple + $25 Google once + domain + a pentest (Phase 7) |

---

## Phase 1 — Cleanup
- Delete `src/db/` and `@sqlite.org/sqlite-wasm` (unused since the v1 import was removed).
- Retire the GitHub Pages workflow/site once the new host is live (Phase 5).
- **Exit:** typecheck, lint and tests green; bundle smaller.

## Phase 2 — Offline-first workouts
- Cache the exercise library and each exercise's "Previous" data on the device; refresh on
  launch and after changes.
- Start, edit and finish a workout fully offline; queue the saves.
- Create a custom exercise offline (client UUID), use it right away, sync it before any workout
  that uses it; a name clash on sync reuses the existing exercise.
- **Exit:** in airplane mode: start → add any exercise (including a new custom one) → log →
  finish → back online → everything on the server, no duplicates. Covered by tests.

## Phase 3 — Accounts for the public
- Open sign-up with **email**: verification, password reset, change email/password.
- **Account deletion** in the app (Apple requires it) and **export my data** (GDPR-style).
- Auth that works inside the native app: the Capacitor app is not on the API's origin, so
  cookies won't work there. Add a bearer token for native, stored in the Keychain/Keystore;
  keep cookies for the web.
- Abuse limits: per-IP and per-account rate limits, sign-up limits, caps on how much data one
  account can store.
- Invites stay available, but nothing requires them anymore.
- **Exit:** every new route has tests, including "user A cannot touch user B's data".

## Phase 4 — Features for launch
Only what makes someone switch from Hevy/Strong:
- **CSV import** from Hevy and Strong (later Fitbod/JEFIT). Pure parsers in `src/domain/`
  tested against real export files; re-importing replaces the data instead of duplicating it.
- **More exercises**: grow the library from free-exercise-db (public domain, ~800 exercises with
  photos; the source of the current photos) — curated, not dumped. Add equipment + muscle
  metadata and better search.
- **Routines (basic)**: Hevy users expect them, and the import should bring theirs over.
  Periodization comes after launch (see `IDEAS.md`).
- Onboarding: first-run flow (units are kg, set up a plan, import from another app).
- **Exit:** a real Hevy export and a real Strong export import correctly.

## Phase 5 — Hosting (staging + production)
- Two environments: **staging** (for testing, fake data) and **production**. Same image, deployed
  by CI from `main` (staging) and from a tag (production).
- Managed Postgres with daily backups + point-in-time restore; app connects as a non-owner DB
  role (no DDL rights at runtime; migrations run as a separate role).
- Secrets only in the host's secret store, never in the repo; rotate the VAPID and session keys
  once before launch.
- Cloudflare: DNS, TLS (full/strict), cache static assets only, never `/api`.
- Health checks, uptime monitor, structured logs without personal data, error monitoring (D6).
- **Exit:** a restore drill — restore last night's backup into staging and log in.

## Phase 6 — Design refresh + native app
- Design pass before the store screenshots: a small design system (colours, type scale,
  spacing, components), consistent empty/loading/error states, haptics on set completion, safe
  areas, dynamic type, accessibility (labels, contrast, 44 pt tap targets).
- Capacitor projects for iOS and Android; app bundled in the binary (works offline from the
  first launch); native push (APNs/FCM) for the rest timer; local notifications as a fallback
  when offline; app icon, splash screen, deep links for invite/reset emails.
- Apple review: wrapped websites get rejected, so the app must use native features (push,
  haptics, offline) and must not feel like a browser.
- **Exit:** TestFlight and Play internal-testing builds installed on your phone and a friend's.

## Phase 7 — Security gate (strict validation before anyone public)
Nothing public until every box here is ticked and written up in `SECURITY.md`.

**7.1 Threat model** (1 page): what we protect (accounts, workout/health-like data, email
addresses), from whom (credential stuffing, account takeover, scraping other users' data,
abuse of sign-up/push, a stolen phone, a leaked backup), and where the trust boundaries are.

**7.2 Checklist against OWASP ASVS level 2**, focused on:
- *Authentication:* argon2id parameters, password rules (length, known-breached check), lockout
  and rate limits, reset tokens single-use + short expiry, the session invalidated on password
  change, no account enumeration in login/sign-up/reset responses.
- *Access control:* every query filtered by user, proven by a test per endpoint that user A
  gets 404 on user B's ids (IDOR suite). Admin actions checked server-side.
- *Input:* zod on every body/query/param, size limits, CSV import treated as hostile (row
  limits, no formula injection when we export CSV).
- *Sessions/tokens:* cookie flags, native token storage in the Keychain, logout revokes, expiry.
- *Transport/headers:* HTTPS only, HSTS, strict CSP, CORS allow-list for the native app only.
- *Data:* least-privilege DB role, encrypted backups, no personal data in logs, data
  retention, deletion really deletes (including push subscriptions and sessions).
- *Supply chain:* `npm audit` + Dependabot, lockfile committed, pinned base image, CodeQL in CI,
  container image scan.

**7.3 Automated checks in CI:** unit + IDOR tests, CodeQL, dependency audit, image scan, and an
OWASP ZAP baseline scan against staging on every release.

**7.4 Manual testing on staging:** walk the OWASP Web Security Testing Guide for auth, session
and access control; try to read/modify another account's data via the API directly.

**7.5 External review:** a paid pentest (or at least a security-minded reviewer) of the API and
both apps before public launch. Budget for it (D7).

**7.6 Operations:** `security.txt` + a contact address, an incident runbook (how to rotate keys,
revoke all sessions, restore a backup, notify users), alerting on spikes of failed logins/5xx.

**7.7 Legal (also a gate):** privacy policy, terms of use, what data we keep and why; the
store privacy forms (Apple "nutrition label", Google Data safety) filled in to match.

- **Exit:** every item ticked with evidence (test names, scan reports, the pentest report and
  fixes), reviewed by you.

## Phase 8 — Closed beta
- 10–50 people via TestFlight + Play internal testing: friends, then gym people.
- In-app feedback link, crash/error monitoring on, weekly fix releases.
- Watch: crashes, sync failures, retention after 1 and 4 weeks, what people miss from Hevy.
- **Exit:** two weeks with no data-loss bugs and no open high-severity issues.

## Phase 9 — Public launch (free)
- Store listings (screenshots, description, privacy labels), website on the domain with privacy
  policy, terms, support contact.
- Everything free at launch. Tell users up front what will stay free forever and that early
  users get a perk later (see below), so a paid tier isn't a surprise.
- **Exit:** live in both stores; backups, monitoring and alerts verified in production.

## Phase 10 — Making money (plan now, switch on later)
**Model: freemium subscription.** Ads are wrong for a gym app (screen time between sets, privacy)
and selling data is out.

- **Free forever:** unlimited workout logging, history, Previous, rest timer, the exercise
  library, calendar, basic progress charts, import, and export of your own data. If logging
  isn't free, people stay on Hevy.
- **Pro (candidates):** periodization programs and progression rules, unlimited routines
  (free gets a few), advanced stats (muscle volume, PR timeline, 1RM trends), more chart ranges,
  themes/app icons, priority support.
- **Prices:** check Hevy/Strong's current prices when we get there and land a bit under them.
  Offer monthly, yearly (~40% off), and maybe lifetime.
- **Payments:** Apple/Google in-app purchases are required for digital features inside the
  apps; RevenueCat (free at small scale) handles both stores and receipt validation; the
  server remains the source of truth for "is Pro". Apple and Google take 15% for small
  developers (enrol in Apple's Small Business Program).
- **Early-user perk:** everyone who joins in the free period gets e.g. 6–12 months of Pro or a
  discounted lifetime price.
- **When to switch on:** after ~4 weeks of stable public use and once Pro features exist
  (periodization is the obvious first). Needs D1 settled (business/tax setup to receive payouts).
- **Track:** weekly active users, 4-week retention, free→Pro conversion, refunds, churn.
- **Costs to cover:** hosting, Apple/Google fees, email, monitoring, domain, pentest.

---

## Order at a glance
1 Cleanup → 2 Offline → 3 Public accounts → 4 Launch features → 5 Hosting → 6 Design + native →
7 **Security gate** → 8 Closed beta → 9 Public free launch → 10 Pro tier.

Phases 2–4 can be built and tested on the laptop; 5 can start in parallel with 4.
