export type SessionStatus = 'active' | 'finalized';

export type PlayerStatus = 'active' | 'injured' | 'absent' | 'no_need_to_watch' | 'cut_moved_down';

export type CriterionCategory = 'Offense' | 'Defense' | 'Athleticism & Intangibles';

export interface Team {
  slug: string;
  name: string;
  coach_pin: string;
  mixed_gender: boolean;
  member_uids?: string[]; // reserved for a later auth step (unused)
}

export interface TryoutSession {
  id: string;
  name: string;
  session_number: number;
  target_roster_size: number;
  date: string;
  status: SessionStatus;
  /** @deprecated PIN is now on the team doc (team.coach_pin). Field kept optional so old records still type-check. */
  admin_pin_hash?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Criterion {
  id: string;
  session_id: string;
  name: string;
  category: CriterionCategory;
  description: string;
  exemplar_player_name?: string;
  sort_order: number;
}

export interface Player {
  id: string;
  session_id: string;
  name: string;
  pinney_number: number | null;
  pinney_color: string;
  group_name: string;
  is_locked: boolean;
  status: PlayerStatus;
  notes?: string;
  gender?: 'M' | 'F';
}

export interface Evaluation {
  id: string;
  session_id: string;
  player_id: string;
  criterion_id: string;
  evaluator_name: string;
  score: number; // 1: 0/Novice, 2: 1-/Below, 3: 1/Standard, 4: 2/Above, 5: 3+/Expert
  updated_at: string;
  is_synced?: boolean;
}

export interface PlayerNote {
  id: string;
  session_id: string;
  player_id: string;
  evaluator_name: string;
  preset_tag?: string;
  custom_text?: string;
  created_at: string;
  is_synced?: boolean;
}

export interface PendingSyncItem {
  id: string;
  type:
    | 'evaluation'
    | 'evaluation_delete'
    | 'note'
    | 'note_delete'
    | 'player_update'
    | 'player_lock'
    | 'player_delete'
    | 'session_update'
    | 'criterion_update'
    | 'criterion_delete';
  payload: any;
  timestamp: number;
}
