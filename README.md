# Tryout Tracker

A lightweight, mobile-first Progressive Web App (PWA) built with **React (Vite) + Tailwind CSS + Firebase Firestore** for real-time sideline evaluations during team tryouts.

One deployment serves many teams. Each team gets its own URL (`/t/<slug>`), its own isolated cloud data, and its own coach PIN — no per-device setup required beyond opening the link.

---

## Features

- **Multi-team support**: teams isolated by URL slug; one Firestore project serves all.
- **Thumb-Optimized Sideline UI**: big, high-contrast player cards color-coded to match real-life pinneys (Red, Navy, White, Yellow, Green, etc.).
- **5-Point Segmented Touch Scoring**: rapidly score criteria in under 5 seconds (`--`, `-`, `Std`, `+`, `++`).
- **Exemplar Player Anchors**: display benchmark exemplar players next to criteria.
- **Preset Quick-Take Chips**: 1-tap note tags (*"Lock for team"*, *"Cut / Move Down"*, *"Bubble"*, etc.).
- **Coach-Only Live Roster Board**: dynamic spot counter, 1-click lock/unlock, leaderboard sorted by overall/offense/defense, 1-click CSV matrix export.
- **Multi-Session Lifecycle**: advance from Session 1 → Session 2 → Session 3 with 1-click roster rollover.
- **Mixed-Gender Support** (optional per team): M/F badge on player cards, scoring modal and roster board; gender filter on the evaluator grid; M/F counts on the roster header; gender column in CSV import/export.
- **Offline Resilience**: instant optimistic writes to local IndexedDB (Dexie.js); native Firestore multi-tab offline caching + automatic background sync.

---

## Security model (read before deploying)

The isolation level is **convenience**: anyone who knows a team URL (`/t/<slug>`) can access that team and see all evaluations. The coach PIN is stored plaintext in the team doc, readable by anyone who has the URL. This is intentional — the app is designed for sideline use where the audience is known.

- Keep team URLs out of public places if you want privacy.
- Use a long, hard-to-guess `SUPER_ADMIN_PIN` (see env vars below). The super-admin screen lists all teams and their slugs.
- A later migration to Firebase Auth (adding `member_uids` checks to Firestore rules) can tighten this without another data migration — the data layout is already structured for it.

---

## Team URLs

Each team is served at:

```
https://<your-vercel-app>.vercel.app/t/<slug>
```

Example: `/t/ignite`, `/t/gryphons-u17`.

When a coach opens a team URL the app loads the team doc from Firestore, caches it locally, and works offline on subsequent visits. The last-used team slug is remembered; a PWA installed to the home screen relaunches straight to that team.

---

## Creating and editing teams

### Super-admin screen (recommended)

Open the **root URL** (`/`) in a normal browser tab (not the installed PWA). You will be prompted for the `SUPER_ADMIN_PIN`. After signing in you can:

- **List** existing teams with slugs and one-click copy-link buttons.
- **Create** a team: pick a slug (lowercase letters, digits and hyphens; 2–40 chars; reserved words `api`, `t`, `admin`, `assets` are blocked), set a display name, a 4–8 digit coach PIN, and the mixed-gender toggle.
- **Edit** a team: change name, coach PIN or mixed-gender flag. The slug cannot be changed after creation.

> **Note on PIN changes:** coaches cannot change their own PIN. All PIN changes go through the super-admin screen.

### Manual fallback (Firebase console)

If the function is unavailable, create the team document directly:

