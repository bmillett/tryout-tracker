import Dexie, { type Table } from 'dexie';
import type { Evaluation, Player, Criterion, TryoutSession, PlayerNote, PendingSyncItem } from '../types';

export class TryoutTrackerDB extends Dexie {
  sessions!: Table<TryoutSession, string>;
  criteria!: Table<Criterion, string>;
  players!: Table<Player, string>;
  evaluations!: Table<Evaluation, string>;
  notes!: Table<PlayerNote, string>;
  syncQueue!: Table<PendingSyncItem, string>;

  constructor() {
    super('TryoutTrackerDB');
    this.version(1).stores({
      sessions: 'id, session_number, status',
      criteria: 'id, session_id, category, sort_order',
      players: 'id, session_id, pinney_number, group_name, status, is_locked',
      evaluations: 'id, [session_id+player_id+criterion_id+evaluator_name], player_id, criterion_id, evaluator_name, session_id',
      notes: 'id, session_id, player_id, evaluator_name, created_at',
      syncQueue: 'id, type, timestamp'
    });
  }
}

export const db = new TryoutTrackerDB();
