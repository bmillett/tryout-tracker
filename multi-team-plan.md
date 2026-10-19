# Multi-Team Support Plan

## Overview

**Goal:** Serve many teams from one deployment (Vercel) and one backend (Firebase Firestore). A team is selected by URL (`/t/<slug>`), so there is no per-user setup beyond opening the team's link. Add mixed-gender support (visual M/F cue, filter, M/F counts).

**Scope**
- Team identified by URL slug. All cloud and local data is namespaced per team.
- Super-admin screen at the root URL to create and edit teams. It uses a Vercel serverless function plus `firebase-admin`. Creating a team by hand in the Firebase console remains a supported fallback.
- Coach PIN moves from the session record to the team doc.
- Gender on players: colored chip and card edge strip, gender filter, M/F counts on the roster board, CSV import/export support. Enabled per team.
- Optional last sub-task: per-team PWA manifest.

**Non-goals**
- Real authentication. The isolation level is "convenience": anyone who knows a team URL can use that team. Data paths and the team doc are structured so Firebase Auth can be added later without another data migration.
- Gender-based roster targets or limits.
- Changes to scoring, criteria or session logic beyond what scoping requires.

**Approach**
- Firestore layout: `teams/{slug}` (team doc), with subcollections `teams/{slug}/sessions|players|evaluations|player_notes|criteria` (`criteria` added by sub-task 4b). Path-based isolation means no `where('team_id')` filter can be forgotten.
- Local layout: one Dexie DB per team (`TryoutTrackerDB_<slug>`) and slug-prefixed localStorage/sessionStorage keys. Existing queries and the Dexie schema stay unchanged, with no `team_id` on every record.
- Team doc fields: `name`, `coach_pin`, `mixed_gender` (boolean), `created_at`, and a reserved optional `member_uids` (unused now; reserved for the later auth step).
- Firestore rules: clients may `get` a team doc but not `list` teams (the doc holds the PIN) and may not write it. Clients may read/write the team's subcollections. Only the Vercel function (admin SDK, bypasses rules) writes team docs.
- Root URL `/` shows the super-admin screen in a normal browser. When launched as an installed PWA (`display-mode: standalone`) it redirects to the last-used team stored in localStorage.

**Findings from the code that shape the plan**
- Sync listens to unfiltered top-level collections ([`src/services/sync.ts`](src/services/sync.ts:90)). All four collections must move to team paths.
- The coach PIN is stored plaintext in `TryoutSession.admin_pin_hash` and syncs to every device ([`src/types/index.ts`](src/types/index.ts:14)). Moving it to the team doc fixes this.
- `initDB()` seeds the Ignite sample session and players on first run ([`src/services/sync.ts`](src/services/sync.ts:36)). New teams must not receive Ignite sample data.
- ~~Criteria are only written to Dexie and are not synced to Firestore.~~ **Fixed by Sub-task 4b** (criteria now sync via `teams/{slug}/criteria`, and so do player deletes and session rollover).
- Several Admin writes go straight to `db.*` rather than through `SyncService` (e.g. [`AdminPanel.tsx`](src/components/AdminPanel.tsx:115), [`AdminPanel.tsx`](src/components/AdminPanel.tsx:140)). Player add/import were fixed in sub-task 4; player delete, criteria and session rollover were fixed in Sub-task 4b.
- No `vercel.json`, `firestore.rules` or `firebase.json` exist, so all three are new.
- The Firebase web config is already baked in as a default ([`src/services/firebase.ts`](src/services/firebase.ts:20)). It is fine to keep, because the shared backend does not need per-team Firebase settings.

## Decisions / assumptions to confirm during implementation
- **Coach PIN changes:** Clients cannot write the team doc, so the existing "change PIN" control in Admin ([`AdminPanel.tsx`](src/components/AdminPanel.tsx:878)) is removed, and PINs are changed by the super admin. Alternative if you want coaches to self-serve: a second function endpoint that verifies the current coach PIN server-side.
- **Super-admin secret:** Use a longer secret entered in a password field, not the 4-digit keypad, since it guards team creation. The function compares it in constant time against a server-only env var.
- **Legacy Ignite data:** Migrated by copying (not moving) to `teams/ignite` so old clients keep working until cutover. Devices should sync before cutover; their local caches repopulate from Firestore.

---

## Sub-Tasks

### 1. Team context and URL routing
**Intent:** Establish "which team am I" once, early, and make everything else read it from one place.

**Expected Outcomes**
- `/t/<slug>` loads the app for that team. `/` shows a placeholder (super-admin screen is wired in sub-task 6). Unknown slug shows a clear "team not found" screen.
- Team doc (name, PIN, `mixed_gender`) is fetched from Firestore and cached locally per team, so the app still loads and PIN checks still work offline on later visits.
- Last-used team slug is remembered. A standalone-launched PWA at `/` redirects to it.
- `Ignite` branding in the header and evaluator prompt comes from the team name.

**Todo List**
1. Add a small helper module that parses `location.pathname` into `{ kind: 'root' | 'team', slug }` and validates slug format. No router library.
2. Add a `Team` type (`slug`, `name`, `coach_pin`, `mixed_gender`, optional `member_uids`).
3. Add a team-loading step in the app entry (loading / not-found / ready states) that fetches `teams/{slug}` and caches it in localStorage keyed by slug.
4. Provide the loaded team to the app via React context.
5. Save the last-used slug on successful load. Redirect `/` to it when running standalone.
6. Replace hardcoded "Ignite" strings in UI with the team name.

