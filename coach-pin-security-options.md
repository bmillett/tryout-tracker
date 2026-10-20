# Coach PIN security: options for later

## Current state

- Coach PIN is stored in plain text as `coach_pin` on the team doc (`teams/{slug}`).
- `firestore.rules` allows `get` on the team doc for anyone, and `src/services/team.ts` (`fetchTeam`) reads `coach_pin` on the client. Anyone who knows a team slug can read the PIN straight from Firestore.
- The PIN keypad (`AdminPinModal`) is a client-side check only.
- `POST /api/team-pin` (`api/team-pin.ts`) changes a team's PIN given only the slug and the new PIN. It does not check the current PIN. Anyone who knows the slug can call it.
- The super-admin API (`api/teams.ts`) is protected separately by `SUPER_ADMIN_PIN` and can reset a PIN if one is changed by mistake.
- Overall isolation is "convenience, not security": the team slug is the only protection (see the header of `firestore.rules`).

## Key point

You cannot fully guarantee that only the app calls the API. Anything the browser sends can be copied with `curl`. The aim is to make the endpoint need something an outsider doesn't have. Because `coach_pin` is readable from Firestore, requiring the current PIN on its own adds little until the PIN is moved out of client-readable data.

## Options

### A. Rate limiting and Origin check (cheap)
- Use Vercel Firewall rate limits on `/api/team-pin`.
- Reject requests whose `Origin` header is not the app's domain.
- Stops other websites and casual abuse. Does not stop scripts, which can set any header.

### B. Firebase App Check (moderate)
- The app attaches an App Check token (reCAPTCHA-based) proving the request came from the real site.
- The API verifies the token with `firebase-admin`. App Check can also be enforced on Firestore.
- Closest to "make sure the app is calling the API". Raises the bar a lot but is not bulletproof.
- Needs a reCAPTCHA key and Firebase console setup.

### C. Shared token/secret in the request (light)
- App sends a secret (for example `VITE_` env var) and the backend verifies it.
- The secret ships in the JS bundle and is visible in DevTools, so it stops bots and scanners but not anyone who inspects the app.
- One token for all teams. Rotating it needs a redeploy.
- About ten lines of code. Treat as light spam protection only.

### D. Require the current PIN on the endpoint (small, recommended step 1)
- `/api/team-pin` takes `slug`, `current_pin` and `new_pin`.
- The server compares `current_pin` to the stored PIN with a constant-time check (helper exists in `api/teams.ts`: `safeEqual`).
- Add a short delay on failure, as `api/teams.ts` does.
- Add a "Current PIN" field to the Change Coach PIN card in `AdminPanel.tsx`.
- Per-team and needs no secret in the bundle. Only fully effective once the PIN is no longer readable by the client (see E).

### E. Move the PIN off client-readable data (recommended step 2)
- Store the PIN where Firestore rules deny client reads: a hash in a server-only document, or a field the client cannot get. Do not return `coach_pin` from `fetchTeam`.
- Add `POST /api/verify-pin` and have the keypad verify through it instead of comparing locally.
- One-time migration of existing PINs (hash and move). Update the super-admin create/edit code in `api/teams.ts`.
- Offline behaviour needs a decision: the cached team currently holds the PIN, so offline unlock would need another approach (for example a cached "unlocked" flag per device after a successful verify).
- Makes D actually secure. No Firebase Auth needed.

### F. Real auth (largest, long term)
- Store a hash of the PIN and verify it server-side. On success issue a short-lived token or a Firebase custom auth token.
- Change `canAccessTeam` in `firestore.rules` to require that auth, and require it on `/api/team-pin`.
- Fixes both the PIN exposure and unauthenticated data access, and matches the plan sketched in the `firestore.rules` comments (`member_uids`).
- Touches the keypad flow, super-admin create/edit, and needs PIN migration.
- Worth doing if teams ever hold data that parents or other coaches should not see (for example player evaluations).

### G. Rollback safety net (cheap, does not prevent anything)
- Record when the PIN last changed and keep the previous hash so a bad change can be reverted from the super-admin screen.

## Suggested path

1. Short term: A + B for casual abuse protection.
2. Next: D, then E (D alone is weak while the PIN is readable).
3. Longer term: F if sensitive data is added.
4. C only if a quick, minimal deterrent is wanted.
