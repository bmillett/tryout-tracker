#!/usr/bin/env node
/**
 * scripts/migrate-to-team.mjs
 *
 * One-off migration: copies legacy top-level Firestore collections
 * (sessions, players, evaluations, player_notes, criteria) into
 * teams/{slug}/... and creates the teams/{slug} team doc.
 *
 * Usage:
 *   node scripts/migrate-to-team.mjs [options]
 *
 * Options:
 *   --key <path>         Path to Firebase service-account JSON file.
 *                        Alternative: set GOOGLE_APPLICATION_CREDENTIALS env var.
 *   --team <slug>        Target team slug (default: "ignite")
 *   --name <display>     Team display name (default: "Ignite Juniors")
 *   --mixed-gender       Enable mixed-gender mode on the team doc (flag, default off)
 *   --apply              Actually write to Firestore. Without this flag the script
 *                        is a READ-ONLY dry run — nothing is written.
 *
 * Safety:
 *   - Dry-run by default. You must pass --apply to write anything.
 *   - Non-clobbering: docs that already exist at the destination are never overwritten.
 *   - Legacy collections are NEVER deleted (that is a separate manual step).
 *   - No document contents, PINs, or key material are printed.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    keyPath: null,
    slug: 'ignite',
    name: 'Ignite Juniors',
    mixedGender: false,
    apply: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--key' && args[i + 1]) { result.keyPath = args[++i]; continue; }
    if (a === '--team' && args[i + 1]) { result.slug = args[++i]; continue; }
    if (a === '--name' && args[i + 1]) { result.name = args[++i]; continue; }
    if (a === '--mixed-gender') { result.mixedGender = true; continue; }
    if (a === '--apply') { result.apply = true; continue; }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Session-id remap logic (pure function — unit-testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Given a document from a legacy collection and the target team slug,
 * returns a transformed copy ready for the team subcollection.
 *
 * Rules:
 *   - The legacy default session id "session-1" is renamed to
 *     "session-<slug>-1" (matching the deterministic id seeded by initDB).
 *   - session_id fields that reference "session-1" are updated to match.
 *   - Any other session id (e.g. "session-<timestamp>") is kept unchanged.
 *   - Legacy seeded criterion ids "crit-s1-<n>" are renamed to "crit-<slug>-s1-<n>"
 *     (the ids initDB now seeds locally), on criteria docs and on the
 *     criterion_id of evaluations. Without this, migrated evaluations would
 *     point at criteria that do not exist on the device.
 *   - Player ids are left unchanged (production ids like "player-s1-9" and
 *     "player_<timestamp>_<rand>" do not embed the session id).
 *   - admin_pin_hash is stripped from session docs (PIN lives on team doc now).
 *   - All other fields are copied verbatim.
 *
 * @param {string} collection  - "sessions" | "players" | "evaluations" | "player_notes" | "criteria"
 * @param {string} docId       - Firestore document id
 * @param {Record<string,unknown>} data - Document data
 * @param {string} slug        - Target team slug (e.g. "ignite")
 * @returns {{ newDocId: string, newData: Record<string,unknown> }}
 */
export function remapDoc(collection, docId, data, slug) {
  const OLD_SESSION_ID = 'session-1';
  const NEW_SESSION_ID = `session-${slug}-1`;

  function remapSessionId(id) {
    return id === OLD_SESSION_ID ? NEW_SESSION_ID : id;
  }

  function remapCriterionId(id) {
    // Legacy seeded ids "crit-s1-<n>" -> "crit-<slug>-s1-<n>".
    const m = typeof id === 'string' ? /^crit-s1-(\d+)$/.exec(id) : null;
    return m ? `crit-${slug}-s1-${m[1]}` : id;
  }

  let newDocId = docId;
  const newData = { ...data };

  if (collection === 'sessions') {
    // Remap the doc id and the embedded id field.
    newDocId = remapSessionId(docId);
    if (typeof newData.id === 'string') {
      newData.id = remapSessionId(newData.id);
    }
    // Strip admin_pin_hash — PIN now lives on the team doc.
    delete newData.admin_pin_hash;
  }

  if (collection === 'players') {
    if (typeof newData.session_id === 'string') {
      newData.session_id = remapSessionId(newData.session_id);
    }
  }

  if (collection === 'evaluations' || collection === 'player_notes') {
    if (typeof newData.session_id === 'string') {
      newData.session_id = remapSessionId(newData.session_id);
    }
    if (collection === 'evaluations' && typeof newData.criterion_id === 'string') {
      newData.criterion_id = remapCriterionId(newData.criterion_id);
    }
  }

  if (collection === 'criteria') {
    newDocId = remapCriterionId(docId);
    if (typeof newData.id === 'string') {
      newData.id = remapCriterionId(newData.id);
    }
    if (typeof newData.session_id === 'string') {
      newData.session_id = remapSessionId(newData.session_id);
    }
  }

  return { newDocId, newData };
}