1. Open [console.firebase.google.com](https://console.firebase.google.com) → your project → **Firestore Database**.
2. Create a document at `teams/<slug>` (e.g. `teams/gryphons-u17`).
3. Add these fields:

| Field | Type | Example |
|---|---|---|
| `name` | string | `"Gryphons U17"` |
| `coach_pin` | string | `"2026"` |
| `mixed_gender` | boolean | `false` |
| `created_at` | string | `"2025-01-01T00:00:00.000Z"` |
| `updated_at` | string | `"2025-01-01T00:00:00.000Z"` |
| `member_uids` | array | *(empty)* |

---

## Mixed-gender teams

Set `mixed_gender: true` on the team doc (via the super-admin screen or Firebase console) to enable:

- Blue **M** / violet **F** badge on every player card, the scoring modal header, and the roster board table.
- A thin colored strip on the left edge of each player card.
- Gender filter pills (All / M / F) on the evaluator grid.
- M and F counts in the roster board header.
- Gender selector in the admin add-player form and roster table.
- `Gender` column in CSV import (accepts `M`/`Male`/`Men`/`Man`/`Boy` and `F`/`Female`/`Women`/`Woman`/`Girl`, case-insensitive) and export.

When `mixed_gender` is off none of these elements appear.

---

## Environment variables

Set these in Vercel project settings (never commit real values to the repo).

| Variable | Required by | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | SPA (client) | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | SPA (client) | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | SPA (client) | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | SPA (client) | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | SPA (client) | Firebase web config |
| `VITE_FIREBASE_APP_ID` | SPA (client) | Firebase web config |
| `SUPER_ADMIN_PIN` | `api/teams` function | Secret for super-admin screen. **Use 8+ characters.** |
| `FIREBASE_SERVICE_ACCOUNT` | `api/teams` function | Service-account JSON or its base64 encoding. Firebase console → Project settings → Service accounts → Generate new private key. |

`SUPER_ADMIN_PIN` and `FIREBASE_SERVICE_ACCOUNT` are server-only — **never** prefix them with `VITE_`. Copy `.env.example` to `.env` for local development; `.env` is gitignored.

---

## Firestore rules deployment

Security rules live in [`firestore.rules`](firestore.rules). They allow clients to `get` (not list or write) `teams/{slug}` and to read/write the team's `sessions`, `players`, `evaluations`, `player_notes` and `criteria` subcollections. Everything else is denied by default.

Deploy after any change:

- **Firebase console (no tooling):** Build → Firestore Database → **Rules**, paste the contents of `firestore.rules`, click **Publish**.
- **Firebase CLI:** with a `firebase.json` containing `{ "firestore": { "rules": "firestore.rules" } }` (not committed), run:
  ```bash
  npx firebase-tools deploy --only firestore:rules --project <project-id>
  ```

During the legacy-data migration window the rules file has a commented-out block at the bottom that keeps the old top-level collections readable. Uncomment it only when deploying rules before cutover, then remove it again after (see migration section below).

---

## Vercel deployment

Push to `main` (or the branch you have connected in Vercel). Vercel builds the SPA with `npm run build` and serves it. The `/api/teams` serverless function is compiled by Vercel automatically.

The [`vercel.json`](vercel.json) rewrite rule sends any `/t/*` request to `index.html` so team URLs work on page refresh and as shared links.

### Local development

```bash
# Install dependencies
npm install

# SPA only (no /api/* function)
npm run dev
```

Open `http://localhost:5173`. The Vite dev server handles `/t/*` rewrites already.

To also test the super-admin API function locally, use the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm install -g vercel
vercel dev
```

This runs both the Vite dev server and the Vercel function runtime. Set `SUPER_ADMIN_PIN` and `FIREBASE_SERVICE_ACCOUNT` in your local `.env` before running `vercel dev`.

> **PowerShell note:** On Windows, bare `npm` may be blocked by the execution policy. Use `npm.cmd` instead (e.g. `npm.cmd run dev`, `npm.cmd run build`).

---

## Migrating existing (legacy) data

This section covers the one-time migration of legacy top-level Firestore data (written before multi-team support) into `teams/<slug>/...`.

### Prerequisites

- Node 18+.
- Firebase service-account JSON **outside the repo** (Firebase console → Project settings → Service accounts → Generate new private key).
- `firebase-admin` is already installed (`npm install` covers it).

> **Freeze window:** The script is non-clobbering — if you re-run it after devices have written new data to `teams/<slug>`, those records are left untouched. However, legacy-client writes made after the copy but before the old Firestore rules are removed are silently lost (a re-run skips them because the destination doc already exists). Keep the window between step 2 and step 5 below short.

### Step 1 — Dry run (safe to repeat)

```bash
node scripts/migrate-to-team.mjs \
  --key "/path/to/serviceaccount.json" \
  --team ignite \
  --name "Ignite Juniors"
```

Prints per-collection counts. Nothing is written.

### Step 2 — Apply

```bash
node scripts/migrate-to-team.mjs \
  --key "/path/to/serviceaccount.json" \
  --team ignite \
  --name "Ignite Juniors" \
  --apply
```

Add `--mixed-gender` if the team uses gender tagging.

### Ordered cutover checklist

1. **Coaches sync devices.** Ask all coaches to open the app and wait for the sync indicator to clear.
2. **Run the migration copy** (`--apply`). Confirm the output counts match the dry run.
3. **Deploy the updated app and Firestore rules.** Uncomment the legacy block at the bottom of `firestore.rules` before deploying, so old clients keep working during the rollout window.
4. **Verify `/t/<slug>` on a real device.** Score a player; confirm the evaluation appears in the roster board and in Firestore under `teams/<slug>/evaluations`.
5. **Remove the legacy rule block and redeploy rules.** This denies client access to the old top-level collections.
6. **Delete old data.** In the Firebase console, delete the top-level `sessions`, `players`, `evaluations`, and `player_notes` collections once you are satisfied.

### Migration status (Ignite)

Migration was **applied** to the production Firestore project (`tryout-tracker-450cc`) on 2026-10-19: `teams/ignite` doc created; 1 session (`session-ignite-1`), 2 players, 16 evaluations, 0 player_notes copied. A follow-up dry run shows 0 remaining docs. Legacy top-level collections are untouched. **Cutover steps 2–6 above are still pending.**

---

## Coach / Admin access

Evaluators open the team URL and enter their name to start rating players. Coaches click the ⚙️ icon or the **Roster Board** button and enter the coach PIN to unlock admin controls. The PIN is set per team in the super-admin screen (a 4–8 digit PIN is required when creating a team).

---

## Known limitations

- **Orphaned evaluations/notes after player delete:** deleting a player leaves that player's evaluations and notes in Firestore and IndexedDB. They are not shown in the UI but are not cleaned up.
- **PIN changes require super-admin:** coaches cannot change their own PIN. All PIN changes go through the root super-admin screen.
- **Criteria sync but default seeds are local:** default criteria are seeded by `initDB()` on first load with deterministic IDs (`crit-<slug>-s1-<n>`). They are not pushed to Firestore by the seed. If an admin edits a criterion it is then synced and overwrites the local copy on other devices — this is the intended behavior.
- **Exemplar input syncs on every keystroke:** each keystroke replaces the same queue item, so the queue does not grow, but there is no debounce.
- **No real authentication:** anyone with a team URL can read and write that team's data. The coach PIN is stored plaintext in the team doc.
- **Server-side rate limiting not implemented:** the super-admin function adds a ~700 ms fixed delay on failed attempts but has no per-IP rate limiting (Vercel serverless functions are stateless). Use a long `SUPER_ADMIN_PIN`.
