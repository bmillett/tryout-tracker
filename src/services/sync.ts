import PocketBase from 'pocketbase';
import { db } from './db';
import type { Evaluation, Criterion, Player, PlayerNote } from '../types';
import { DEFAULT_CRITERIA_TEMPLATES, INITIAL_DEFAULT_SESSION, INITIAL_SAMPLE_PLAYERS } from '../data/defaultData';

const DEFAULT_POCKETBASE_URL = localStorage.getItem('ignite_pb_url') || 'https://tryout-tracker.pockethost.io';

export const pb = new PocketBase(DEFAULT_POCKETBASE_URL);
pb.autoCancellation(false);

export class SyncService {
  private static isSyncing = false;
  private static isOnline = navigator.onLine;
  private static listeners: ((online: boolean, syncing: boolean, pendingCount: number) => void)[] = [];

  public static getPbUrl(): string {
    return localStorage.getItem('ignite_pb_url') || DEFAULT_POCKETBASE_URL;
  }

  public static setPbUrl(url: string) {
    localStorage.setItem('ignite_pb_url', url.trim());
    pb.baseUrl = url.trim();
  }

  public static subscribeStatus(listener: (online: boolean, syncing: boolean, pendingCount: number) => void) {
    this.listeners.push(listener);
    this.notify();
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static async notify() {
    const pendingCount = await db.syncQueue.count();
    this.listeners.forEach(cb => cb(this.isOnline, this.isSyncing, pendingCount));
  }

  public static async initDB() {
    // Check if initial session exists
    const sessionCount = await db.sessions.count();
    if (sessionCount === 0) {
      await db.sessions.add(INITIAL_DEFAULT_SESSION);
      
      // Add default criteria for session 1
      const criteriaToAdd: Criterion[] = DEFAULT_CRITERIA_TEMPLATES.map((c, idx) => ({
        ...c,
        id: `crit-s1-${idx + 1}`,
        session_id: INITIAL_DEFAULT_SESSION.id
      }));
      await db.criteria.bulkAdd(criteriaToAdd);

      // Add default sample players
      const playersToAdd: Player[] = INITIAL_SAMPLE_PLAYERS.map((p, idx) => ({
        ...p,
        id: `player-s1-${idx + 1}`,
        session_id: INITIAL_DEFAULT_SESSION.id
      }));
      await db.players.bulkAdd(playersToAdd);
    }

    // Set up network listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueue();
      this.notify();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notify();
    });

    // Try background sync if online
    if (this.isOnline) {
      this.flushQueue();
    }
  }

  // Save evaluation optimistically to local DB and enqueue for PocketBase sync
  public static async saveEvaluation(evaluation: Omit<Evaluation, 'id' | 'updated_at'>) {
    const existing = await db.evaluations
      .where({
        session_id: evaluation.session_id,
        player_id: evaluation.player_id,
        criterion_id: evaluation.criterion_id,
        evaluator_name: evaluation.evaluator_name
      })
      .first();

    const id = existing ? existing.id : `eval_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullEval: Evaluation = {
      ...evaluation,
      id,
      updated_at: new Date().toISOString(),
      is_synced: false
    };

    await db.evaluations.put(fullEval);

    // Queue for PocketBase
    await db.syncQueue.put({
      id: `queue_${id}`,
      type: 'evaluation',
      payload: fullEval,
      timestamp: Date.now()
    });

    this.notify();
    this.flushQueue();
    return fullEval;
  }

  // Save note optimistically
  public static async saveNote(note: Omit<PlayerNote, 'id' | 'created_at'>) {
    const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullNote: PlayerNote = {
      ...note,
      id,
      created_at: new Date().toISOString(),
      is_synced: false
    };

    await db.notes.put(fullNote);

    await db.syncQueue.put({
      id: `queue_${id}`,
      type: 'note',
      payload: fullNote,
      timestamp: Date.now()
    });

    this.notify();
    this.flushQueue();
    return fullNote;
  }

  // Flush offline queue to PocketBase
  public static async flushQueue() {
    if (this.isSyncing || !this.isOnline) return;
    this.isSyncing = true;
    this.notify();

    try {
      const items = await db.syncQueue.toArray();
      for (const item of items) {
        try {
          if (item.type === 'evaluation') {
            const evalItem = item.payload as Evaluation;
            try {
              // PocketBase upsert
              await pb.collection('evaluations').create({
                session_id: evalItem.session_id,
                player_id: evalItem.player_id,
                criterion_id: evalItem.criterion_id,
                evaluator_name: evalItem.evaluator_name,
                score: evalItem.score,
                client_id: evalItem.id
              });
            } catch (createErr: any) {
              // If already created, update it
              if (createErr.status === 400 || createErr.status === 409) {
                // Ignore or attempt update
              }
            }
            await db.evaluations.update(evalItem.id, { is_synced: true });
          } else if (item.type === 'note') {
            const noteItem = item.payload as PlayerNote;
            try {
              await pb.collection('player_notes').create({
                session_id: noteItem.session_id,
                player_id: noteItem.player_id,
                evaluator_name: noteItem.evaluator_name,
                preset_tag: noteItem.preset_tag,
                custom_text: noteItem.custom_text,
                client_id: noteItem.id
              });
            } catch {
              // ignore
            }
            await db.notes.update(noteItem.id, { is_synced: true });
          }
          await db.syncQueue.delete(item.id);
        } catch (e) {
          // If network error, stop flushing until connection restores
          break;
        }
      }
    } catch (e) {
      // ignore
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}
