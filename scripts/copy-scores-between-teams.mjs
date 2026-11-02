#!/usr/bin/env node
/**
 * scripts/copy-scores-between-teams.mjs
 *
 * Copies ONE evaluator's scores and notes from a session in one team to a session
 * in another team, assuming both teams have the same players and criteria.
 *
 * Usage:
 *   node scripts/copy-scores-between-teams.mjs --key <service-account.json> \
 *     --from <slug> --to <slug> --evaluator "<name>" [options]
 *
 * Options:
 *   --from <slug>             Source team slug (required)
 *   --to <slug>               Target team slug (required)
 *   --evaluator <name>        Evaluator whose scores and notes are copied (required)
 *   --from-session <id|name>  Source session id or name (default: lowest session number)
 *   --to-session <id|name>    Target session id or name (default: lowest session number)
 *   --key <path>              Firebase service-account JSON (or set GOOGLE_APPLICATION_CREDENTIALS)
 *   --apply                   Actually write. Without this the script is a READ-ONLY dry run.
 *
 * How records are matched:
 *   - Players:  by name (case-insensitive), the same rule as the CSV roster import.
 *   - Criteria: default ones ("crit-<slug>-s1-<n>", session 1 of each team) by position <n>,
 *               even if renamed; any other by name + category (case-insensitive).
 *   Anything without exactly one match is skipped and listed, never guessed.
 *
 * Safety:
 *   - Dry-run by default. Pass --apply to write.
 *   - Only the named evaluator's records are read for copying.
 *   - Never modifies or deletes anything in the source team.
 *   - Never overwrites: a score is skipped if the target already has one for the same
 *     session + player + criterion + evaluator; a note is skipped if the target already
 *     has an identical one. Writes use batch.create, so an existing doc id is never replaced.
 *   - Copies get deterministic ids ("copy_<source id>"), so re-running is harmless.
 *   - No key material or PINs are printed.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Pure planning logic (no Firestore access, so it can be tested on its own)
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Groups items by key and returns { unique: Map(key -> item), duplicated: Set(key) }. */
function indexUnique(items, keyFn) {
  const unique = new Map();
  const duplicated = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (unique.has(key) || duplicated.has(key)) {
      unique.delete(key);
      duplicated.add(key);
    } else {
      unique.set(key, item);
    }
  }
  return { unique, duplicated };
}

/**
 * Builds the copy plan.
 *
 * @param {object} i
 * @param {string} i.evaluator
 * @param {string} i.srcSlug, i.dstSlug            team slugs (for positional criterion ids)
 * @param {string} i.srcSessionId
 * @param {string} i.dstSessionId
 * @param {Array}  i.srcPlayers, i.dstPlayers      player docs ({ id, name, ... })
 * @param {Array}  i.srcCriteria, i.dstCriteria    criterion docs ({ id, name, category, ... })
 * @param {Array}  i.srcEvaluations, i.srcNotes    ALL docs of the source session
 * @param {Array}  i.dstEvaluations, i.dstNotes    ALL docs of the target session
 */