// ---------------------------------------------------------------------------
// Inline sanity test for the remap logic (runs at script start, exits on fail)
// ---------------------------------------------------------------------------

function runSanityChecks() {
  const cases = [
    // Session doc: id field + doc id remapped, admin_pin_hash stripped
    {
      col: 'sessions', docId: 'session-1',
      data: { id: 'session-1', name: 'Session 1', admin_pin_hash: '2026' },
      slug: 'ignite',
      expectDocId: 'session-ignite-1',
      expectId: 'session-ignite-1',
      expectNoKey: 'admin_pin_hash',
    },
    // Session doc with non-default id: unchanged
    {
      col: 'sessions', docId: 'session-1700000000000',
      data: { id: 'session-1700000000000', name: 'S2', admin_pin_hash: 'x' },
      slug: 'ignite',
      expectDocId: 'session-1700000000000',
      expectId: 'session-1700000000000',
      expectNoKey: 'admin_pin_hash',
    },
    // Player: session_id remapped, ids untouched
    {
      col: 'players', docId: 'player-s1-9',
      data: { id: 'player-s1-9', session_id: 'session-1', name: 'Alice' },
      slug: 'ignite',
      expectDocId: 'player-s1-9',
      expectId: 'player-s1-9',
      expectSessionId: 'session-ignite-1',
    },
    // Evaluation: session_id and criterion_id remapped, player_id untouched
    {
      col: 'evaluations', docId: 'eval_abc',
      data: { id: 'eval_abc', session_id: 'session-1', player_id: 'player-s1-3', criterion_id: 'crit-s1-10', score: 4 },
      slug: 'ignite',
      expectDocId: 'eval_abc',
      expectSessionId: 'session-ignite-1',
      expectPlayerId: 'player-s1-3',
      expectCriterionId: 'crit-ignite-s1-10',
    },
    // Evaluation with a non-legacy criterion id: unchanged
    {
      col: 'evaluations', docId: 'eval_def',
      data: { id: 'eval_def', session_id: 'session-1', player_id: 'p', criterion_id: 'crit_1700_1' },
      slug: 'ignite',
      expectDocId: 'eval_def',
      expectCriterionId: 'crit_1700_1',
    },
    // player_notes: session_id remapped
    {
      col: 'player_notes', docId: 'note_xyz',
      data: { id: 'note_xyz', session_id: 'session-1', player_id: 'player-s1-2' },
      slug: 'ignite',
      expectDocId: 'note_xyz',
      expectSessionId: 'session-ignite-1',
      expectPlayerId: 'player-s1-2',
    },
    // criteria: legacy seeded id and session_id remapped
    {
      col: 'criteria', docId: 'crit-s1-4',
      data: { id: 'crit-s1-4', session_id: 'session-1' },
      slug: 'ignite',
      expectDocId: 'crit-ignite-s1-4',
      expectId: 'crit-ignite-s1-4',
      expectSessionId: 'session-ignite-1',
    },
  ];

  for (const c of cases) {
    const { newDocId, newData } = remapDoc(c.col, c.docId, c.data, c.slug);
    const fail = (msg) => { console.error(`[sanity] FAIL: ${msg}`); process.exit(1); };
    if (c.expectDocId !== undefined && newDocId !== c.expectDocId)
      fail(`${c.col}/${c.docId}: docId → "${newDocId}", expected "${c.expectDocId}"`);
    if (c.expectId !== undefined && newData.id !== c.expectId)
      fail(`${c.col}/${c.docId}: data.id → "${newData.id}", expected "${c.expectId}"`);
    if (c.expectNoKey !== undefined && c.expectNoKey in newData)
      fail(`${c.col}/${c.docId}: "${c.expectNoKey}" should have been stripped`);
    if (c.expectSessionId !== undefined && newData.session_id !== c.expectSessionId)
      fail(`${c.col}/${c.docId}: session_id → "${newData.session_id}", expected "${c.expectSessionId}"`);
    if (c.expectPlayerId !== undefined && newData.player_id !== c.expectPlayerId)
      fail(`${c.col}/${c.docId}: player_id → "${newData.player_id}", expected "${c.expectPlayerId}"`);
    if (c.expectCriterionId !== undefined && newData.criterion_id !== c.expectCriterionId)
      fail(`${c.col}/${c.docId}: criterion_id → "${newData.criterion_id}", expected "${c.expectCriterionId}"`);
  }
  console.log('[sanity] All remap checks passed.\n');
}

