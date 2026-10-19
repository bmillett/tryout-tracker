#!/usr/bin/env node
/**
 * scripts/seed-sample-players.mjs
 *
 * Adds the 9 sample players (the ones the original single-team app seeded
 * locally on first run) to teams/{slug}/players, for testing.
 *
 * Usage:
 *   node scripts/seed-sample-players.mjs --key <service-account.json> [--team ignite] [--apply]
 *
 * - Dry run unless --apply is passed.
 * - Non-clobbering: players whose id already exists are skipped.
 * - Ids are player-s1-1 .. player-s1-9, matching the original seed, so evaluations
 *   that already reference those ids reconnect.
 * - The sample list is a copy of INITIAL_SAMPLE_PLAYERS in src/data/defaultData.ts.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SAMPLE_PLAYERS = [
  { name: 'Kian M.', pinney_number: 7, pinney_color: 'Navy / Blue', group_name: 'Group A', is_locked: true, status: 'active' },
  { name: 'Lucas W.', pinney_number: 14, pinney_color: 'Red', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Maya S.', pinney_number: 22, pinney_color: 'White', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Ethan B.', pinney_number: 3, pinney_color: 'Navy / Blue', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Ava T.', pinney_number: 11, pinney_color: 'Red', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Noah G.', pinney_number: 88, pinney_color: 'Yellow / Gold', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Sammy C.', pinney_number: 19, pinney_color: 'Green', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Chloe Z.', pinney_number: 44, pinney_color: 'White', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Tyler R.', pinney_number: 99, pinney_color: 'Black', group_name: 'Group A', is_locked: false, status: 'no_need_to_watch' },
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { keyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || null, slug: 'ignite', apply: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i + 1]) opts.keyPath = args[++i];
    else if (args[i] === '--team' && args[i + 1]) opts.slug = args[++i];
    else if (args[i] === '--apply') opts.apply = true;
  }
  return opts;
}

async function main() {
  const { keyPath, slug, apply } = parseArgs(process.argv);
  if (!keyPath) {
    console.error('No credentials. Use --key <path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore();

  const teamRef = db.collection('teams').doc(slug);
  if (!(await teamRef.get()).exists) {
    console.error(`Team "${slug}" does not exist.`);
    process.exit(1);
  }

  const sessionId = `session-${slug}-1`;
  if (!(await teamRef.collection('sessions').doc(sessionId).get()).exists) {
    console.error(`Session "${sessionId}" not found under teams/${slug}/sessions; nothing to attach players to.`);
    process.exit(1);
  }

  const col = teamRef.collection('players');
  const toCreate = [];
  let present = 0;
  for (let i = 0; i < SAMPLE_PLAYERS.length; i++) {
    const id = `player-s1-${i + 1}`;
    if ((await col.doc(id).get()).exists) present++;
    else toCreate.push({ id, data: { ...SAMPLE_PLAYERS[i], id, session_id: sessionId } });
  }

  console.log(`team=${slug} session=${sessionId} mode=${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  to-create=${toCreate.length}  already-present=${present}`);

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to write.');
    return;
  }

  const batch = db.batch();
  for (const { id, data } of toCreate) batch.create(col.doc(id), data);
  await batch.commit();
  console.log(`  wrote ${toCreate.length} players`);
}

main().catch((err) => {
  console.error('ERROR:', err.message ?? String(err));
  process.exit(1);
});