**Relevant Context:** [`src/main.tsx`](src/main.tsx), [`src/App.tsx`](src/App.tsx), [`src/components/EvaluatorPrompt.tsx`](src/components/EvaluatorPrompt.tsx:27), [`src/services/firebase.ts`](src/services/firebase.ts), [`src/types/index.ts`](src/types/index.ts).

**Status:** `[x] done`

**Implementation notes (for sub-task 2 and later)**
- `src/services/team.ts`: route and team helpers. `parseRoute()` returns `{kind:'root'} | {kind:'team', slug} | {kind:'unknown'}` (slug regex `^[a-z0-9][a-z0-9-]*$`, via `isValidSlug`). Also `fetchTeam(slug)` (reads `teams/{slug}` through `getFirestoreDB()`, returns `null` if missing), `readCachedTeam` / `cacheTeam` / `clearCachedTeam`, `getLastTeamSlug` / `saveLastTeamSlug`, `isStandalone()`.
- `src/context/TeamContext.tsx`: `<TeamGate>` (wraps `<App />` in `src/main.tsx`) renders root placeholder / not-found / loading / error / ready screens. `useTeam()` returns the `Team` and is only valid under a ready gate. **Sub-task 2 can read the slug** from `useTeam().slug`, or from `parseRoute()` at module load (`db.ts` is a module singleton, and the slug is known from `location.pathname` before React mounts).
- `Team` type is in `src/types/index.ts`. `fetchTeam` normalizes `coach_pin` to a string and defaults `name` to the slug.
- Caching: team doc stored in localStorage under `tryout_team_<slug>`. A cached team renders immediately (stale-while-revalidate); a network fetch failure keeps the cached team. A missing doc clears the cache and shows "team not found". The error screen shows only when there is no cache and the fetch fails. Last-used slug is in `tryout_last_team_slug` (global, not team-prefixed on purpose).
- Standalone redirect: `RootScreen` does `window.location.replace('/t/<last slug>')` when `display-mode: standalone` (or iOS `navigator.standalone`) and a last slug exists.
- Branding: header `<h1>` in `App.tsx` and `EvaluatorPrompt` title now use `team.name`.
- Not changed (left for later sub-tasks): `ignite_*` storage keys, the single Dexie DB, top-level Firestore collections in `sync.ts`, `admin_pin_hash` as PIN source (`App.tsx` still passes `activeSession?.admin_pin_hash || '2026'`; sub-task 3 should use `team.coach_pin`), `index.html` title and PWA manifest name (sub-task 8/9). `Team.mixed_gender` is available via `useTeam()` for sub-task 4.
- Note: `vercel.json` rewrite for `/t/*` does not exist yet (sub-task 5), so refreshing `/t/<slug>` on Vercel will 404 until then. The Vite dev server handles it already.
- `npm.cmd run build` passes (the only warning is the pre-existing chunk size warning). On this machine bare `npm` is blocked by the PowerShell execution policy, so use `npm.cmd`.

---

### 2. Scope local storage and cloud sync by team
**Intent:** Guarantee no data crosses teams on the device or in Firestore.

**Expected Outcomes**
- Each team uses its own Dexie DB. All `ignite_*` localStorage/sessionStorage keys (evaluator name, admin unlocked) are prefixed by slug. Theme stays global.
- All Firestore reads/writes/listeners use `teams/{slug}/...` paths.
- A new team starts with a default session and default criteria but no sample players. Seed IDs are deterministic so multiple devices seeding concurrently do not create duplicates.
- Switching between teams on one device keeps each team's evaluator name and unlocked state separate.