// ---------------------------------------------------------------------------
// Firebase admin init
// ---------------------------------------------------------------------------

function initAdmin(keyPath) {
  if (getApps().length > 0) return getFirestore();

  let credential;
  if (keyPath) {
    // Load from explicit --key path
    const raw = readFileSync(keyPath, 'utf8');
    credential = cert(JSON.parse(raw));
  } else {
    // Fall back to GOOGLE_APPLICATION_CREDENTIALS (standard ADC env var)
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (envPath) {
      const raw = readFileSync(envPath, 'utf8');
      credential = cert(JSON.parse(raw));
    } else {
      // Last resort: FIREBASE_SERVICE_ACCOUNT (same format as api/teams.ts)
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) {
        console.error(
          'No credentials found. Use --key <path>, set GOOGLE_APPLICATION_CREDENTIALS, ' +
          'or set FIREBASE_SERVICE_ACCOUNT.'
        );
        process.exit(1);
      }
      const jsonStr = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      credential = cert(JSON.parse(jsonStr));
    }
  }

  initializeApp({ credential });
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Main migration logic
// ---------------------------------------------------------------------------

const COLLECTIONS = ['sessions', 'players', 'evaluations', 'player_notes', 'criteria'];
const BATCH_SIZE = 400;

/** Read all docs in a legacy top-level collection. */
async function readLegacyCollection(db, colName) {
  const snap = await db.collection(colName).get();
  return snap.docs.map((d) => ({ docId: d.id, data: d.data() }));
}

