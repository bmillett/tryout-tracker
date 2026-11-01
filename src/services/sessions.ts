import type { TryoutSession } from '../types';

/** Sessions in a stable order: by session number, then id. */
export function sortSessions(sessions: TryoutSession[]): TryoutSession[] {
  return [...sessions].sort(
    (a, b) => (a.session_number ?? 0) - (b.session_number ?? 0) || a.id.localeCompare(b.id)
  );
}

/** The session a coach explicitly chose for evaluators, if any. */
export function getFlaggedEvaluatorSession(sessions: TryoutSession[]): TryoutSession | undefined {
  return sortSessions(sessions).find(s => s.is_evaluator_session);
}

/**
 * The session evaluators see. Uses the coach's explicit choice; teams that never
 * made one fall back to the first active session (lowest session number), then
 * the first session.
 */
export function getEvaluatorSession(sessions: TryoutSession[]): TryoutSession | undefined {
  const sorted = sortSessions(sessions);
  return sorted.find(s => s.is_evaluator_session) || sorted.find(s => s.status === 'active') || sorted[0];
}