**Todo List**
1. Make the Dexie DB name team-derived. `db` is a module-level singleton imported across the app, so decide the instantiation point (the slug is known at page load) and keep the exported `db` usage unchanged where possible.
2. Prefix the storage keys in [`App.tsx`](src/App.tsx:32), [`EvaluatorPrompt.tsx`](src/components/EvaluatorPrompt.tsx:15) and [`AdminPinModal.tsx`](src/components/AdminPinModal.tsx:30).
3. Change the four `collection(...)`/`doc(...)` usages in listeners and `flushQueue()` to team-rooted paths.
4. Update `initDB()` seeding: no sample players for new teams (decide whether Ignite's sample data is kept for any team or removed).
5. Verify that the offline queue flushes to the correct team path after reconnect.

**Relevant Context:** [`src/services/db.ts`](src/services/db.ts), [`src/services/sync.ts`](src/services/sync.ts), [`src/data/defaultData.ts`](src/data/defaultData.ts:168), [`src/hooks/useTheme.ts`](src/hooks/useTheme.ts) (no change).

**Status:** `[x] done`

**Implementation notes (for sub-task 3 and later)**
- `src/services/db.ts`: `slugFromPathname()` parses `window.location.pathname` at module load using the same regex as `parseRoute()` (avoids a circular dep with `team.ts`). The Dexie DB is now created as `TryoutTrackerDB_<slug>` (e.g. `TryoutTrackerDB_ignite`). Falls back to `TryoutTrackerDB_default` on non-team routes. The exported `db` is unchanged for all consumers.
- `src/services/sync.ts`: added `getTeamSlug()` helper (calls `parseRoute()`). All four `collection()` / `doc()` usages in `startFirestoreListeners()` and `flushQueue()` now use `teams/${slug}/<collection>` paths. The offline queue therefore flushes to the correct team path after reconnect — same slug is computed each call.
- `initDB()` seeding: session ID is now `session-<slug>-1` and criteria IDs are `crit-<slug>-s1-<n>`. Deterministic so two devices seeding concurrently produce the same records with the same primary keys. Sample players are **not** seeded for new teams. `INITIAL_SAMPLE_PLAYERS` import removed from `sync.ts`.
- Storage key prefixes: `App.tsx` and `EvaluatorPrompt.tsx` use `` `${team.slug}_evaluator_name` ``; `App.tsx` and `AdminPinModal.tsx` use `` `${team.slug}_admin_unlocked` `` (session storage). Theme stays global (unchanged). `AdminPinModal` now imports `useTeam()` for the key — it is only rendered under `<TeamGate>` so this is safe.
- Not changed: `admin_pin_hash` as PIN source (`App.tsx` still passes `activeSession?.admin_pin_hash || '2026'`; sub-task 3 should replace with `team.coach_pin`). The "change PIN" UI in `AdminPanel` is left for sub-task 3 to remove.
- `npm.cmd run build` passes (exit 0). The only warning is the pre-existing chunk size warning — no new TS errors.

---

### 3. Move coach PIN to the team doc
**Intent:** Stop shipping the PIN in every session sync and give each team one PIN.

**Expected Outcomes**
- The PIN modal validates against the team doc's `coach_pin`, including offline via the cached team doc.
- `TryoutSession.admin_pin_hash` is no longer read or written (field left optional/deprecated for old records).
- The "change PIN" UI in Admin is removed (see decisions above).
- The PIN modal's indicator count and key-handling follow the team PIN length.

**Todo List**
1. Pass `team.coach_pin` as `targetPin` to [`AdminPinModal`](src/components/AdminPinModal.tsx).
2. Remove PIN state and UI from [`AdminPanel.tsx`](src/components/AdminPanel.tsx:72).
3. Stop seeding `admin_pin_hash: '2026'` for new sessions (including rollover sessions in `AdminPanel`).
4. Confirm the PIN indicator dots handle non-4-digit PINs if the super admin may set other lengths (or restrict creation to 4 digits).

**Relevant Context:** [`src/components/AdminPinModal.tsx`](src/components/AdminPinModal.tsx), [`src/components/AdminPanel.tsx`](src/components/AdminPanel.tsx:72), [`src/types/index.ts`](src/types/index.ts:14), [`src/data/defaultData.ts`](src/data/defaultData.ts:168).

**Status:** `[x] done`

**Implementation notes (for sub-task 4 and later)**
- `src/App.tsx`: `targetPin` on `<AdminPinModal>` now reads `team.coach_pin` (from `useTeam()`). No fallback needed — the team doc is cached in localStorage so this works offline.
- `src/components/AdminPanel.tsx`: removed `customPin`, `pinSuccess`, `pinError` state and the entire "Change Coach PIN" card from the Settings tab. Removed `KeyRound` import (was only used in that card). `CheckCircle2` kept — it's used in the save-success banner on the roster tab.
- `src/components/AdminPanel.tsx` line ~220: `admin_pin_hash` no longer copied to rollover sessions.
- `src/data/defaultData.ts`: removed `admin_pin_hash: '2026'` from `INITIAL_DEFAULT_SESSION`. The seeded session now has no PIN field.
- `src/types/index.ts`: `TryoutSession.admin_pin_hash` is now `optional` (`?`) and marked `@deprecated`. Old Firestore records still type-check; new ones simply omit it.
- `src/components/AdminPinModal.tsx`: dot indicators use `Array.from({ length: targetPin.length })`, the keypad cap uses `pin.length < targetPin.length`, and the helper text says "Enter your N-digit Coach PIN" where N comes from `targetPin.length`. All three adapt automatically to whatever PIN length the super admin sets.
- `npm.cmd run build` passes — `tsc -b` clean, vite builds in ~4 s. Only pre-existing chunk-size advisory warning (same as sub-tasks 1 and 2).
- Sub-task 4 note: `Team.mixed_gender` is available from `useTeam()`. No new plumbing needed; `Player.gender` just needs to be added to `src/types/index.ts` and populated. No Dexie schema version bump is needed: `gender` is not indexed, and filtering is done in memory.

---

### 4. Mixed-gender support
**Intent:** Let a team tag players M/F and see it at a glance on the sideline.

**Expected Outcomes**
- `Player.gender` is an optional `'M' | 'F'`, so existing records still work. No Dexie schema change is needed because filtering is done in memory.
- When the team has `mixed_gender` on:
  - A colored chip (e.g. blue for M, violet or pink for F) with a text label (`M` / `F`), plus a thin card-edge strip, appears on [`PlayerCard`](src/components/PlayerCard.tsx), the scoring modal header and the roster board rows. Color is never the only cue.
  - The evaluator grid has a gender filter next to the group filter.
  - The roster board shows M and F counts (no targets or limits).
  - Admin add-player form and roster table have a gender selector.
  - CSV import accepts a `Gender` column (tolerant of `M/F`, `Male/Female`, `Men/Women`, case-insensitive). Export includes a `Gender` column.
- When `mixed_gender` is off, none of this appears.

**Todo List**
1. Add `gender` to `Player` and a small shared gender-badge component plus helper to normalize CSV values.
2. Add the badge/strip to `PlayerCard`, `ScoringModal` and `Leaderboard`.
3. Add the gender filter to the evaluator grid in `App.tsx`.
4. Add M/F counts to the roster board header area in `Leaderboard`.
5. Extend the Admin add form, roster table and CSV import. Confirm that gender edits are synced via `SyncService.syncPlayer` and that newly created or imported players reach Firestore (see findings).
6. Extend the CSV export in `Leaderboard`.
7. Update the CSV hint text in Admin.

**Relevant Context:** [`src/components/PlayerCard.tsx`](src/components/PlayerCard.tsx), [`src/components/ScoringModal.tsx`](src/components/ScoringModal.tsx:124), [`src/components/Leaderboard.tsx`](src/components/Leaderboard.tsx:131), [`src/components/AdminPanel.tsx`](src/components/AdminPanel.tsx:85), [`src/App.tsx`](src/App.tsx:113), [`src/data/defaultData.ts`](src/data/defaultData.ts:136) (pinney colors, existing visual pattern).

**Status:** `[x] done`

**Implementation notes (for sub-task 5 and later)**
- `src/types/index.ts`: `Player.gender` added as `optional 'M' | 'F'`. No Dexie schema change — no index, filtered in memory.
- `src/components/GenderBadge.tsx` (new): exports `GenderBadge` (inline chip, blue for M / violet for F, always shows text label so color is never the sole cue), `GenderStrip` (3 px left-edge strip for `PlayerCard`), and `normalizeGender` (CSV helper: M/Male/Men/Man/Boy → 'M'; F/Female/Women/Woman/Girl → 'F'; anything else → undefined, case-insensitive).
- All gender UI is gated by `useTeam().mixed_gender` — when off, no gender element appears anywhere.
- `PlayerCard.tsx`: `GenderStrip` on left edge (inside `relative` container), `GenderBadge` beside the player name. Uses `useTeam()` internally.
- `ScoringModal.tsx`: `GenderBadge` beside player name in sticky header. Uses `useTeam()` internally.
- `Leaderboard.tsx`: `GenderBadge` beside player name in the table rows and in the player-detail modal header. M/F counts (non-cut roster) shown in the Coach Roster Board header when `mixed_gender` is on. CSV export includes a `Gender` column (always when `mixed_gender`, never when off).
- `App.tsx`: gender filter pills (All Genders / M / F) added next to the group filter; applied in `filteredPlayers` via `matchesGender`.
- `AdminPanel.tsx`: gender selector in the Add Single Player form (optional, hidden when `mixed_gender` is off); gender column + inline select in the roster table; CSV hint text updated to show `Gender` and a normalizer hint when `mixed_gender` is on; CSV import reads `Gender` / `gender` column via `normalizeGender`.
- **Sync finding:** `handleAddPlayer` and `handleCsvUpload` previously wrote directly to `db.players.add/bulkAdd` without calling `SyncService.syncPlayer`, so new/imported players were never pushed to Firestore. Both paths now call `SyncService.syncPlayer` after the Dexie write. `handleUpdatePlayer` (status/color/lock/gender edits) already called `SyncService.syncPlayer` — unchanged. Session rollover (`handleCreateSession`) still bulk-added rolled-over players without syncing at this point; fixed afterwards in Sub-task 4b.
- `npm.cmd run build` passes — `tsc -b` clean, vite built in ~4 s. Only pre-existing chunk-size advisory warning (same as sub-tasks 1–3).

---

### 4b. Sync gaps (additional task, not one of the original numbered sub-tasks)
**Intent:** Make player deletes, criteria and session rollover reach Firestore, and let deletes propagate to other devices. Without this, a rolled-over session on another device had players but no criteria (scoring impossible), and deleted players reappeared / never disappeared elsewhere.

**Status:** `[x] done`

**Implementation notes**
- `src/types/index.ts`: `PendingSyncItem['type']` now also includes `'player_delete' | 'session_update' | 'criterion_update' | 'criterion_delete'`. The `as any` / `as string` casts for `session_update` in `sync.ts` were removed.
- `src/services/sync.ts`: new `SyncService.deletePlayer(id)`, `syncCriterion(criterion)` and `deleteCriterion(id)`, following the `syncPlayer` pattern (write Dexie, `syncQueue.put`, notify, `flushQueue`). Delete items reuse the upsert's queue id (`queue_player_<id>`, `queue_criterion_<id>`), so a pending update is replaced by the delete rather than racing it.
- `flushQueue()` handles `player_delete`, `criterion_update`, `criterion_delete` (`deleteDoc`). It now also only dequeues an item if the queue row still has the same `timestamp` as when it was read, so an item replaced mid-flush (e.g. a delete overwriting an in-flight update) is not lost.
- Firestore: new subcollection `teams/{slug}/criteria/{id}`.
- Listeners: new `criteria` listener (`added`/`modified` -> `db.criteria.put`). `removed` is now handled for `players` and `criteria` (`db.*.delete`). `evaluations`, `player_notes` and `sessions` do not handle `removed` (sessions are never deleted in the UI; evaluations/notes are never deleted).
- `AdminPanel.tsx`: `handleDeletePlayer` -> `SyncService.deletePlayer`; `handleAddCriterion`, `handleSaveCriterionEdit` and the exemplar input `onChange` -> `SyncService.syncCriterion`; `handleDeleteCriterion` -> `SyncService.deleteCriterion`; `handleCreateSession` syncs the new session (`syncSession`), every copied criterion (`syncCriterion`) and every rolled player (`syncPlayer`) in simple loops.
- Seeded default criteria (`crit-<slug>-s1-<n>`, created by `initDB()`) are deliberately **not** pushed to the cloud. Every device seeds identical ids locally, and if a cloud copy exists (after an admin edits it) the new criteria listener overwrites the local one via `put`, which is fine.
- Known limitation: deleting a player leaves that player's local and cloud evaluations/notes orphaned (existing behavior, scope not expanded).
- Known limitation: the exemplar input syncs on every keystroke (one queue row per criterion, replaced each time, so the queue does not grow).
- `npm.cmd run build` passes (only the pre-existing chunk-size warning). Firestore sync was not exercised against a real backend.

---

### 5. Firestore rules and Vercel routing config
**Intent:** Enforce the team data layout server-side and make team URLs work on refresh and as shared links on Vercel.

**Expected Outcomes**
- New `firestore.rules`: clients can `get` but not `list` or write `teams/{slug}`. Clients can read/write `teams/{slug}/{sessions|players|evaluations|player_notes|criteria}/*` (`criteria` was added by sub-task 4b; the app now issues deletes for players and criteria, so the rule must allow `delete`, not just create/update). Everything else is denied (including the legacy top-level collections after cutover). Rules are written so a later `member_uids` check can replace the open subcollection rule.
- New `vercel.json`: rewrite `/t/*` to `/index.html`, leave `/api/*` untouched.
- PWA service worker navigation fallback does not intercept `/api/*`.
- Rules are deployed through the Firebase console or CLI. Document which.

**Todo List**
1. Write `firestore.rules` as described. Rules apply only to client SDK traffic. The admin SDK is unaffected.
2. Write `vercel.json` rewrites.
3. Adjust the VitePWA/workbox config to deny `/api/` in the navigation fallback.
4. Document the rules deployment step in README.

**Relevant Context:** [`vite.config.ts`](vite.config.ts), new files `vercel.json`, `firestore.rules`.

**Status:** `[x] done`

**Implementation notes (for sub-task 6 and later)**
- `firestore.rules` (new, `rules_version = '2'`): `teams/{slug}` allows `get` only (no `list`, no writes). `teams/{slug}/{sessions|players|evaluations|player_notes|criteria}/{id}` allow `read, write` (write includes delete) via a helper `canAccessTeam(slug)` that currently returns `true`. A future `member_uids` check goes in that function body (example is in the comment; it costs one extra `get()` per evaluation). Everything else is denied by default, including legacy top-level collections. A commented-out `match /{legacy}/{id}` block at the bottom keeps the legacy collections open during the migration window; uncomment it only if rules are deployed before cutover (sub-task 7), and remove it again afterwards.
- Client operations verified by grep: the only read of the team doc is `getDoc(doc(firestore, 'teams', slug))` in [`src/services/team.ts`](src/services/team.ts:77), which is a `get`. Nothing in `src/` lists or queries the `teams` collection. Subcollection access: `onSnapshot` on collections (list), `setDoc` (create/update, merge) and `deleteDoc` on docs, all covered by `read, write`.
- `vercel.json` (new): single rewrite `/t/:path*` -> `/index.html`. Vercel applies rewrites after the filesystem check, so real files (`/assets/*`, `sw.js`, `manifest.webmanifest`) are never shadowed, and `/api/*` is not matched. Sub-task 6 only needs to add files under `api/`; no `vercel.json` change is needed for them. Sub-task 9's per-team manifest at `/t/<slug>/manifest.webmanifest` will need its own rewrite placed BEFORE the catch-all `/t/:path*` rule.
- `vite.config.ts`: added `workbox.navigateFallbackDenylist: [/^\/api\//]`. Verified in the built `dist/sw.js` (`NavigationRoute(...,{denylist:[/^\/api\//]})`). Manifest and other PWA settings unchanged.
- README: new "Firestore Rules Deployment" section (console paste, or CLI with `npx firebase-tools deploy --only firestore:rules`). No `firebase.json` was added; the CLI command is documented with an inline snippet instead. The old "Firebase Firestore Setup" steps are still stale (sub-task 8).
- Not verified: rules were not run against a real Firestore or the emulator, and no local validator is available without installing `firebase-tools`, so syntax was reviewed by hand only. The Vercel rewrite was not run on Vercel. `npm.cmd run build` passes (only the pre-existing chunk-size warning).
- Sub-task 6 notes: the function uses firebase-admin, which bypasses these rules, so no rule change is needed. The service worker denylist already covers `/api/`, but a first visit to `/api/...` via link in a tab with an old SW installed may still get the old SW until it updates.

---

### 6. Super-admin API and screen
**Intent:** Create and edit teams without touching the Firebase console.

**Expected Outcomes**
- Vercel function(s) under `api/` (e.g. `api/teams`) that verify a server-only `SUPER_ADMIN_PIN` env var (constant-time compare) and use `firebase-admin` with a service account from a server-only env var (not `VITE_*`).
- Operations: list teams, create team (slug, name, coach PIN, `mixed_gender`), edit team (name, coach PIN, `mixed_gender`; slug immutable). No delete in this iteration.
- Slug validation: lowercase letters/digits/hyphens, length limits, reserved words (`api`, `t`, `admin`), uniqueness checked server-side.
- Root `/` in a normal browser shows a super-admin login (password field), then a team list with create/edit forms and a copy-link button for each team's URL.
- `.env.example` documents `SUPER_ADMIN_PIN` and the service-account variable. These are set in Vercel project settings, never committed.
- Manual fallback documented: create `teams/{slug}` in the Firebase console with the same fields.

**Todo List**
1. Add `firebase-admin` and `@vercel/node` dependencies and a `tsconfig` that covers `api/` (the current `tsc -b` build must still pass).
2. Implement the function with request validation and clear error responses.
3. Build the super-admin screen and wire it into the root route from sub-task 1. The secret is held in memory or sessionStorage only for the tab session.
4. Add the manual-creation steps to the docs.
5. Note in README that local testing of the function needs `vercel dev` (plain `npm run dev` serves only the SPA).

**Relevant Context:** [`.env.example`](.env.example), [`package.json`](package.json), [`src/components/AdminPinModal.tsx`](src/components/AdminPinModal.tsx) (UI style reference), [`tsconfig.json`](tsconfig.json).

**Status:** `[x] done`

**Implementation notes (for sub-tasks 7–9)**
- New files: `api/teams.ts` (Vercel function), `api/_lib/validate.ts` (pure validation, zero deps), `api/tsconfig.json` (separate TS project, `module:CommonJS`, `moduleResolution:node`; main `tsc -b` unchanged — `tsconfig.json` only includes `src/`). Vercel compiles `api/` itself.
- Dependencies added: `firebase-admin@14.5.0`, `@vercel/node@24.0.3` (runtime deps). Uses the modular `firebase-admin/app` and `firebase-admin/firestore` sub-package API (not the legacy `import * as admin` style).
- Auth: `x-super-admin-pin` header, compared via `crypto.timingSafeEqual` on SHA-256 digests. A 700 ms fixed delay is applied on every failed attempt. Missing env vars return a clear 500 with the variable name. Secrets are never logged.
- Slug rules: `^[a-z0-9][a-z0-9-]*$`, length 2–40, reserved set `{api, t, admin, assets}`. Coach PIN: digits only, 4–8 chars. Name: required, trimmed, ≤80 chars. `mixed_gender`: boolean.
- Create uses `db.runTransaction` to atomically check uniqueness and write (returns 409 if slug exists). Team doc fields: `name`, `coach_pin`, `mixed_gender`, `created_at`, `updated_at`, `member_uids: []`.
- `FIREBASE_SERVICE_ACCOUNT` accepted as plain JSON or base64-encoded JSON.
- `src/components/SuperAdmin.tsx` (new): login screen (password input + sessionStorage pin for tab session), team list with expand/collapse, edit form inline, create panel, copy-link button per team. Wired into `TeamContext.tsx`'s `RootScreen`. Standalone-PWA redirect to last team remains unchanged.
- Validation logic sanity-tested with 29 assertions via `tsx` (test file deleted).
- **Not verified against a real backend:** no Vercel run, no Firebase Admin SDK call exercised. All TypeScript (both `tsc -b` and `tsc -p api/tsconfig.json`) passes clean. `npm run build` passes (exit 0); the only warning is the pre-existing chunk-size advisory.
- **Sub-task 7:** The migration script needs `FIREBASE_SERVICE_ACCOUNT` in the local environment. Consider option (a) from the plan note: migrate Ignite's session under the deterministic ID `session-ignite-1` to avoid the double-session issue on fresh devices.
- **Sub-task 8:** Remove the stale "Firebase Firestore Setup" and "Firebase Cloud Sync" sections from README; hide the Firebase settings block in `AdminPanel`. Remaining hardcoded `Ignite` references: CSV filename in `Leaderboard`, HTML `<title>`.
- **Sub-task 9 (optional):** `vercel.json` rewrite for `/t/<slug>/manifest.webmanifest` must be placed before the existing `/t/:path*` catch-all rewrite.

---

### 7. Migrate existing Ignite data
**Intent:** Move current production data to `teams/ignite` without data loss.

**Expected Outcomes**
- A one-off script (admin SDK, run locally with the service account) copies `sessions`, `players`, `evaluations` and `player_notes` from the old top-level collections into `teams/ignite/...`, and creates the `teams/ignite` doc. Its `coach_pin` is taken from the existing session `admin_pin_hash`.
- Script is idempotent and does not delete the old collections. Deleting them is a separate manual step after cutover.
- Cutover checklist in the plan or README: coaches sync devices, deploy rules and app, verify `/t/ignite`, then remove old data.
- Existing production has no criteria in Firestore (criteria were never synced), so the migration script need not copy criteria. Note that the `teams/ignite` criteria will be seeded locally per device by `initDB()` (deterministic ids `crit-ignite-s1-<n>`; see Sub-task 4b).


**Known issue from sub-task 2 (must be resolved here):** `initDB()` seeds a local session `session-<slug>-1` plus default criteria whenever the local Dexie DB has no sessions, which happens before Firestore data arrives on a fresh device. That seeded session is never synced to the cloud. The migrated Ignite data keeps its old session IDs (e.g. `session-1`), so a new device opening `/t/ignite` could hold two sessions (the synced one and an empty local `session-ignite-1`), and `App.tsx` picks the first active session, which may be the empty one. Resolve with one of: (a) migrate Ignite's session under the deterministic ID `session-ignite-1` (and matching criteria IDs), or (b) skip local seeding when the team already has sessions in the cloud. Criteria are now synced to Firestore after sub-task 4b, but the seeded default criteria stay local-only.



**Todo List**
1. Write the migration script under `scripts/`.
2. Dry-run mode that prints counts per collection.
3. Document the cutover order. Copy data, deploy the app, then tighten rules to deny legacy collections.

**Relevant Context:** [`src/services/sync.ts`](src/services/sync.ts) (document shapes), [`src/types/index.ts`](src/types/index.ts).

**Status:** `[x] done`

**Implementation notes**
- `scripts/migrate-to-team.mjs` (new, plain Node ESM, no new dependencies). Args: `--key <path>`, `--team <slug>` (default `ignite`), `--name <display>` (default "Ignite Juniors"), `--mixed-gender` (flag), `--apply` (dry-run by default).
- Credential resolution order: `--key <path>` → `GOOGLE_APPLICATION_CREDENTIALS` → `FIREBASE_SERVICE_ACCOUNT`. The key file must live outside the repo.
- Session-id remap (option a from the Known issue): `session-1` → `session-ignite-1` on the session doc and on `session_id` of players/evaluations/notes/criteria. Evaluation `criterion_id` values `crit-s1-<n>` are remapped to `crit-ignite-s1-<n>` to match the criteria that `initDB()` seeds locally (production has evaluations referencing these seeded criteria but no criteria docs). Player ids (`player-s1-<n>`, `player_<timestamp>_<rand>`) do not embed the session id and are unchanged. Any other legacy session ids are kept unchanged. `admin_pin_hash` stripped from the copied session doc.
- Team doc created only if missing; `coach_pin` taken from `admin_pin_hash` of the active (else first) legacy session, validated as 4–8 digits, falls back to `'2026'` with a warning. PIN value never printed.
- Idempotent and non-clobbering: docs already present at `teams/{slug}/{col}/{id}` are skipped. Reports found / to-create / already-present per collection. Batched writes (≤400/batch) in `--apply` mode.
- Inline sanity test of `remapDoc()` runs at script start (6 cases); exits with a clear message on failure.
- `.gitignore`: added `*firebase-adminsdk*.json` and `service-account*.json` patterns.
- `.env.example`: added `GOOGLE_APPLICATION_CREDENTIALS` comment for the migration script.
- README: new "Migrating Existing Ignite Data (cutover)" section with dry-run and apply command lines, the ordered 6-step cutover checklist, freeze-window caveat and limitation note.
- **Dry run against production** (project `tryout-tracker-450cc`): sessions=1, players=2, evaluations=16, player_notes=0, criteria=0 (19 docs total). Team doc will be created. No data written.
- **Migration APPLIED** (2026-10-19): `--apply` was run against the production Firestore project (`tryout-tracker-450cc`). `teams/ignite` doc created; 1 session (`session-ignite-1`), 2 players, 16 evaluations, 0 player_notes copied into `teams/ignite/...`. A follow-up dry run shows 0 remaining docs to copy (all already present). Legacy top-level collections are untouched. Cutover steps 2–6 (deploy updated app + rules with legacy block, verify `/t/ignite` on a real device, remove legacy rule block, delete old data) are still pending and must be done manually.
- `npm.cmd run build` passes (exit 0 from `tsc -b`; only the pre-existing chunk-size advisory warning from Vite). No new TypeScript errors.
- Not verified: Firestore rules were not exercised by the script (admin SDK bypasses rules).

---

### 8. Cleanup and documentation
**Intent:** Remove single-team assumptions that remain and document the new setup.

**Expected Outcomes**
- Remaining hardcoded "Ignite" strings removed or derived from the team (CSV download filename in [`Leaderboard.tsx`](src/components/Leaderboard.tsx:152), HTML title, PWA name where applicable).
- The per-device "Firebase Firestore Cloud Configuration" section in Admin is hidden or removed, since the backend is shared.
- README covers: team URLs, creating teams (screen and manual), env vars, rules deployment, migration/cutover, gender setting.
- `npm run build` passes with no new TypeScript errors.

**Todo List**
1. Sweep remaining `Ignite`/`ignite_` references.
2. Hide/remove the Firebase settings block in Admin ([`AdminPanel.tsx`](src/components/AdminPanel.tsx:893)).
3. Update [`README.md`](README.md) and [`.env.example`](.env.example).
4. Run `npm run build` (use the `run-npm` skill for PowerShell) and manually check: two teams on one device stay isolated, offline scoring then reconnect, mixed-gender on and off.

**Status:** `[x] done`

**Implementation notes**
- `src/components/Leaderboard.tsx`: CSV download filename changed from `Ignite_Tryout_<session>_Matrix.csv` to `<teamSlug>_Tryout_<session>_Matrix.csv`. `slug` destructured from `useTeam()`.
- `index.html`: `<title>` changed from `"Ignite Tryout Tracker"` to `"Tryout Tracker"`.
- `vite.config.ts`: PWA manifest `name`/`short_name` changed to `"Tryout Tracker"`; `description` changed to generic. Per-team manifest deferred to optional Sub-task 9.
- `src/context/TeamContext.tsx`: `TeamLoader` now sets `document.title = "<team.name> – Tryout Tracker"` when the team loads (one-liner in the existing `useEffect` that calls `saveLastTeamSlug`).
- `src/components/AdminPanel.tsx`: removed the entire "Firebase Firestore Cloud Configuration" form (Project ID / API Key / App ID inputs, connect button, how-to note). Replaced the Settings tab content with a one-line info card: "This app uses a shared Firebase Firestore backend — no per-device configuration needed." Removed the now-unused imports `getStoredFirebaseConfig`, `reinitFirebase`, `FirebaseConfig` and `AlertCircle`. State vars `firebaseApiKey`, `firebaseProjectId`, `firebaseAppId`, `configError` removed. `saveSuccess` retained (still used by the roster-tab save banner). `SyncService.isFirebaseConfigured()` / `SyncStatusBadge` unaffected — `getStoredFirebaseConfig()` always returns the baked-in default config, so `isFirebaseConfigured()` always returns `true` and the badge always shows "Cloud Live". `reinitFirebase` exported from `firebase.ts` but now has no callers; left in place (it is exported and removing it would be a separate clean-up).
- `ignite_theme` key in `src/hooks/useTheme.ts` **intentionally left** — theme is a user-level (not team-level) preference.
- `ignite_firebase_config` key in `src/services/firebase.ts` **intentionally left** — `getStoredFirebaseConfig()` is still called by `sync.ts` and `firebase.ts`; renaming it would silently lose any stored custom config on existing devices. The `AdminPanel` no longer writes to it, but it still serves as the localStorage key for the default-config chain.
- `SuperAdmin.tsx` placeholder strings (`e.g. ignite-u17`, `e.g. Ignite U17`) **intentionally left** — these are example hint texts showing the user how to fill in a slug/name field, not actual Ignite data.
- `pocketbase`: dependency removed from `package.json`; `pocketbase-schema.json` deleted. Grep confirmed nothing in `src/` or `api/` referenced either — they were dead leftovers.
- `.env.example`: no changes needed — already accurate.
- `README.md`: fully rewritten. Covers: what the app is (multi-team tryout tracker), team URLs `/t/<slug>`, super-admin screen and manual console fallback, env vars (`VITE_*` web config, `SUPER_ADMIN_PIN`, `FIREBASE_SERVICE_ACCOUNT`), Firestore rules deployment, Vercel deployment and `vercel dev`, local dev (with PowerShell note), migration/cutover (kept and tidied from Sub-task 7 addition), mixed-gender team setting, security model, and known limitations (orphaned evaluations/notes, PIN changes via super-admin only, criteria sync, exemplar debounce, no real auth, no rate limiting).
- `multi-team-plan.md` Sub-task 7 notes: added Migration APPLIED fact (production Firestore project `tryout-tracker-450cc`, 2026-10-19) and removed the "not verified: --apply not run" note.
- `npm.cmd run build` passes: `tsc -b` clean, `vite build` ✓ in ~4 s. Only the pre-existing chunk-size advisory warning (unchanged from all previous sub-tasks).

**Remaining `ignite` references (justified)**
| File | Reference | Justification |
|---|---|---|
| `src/components/SuperAdmin.tsx` | placeholder `e.g. ignite-u17` / `e.g. Ignite U17` | UI hint text showing the user how to fill in a field; not actual data |
| `src/hooks/useTheme.ts` | `ignite_theme` storage key | Theme is a user-level (global) preference; changing the key would silently reset every existing user's theme choice |
| `src/services/firebase.ts` | `ignite_firebase_config` storage key | `getStoredFirebaseConfig()` still called by `sync.ts`; renaming would silently discard any stored custom config on existing devices |

**Manual verification checklist (cannot run a browser)**
1. **Two teams isolated on one device:** open `/t/ignite` and `/t/<second-team>` in separate tabs; confirm each shows its own roster and session name; confirm the evaluator-name and admin-unlocked states are independent (stored under `<slug>_evaluator_name` / `<slug>_admin_unlocked`).
2. **Offline scoring then reconnect:** put the device offline, score a player, check the "X queued" badge appears; reconnect and confirm the pending count drops and the evaluation appears in the roster board.
3. **Mixed-gender on/off:** create a team with `mixed_gender: true` and one with `false`; verify gender badges, filter pills and M/F counts appear only for the mixed-gender team.
4. **Super-admin create/edit:** open `/` in a normal browser tab; enter the `SUPER_ADMIN_PIN`; create a new team; open `/t/<new-slug>`; confirm the app loads with the new team's name.
5. **PIN modal:** enter the wrong PIN; confirm rejection; enter the correct team `coach_pin`; confirm admin unlocks.
6. **`/t/ignite` with migrated data:** open on a fresh device (no local cache); confirm the migrated session (`session-ignite-1`), 2 players and 16 evaluations load from Firestore; confirm scoring a player pushes to `teams/ignite/evaluations`.

---

### 9. (Optional) Per-team PWA manifest
**Intent:** Make "Add to Home Screen" from `/t/<slug>` launch that team directly, with the team's name.

**Expected Outcomes**
- A Vercel function serves `/t/<slug>/manifest.webmanifest` with `name`, `short_name` and `start_url` set to that team.
- The static manifest generation is turned off in VitePWA. The page injects a `<link rel="manifest">` pointing to the team manifest at runtime.
- The last-used-team redirect from sub-task 1 remains as a fallback.

**Todo List**
1. Add the manifest function (reads the team doc via admin SDK, falls back to a generic manifest if the team is unknown).
2. Add a `vercel.json` rewrite for the manifest path.
3. Disable VitePWA's generated manifest and keep icons/theme values in the function's response.
4. Inject the manifest link when the team loads.
5. Test install on Android and iOS (iOS reads the manifest at install time).

**Relevant Context:** [`vite.config.ts`](vite.config.ts:16), [`index.html`](index.html), sub-tasks 5 and 6.

**Status:** `[ ] deferred` (decided 2026-10-19: no real users yet, only testers, so the cost of waiting is low and adding it later only means re-installing on a few devices).

**Trigger to revisit:** after deploying to Vercel, have testers check:
1. iPhone: open `/t/<slug>` in Safari → Add to Home Screen → launch the icon. If it opens the super-admin screen instead of the team, do this sub-task. If it opens the team, skip it.
2. Android: same check.
3. A device with two teams installed: confirm which team each icon opens (the last-used-team redirect can pick the wrong one).
4. Note whether the home-screen icon is blank or generic.

**Prerequisite gap (resolved):** `vite.config.ts` referenced `pwa-192x192.png` and `pwa-512x512.png` but the repo had no `public/` folder. Placeholder icons (amber circle with "TT" on navy) were added in `public/` on 2026-10-19; they are copied into `dist/` and precached by the service worker. Replace them with real artwork when available.

---

## Suggested ordering
1 → 2 → 3 → 4 (app works per team using manually created team docs) → 5 → 6 (super-admin) → 7 (migration and cutover) → 8 → 9 (optional).