/** Check which destination doc ids already exist in teams/{slug}/{colName}. */
async function getExistingDestIds(db, slug, colName) {
  const snap = await db.collection('teams').doc(slug).collection(colName).get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Extract the coach_pin from legacy sessions.
 * Prefers the active session; falls back to the first session.
 * Never prints the PIN value — only its length and source.
 */
function extractCoachPin(sessions) {
  const DIGITS_RE = /^\d{4,8}$/;
  const FALLBACK = '2026';

  const active = sessions.find((s) => s.data && s.data.status === 'active');
  const source = active ?? sessions[0];

  if (!source) {
    console.log('  coach_pin: no legacy sessions found; using fallback');
    return FALLBACK;
  }

  const raw = source.data?.admin_pin_hash;
  if (typeof raw === 'string' && DIGITS_RE.test(raw)) {
    console.log(`  coach_pin: taken from legacy session (length: ${raw.length})`);
    return raw;
  }

  console.log(
    `  coach_pin: legacy admin_pin_hash absent or not 4-8 digits` +
    (raw !== undefined ? ` (length: ${String(raw).length})` : '') +
    `; using fallback`
  );
  return FALLBACK;
}

async function migrate(opts) {
  const { slug, name, mixedGender, apply, keyPath } = opts;

  console.log('='.repeat(60));
  console.log(`Tryout Tracker — team migration`);
  console.log(`  target slug  : ${slug}`);
  console.log(`  display name : ${name}`);
  console.log(`  mixed_gender : ${mixedGender}`);
  console.log(`  mode         : ${apply ? 'APPLY (writes to Firestore)' : 'DRY RUN (read-only)'}`);
  console.log('='.repeat(60));

  const db = initAdmin(keyPath);

  // ------------------------------------------------------------------
  // 1. Read all legacy docs
  // ------------------------------------------------------------------

  console.log('\nReading legacy collections...');
  const legacyDocs = {};
  for (const col of COLLECTIONS) {
    legacyDocs[col] = await readLegacyCollection(db, col);
    console.log(`  ${col}: ${legacyDocs[col].length} docs`);
  }

  // ------------------------------------------------------------------
  // 2. Compute remap and check what already exists at destination
  // ------------------------------------------------------------------

  console.log('\nChecking destination (teams/' + slug + ')...');
  const plan = {};   // col -> [ { newDocId, newData } ]
  const stats = {}; // col -> { found, toCreate, alreadyPresent }

  for (const col of COLLECTIONS) {
    const existingIds = await getExistingDestIds(db, slug, col);
    const remapped = legacyDocs[col].map(({ docId, data }) =>
      remapDoc(col, docId, data, slug)
    );
    const toCreate = remapped.filter(({ newDocId }) => !existingIds.has(newDocId));
    const alreadyPresent = remapped.length - toCreate.length;

    stats[col] = { found: remapped.length, toCreate: toCreate.length, alreadyPresent };
    plan[col] = toCreate;
  }

  // ------------------------------------------------------------------
  // 3. Check / plan team doc
  // ------------------------------------------------------------------

  const teamRef = db.collection('teams').doc(slug);
  const teamSnap = await teamRef.get();
  const teamExists = teamSnap.exists;

  console.log('\nTeam doc (teams/' + slug + '):');
  if (teamExists) {
    console.log('  already exists — will not overwrite');
  } else {
    const coachPin = extractCoachPin(legacyDocs['sessions']);
    console.log(`  will create (mixed_gender: ${mixedGender})`);
    plan._teamDoc = { coachPin, name, mixedGender };
  }

  // ------------------------------------------------------------------
  // 4. Print summary
  // ------------------------------------------------------------------

  console.log('\n--- Migration plan ---');
  for (const col of COLLECTIONS) {
    const s = stats[col];
    console.log(
      `  ${col.padEnd(15)}: found=${s.found}  to-create=${s.toCreate}  already-present=${s.alreadyPresent}`
    );
  }

  const totalToCreate = COLLECTIONS.reduce((n, c) => n + plan[c].length, 0);
  console.log(`\n  Total docs to copy : ${totalToCreate}`);
  console.log(`  Team doc           : ${teamExists ? 'already present' : 'will create'}`);

  if (!apply) {
    console.log('\nDRY RUN complete — no data written. Re-run with --apply to migrate.\n');
    return;
  }

  // ------------------------------------------------------------------
  // 5. Write — batched, non-clobbering
  // ------------------------------------------------------------------

  console.log('\nApplying writes...');
  const now = new Date().toISOString();

  // Team doc (only if missing)
  if (plan._teamDoc) {
    const { coachPin, name: teamName, mixedGender: mg } = plan._teamDoc;
    await teamRef.set({
      name: teamName,
      coach_pin: coachPin,
      mixed_gender: mg,
      created_at: now,
      updated_at: now,
      member_uids: [],
    });
    console.log(`  Created teams/${slug}`);
  }

  // Subcollection docs in batches
  for (const col of COLLECTIONS) {
    const docs = plan[col];
    if (docs.length === 0) {
      console.log(`  ${col}: nothing to write`);
      continue;
    }

    let written = 0;
    const colRef = db.collection('teams').doc(slug).collection(col);

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const { newDocId, newData } of chunk) {
        batch.create(colRef.doc(newDocId), newData);
      }
      await batch.commit();
      written += chunk.length;
    }

    console.log(`  ${col}: wrote ${written} docs`);
  }

  console.log('\nMigration complete.\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runSanityChecks();
const opts = parseArgs(process.argv);
migrate(opts).catch((err) => {
  // Print only the error message, not stack frames that might include paths
  // or credential material.
  console.error('\nERROR:', err.message ?? String(err));
  process.exit(1);
});
