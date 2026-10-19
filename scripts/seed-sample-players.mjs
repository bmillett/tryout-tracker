#!/usr/bin/env node
/**
 * scripts/seed-sample-players.mjs
 *
 * Adds test players to teams/{slug}/players.
 *
 * Usage:
 *   node scripts/seed-sample-players.mjs --key <service-account.json> [--team ignite] [--count N] [--apply]
 *
 * - Without --count: the 9 original sample players (a copy of INITIAL_SAMPLE_PLAYERS
 *   in src/data/defaultData.ts).
 * - With --count N: N generated players. If the team doc has mixed_gender: true,
 *   genders alternate M/F; otherwise players are untagged.
 * - Dry run unless --apply is passed.
 * - Non-clobbering: players whose id already exists are skipped.
 * - Ids are player-s1-1 .. player-s1-N and the session is session-<slug>-1 (the id
 *   each device seeds locally), so the players show up in the team's first session.
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

// Generated rosters use 4 pinney colors (names must match PINNEY_COLORS in src/data/defaultData.ts).
const PINNEY_COLOR_NAMES = ['Red', 'Navy / Blue', 'White', 'Yellow / Gold'];
const MALE_NAMES = [
  'Liam', 'Owen', 'Jack', 'Caleb', 'Mason', 'Eli', 'Declan', 'Finn', 'Theo', 'Rhys',
  'Jonah', 'Micah', 'Silas', 'Wyatt', 'Quinn', 'Reid', 'Dominic', 'Felix', 'Hugo', 'Ravi',
];
const FEMALE_NAMES = [
  'Emma', 'Nora', 'Zoe', 'Ruby', 'Hana', 'Iris', 'Lena', 'Mira', 'Tess', 'Willa',
  'June', 'Cleo', 'Freya', 'Nadia', 'Sage', 'Piper', 'Anya', 'Maeve', 'Talia', 'Priya',
];
const LAST_INITIALS = 'ABCDEFGHIJKLMNOPRSTW';

/**
 * Deterministic generated roster for --count N (--count 40 -> 20 M, 20 F).
 * Genders alternate; numbers are 1..N; groups are blocks of 10 (Group A, B, ...).
 * A few statuses are varied so the UI states can be tested.
 * Colors cycle through the 4 pinney colors with an offset (i + floor(i/2)) so that
 * each gender gets all 4 colors; a plain i % 4 would give two colors to M only
 * and the other two to F only.
 */
function generatePlayers(count, mixed) {
  const players = [];
  for (let i = 0; i < count; i++) {
    const gender = mixed ? (i % 2 === 0 ? 'M' : 'F') : undefined;
    const pool = gender === 'F' ? FEMALE_NAMES : MALE_NAMES;
    const first = pool[Math.floor(i / 2) % pool.length];
    const last = LAST_INITIALS[(i * 7) % LAST_INITIALS.length];
    let status = 'active';
    if (i === 5) status = 'injured';
    if (i === 17) status = 'absent';
    if (i === 29) status = 'no_need_to_watch';
    const p = {
      name: `${first} ${last}.`,
      pinney_number: i + 1,
      pinney_color: PINNEY_COLOR_NAMES[(i + Math.floor(i / 2)) % PINNEY_COLOR_NAMES.length],
      group_name: `Group ${String.fromCharCode(65 + Math.floor(i / 10))}`,
      is_locked: false,
      status,
    };
    if (gender) p.gender = gender;
    players.push(p);
  }
  return players;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    keyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
    slug: 'ignite',
    apply: false,
    overwrite: false,
    count: 0,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i + 1]) opts.keyPath = args[++i];
    else if (args[i] === '--team' && args[i + 1]) opts.slug = args[++i];
    else if (args[i] === '--count' && args[i + 1]) opts.count = parseInt(args[++i], 10) || 0;
    else if (args[i] === '--apply') opts.apply = true;
    else if (args[i] === '--overwrite') opts.overwrite = true;
  }
  return opts;
}

async function main() {
  const { keyPath, slug, apply, count, overwrite } = parseArgs(process.argv);
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

  // The first session is seeded locally on each device with this deterministic id
  // (SyncService.initDB) and is not written to the cloud. Players just reference it.
  const sessionId = `session-${slug}-1`;
  const teamData = (await teamRef.get()).data() ?? {};
  const sessionsSnap = await teamRef.collection('sessions').get();
  if (sessionsSnap.size > 0 && !sessionsSnap.docs.some((d) => d.id === sessionId)) {
    console.error(
      `Team has sessions in the cloud but not "${sessionId}" (${sessionsSnap.docs.map((d) => d.id).join(', ')}). ` +
      'Refusing to guess which session to attach players to.'
    );
    process.exit(1);
  }

  const mixed = teamData.mixed_gender === true;
  const roster = count > 0 ? generatePlayers(count, mixed) : SAMPLE_PLAYERS;

  const col = teamRef.collection('players');
  const toCreate = [];
  let present = 0;
  for (let i = 0; i < roster.length; i++) {
    const id = `player-s1-${i + 1}`;
    const exists = (await col.doc(id).get()).exists;
    if (exists && !overwrite) present++;
    else toCreate.push({ id, data: { ...roster[i], id, session_id: sessionId } });
  }

  console.log(`team=${slug} session=${sessionId} mixed_gender=${mixed} roster=${roster.length} mode=${apply ? 'APPLY' : 'DRY RUN'}`);
  if (count > 0) {
    const m = roster.filter((p) => p.gender === 'M').length;
    const f = roster.filter((p) => p.gender === 'F').length;
    console.log(`  generated: ${m} M, ${f} F, ${roster.length - m - f} untagged`);
  }
  console.log(`  to-write=${toCreate.length}  already-present(skipped)=${present}${overwrite ? '  (--overwrite: existing players are replaced, resetting locks/status edits)' : ''}`);
  if (count > 0) {
    const byColor = {};
    for (const p of roster) byColor[p.pinney_color] = (byColor[p.pinney_color] || 0) + 1;
    console.log('  colors:', JSON.stringify(byColor));
  }

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to write.');
    return;
  }

  const batch = db.batch();
  for (const { id, data } of toCreate) {
    if (overwrite) batch.set(col.doc(id), data);
    else batch.create(col.doc(id), data);
  }
  await batch.commit();
  console.log(`  wrote ${toCreate.length} players`);
}

main().catch((err) => {
  console.error('ERROR:', err.message ?? String(err));
  process.exit(1);
});
