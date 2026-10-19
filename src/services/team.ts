import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDB } from './firebase';
import type { Team } from '../types';

const LAST_TEAM_KEY = 'tryout_last_team_slug';
const TEAM_CACHE_PREFIX = 'tryout_team_';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type AppRoute =
  | { kind: 'root' }
  | { kind: 'team'; slug: string }
  | { kind: 'unknown' };

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Parses `location.pathname`: `/` -> root, `/t/<slug>` -> team, anything else -> unknown. */
export function parseRoute(pathname: string = window.location.pathname): AppRoute {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return { kind: 'root' };
  if (segments[0] === 't' && segments.length === 2 && isValidSlug(segments[1])) {
    return { kind: 'team', slug: segments[1] };
  }
  return { kind: 'unknown' };
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function getLastTeamSlug(): string | null {
  try {
    const slug = localStorage.getItem(LAST_TEAM_KEY);
    return slug && isValidSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function saveLastTeamSlug(slug: string) {
  try {
    localStorage.setItem(LAST_TEAM_KEY, slug);
  } catch {}
}

export function readCachedTeam(slug: string): Team | null {
  try {
    const raw = localStorage.getItem(TEAM_CACHE_PREFIX + slug);
    return raw ? (JSON.parse(raw) as Team) : null;
  } catch {
    return null;
  }
}

export function cacheTeam(team: Team) {
  try {
    localStorage.setItem(TEAM_CACHE_PREFIX + team.slug, JSON.stringify(team));
  } catch {}
}

export function clearCachedTeam(slug: string) {
  try {
    localStorage.removeItem(TEAM_CACHE_PREFIX + slug);
  } catch {}
}

/** Fetches `teams/{slug}`. Resolves null if the team doc does not exist; rejects on fetch errors. */
export async function fetchTeam(slug: string): Promise<Team | null> {
  const firestore = getFirestoreDB();
  if (!firestore) throw new Error('Firestore is not configured');

  const snap = await getDoc(doc(firestore, 'teams', slug));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    slug,
    name: typeof data.name === 'string' && data.name ? data.name : slug,
    coach_pin: data.coach_pin != null ? String(data.coach_pin) : '',
    mixed_gender: data.mixed_gender === true,
    member_uids: Array.isArray(data.member_uids) ? data.member_uids : undefined
  };
}