export function buildPlan(i) {
  const wanted = norm(i.evaluator);

  const srcEvals = i.srcEvaluations.filter((e) => norm(e.evaluator_name) === wanted);
  const srcNotes = i.srcNotes.filter((n) => norm(n.evaluator_name) === wanted);

  const dstPlayers = indexUnique(i.dstPlayers, (p) => norm(p.name));
  const srcPlayers = indexUnique(i.srcPlayers, (p) => norm(p.name));
  const dstCriteria = indexUnique(i.dstCriteria, (c) => `${norm(c.name)}|${norm(c.category)}`);
  const srcCriteria = indexUnique(i.srcCriteria, (c) => `${norm(c.name)}|${norm(c.category)}`);

  // Source id -> target id
  const playerMap = new Map();
  const unmatchedPlayers = new Map(); // source player id -> reason
  for (const p of i.srcPlayers) {
    const key = norm(p.name);
    if (srcPlayers.duplicated.has(key)) unmatchedPlayers.set(p.id, `${p.name}: duplicate name in source`);
    else if (dstPlayers.duplicated.has(key)) unmatchedPlayers.set(p.id, `${p.name}: duplicate name in target`);
    else if (!dstPlayers.unique.has(key)) unmatchedPlayers.set(p.id, `${p.name}: not in target`);
    else playerMap.set(p.id, dstPlayers.unique.get(key).id);
  }

  // Default criteria are seeded locally with ids "crit-<slug>-s1-<n>" and only reach Firestore
  // once edited, so many have no doc. Those (and renamed ones) are matched by position <n>.
  const positional = (id) => {
    if (i.srcSessionId !== `session-${i.srcSlug}-1` || i.dstSessionId !== `session-${i.dstSlug}-1`) return undefined;
    const m = String(id).match(new RegExp(`^crit-${i.srcSlug}-s1-(\\d+)$`));
    return m ? `crit-${i.dstSlug}-s1-${m[1]}` : undefined;
  };

  const criterionMap = new Map();
  const unmatchedCriteria = new Map();
  for (const c of i.srcCriteria) {
    if (positional(c.id)) continue;
    const key = `${norm(c.name)}|${norm(c.category)}`;
    if (srcCriteria.duplicated.has(key)) unmatchedCriteria.set(c.id, `${c.name}: duplicate in source`);
    else if (dstCriteria.duplicated.has(key)) unmatchedCriteria.set(c.id, `${c.name}: duplicate in target`);
    else if (!dstCriteria.unique.has(key)) unmatchedCriteria.set(c.id, `${c.name}: not in target`);
    else criterionMap.set(c.id, dstCriteria.unique.get(key).id);
  }

  // Existing target records, to avoid duplicates
  const dstEvalKeys = new Set(
    i.dstEvaluations.map((e) => `${e.player_id}|${e.criterion_id}|${norm(e.evaluator_name)}`)
  );
  const dstEvalIds = new Set(i.dstEvaluations.map((e) => e.id));
  const noteKey = (n) => `${n.player_id}|${norm(n.evaluator_name)}|${n.preset_tag ?? ''}|${n.custom_text ?? ''}`;
  const dstNoteKeys = new Set(i.dstNotes.map(noteKey));
  const dstNoteIds = new Set(i.dstNotes.map((n) => n.id));

  const plan = {
    evaluations: [], // { docId, data }
    notes: [],
    skipped: {
      evalNoPlayer: [], evalNoCriterion: [], evalAlreadyThere: 0,
      noteNoPlayer: [], noteAlreadyThere: 0,
    },
    counts: { srcEvals: srcEvals.length, srcNotes: srcNotes.length },
    unmatchedPlayers, unmatchedCriteria,
  };

  const seenEvalKeys = new Set();
  for (const e of srcEvals) {
    const newPlayer = playerMap.get(e.player_id);
    const newCrit = positional(e.criterion_id) ?? criterionMap.get(e.criterion_id);
    if (!newPlayer) { plan.skipped.evalNoPlayer.push(e.player_id); continue; }
    if (!newCrit) { plan.skipped.evalNoCriterion.push(e.criterion_id); continue; }

    const key = `${newPlayer}|${newCrit}|${norm(e.evaluator_name)}`;
    const docId = `copy_${e.id}`;
    if (dstEvalKeys.has(key) || dstEvalIds.has(docId) || seenEvalKeys.has(key)) {
      plan.skipped.evalAlreadyThere++;
      continue;
    }
    seenEvalKeys.add(key);
    plan.evaluations.push({
      docId,
      data: { ...e, id: docId, session_id: i.dstSessionId, player_id: newPlayer, criterion_id: newCrit },
    });
  }

  const seenNoteKeys = new Set();
  for (const n of srcNotes) {
    const newPlayer = playerMap.get(n.player_id);
    if (!newPlayer) { plan.skipped.noteNoPlayer.push(n.player_id); continue; }

    const docId = `copy_${n.id}`;
    const mapped = { ...n, id: docId, session_id: i.dstSessionId, player_id: newPlayer };
    const key = noteKey(mapped);
    if (dstNoteKeys.has(key) || dstNoteIds.has(docId) || seenNoteKeys.has(key)) {
      plan.skipped.noteAlreadyThere++;
      continue;
    }
    seenNoteKeys.add(key);
    plan.notes.push({ docId, data: mapped });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Argument parsing / Firebase init
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const r = { apply: false };
  const take = (flag, prop, i) => { r[prop] = args[i + 1]; return i + 1; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') r.apply = true;
    else if (a === '--key') i = take(a, 'keyPath', i);
    else if (a === '--from') i = take(a, 'from', i);
    else if (a === '--to') i = take(a, 'to', i);
    else if (a === '--evaluator') i = take(a, 'evaluator', i);
    else if (a === '--from-session') i = take(a, 'fromSession', i);
    else if (a === '--to-session') i = take(a, 'toSession', i);
  }
  return r;
}

function initAdmin(keyPath) {
  if (getApps().length > 0) return getFirestore();
  const path = keyPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    console.error('No credentials. Use --key <path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(path, 'utf8'))) });
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

async function readCol(db, slug, col) {
  const snap = await db.collection('teams').doc(slug).collection(col).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** Finds a session by id or name; with no selector, the lowest session number. */
function pickSession(sessions, selector, label) {
  if (selector) {
    const s = sessions.find((x) => x.id === selector) || sessions.find((x) => norm(x.name) === norm(selector));
    if (!s) fail(`${label}: no session with id or name "${selector}".`, sessions);
    return s;
  }
  const sorted = [...sessions].sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0) || a.id.localeCompare(b.id));
  if (!sorted.length) fail(`${label}: team has no sessions.`, sessions);
  return sorted[0];
}

function fail(msg, sessions) {
  console.error(`\nERROR: ${msg}`);
  if (sessions?.length) {
    console.error('Sessions found:');
    for (const s of sessions) console.error(`  - ${s.id}  "${s.name}"  (session ${s.session_number}, ${s.status})`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const o = parseArgs(process.argv);
  if (!o.from || !o.to || !o.evaluator) {
    console.error('Required: --from <slug> --to <slug> --evaluator "<name>"');
    process.exit(1);
  }
  if (o.from === o.to) fail('--from and --to are the same team.');

  console.log('='.repeat(60));
  console.log('Copy one evaluator\'s scores and notes between teams');
  console.log(`  from      : ${o.from}`);
  console.log(`  to        : ${o.to}`);
  console.log(`  evaluator : ${o.evaluator}`);
  console.log(`  mode      : ${o.apply ? 'APPLY (writes to Firestore)' : 'DRY RUN (read-only)'}`);
  console.log('='.repeat(60));

  const db = initAdmin(o.keyPath);

  for (const slug of [o.from, o.to]) {
    const t = await db.collection('teams').doc(slug).get();
    if (!t.exists) fail(`team "${slug}" does not exist.`);
  }

  const [srcSessions, dstSessions] = await Promise.all([readCol(db, o.from, 'sessions'), readCol(db, o.to, 'sessions')]);
  const srcSession = pickSession(srcSessions, o.fromSession, `source (${o.from})`);
  const dstSession = pickSession(dstSessions, o.toSession, `target (${o.to})`);
  console.log(`\nSource session: ${srcSession.id} "${srcSession.name}"`);
  console.log(`Target session: ${dstSession.id} "${dstSession.name}"`);

  const inSession = (sid) => (d) => d.session_id === sid;
  const [sp, dp, sc, dc, se, de, sn, dn] = await Promise.all([
    readCol(db, o.from, 'players'), readCol(db, o.to, 'players'),
    readCol(db, o.from, 'criteria'), readCol(db, o.to, 'criteria'),
    readCol(db, o.from, 'evaluations'), readCol(db, o.to, 'evaluations'),
    readCol(db, o.from, 'player_notes'), readCol(db, o.to, 'player_notes'),
  ]);
  const srcEvaluations = se.filter(inSession(srcSession.id));
  const srcNotes = sn.filter(inSession(srcSession.id));

  // Evaluator name check: list who is in the source session and stop if no exact match.
  const counts = new Map();
  for (const e of srcEvaluations) {
    const c = counts.get(e.evaluator_name) ?? { scores: 0, notes: 0 };
    c.scores++; counts.set(e.evaluator_name, c);
  }
  for (const n of srcNotes) {
    const c = counts.get(n.evaluator_name) ?? { scores: 0, notes: 0 };
    c.notes++; counts.set(n.evaluator_name, c);
  }
  console.log('\nEvaluators in the source session:');
  for (const [name, c] of [...counts].sort()) {
    console.log(`  ${norm(name) === norm(o.evaluator) ? '>' : ' '} "${name}": ${c.scores} scores, ${c.notes} notes`);
  }
  if (![...counts.keys()].some((n) => norm(n) === norm(o.evaluator))) {
    fail(`no evaluator named "${o.evaluator}" in the source session. Use one of the names above.`);
  }

  const plan = buildPlan({
    evaluator: o.evaluator,
    srcSlug: o.from, dstSlug: o.to,
    srcSessionId: srcSession.id, dstSessionId: dstSession.id,
    srcPlayers: sp.filter(inSession(srcSession.id)), dstPlayers: dp.filter(inSession(dstSession.id)),
    srcCriteria: sc.filter(inSession(srcSession.id)), dstCriteria: dc.filter(inSession(dstSession.id)),
    srcEvaluations, srcNotes,
    dstEvaluations: de.filter(inSession(dstSession.id)), dstNotes: dn.filter(inSession(dstSession.id)),
  });

  const uniq = (a) => [...new Set(a)];
  console.log('\n--- Plan ---');
  console.log(`  scores to copy : ${plan.evaluations.length}  (of ${plan.counts.srcEvals} for this evaluator)`);
  console.log(`  notes to copy  : ${plan.notes.length}  (of ${plan.counts.srcNotes} for this evaluator)`);
  console.log(`  scores skipped : ${plan.skipped.evalAlreadyThere} already in target, ` +
    `${plan.skipped.evalNoPlayer.length} no matching player, ${plan.skipped.evalNoCriterion.length} no matching criterion`);
  console.log(`  notes skipped  : ${plan.skipped.noteAlreadyThere} already in target, ${plan.skipped.noteNoPlayer.length} no matching player`);

  const badPlayers = uniq([...plan.skipped.evalNoPlayer, ...plan.skipped.noteNoPlayer]).map((id) => plan.unmatchedPlayers.get(id) ?? `${id}: unknown player id`);
  if (badPlayers.length) { console.log('\nPlayers with no usable match (their records are skipped):'); badPlayers.forEach((p) => console.log(`  - ${p}`)); }
  const badCrit = uniq(plan.skipped.evalNoCriterion).map((id) => plan.unmatchedCriteria.get(id) ?? `${id}: unknown criterion id`);
  if (badCrit.length) { console.log('\nCriteria with no usable match (their scores are skipped):'); badCrit.forEach((c) => console.log(`  - ${c}`)); }

  if (!o.apply) {
    console.log('\nDRY RUN complete. Nothing was written. Re-run with --apply to copy.\n');
    return;
  }

  console.log('\nApplying writes...');
  const BATCH = 400;
  for (const [col, docs] of [['evaluations', plan.evaluations], ['player_notes', plan.notes]]) {
    const colRef = db.collection('teams').doc(o.to).collection(col);
    let written = 0;
    for (let k = 0; k < docs.length; k += BATCH) {
      const batch = db.batch();
      for (const { docId, data } of docs.slice(k, k + BATCH)) batch.create(colRef.doc(docId), data);
      await batch.commit();
      written += Math.min(BATCH, docs.length - k);
    }
    console.log(`  ${col}: wrote ${written} docs`);
  }
  console.log('\nCopy complete.\n');
}

// Run only when executed directly (so buildPlan can be imported for testing).
if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('copy-scores-between-teams.mjs')) {
  main().catch((err) => {
    console.error('\nERROR:', err.message ?? String(err));
    process.exit(1);
  });
}
